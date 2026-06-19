"""FastAPI mobile health dashboard."""

from __future__ import annotations

import re
import socket
import sys
import json
import hashlib
from urllib.parse import quote
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from markupsafe import Markup, escape

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from health import init_db, nutrition, screening, grocery, workouts, progress_photos, food_scanner, gym_plans, gym_session, vitals, symptoms, jarvis_chat, product_scanner, autopilot, cycle, meal_presets, meal_planner, supplements, derm_hygiene, bhagavad_gita, wearables, weekly_insights
from health.lab_import import import_health_pdf, list_lab_documents
from health.lab_sections import build_lab_sections, current_section_status
from health import profile as user_profile
from health import sleep as sleep_mod
from health.db import get_conn, today, water_total_ml
from health.agent_tools import all_lab_draws
from health.paths import CONFIG_DIR, HEALTH_DATA
from health import web_auth
from health.build_stamp import read_build_stamp, write_build_stamp

PHONE_URL_FILE = CONFIG_DIR.parent / "phone_url.json"
APP_PORT = 8781


def app_build() -> str:
    return read_build_stamp()

app = FastAPI(title="Melani Health — Dr. Melani")
WEB_DIR = Path(__file__).parent
templates = Jinja2Templates(directory=str(WEB_DIR / "templates"))
templates.env.auto_reload = True

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")


def highlight_number_sentences(text: str) -> Markup:
    """Wrap sentences containing digits in a subtle highlight span."""
    text = str(text or "")
    if not text:
        return Markup("")
    parts = [p for p in _SENTENCE_BOUNDARY.split(text) if p]
    out: list[str] = []
    for part in parts:
        escaped = escape(part)
        if re.search(r"\d", part):
            out.append(f'<span class="hygiene-guide-num-highlight">{escaped}</span>')
        else:
            out.append(str(escaped))
    return Markup(" ".join(out))


templates.env.filters["highlight_number_sentences"] = highlight_number_sentences
app.mount("/static", StaticFiles(directory=str(WEB_DIR / "static")), name="static")
app.mount("/photos", StaticFiles(directory=str(HEALTH_DATA / "progress_photos")), name="photos")

init_db(seed=True)
sleep_mod.maybe_migrate_week_system()
web_auth.ensure_web_pin()


