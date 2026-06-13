"""FastAPI Melani Content dashboard — port 8782."""

from __future__ import annotations

import json
import socket
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content import calendar, media, setup_status, workflows  # noqa: E402
from content.config import load_config, save_config  # noqa: E402
from content.db import init_db  # noqa: E402
from content import oauth  # noqa: E402
from content.paths import CONTENT_DATA, PHONE_URL_FILE, ensure_dirs  # noqa: E402
from content.publishers import bundle as bundle_pub  # noqa: E402
from content.publishers import instagram, linkedin, tiktok, youtube  # noqa: E402
from content.scheduler import start_scheduler, stop_scheduler  # noqa: E402
from content.web_auth import CONTENT_SESSION_COOKIE, pin_ok, session_token_for_pin  # noqa: E402
from content.build_stamp import read_build_stamp, write_build_stamp  # noqa: E402
from health.web_auth import DEFAULT_PIN, verify_pin  # noqa: E402

APP_PORT = 8782


def app_build() -> str:
    return read_build_stamp()


app = FastAPI(title="Melani Content")
WEB_DIR = Path(__file__).parent
templates = Jinja2Templates(directory=str(WEB_DIR / "templates"))
templates.env.auto_reload = True
app.mount("/static", StaticFiles(directory=str(WEB_DIR / "static")), name="static")

ensure_dirs()
init_db()


@app.on_event("startup")
def on_startup():
    write_build_stamp()
    start_scheduler()
    media.scan_inbox()


@app.on_event("shutdown")
def on_shutdown():
    stop_scheduler()


@app.middleware("http")
async def no_cache_guard(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/static/"):
        response.headers["Cache-Control"] = f"public, max-age=3600, stale-while-revalidate=60"
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
    if path.startswith("/media/") and request.query_params.get("token"):
        return await call_next(request)
    if pin_ok(request.cookies):
        return await call_next(request)
    if path.startswith("/api/"):
        return JSONResponse({"detail": "PIN required — open /login"}, status_code=401)
    return RedirectResponse("/login", status_code=302)


def _ctx(request: Request, **extra):
    return {
        "request": request,
        "display_date": date.today().strftime("%A, %B %d"),
        "app_build": app_build(),
        "show_date": extra.pop("show_date", True),
        **extra,
    }


def _render(request: Request, template: str, **extra):
    return templates.TemplateResponse(request, template, _ctx(request, **extra))


def _phone_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip if ip and not ip.startswith("127.") else ""
    except OSError:
        return ""


def _save_phone_url() -> str | None:
    urls = []
    if PHONE_URL_FILE.exists():
        try:
            data = json.loads(PHONE_URL_FILE.read_text())
            tunnel = (data.get("tunnel_url") or "").rstrip("/")
            if tunnel and "api.trycloudflare" not in tunnel:
                urls.append(tunnel)
        except (json.JSONDecodeError, OSError):
            pass
    ip = _phone_ip()
    if ip:
        urls.append(f"http://{ip}:{APP_PORT}")
    if not urls:
        return None
    base = urls[0]
    PHONE_URL_FILE.write_text(json.dumps({"url": f"{base}/", "tunnel_url": base}))
    cfg = load_config()
    cfg["public_video_base_url"] = base
    save_config(cfg)
    tok = oauth.get_tokens("instagram") or {}
    if tok:
        tok["public_video_base_url"] = base
        oauth.save_tokens("instagram", tok, (oauth.account_info("instagram") or {}).get("account_name", ""))
    return f"{base}/"


@app.get("/healthz")
def healthz():
    return {"ok": True, "app": "melani-content", "build": app_build()}


@app.get("/login", response_class=HTMLResponse)
def login_get(request: Request):
    return _render(request, "content/login.html", nav="", error=None)


@app.post("/login")
def login_post(request: Request, pin: str = Form(...)):
    token = session_token_for_pin(pin)
    if not token:
        return _render(request, "content/login.html", nav="", error="Wrong PIN")
    resp = RedirectResponse("/", status_code=303)
    resp.set_cookie(CONTENT_SESSION_COOKIE, token, httponly=True, max_age=60 * 60 * 24 * 30)
    return resp


@app.get("/", response_class=HTMLResponse)
def today_page(request: Request):
    items = calendar.today_items()
    platforms = setup_status.all_platform_status()
    wfs = workflows.list_workflows()
    queue = workflows.queue_summary()
    return _render(
        request,
        "content/today.html",
        nav="today",
        items=items,
        platforms=platforms,
        workflows=wfs,
        queue=queue,
    )


@app.get("/calendar", response_class=HTMLResponse)
def calendar_page(request: Request):
    week = calendar.week_items()
    return _render(request, "content/calendar.html", nav="calendar", week=week)


@app.get("/create", response_class=HTMLResponse)
def create_page(request: Request, kind: str = ""):
    return _render(request, "content/create.html", nav="create", kind=kind or "bundle")


@app.post("/create/bundle")
async def create_bundle_post(
    request: Request,
    video: UploadFile = File(...),
    caption: str = Form(...),
    hashtags: str = Form(""),
    scheduled_at: str = Form(""),
    publish_now: str = Form(""),
    add_to_queue: str = Form("1"),
):
    data = await video.read()
    path = media.save_upload(data, video.filename or "video.mp4", "shorts")
    if publish_now == "1":
        status = "draft"
    elif add_to_queue == "1":
        status = "queued"
    elif scheduled_at:
        status = "scheduled"
    else:
        status = "draft"
    bundle = calendar.create_bundle(
        video_path=path,
        caption=caption.strip(),
        hashtags_raw=hashtags,
        scheduled_at=scheduled_at or None,
        status=status,
    )
    if add_to_queue == "1" and publish_now != "1":
        workflows.enqueue_bundle(bundle["id"])
    if publish_now == "1":
        bundle_pub.publish_short_bundle(bundle["id"])
    return RedirectResponse("/workflows", status_code=303)


@app.post("/create/linkedin")
async def create_linkedin_post(
    request: Request,
    body: str = Form(...),
    scheduled_at: str = Form(""),
    recurring: str = Form(""),
    image: Optional[UploadFile] = File(None),
    publish_now: str = Form(""),
):
    image_path = None
    if image and image.filename:
        image_path = media.save_linkedin_image(await image.read(), image.filename)
    status = "scheduled" if scheduled_at else "draft"
    post = calendar.create_linkedin_post(
        body=body,
        image_path=image_path,
        scheduled_at=scheduled_at or None,
        recurring=recurring == "1",
        status=status,
    )
    if publish_now == "1":
        result = linkedin.publish_post(body, image_path)
        if result.get("ok"):
            calendar.update_linkedin_post(
                post["id"], status="published", post_url=result.get("post_url")
            )
    return RedirectResponse("/library", status_code=303)


@app.post("/create/youtube")
async def create_youtube_post(
    request: Request,
    video: UploadFile = File(...),
    title: str = Form(...),
    description: str = Form(""),
    scheduled_at: str = Form(""),
    is_short: str = Form("0"),
    publish_now: str = Form(""),
):
    data = await video.read()
    kind = "shorts" if is_short == "1" else "youtube"
    path = media.save_upload(data, video.filename or "video.mp4", kind)
    status = "scheduled" if scheduled_at else "draft"
    vid = calendar.create_youtube_video(
        video_path=path,
        title=title,
        description=description,
        scheduled_at=scheduled_at or None,
        is_short=is_short == "1",
        status=status,
    )
    if publish_now == "1":
        result = youtube.publish_video(path, title, description, is_short=is_short == "1")
        if result.get("ok"):
            calendar.update_youtube_video(
                vid["id"], status="published", post_url=result.get("post_url")
            )
    return RedirectResponse("/library", status_code=303)


@app.get("/workflows", response_class=HTMLResponse)
def workflows_page(request: Request):
    wfs = workflows.list_workflows()
    queue = workflows.queue_summary()
    return _render(request, "content/workflows.html", nav="workflows", workflows=wfs, queue=queue)


@app.post("/workflows/toggle/{workflow_id}")
def workflows_toggle(workflow_id: int, enabled: str = Form("0")):
    workflows.toggle_workflow(workflow_id, enabled == "1")
    return RedirectResponse("/workflows", status_code=303)


@app.post("/api/content/parse-hashtags")
async def api_parse_hashtags(request: Request):
    from content.caption import full_caption, parse_hashtags, prepare_bundle_fields

    form = await request.form()
    caption = str(form.get("caption") or "")
    hashtags = str(form.get("hashtags") or "")
    fields = prepare_bundle_fields(caption, hashtags)
    return JSONResponse(
        {
            "tags": fields["hashtags_list"],
            "full_caption": fields["full_caption"],
            "count": len(fields["hashtags_list"]),
        }
    )


@app.get("/library", response_class=HTMLResponse)
def library_page(request: Request):
    items = calendar.library_items()
    return _render(request, "content/library.html", nav="library", items=items)


@app.post("/library/publish/{kind}/{item_id}")
def library_publish(kind: str, item_id: int):
    if kind == "bundle":
        bundle_pub.publish_short_bundle(item_id)
    elif kind == "linkedin":
        post = calendar.get_linkedin_post(item_id)
        if post:
            result = linkedin.publish_post(post["body"], post.get("image_path"))
            if result.get("ok"):
                calendar.update_linkedin_post(
                    item_id, status="published", post_url=result.get("post_url")
                )
    elif kind == "youtube":
        vid = calendar.get_youtube_video(item_id)
        if vid:
            result = youtube.publish_video(
                vid["video_path"],
                vid["title"],
                vid.get("description") or "",
                tags=vid.get("tags_list") or [],
                is_short=bool(vid.get("is_short")),
            )
            if result.get("ok"):
                calendar.update_youtube_video(
                    item_id, status="published", post_url=result.get("post_url")
                )
    return RedirectResponse("/library", status_code=303)


@app.post("/library/retry/{bundle_id}")
def library_retry(bundle_id: int):
    bundle_pub.retry_failed_platforms(bundle_id)
    return RedirectResponse("/library", status_code=303)


@app.get("/setup", response_class=HTMLResponse)
def setup_page(request: Request):
    cfg = load_config()
    platforms = setup_status.all_platform_status()
    return _render(request, "content/setup.html", nav="setup", platforms=platforms, config=cfg)


@app.post("/setup/config")
async def setup_config_save(request: Request):
    form = await request.form()
    cfg = load_config()
    for platform in ("youtube", "linkedin", "instagram", "tiktok"):
        pcfg = cfg["platforms"][platform]
        for key in pcfg:
            field = f"{platform}_{key}"
            if field in form:
                pcfg[key] = str(form[field])
    cfg["linkedin_daily_time"] = str(form.get("linkedin_daily_time") or cfg.get("linkedin_daily_time"))
    cfg["youtube_weekly_time"] = str(form.get("youtube_weekly_time") or cfg.get("youtube_weekly_time"))
    if "profiles" not in cfg:
        cfg["profiles"] = {}
    for key in ("youtube", "linkedin", "instagram", "tiktok"):
        field = f"profile_{key}"
        if field in form:
            cfg["profiles"][key] = str(form[field]).strip()
    save_config(cfg)
    return RedirectResponse("/setup?saved=1", status_code=303)


@app.get("/oauth/{platform}/start")
def oauth_start(platform: str):
    handlers = {
        "youtube": youtube.auth_url,
        "linkedin": linkedin.auth_url,
        "instagram": instagram.auth_url,
        "tiktok": tiktok.auth_url,
    }
    if platform not in handlers:
        return RedirectResponse("/setup", status_code=302)
    state = oauth.new_oauth_state(platform)
    return RedirectResponse(handlers[platform](state), status_code=302)


@app.get("/oauth/{platform}/callback")
def oauth_callback(platform: str, code: str = "", state: str = "", error: str = ""):
    if error:
        return RedirectResponse(f"/setup?error={error}", status_code=302)
    expected = oauth.pop_oauth_state(state)
    if expected != platform:
        return RedirectResponse("/setup?error=invalid_state", status_code=302)
    handlers = {
        "youtube": youtube.exchange_code,
        "linkedin": linkedin.exchange_code,
        "instagram": instagram.exchange_code,
        "tiktok": tiktok.exchange_code,
    }
    try:
        handlers[platform](code)
        return RedirectResponse(f"/setup?connected={platform}", status_code=302)
    except Exception as exc:
        return RedirectResponse(f"/setup?error={str(exc)[:120]}", status_code=302)


@app.post("/setup/disconnect/{platform}")
def setup_disconnect(platform: str):
    oauth.disconnect(platform)
    return RedirectResponse("/setup", status_code=303)


@app.get("/media/{filename}")
def serve_media(filename: str):
    for sub in ("shorts", "youtube", "videos"):
        path = CONTENT_DATA / sub / filename
        if path.exists():
            return FileResponse(path)
    return JSONResponse({"detail": "not found"}, status_code=404)


@app.get("/links")
def links_page():
    """Legacy URL — one bookmark at / is enough."""
    return RedirectResponse("/", status_code=302)


@app.get("/api/content/today")
def api_today():
    return JSONResponse(calendar.today_items())


@app.get("/api/content/status")
def api_status():
    return JSONResponse({"platforms": setup_status.all_platform_status()})


@app.post("/api/content/scan-inbox")
def api_scan_inbox():
    created = media.scan_inbox()
    return JSONResponse({"created": len(created), "items": created})