@app.middleware("http")
async def no_cache_guard(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=60"
        return response
    ctype = response.headers.get("content-type", "")
    if "text/html" in ctype or path.startswith("/api/") or path == "/healthz":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.middleware("http")
async def pin_guard(request: Request, call_next):
    path = request.url.path
    if path.startswith("/static") or path in ("/login", "/healthz"):
        return await call_next(request)
    if web_auth.pin_ok(request.cookies):
        return await call_next(request)
    if path.startswith("/api/"):
        return JSONResponse({"detail": "PIN required — open /login"}, status_code=401)
    return RedirectResponse("/login", status_code=302)


def _phone_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip if ip and not ip.startswith("127.") else ""
    except OSError:
        return ""


def _phone_urls() -> list[str]:
    urls: list[str] = []
    ip = _phone_ip()
    if ip:
        urls.append(f"http://{ip}:{APP_PORT}/links")
    host = socket.gethostname().split(".")[0]
    if host:
        urls.append(f"http://{host}.local:{APP_PORT}/links")
    return urls


def _load_phone_url_data() -> dict:
    if not PHONE_URL_FILE.exists():
        return {}
    try:
        return json.loads(PHONE_URL_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _write_phone_url_data(data: dict) -> None:
    PHONE_URL_FILE.parent.mkdir(parents=True, exist_ok=True)
    PHONE_URL_FILE.write_text(json.dumps(data, indent=2))


def _save_phone_url() -> str | None:
    """Refresh LAN fallback URLs without wiping an active Cloudflare tunnel link."""
    data = _load_phone_url_data()
    urls = _phone_urls()
    ip = _phone_ip()
    data["urls"] = urls
    data["ip"] = ip or None
    data["hostname"] = socket.gethostname().split(".")[0]
    data["port"] = APP_PORT
    data["updated_at"] = datetime.now().isoformat()
    if urls:
        data["lan_url"] = urls[0]
    if not data.get("tunnel_url"):
        data["url"] = urls[0] if urls else data.get("url")
    _write_phone_url_data(data)
    if ip:
        (CONFIG_DIR.parent / "last_ip.txt").write_text(ip)
    (CONFIG_DIR.parent / "last_port.txt").write_text(str(APP_PORT))
    return get_phone_url()


def get_phone_url() -> str | None:
    data = _load_phone_url_data()
    if data.get("url"):
        return str(data["url"])
    if data.get("tunnel_url"):
        return str(data["tunnel_url"]).rstrip("/") + "/links"
    if data.get("lan_url"):
        return str(data["lan_url"])
    return _save_phone_url()


@app.on_event("startup")
def _on_startup():
    write_build_stamp()
    _save_phone_url()
    from health.nutrition_goals import get_goals
    get_goals()


def _load_cfg() -> dict:
    import json
    p = CONFIG_DIR / "config.json"
    if p.exists():
        return json.loads(p.read_text())
    return {}


def _pin_ok(request: Request) -> bool:
    return web_auth.pin_ok(request.cookies)


def format_display_date(d: date | None = None) -> str:
    d = d or date.today()
    return d.strftime("%B %d, %Y").replace(" 0", " ")  # May 29, 2026


def _ctx(request: Request, **extra):
    d = today()
    show_date = extra.pop("show_date", True)
    base = {
        "request": request,
        "day": d,
        "display_date": format_display_date(date.fromisoformat(d)),
        "show_date": show_date,
        "summary": nutrition.today_summary(d),
        "nav": extra.get("nav", "today"),
        "profile_tagline": user_profile.header_tagline(),
        "data_stats": user_profile.data_stats(),
        "app_build": app_build(),
    }
    base.update(extra)
    return base


def _render(request: Request, template: str, **extra):
    return templates.TemplateResponse(request, template, _ctx(request, **extra))


@app.get("/", response_class=HTMLResponse)
def home(request: Request, week: str = "", weight_week: str = ""):
    symptoms.maybe_rollover_brain_fog_week()
    symptoms.maybe_rollover_bowel_week()
    sleep = sleep_mod.get_sleep()
    weeks = sleep_mod.list_weeks()
    chart = sleep_mod.week_chart_data(week or None)
    weight = vitals.get_weight()
    weight_delta = vitals.weight_change()
    brain_fog = symptoms.get_brain_fog()
    brain_fog_streak = symptoms.consecutive_brain_fog_days()
    brain_fog_week = symptoms.week_brain_fog_data()
    last_week_verdict = symptoms.last_week_verdict()
    bowel = symptoms.get_bowel_movement()
    bowel_week = symptoms.week_bowel_data()
    weight_chart = vitals.week_chart_data(weight_week or None)
    weight_weeks = vitals.list_weeks()
    supplement_status = supplements.today_status()
    from health import journal as journal_mod

    mood_saved_day = (request.query_params.get("mood_saved") or "").strip()
    weekly_card = weekly_insights.build_card()
    return _render(
        request,
        "today.html",
        nav="today",
        sleep=sleep,
        weight=weight,
        weight_delta=weight_delta,
        brain_fog=brain_fog,
        brain_fog_streak=brain_fog_streak,
        brain_fog_week=brain_fog_week,
        last_week_verdict=last_week_verdict,
        bowel=bowel,
        bowel_week=bowel_week,
        weight_weeks=weight_weeks,
        weight_chart_week=weight_chart["week"],
        weight_chart=weight_chart,
        bedtime_input=sleep_mod.time_input_value(sleep.get("bedtime", "")),
        wake_input=sleep_mod.time_input_value(sleep.get("wake_time", "")),
        sleep_weeks=weeks,
        chart_week=chart["week"],
        chart=chart,
        today_autopilot=autopilot.today_status(),
        gita_quote=bhagavad_gita.quote_for_day(),
        phone_url=get_phone_url(),
        supplements=supplement_status["items"],
        supplement_summary=supplement_status["summary"],
        mood_log_days=journal_mod.mood_log_by_day(),
        mood_saved_day=mood_saved_day,
        mood_notes_open=bool(mood_saved_day),
        weekly_card=weekly_card,
    )


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    if web_auth.pin_ok(request.cookies):
        return RedirectResponse("/", status_code=302)
    return _render(request, "login.html", nav="today", error="")


@app.post("/login")
def login(request: Request, pin: str = Form(...)):
    token = web_auth.session_token_for_pin(pin)
    if not token:
        return _render(request, "login.html", nav="today", error="Wrong PIN — try again.")
    resp = RedirectResponse("/", status_code=303)
    resp.set_cookie(
        web_auth.SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 90,
    )
    return resp


@app.post("/today/sleep")
def save_sleep_route(
    request: Request,
    bedtime: str = Form(""),
    wake_time: str = Form(""),
    notes: str = Form(""),
    log_date: str = Form(""),
    brain_fog_yes: str = Form(""),
):
    day = log_date.strip() or None
    sleep_mod.save_sleep(bedtime=bedtime, wake_time=wake_time, notes=notes, log_date=day)
    if brain_fog_yes in ("0", "1"):
        symptoms.log_brain_fog(brain_fog_yes == "1")
    week = request.query_params.get("week", "")
    url = "/" + (f"?week={week}" if week else "")
    return RedirectResponse(url, status_code=303)


@app.post("/api/today/sleep")
async def api_save_sleep(request: Request):
    form = await request.form()
    log_date = str(form.get("log_date") or "").strip() or None
    payload = sleep_mod.save_sleep(
        bedtime=str(form.get("bedtime") or ""),
        wake_time=str(form.get("wake_time") or ""),
        notes=str(form.get("notes") or ""),
        log_date=log_date,
    )
    from datetime import date as date_cls

    saved_day = date_cls.fromisoformat(payload["date"])
    chart = sleep_mod.week_chart_data(sleep_mod.week_key(saved_day))
    return JSONResponse({
        "sleep": {
            **payload,
            "bedtime_input": sleep_mod.time_input_value(payload.get("bedtime", "")),
            "wake_input": sleep_mod.time_input_value(payload.get("wake_time", "")),
        },
        "chart": chart,
    })


@app.get("/api/sleep/day")
def sleep_day_api(date: str = ""):
    from health.db import today as today_fn

    rec = sleep_mod.get_sleep(date or today_fn())
    return JSONResponse({
        **rec,
        "bedtime_input": sleep_mod.time_input_value(rec.get("bedtime", "")),
        "wake_input": sleep_mod.time_input_value(rec.get("wake_time", "")),
    })


@app.get("/api/sleep/week")
def sleep_week_api(week: str = ""):
    return sleep_mod.week_chart_data(week or None)


@app.get("/api/weight/week")
def weight_week_api(week: str = ""):
    return vitals.week_chart_data(week or None)


@app.post("/today/brain-fog")
def brain_fog_route(yes: int = Form(...), log_date: str = Form("")):
    day = log_date.strip() or None
    symptoms.log_brain_fog(bool(yes), day)
    return RedirectResponse("/", status_code=303)


@app.post("/today/bowel-movement")
def bowel_movement_route(yes: int = Form(...)):
    symptoms.log_bowel_movement(bool(yes))
    return RedirectResponse("/", status_code=303)


@app.post("/api/today/bowel-note")
async def bowel_note_api(request: Request):
    data = await request.json()
    description = str(data.get("description") or "").strip()
    if not description:
        return JSONResponse({"ok": False, "error": "empty"}, status_code=400)
    symptoms.log_bowel_note(description)
    return JSONResponse({"ok": True, "has_note": True})


@app.get("/api/supplements/today")
def supplements_today_api():
    return JSONResponse(supplements.today_status())


@app.get("/api/supplements/catalog")
def supplements_catalog_api():
    items = supplements.list_catalog()
    return JSONResponse({
        "items": [
            {
                **item,
                "daily_track": (item.get("schedule") or "Daily").lower() != "considering",
            }
            for item in items
        ]
    })


@app.post("/api/supplements/toggle")
async def supplements_toggle_api(request: Request):
    data = await request.json()
    status = supplements.set_taken(int(data["supplement_id"]), bool(data.get("taken", True)))
    return JSONResponse(status)


@app.post("/api/supplements/log-all")
def supplements_log_all_api():
    return JSONResponse(supplements.log_all_today())


@app.post("/today/water")
def add_water(request: Request, amount_ml: int = Form(...)):
    nutrition.add_water(amount_ml)
    return RedirectResponse("/", status_code=303)


@app.post("/today/water/undo")
def undo_water(request: Request):
    nutrition.undo_last_water()
    return RedirectResponse("/", status_code=303)


@app.post("/today/water/reset")
def reset_water(request: Request):
    nutrition.reset_water()
    return RedirectResponse("/", status_code=303)


@app.post("/api/today/water")
async def api_add_water(request: Request):
    form = await request.form()
    raw = form.get("amount_ml")
    if raw is None or str(raw).strip() == "":
        return JSONResponse({"detail": "amount_ml required"}, status_code=400)
    amount_ml = int(raw)
    return JSONResponse(nutrition.add_water(amount_ml))


@app.post("/api/today/water/undo")
def api_undo_water():
    return JSONResponse(nutrition.undo_last_water())


@app.post("/api/today/water/reset")
def api_reset_water():
    return JSONResponse(nutrition.reset_water())


@app.post("/today/weight")
def save_weight_route(request: Request, weight_lb: float = Form(...)):
    vitals.save_weight(weight_lb)
    return RedirectResponse("/", status_code=303)


@app.post("/today/mood-note")
def mood_note_route(
    request: Request,
    text: str = Form(""),
    log_date: str = Form(""),
):
    from health import journal as journal_mod

    log_day = (log_date or today()).strip()
    journal_mod.log_note(text, day=log_day)
    week = request.query_params.get("week", "")
    url = f"/?mood_saved={log_day}#mood-{log_day}"
    if week:
        url = f"/?week={week}&mood_saved={log_day}#mood-{log_day}"
    return RedirectResponse(url, status_code=303)


@app.get("/meals", response_class=HTMLResponse)
def meals_page(request: Request):
    nutrition.maybe_rollover_meal_before_7pm_week()
    macro = nutrition.macro_dashboard()
    return _render(
        request,
        "meals.html",
        nav="meals",
        meals=nutrition.get_meals(),
        macro=macro,
        breakfast_preset=meal_presets.breakfast_preset(),
        chipotle_preset=meal_presets.chipotle_bowl_preset(),
        meal_before_7pm=nutrition.get_meal_before_7pm(),
        meal_before_7pm_week=nutrition.week_meal_before_7pm_data(),
        tomorrow_plan_line=meal_planner.display_line(),
    )


@app.get("/api/meals/history")
def meals_history_api(days: int = 30):
    days = max(7, min(int(days or 30), 180))
    return JSONResponse(nutrition.macro_history(days))


@app.post("/meals/preset/breakfast/log")
def log_breakfast_preset(request: Request):
    meal_presets.log_preset("breakfast_usual")
    return RedirectResponse("/meals", status_code=303)


@app.post("/meals/preset/chipotle/log")
def log_chipotle_preset(request: Request):
    meal_presets.log_preset("chipotle_burrito_bowl")
    return RedirectResponse("/meals", status_code=303)


@app.post("/meals/before-7pm")
def meal_before_7pm_route(yes: int = Form(...)):
    nutrition.log_meal_before_7pm(bool(yes))
    return RedirectResponse("/meals", status_code=303)


@app.post("/meals/preset/breakfast/update")
async def update_breakfast_preset(request: Request):
    form = await request.form()
    listed = [str(x).strip() for x in form.getlist("ingredients") if str(x).strip()]
    if not listed:
        ingredients_raw = str(form.get("ingredients") or "")
        listed = [ln.strip() for ln in ingredients_raw.splitlines() if ln.strip()]
    preset = meal_presets.breakfast_preset()
    preset.update({
        "notes": str(form.get("notes") or preset.get("notes", "")).strip(),
        "ingredients": listed or preset.get("ingredients", []),
        "calories": float(form.get("calories") or preset.get("calories") or 0),
        "protein_g": float(form.get("protein_g") or preset.get("protein_g") or 0),
        "carbs_g": float(form.get("carbs_g") or preset.get("carbs_g") or 0),
        "fat_g": float(form.get("fat_g") or preset.get("fat_g") or 0),
    })
    meal_presets.save_preset(preset)
    return RedirectResponse("/meals", status_code=303)


@app.post("/meals/undo")
def undo_last_meal_route():
    nutrition.undo_last_meal()
    return RedirectResponse("/meals", status_code=303)


@app.post("/meals/clear")
def clear_meal_route(slot: str = Form(...)):
    nutrition.clear_meal(slot)
    return RedirectResponse("/meals", status_code=303)


@app.post("/api/meals/undo")
def api_undo_last_meal():
    result = nutrition.undo_last_meal()
    return JSONResponse({
        **result,
        "meals": nutrition.get_meals(),
        "macro": nutrition.macro_dashboard(),
    })


@app.post("/api/meals/clear")
async def api_clear_meal(request: Request):
    data = await request.json()
    result = nutrition.clear_meal(data.get("slot", ""))
    return JSONResponse({
        **result,
        "meals": nutrition.get_meals(),
        "macro": nutrition.macro_dashboard(),
    })


@app.get("/api/meals/today")
def meals_today_api():
    return JSONResponse({"meals": nutrition.get_meals(), "macro": nutrition.macro_dashboard()})


@app.post("/meals/log")
async def log_meal_text(request: Request, slot: str = Form(""), name: str = Form(...)):
    data = food_scanner.estimate_meal_from_text(name)
    chosen_slot = nutrition.infer_meal_slot(
        text=f"{name} {data.get('name') or ''}",
        preferred_slot=slot,
    )
    nutrition.save_meal(
        chosen_slot,
        data.get("name") or name,
        data.get("calories"),
        data.get("protein_g"),
        data.get("carbs_g"),
        data.get("fat_g"),
        data.get("fiber_g"),
        source="ai_text",
    )
    return RedirectResponse("/meals", status_code=303)


@app.post("/meals/scan")
async def scan_meal(request: Request, slot: str = Form(""), photo: UploadFile = File(...)):
    tmp = HEALTH_DATA / "nutrition" / "meals" / f"_scan_{photo.filename}"
    tmp.write_bytes(await photo.read())
    data = food_scanner.scan_meal_photo(str(tmp))
    chosen_slot = nutrition.infer_meal_slot(
        text=f"{data.get('name', '')} {data.get('meal_slot_hint', '')}",
        preferred_slot=slot or str(data.get("meal_slot_hint") or ""),
    )
    nutrition.save_meal(
        chosen_slot, data.get("name", "Scanned meal"),
        data.get("calories"), data.get("protein_g"), data.get("carbs_g"),
        data.get("fat_g"), data.get("fiber_g"),
        source="ai_scan", photo_path=str(tmp),
    )
    return RedirectResponse("/meals", status_code=303)


def _progress_photo_cards() -> list[dict]:
    return [
        {
            "day": p["day"],
            "tag": p["tag"],
            "url": "/photos/" + Path(p["path"]).name,
        }
        for p in progress_photos.list_photos()
    ]


def _gym_whoop_context() -> dict:
    st = wearables.status()
    sleep = None
    for offset in (0, -1):
        d = (date.today() + timedelta(days=offset)).isoformat()
        row = wearables.get_metric(d, "whoop", "sleep_hours")
        if row and row.get("value") is not None:
            sleep = {"hours": round(float(row["value"]), 1), "day": d}
            break
    if st.get("whoop_configured"):
        connect_href = "/data/wearables/whoop/connect"
    else:
        connect_href = "/labs"
    return {
        "whoop_connected": st.get("whoop_connected"),
        "whoop_configured": st.get("whoop_configured"),
        "whoop_sleep": sleep,
        "whoop_connect_href": connect_href,
    }


@app.get("/gym", response_class=HTMLResponse)
def gym_page(request: Request):
    gym_plans.ensure_plans()
    alert = None
    level = request.query_params.get("alert", "").strip()
    msg = request.query_params.get("msg", "").strip()
    if level and msg:
        alert = {"level": level, "message": msg}
    week_plan = gym_plans.get_week_plan()
    plan_violations = gym_plans.validate_week_plan(
        week_plan, [c["day_key"] for c in gym_plans.week_strip()]
    )
    return _render(
        request,
        "gym.html",
        nav="gym",
        show_date=False,
        days=gym_plans.list_days(),
        today_key=gym_plans.today_day_key(),
        week_strip=gym_plans.week_strip(),
        week_plan=week_plan,
        workout_types=gym_plans.WORKOUT_TYPES,
        plan_violations=plan_violations,
        gym_alert=alert,
        whoop=_gym_whoop_context(),
    )


@app.post("/gym/week-plan")
async def gym_set_week_plan(request: Request):
    form = await request.form()
    lists = {t: form.getlist(t) for t in gym_plans.WORKOUT_TYPES}
    result = gym_plans.week_plan_from_form(lists)
    if not result["ok"]:
        block = next(
            (v for v in result.get("violations", []) if v.get("level") == "block"),
            None,
        )
        msg = (block or {}).get("message") or "That week plan needs a tweak."
        return RedirectResponse(f"/gym?alert=block&msg={quote(msg)}", status_code=303)
    warns = [v for v in result.get("violations", []) if v.get("level") == "warn"]
    if warns:
        msg = warns[0].get("message", "Week saved.")
        return RedirectResponse(f"/gym?alert=warn&msg={quote(msg)}", status_code=303)
    return RedirectResponse("/gym", status_code=303)


@app.post("/gym/cardio-day")
def gym_set_cardio_day(day: str = Form("")):
    result = gym_plans.set_cardio_day(day)
    if not result.get("ok"):
        block = next(
            (v for v in result.get("violations", []) if v.get("level") == "block"),
            None,
        )
        msg = (block or {}).get("message") or "That needs a tweak."
        return RedirectResponse(f"/gym?alert=block&msg={quote(msg)}", status_code=303)
    return RedirectResponse("/gym", status_code=303)


@app.get("/gym/lower", response_class=HTMLResponse)
def gym_lower_hub(request: Request):
    gym_plans.ensure_plans()
    return _render(
        request,
        "gym_lower.html",
        nav="gym",
        show_date=False,
        cards=gym_plans.lower_hub_cards(),
    )


@app.get("/gym/lower/{slot}", response_class=HTMLResponse)
def gym_lower_session(request: Request, slot: str):
    gym_plans.ensure_plans()
    plan_key = gym_plans.lower_plan_key_for_slot(slot)
    if not plan_key:
        return RedirectResponse("/gym/lower", status_code=303)
    plan = gym_session.enrich_plan(gym_plans.get_plan(plan_key))
    return _render(
        request,
        "gym_session.html",
        nav="gym",
        show_date=False,
        plan=plan,
        day_key=plan_key,
        slot=slot.strip().lower(),
    )


@app.get("/gym/upper", response_class=HTMLResponse)
def gym_upper_hub(request: Request):
    gym_plans.ensure_plans()
    return _render(
        request,
        "gym_upper.html",
        nav="gym",
        show_date=False,
        cards=gym_plans.upper_abs_hub_cards(),
    )


@app.get("/gym/upper/{slot}", response_class=HTMLResponse)
def gym_upper_session(request: Request, slot: str):
    gym_plans.ensure_plans()
    plan_key = gym_plans.upper_abs_plan_key_for_slot(slot)
    if not plan_key:
        return RedirectResponse("/gym/upper", status_code=303)
    plan = gym_session.enrich_plan(gym_plans.get_plan(plan_key))
    return _render(
        request,
        "gym_session.html",
        nav="gym",
        show_date=False,
        plan=plan,
        day_key=plan_key,
        slot=slot.strip().lower(),
    )


@app.get("/gym/cardio", response_class=HTMLResponse)
def gym_cardio_hub(request: Request):
    gym_plans.ensure_plans()
    return _render(
        request,
        "gym_cardio.html",
        nav="gym",
        show_date=False,
        cards=gym_plans.cardio_hub_cards(),
    )


@app.get("/gym/cardio/{slot}", response_class=HTMLResponse)
def gym_cardio_session(request: Request, slot: str):
    gym_plans.ensure_plans()
    slot_key = slot.strip().lower()
    plan_key = gym_plans.cardio_plan_key_for_slot(slot_key)
    if not plan_key:
        return RedirectResponse("/gym/cardio", status_code=303)
    if slot_key == "running":
        from health import runs

        runs.ensure()
        ctx = runs.page_context()
        return _render(
            request,
            "gym_running.html",
            nav="gym",
            show_date=False,
            **ctx,
        )
    plan = gym_session.enrich_plan(gym_plans.get_plan(plan_key))
    return _render(
        request,
        "gym_session.html",
        nav="gym",
        show_date=False,
        plan=plan,
        day_key=plan_key,
        slot=slot_key,
    )


@app.post("/api/runs/log")
async def runs_log(request: Request):
    from health import runs

    runs.ensure()
    data = await request.json()
    try:
        duration_sec = runs.parse_duration_fields(
            data.get("hours", 0),
            data.get("minutes", 0),
        )
        entry = runs.log_run(
            data.get("miles"),
            duration_sec,
            day=data.get("day"),
            notes=data.get("notes", ""),
        )
        return JSONResponse({"ok": True, "run": entry, "chart": runs.progress_chart_data()})
    except (ValueError, TypeError) as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)


@app.get("/api/runs/chart")
def runs_chart():
    from health import runs

    runs.ensure()
    return runs.progress_chart_data()


@app.get("/gym/{day_key}", response_class=HTMLResponse)
def gym_day_page(request: Request, day_key: str):
    dk = (day_key or "").strip().lower()
    if dk in gym_plans.LOWER_PLAN_KEYS:
        slot = gym_plans.LOWER_KEY_TO_SLOT.get(dk, "one")
        return RedirectResponse(f"/gym/lower/{slot}", status_code=303)
    if dk in gym_plans.CARDIO_PLAN_KEYS:
        slot = gym_plans.CARDIO_KEY_TO_SLOT.get(dk, "running")
        return RedirectResponse(f"/gym/cardio/{slot}", status_code=303)
    if dk in gym_plans.UPPER_ABS_PLAN_KEYS:
        slot = gym_plans.UPPER_ABS_KEY_TO_SLOT.get(dk, "one")
        return RedirectResponse(f"/gym/upper/{slot}", status_code=303)
    lower_slot = gym_plans.lower_slot_for_day(dk)
    if lower_slot:
        return RedirectResponse("/gym/lower", status_code=303)
    upper_slot = gym_plans.upper_abs_slot_for_day(dk)
    if upper_slot:
        return RedirectResponse("/gym/upper", status_code=303)
    if gym_plans.get_day_workout(dk) == "cardio":
        return RedirectResponse("/gym/cardio", status_code=303)
    plan = gym_session.enrich_plan(gym_plans.get_plan(dk))
    from health.gym_gifs import EXERCISE_CATALOG
    return _render(
        request,
        "gym_day.html",
        nav="gym",
        show_date=False,
        plan=plan,
        day_key=dk,
        exercise_catalog=EXERCISE_CATALOG,
    )


@app.post("/api/gym/{day_key}/toggle")
async def gym_toggle(day_key: str, request: Request):
    data = await request.json()
    plan = gym_plans.toggle_item(day_key, data["item_id"], data.get("checked", True))
    return JSONResponse({"ok": True, "plan": plan})


@app.post("/api/gym/{day_key}/item")
async def gym_update_item(day_key: str, request: Request):
    data = await request.json()
    try:
        if data.get("action") == "add":
            plan = gym_plans.add_item(day_key, data["section_id"], data.get("text", "New exercise"))
        elif data.get("action") == "add_section":
            plan = gym_plans.add_section(day_key, data.get("title", "New section"))
        elif data.get("action") == "reset":
            plan = gym_plans.reset_checks(day_key)
        else:
            plan = gym_plans.update_item_text(day_key, data["item_id"], data.get("text", ""))
    except ValueError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    return JSONResponse({"ok": True, "plan": plan})


@app.post("/api/gym/{day_key}/chat")
async def gym_chat(day_key: str, request: Request):
    data = await request.json()
    result = gym_plans.ask_gym_ai(day_key, data.get("question", ""))
    if isinstance(result, str):
        return JSONResponse({"answer": result})
    return JSONResponse(result)


@app.post("/api/gym/{day_key}/set")
async def gym_hit_set(day_key: str, request: Request):
    data = await request.json()
    w = data.get("weight_lb")
    done = data.get("done", True)
    plan, item_meta = gym_session.toggle_set(
        day_key,
        data["item_id"],
        int(data["set_index"]),
        done=bool(done),
        weight_lb=float(w) if w not in (None, "") else None,
    )
    payload = {"ok": True, "plan": plan}
    if item_meta and done:
        payload["rest_sec"] = item_meta.get("rest_sec")
        payload["rest_label"] = item_meta.get("rest_label", "")
        payload["exercise_name"] = item_meta.get("name", "")
        payload["set_number"] = item_meta.get("set_number")
        payload["is_failure"] = item_meta.get("is_failure", False)
    return JSONResponse(payload)


@app.post("/api/gym/{day_key}/help")
async def gym_exercise_help(day_key: str, request: Request):
    data = await request.json()
    return JSONResponse(gym_session.exercise_help(day_key, data.get("name", "")))


@app.post("/api/gym/{day_key}/demo")
async def gym_exercise_demo(day_key: str, request: Request):
    data = await request.json()
    from health.gym_gifs import get_demo_gif

    return JSONResponse(get_demo_gif(data.get("name", ""), allow_web=True))


@app.post("/gym/log")
def gym_log(
    request: Request,
    workout_type: str = Form(...),
    duration_min: int = Form(0),
    notes: str = Form(""),
):
    workouts.log_workout(workout_type, duration_min or None, notes)
    return RedirectResponse("/gym", status_code=303)


@app.get("/gains", response_class=HTMLResponse)
def gains_page(request: Request):
    return RedirectResponse("/labs#progress-photos", status_code=303)


@app.get("/derm", response_class=HTMLResponse)
def derm_redirect():
    return RedirectResponse("/hygiene", status_code=302)


@app.get("/hygiene", response_class=HTMLResponse)
def hygiene_page(request: Request):
    data = derm_hygiene.page_data()
    alert = None
    level = request.query_params.get("alert", "").strip()
    msg = request.query_params.get("msg", "").strip()
    if level and msg:
        alert = {"level": level, "message": msg}
    week_plan = derm_hygiene.get_week_plan()
    return _render(
        request,
        "hygiene.html",
        nav="hygiene",
        show_date=False,
        week_strip=data["shower_week_strip"],
        shower_week_strip=data["shower_week_strip"],
        skincare_week_strip=data["skincare_week_strip"],
        all_week_strip=data["week_strip"],
        week_plan=week_plan,
        routine_types=derm_hygiene.SHOWER_ROUTINE_TYPES,
        shower_routine_types=derm_hygiene.SHOWER_ROUTINE_TYPES,
        skincare_routine_types=derm_hygiene.SKINCARE_ROUTINE_TYPES,
        hygiene_hrefs=derm_hygiene.ROUTINE_HREFS,
        hygiene_products=data["products"],
        hygiene_products_by_lane=data["products_by_lane"],
        hygiene_products_summary=data["products_summary"],
        product_categories=derm_hygiene.PRODUCT_CATEGORIES,
        hygiene_alert=alert,
    )


@app.post("/hygiene/week-plan")
async def hygiene_set_week_plan(request: Request):
    form = await request.form()
    category = request.query_params.get("category", "").strip().lower()
    if category == "shower":
        types = derm_hygiene.SHOWER_ROUTINE_TYPES
    elif category == "skincare":
        types = derm_hygiene.SKINCARE_ROUTINE_TYPES
    else:
        types = derm_hygiene.ROUTINE_TYPES
    lists = {t: form.getlist(t) for t in types}
    result = derm_hygiene.week_plan_from_form(lists, category=category or None)
    if not result["ok"]:
        block = next(
            (v for v in result.get("violations", []) if v.get("level") == "block"),
            None,
        )
        msg = (block or {}).get("message") or "That week plan needs a tweak."
        return RedirectResponse(
            f"/hygiene/pm-skincare?alert=block&msg={quote(msg)}"
            if category == "skincare"
            else f"/hygiene?alert=block&msg={quote(msg)}",
            status_code=303,
        )
    if category == "skincare":
        return RedirectResponse("/hygiene/pm-skincare", status_code=303)
    return RedirectResponse("/hygiene", status_code=303)


def _hygiene_routine_page(request: Request, routine_type: str):
    derm_hygiene.ensure_catalog()
    meta = derm_hygiene.ROUTINE_TYPES[routine_type]
    plan = derm_hygiene.get_week_plan()
    assigned = plan.get(routine_type, [])
    return _render(
        request,
        "hygiene_routine.html",
        nav="hygiene",
        show_date=False,
        routine_group=routine_type,
        routine_title=meta["label"],
        routine_emoji=meta["emoji"],
        group=derm_hygiene.group_status(routine_type),
        assigned_label=", ".join(d.capitalize() for d in assigned),
        is_today=derm_hygiene.today_day_key() in assigned,
    )


@app.get("/hygiene/daily-shower", response_class=HTMLResponse)
def hygiene_daily_shower_page(request: Request):
    derm_hygiene.ensure_catalog()
    meta = derm_hygiene.ROUTINE_TYPES["daily_shower"]
    plan = derm_hygiene.get_week_plan()
    assigned = plan.get("daily_shower", [])
    return _render(
        request,
        "hygiene_routine_guide.html",
        nav="hygiene",
        show_date=False,
        routine_title=meta["label"],
        routine_emoji=meta["emoji"],
        guide=derm_hygiene.DAILY_SHOWER_GUIDE,
        guide_theme="body",
        assigned_label=", ".join(d.capitalize() for d in assigned),
        is_today=derm_hygiene.today_day_key() in assigned,
    )


@app.get("/hygiene/everything-shower", response_class=HTMLResponse)
def hygiene_everything_shower_page(request: Request):
    derm_hygiene.ensure_catalog()
    meta = derm_hygiene.ROUTINE_TYPES["everything_shower"]
    plan = derm_hygiene.get_week_plan()
    assigned = plan.get("everything_shower", [])
    return _render(
        request,
        "hygiene_routine_guide.html",
        nav="hygiene",
        show_date=False,
        routine_title=meta["label"],
        routine_emoji=meta["emoji"],
        guide=derm_hygiene.EVERYTHING_SHOWER_GUIDE,
        guide_theme="shower",
        assigned_label=", ".join(d.capitalize() for d in assigned),
        is_today=derm_hygiene.today_day_key() in assigned,
    )


@app.get("/hygiene/hair-care", response_class=HTMLResponse)
def hygiene_hair_care_page(request: Request):
    derm_hygiene.ensure_catalog()
    meta = derm_hygiene.ROUTINE_TYPES["hair_care"]
    plan = derm_hygiene.get_week_plan()
    assigned = plan.get("hair_care", [])
    return _render(
        request,
        "hygiene_routine_guide.html",
        nav="hygiene",
        show_date=False,
        routine_title=meta["label"],
        routine_emoji=meta["emoji"],
        guide=derm_hygiene.HAIR_CARE_GUIDE,
        guide_theme="hair",
        assigned_label=", ".join(d.capitalize() for d in assigned),
        is_today=derm_hygiene.today_day_key() in assigned,
    )


@app.get("/hygiene/am-skincare", response_class=HTMLResponse)
def hygiene_am_skincare_page(request: Request):
    return _render(
        request,
        "hygiene_routine_guide.html",
        nav="hygiene",
        show_date=False,
        routine_title="AM skincare",
        routine_emoji="☀️",
        guide=derm_hygiene.AM_SKINCARE_GUIDE,
        guide_theme="skincare",
    )


@app.get("/hygiene/pm-skincare", response_class=HTMLResponse)
def hygiene_pm_skincare_hub(request: Request):
    alert = None
    level = request.query_params.get("alert", "").strip()
    msg = request.query_params.get("msg", "").strip()
    if level and msg:
        alert = {"level": level, "message": msg}
    data = derm_hygiene.page_data()
    week_plan = derm_hygiene.get_week_plan()
    return _render(
        request,
        "hygiene_pm_skincare.html",
        nav="hygiene",
        show_date=False,
        skincare_week_strip=data["skincare_week_strip"],
        week_plan=week_plan,
        skincare_routine_types=derm_hygiene.SKINCARE_ROUTINE_TYPES,
        hygiene_hrefs=derm_hygiene.ROUTINE_HREFS,
        hygiene_alert=alert,
    )


def _hygiene_pm_guide_page(request: Request, routine_type: str):
    meta = derm_hygiene.SKINCARE_ROUTINE_TYPES[routine_type]
    plan = derm_hygiene.get_week_plan()
    assigned = plan.get(routine_type, [])
    return _render(
        request,
        "hygiene_routine_guide.html",
        nav="hygiene",
        show_date=False,
        routine_title=meta["label"],
        routine_emoji=meta["emoji"],
        guide=derm_hygiene.PM_SKINCARE_GUIDES[routine_type],
        guide_theme="skincare",
        guide_intro=meta.get("guide_intro"),
        assigned_label=", ".join(d.capitalize() for d in assigned),
        is_today=derm_hygiene.today_day_key() in assigned,
        breadcrumb_href="/hygiene/pm-skincare",
        breadcrumb_label="PM skincare",
    )


@app.get("/hygiene/pm-mark-fading", response_class=HTMLResponse)
def hygiene_pm_mark_fading_page(request: Request):
    return _hygiene_pm_guide_page(request, "pm_mark_fading")


@app.get("/hygiene/pm-retinol", response_class=HTMLResponse)
def hygiene_pm_retinol_page(request: Request):
    return _hygiene_pm_guide_page(request, "pm_retinol")


@app.get("/hygiene/pm-clay-night", response_class=HTMLResponse)
def hygiene_pm_clay_night_page(request: Request):
    return _hygiene_pm_guide_page(request, "pm_clay_night")


@app.get("/hygiene/pm-panoxyl", response_class=HTMLResponse)
def hygiene_pm_panoxyl_page(request: Request):
    return _hygiene_pm_guide_page(request, "pm_panoxyl")


@app.get("/hygiene/night-skincare", response_class=HTMLResponse)
def hygiene_night_skincare_redirect():
    return RedirectResponse("/hygiene/pm-skincare", status_code=302)


@app.get("/api/hygiene/today")
def hygiene_today_api():
    return JSONResponse(derm_hygiene.page_data())


@app.post("/api/hygiene/toggle")
async def hygiene_toggle_api(request: Request):
    data = await request.json()
    try:
        status = derm_hygiene.set_done(int(data["item_id"]), bool(data.get("done", True)))
    except (ValueError, KeyError) as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    return JSONResponse(status)


@app.post("/api/hygiene/schedule/toggle")
async def hygiene_schedule_toggle_api(request: Request):
    data = await request.json()
    try:
        cal = derm_hygiene.set_schedule_done(
            str(data["event_id"]),
            str(data.get("day") or ""),
            bool(data.get("done", True)),
        )
    except (ValueError, KeyError) as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    return JSONResponse(cal)


@app.post("/api/hygiene/schedule/save")
async def hygiene_schedule_save_api(request: Request):
    data = await request.json()
    try:
        event_id = (data.get("id") or data.get("event_id") or "").strip()
        payload = {
            "id": event_id,
            "title": data.get("title"),
            "emoji": data.get("emoji"),
            "note": data.get("note"),
            "recurrence": data.get("recurrence"),
            "weekday": data.get("weekday"),
            "enabled": data.get("enabled", True),
        }
        if event_id:
            schedule = derm_hygiene.update_schedule_event(payload)
        else:
            schedule = derm_hygiene.add_schedule_event(payload)
    except (ValueError, KeyError, TypeError) as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    return JSONResponse({"schedule": schedule, "calendar": derm_hygiene.week_calendar()})


@app.post("/api/hygiene/schedule/delete")
async def hygiene_schedule_delete_api(request: Request):
    data = await request.json()
    try:
        schedule = derm_hygiene.delete_schedule_event(str(data.get("event_id") or data.get("id") or ""))
    except (ValueError, KeyError) as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    return JSONResponse({"schedule": schedule, "calendar": derm_hygiene.week_calendar()})


@app.post("/api/hygiene/product")
async def hygiene_product_api(request: Request):
    data = await request.json()
    action = (data.get("action") or "").lower()
    try:
        if action == "add":
            products = derm_hygiene.add_product(
                str(data.get("name") or ""),
                str(data.get("category") or "other"),
                str(data.get("lane") or "using"),
                str(data.get("note") or ""),
            )
        elif action == "level":
            products = derm_hygiene.set_product_level(
                str(data["product_id"]),
                str(data.get("level") or "ok"),
            )
        elif action == "lane":
            products = derm_hygiene.set_product_lane(
                str(data["product_id"]),
                str(data.get("lane") or "using"),
            )
        elif action == "note":
            products = derm_hygiene.set_product_note(
                str(data["product_id"]),
                str(data.get("note") or ""),
            )
        elif action == "shop":
            products = derm_hygiene.add_product_to_shop(str(data["product_id"]))
        elif action == "delete":
            products = derm_hygiene.delete_product(str(data["product_id"]))
        else:
            return JSONResponse({"ok": False, "error": "Unknown action"}, status_code=400)
    except (ValueError, KeyError) as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    by_lane = {
        lane: [p for p in products if p.get("lane", "using") == lane]
        for lane in derm_hygiene.PRODUCT_LANES
    }
    return JSONResponse(
        {
            "products": products,
            "products_by_lane": by_lane,
            "summary": derm_hygiene.products_summary(),
        }
    )


@app.post("/api/hygiene/item")
async def hygiene_item_api(request: Request):
    data = await request.json()
    action = (data.get("action") or "").lower()
    try:
        if action == "add":
            status = derm_hygiene.add_item(
                str(data.get("text") or ""),
                str(data.get("routine_group") or "morning"),
            )
        elif action == "update":
            status = derm_hygiene.update_item(int(data["item_id"]), str(data.get("text") or ""))
        elif action == "delete":
            status = derm_hygiene.delete_item(int(data["item_id"]))
        else:
            return JSONResponse({"ok": False, "error": "Unknown action"}, status_code=400)
    except (ValueError, KeyError) as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    return JSONResponse(status)


@app.post("/api/hygiene/log-all")
async def hygiene_log_all_api(request: Request):
    data = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    group = str((data or {}).get("routine_group") or "morning")
    return JSONResponse(derm_hygiene.log_all_group(group))


@app.get("/api/derm/today")
def derm_today_api_legacy():
    return JSONResponse(derm_hygiene.today_status())


@app.post("/api/derm/toggle")
async def derm_toggle_api_legacy(request: Request):
    data = await request.json()
    status = derm_hygiene.set_done(int(data["item_id"]), bool(data.get("done", True)))
    return JSONResponse(status)


@app.post("/api/derm/log-all")
def derm_log_all_api_legacy():
    return JSONResponse(derm_hygiene.log_all_group("morning"))


@app.post("/gains/upload")
async def gains_upload(request: Request, tag: str = Form("front"), photo: UploadFile = File(...)):
    tmp = HEALTH_DATA / "progress_photos" / f"_upload_{photo.filename}"
    tmp.write_bytes(await photo.read())
    progress_photos.save_photo(str(tmp), tag=tag)
    return RedirectResponse("/labs#progress-photos", status_code=303)


@app.get("/healthz")
def healthz():
    return JSONResponse({"ok": True, "build": app_build(), "labs": len(all_lab_draws())})


@app.get("/api/autopilot/today")
def autopilot_today_api():
    return autopilot.today_status()


@app.get("/labs", response_class=HTMLResponse)
def labs_page(request: Request, uploaded: str = "", wearable: str = ""):
    tests = screening.list_screening()
    tests_due = any(t["status"] != "ok" for t in tests)
    raw_draws = all_lab_draws()
    lab_sections = build_lab_sections(raw_draws)
    total_tests = sum(len(d.get("values", [])) for d in raw_draws)
    upload_msg = None
    if uploaded == "ok":
        upload_msg = {"type": "ok", "text": "Report imported — your data was updated automatically."}
    elif uploaded == "fail":
        upload_msg = {"type": "err", "text": request.cookies.get("lab_upload_err", "Could not read that PDF.")}
    wearable_msg = None
    wearable_flash = {
        "whoop_ok": ("ok", "WHOOP connected and synced."),
        "whoop_fail": ("err", "WHOOP connection failed — check credentials and try again."),
        "whoop_config_saved": ("ok", "WHOOP credentials saved."),
        "whoop_config": ("err", "Add WHOOP client ID and secret first."),
        "whoop_sync_ok": ("ok", "WHOOP data synced (raw RHR/HRV/sleep only)."),
        "whoop_sync_fail": ("err", "WHOOP sync failed — reconnect or check API access."),
        "apple_ok": ("ok", "Apple Health CSV imported."),
        "apple_fail": ("err", "Could not read that CSV — use Export All Health Data from iPhone."),
    }
    if wearable in wearable_flash:
        kind, text = wearable_flash[wearable]
        wearable_msg = {"type": kind, "text": text}
    return _render(
        request,
        "labs.html",
        nav="data",
        page_title="My Data",
        lab_sections=lab_sections,
        data_overview={
            "visits": len(raw_draws),
            "tests": total_tests,
            "sections": len(lab_sections),
            "latest_date": lab_sections[0]["last_date_display"] if lab_sections else "Date: —",
            "build": app_build(),
        },
        current_status=current_section_status(raw_draws),
        tests=tests,
        tests_due=tests_due,
        documents=list_lab_documents(),
        upload_msg=upload_msg,
        cycle=cycle.cycle_overview(),
        photos=_progress_photo_cards(),
        wearable_status=wearables.status(),
        whoop_configured=bool(wearables.whoop_config().get("client_id")),
        wearable_msg=wearable_msg,
    )


@app.get("/my-data", response_class=HTMLResponse)
def my_data_page(request: Request, uploaded: str = ""):
    return labs_page(request, uploaded)


@app.post("/data/cycle/flow")
def cycle_flow_route(flow: str = Form(...)):
    cycle.log_flow(flow)
    return RedirectResponse("/labs", status_code=303)


@app.post("/data/cycle/start")
def cycle_start_route():
    cycle.start_period()
    return RedirectResponse("/labs", status_code=303)


@app.get("/data/wearables/whoop/connect")
def whoop_connect():
    if not wearables.whoop_config().get("client_id"):
        return RedirectResponse("/labs?wearable=whoop_config", status_code=303)
    return RedirectResponse(wearables.whoop_auth_url(), status_code=303)


@app.get("/data/wearables/whoop/callback")
def whoop_callback(code: str = "", error: str = ""):
    if error or not code:
        return RedirectResponse("/labs?wearable=whoop_fail", status_code=303)
    try:
        wearables.whoop_exchange_code(code)
        wearables.sync_whoop()
        return RedirectResponse("/labs?wearable=whoop_ok", status_code=303)
    except Exception:
        return RedirectResponse("/labs?wearable=whoop_fail", status_code=303)


@app.post("/data/wearables/whoop/config")
async def whoop_config_route(request: Request):
    form = await request.form()
    wearables.save_whoop_config(
        str(form.get("client_id") or ""),
        str(form.get("client_secret") or ""),
        str(form.get("redirect_uri") or ""),
    )
    return RedirectResponse("/labs?wearable=whoop_config_saved", status_code=303)


@app.post("/data/wearables/whoop/sync")
def whoop_sync_route():
    result = wearables.sync_whoop()
    status = "whoop_sync_ok" if result.get("ok") else "whoop_sync_fail"
    return RedirectResponse(f"/labs?wearable={status}", status_code=303)


@app.post("/data/wearables/apple/import")
async def apple_health_import_route(csv: UploadFile = File(...)):
    content = await csv.read()
    result = wearables.import_apple_health_csv(content)
    status = "apple_ok" if result.get("ok") else "apple_fail"
    return RedirectResponse(f"/labs?wearable={status}", status_code=303)


@app.post("/labs/upload")
async def labs_upload(request: Request, pdf: UploadFile = File(...)):
    from health.paths import HEALTH_DATA

    tmp = HEALTH_DATA / "documents" / f"_upload_{pdf.filename or 'lab.pdf'}"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(await pdf.read())
    resp = RedirectResponse("/labs?uploaded=ok", status_code=303)
    try:
        summary = import_health_pdf(tmp)
        kind = summary.get("type", "blood")
        msg = "Gynecology report added." if kind == "gynecology" else "Blood test results updated."
        resp = RedirectResponse(f"/labs?uploaded=ok&kind={kind}", status_code=303)
        resp.set_cookie("lab_upload_summary", json.dumps(summary), max_age=60)
    except Exception as e:
        resp = RedirectResponse("/labs?uploaded=fail", status_code=303)
        resp.set_cookie("lab_upload_err", str(e)[:200], max_age=60)
    return resp


@app.get("/tests", response_class=HTMLResponse)
def tests_page_redirect():
    return RedirectResponse("/labs", status_code=302)


@app.get("/phone")
def phone_page():
    url = get_phone_url()
    if url:
        return RedirectResponse(url, status_code=302)
    return HTMLResponse(
        "<p>Connect your Mac to Wi‑Fi and restart the app. Then open /links on your Mac.</p>",
        status_code=503,
    )


@app.get("/api/phone-url")
def phone_url_api():
    url = get_phone_url() or _save_phone_url()
    data = _load_phone_url_data()
    return JSONResponse(
        {
            "url": url,
            "ready": bool(url),
            "tunnel_url": data.get("tunnel_url"),
            "lan_url": data.get("lan_url"),
            "updated_at": data.get("updated_at"),
        }
    )


@app.get("/links", response_class=HTMLResponse)
def links_page(request: Request):
    phone_url = get_phone_url()
    tunnel = _load_phone_url_data().get("tunnel_url") or ""
    link_note = (
        "Bookmark this page on your iPhone. Same link stays live while Melani Health is running on your Mac."
        if tunnel
        else "Same Wi‑Fi as your Mac — or restart the app for a cellular link."
    )
    html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="Melani Health">
    <title>Melani Health</title>
    <style>body{{font-family:-apple-system,sans-serif;background:#191919;color:#fff;padding:24px;max-width:420px;margin:0 auto}}
    a{{display:block;background:#2383e2;color:#fff;text-decoration:none;padding:16px;border-radius:12px;margin-bottom:12px;text-align:center;font-weight:600}}
    a.primary{{background:#22c55e;font-size:1.05rem}}
    p{{color:#888;font-size:0.9rem;line-height:1.5}}
    .phone-box{{background:#2a2a2a;padding:14px;border-radius:10px;margin-bottom:16px;font-size:0.85rem;color:#ccc;word-break:break-all}}
    .phone-box strong{{color:#fff;display:block;margin-bottom:6px}}
    .pin{{color:#fda4af;font-weight:700}}</style></head><body>
    <h1>Melani Health</h1>
    <div class="phone-box"><strong>📱 Phone link</strong>
    {link_note}<br><br>
    <a href="/links" style="padding:0;background:none;text-align:left;margin:0;color:#7dd3fc">{phone_url or '/links'}</a>
    <p style="margin-top:10px">PIN: <span class="pin">8299</span></p></div>
    <p>Tap any link — updates on your Mac show here automatically:</p>
    <a href="/" class="primary">Today</a>
    <a href="/meals">Meals</a>
    <a href="/gym">Gym</a>
    <a href="/gym/{gym_plans.today_day_key()}">Today's workout</a>
    <a href="/hygiene">Hygiene</a>
    <a href="/grocery">Shop</a>
    <a href="/labs">My Data</a>
    </body></html>"""
    return HTMLResponse(html)


@app.get("/grocery", response_class=HTMLResponse)
def grocery_page(request: Request):
    items = grocery.list_items(checked_only=False)
    unchecked = [i for i in items if not i.get("checked")]
    return _render(
        request,
        "grocery.html",
        nav="grocery",
        items=items,
        unchecked=unchecked,
        sparky_prompt=grocery.format_sparky_prompt([i["name"] for i in unchecked]),
    )


@app.get("/api/grocery/sparky-prompt")
def grocery_sparky_prompt():
    unchecked = [i for i in grocery.list_items(checked_only=False) if not i.get("checked")]
    prompt = grocery.format_sparky_prompt([i["name"] for i in unchecked])
    return {"prompt": prompt, "count": len(unchecked), "items": [i["name"] for i in unchecked]}


@app.post("/grocery/add")
def grocery_add(request: Request, name: str = Form(...)):
    grocery.add_item(name)
    return RedirectResponse("/grocery", status_code=303)


@app.get("/grocery/suggest")
@app.post("/grocery/suggest")
def grocery_suggest_removed():
    return RedirectResponse("/grocery", status_code=302)


@app.post("/grocery/toggle/{item_id}")
def grocery_toggle(item_id: int, request: Request, checked: int = Form(0)):
    grocery.toggle_item(item_id, bool(checked))
    return RedirectResponse("/grocery", status_code=303)


@app.post("/grocery/delete/{item_id}")
def grocery_delete(item_id: int):
    grocery.delete_item(item_id)
    return RedirectResponse("/grocery", status_code=303)


@app.post("/api/grocery/scan/barcode")
async def grocery_scan_barcode(request: Request):
    data = await request.json()
    return JSONResponse(product_scanner.scan_barcode(data.get("barcode", "")))


@app.post("/api/grocery/scan/photo")
async def grocery_scan_photo(photo: UploadFile = File(...)):
    tmp = HEALTH_DATA / "grocery" / f"_scan_{photo.filename}"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(await photo.read())
    return JSONResponse(product_scanner.scan_label_photo(str(tmp)))


@app.post("/api/grocery/add-scanned")
async def grocery_add_scanned(request: Request):
    data = await request.json()
    notes = data.get("notes") or []
    reason = "; ".join(notes[:2]) if notes else data.get("reason", "")
    item = grocery.add_item(
        data.get("name", "Product"),
        added_by="scan",
        reason=reason,
        barcode=data.get("barcode"),
        health_score=data.get("score"),
        health_verdict=data.get("verdict"),
    )
    return JSONResponse({"ok": True, "item": item})


@app.get("/api/jarvis/history")
def jarvis_history_api():
    return JSONResponse({"messages": jarvis_chat.get_chat_messages()})


@app.post("/api/jarvis/new-chat")
def jarvis_new_chat_api():
    return JSONResponse(jarvis_chat.clear_chat_history())


@app.get("/api/jarvis/nudges")
def jarvis_nudges_api():
    return JSONResponse({"nudges": jarvis_chat.pending_nudges()})


@app.post("/api/jarvis/nudge")
async def jarvis_nudge_api(request: Request):
    data = await request.json()
    result = jarvis_chat.answer_nudge(data.get("id", ""), data.get("answer", ""))
    return JSONResponse(result or {"ok": False})


@app.get("/api/jarvis/status")
def jarvis_status_api():
    """Whether an answer is currently generating (for non-blocking chat)."""
    return JSONResponse(jarvis_chat.chat_status())


@app.post("/api/jarvis/chat")
async def jarvis_chat_api(request: Request):
    ct = request.headers.get("content-type", "")
    if "multipart/form-data" in ct:
        form = await request.form()
        question = str(form.get("question") or "")
        upload = form.get("image")
        supplement_id = form.get("supplement_id")
        photo_mode = str(form.get("photo_mode") or "auto")
        image_bytes = None
        if upload is not None and hasattr(upload, "read"):
            image_bytes = await upload.read()
            if not image_bytes:
                image_bytes = None
        sid = int(supplement_id) if supplement_id not in (None, "") else None
        return JSONResponse(
            jarvis_chat.start_chat_job(
                question,
                image_bytes=image_bytes,
                supplement_id=sid,
                photo_mode=photo_mode,
            )
        )

    data = await request.json()
    sid = data.get("supplement_id")
    return JSONResponse(
        jarvis_chat.start_chat_job(
            data.get("question", ""),
            supplement_id=int(sid) if sid not in (None, "") else None,
            photo_mode=str(data.get("photo_mode") or "auto"),
        )
    )


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"
