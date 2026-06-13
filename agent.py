#!/usr/bin/env python3
"""
Melani's Assistant — Personal AI agent via Telegram.

Usage on your phone (in Telegram, message your bot):
  unlock no such thing as tomorrow   → start a session
  what files are on my desktop?      → ask anything
  lock                               → end session
"""

from __future__ import annotations

import os, sys, json, time, subprocess, hashlib, re, logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

try:
    import requests
    from bs4 import BeautifulSoup
    from openai import OpenAI
except ImportError:
    print("Run: pip3 install -r requirements.txt")
    sys.exit(1)

try:
    from health.db import init_db
    from health.agent_tools import run_health_tool
    from health.nutrition import add_water, save_meal, save_checkin, today_summary
    from health.food_scanner import scan_meal_photo
    from health.screening import due_reminders
    from health import grocery as grocery_mod
    HEALTH_ENABLED = True
    init_db(seed=True)
except Exception as _health_err:
    HEALTH_ENABLED = False
    logging.warning(f"Health module not loaded: {_health_err}")

# ── config ────────────────────────────────────────────────────────────────────
HOME        = Path.home()
CONFIG_DIR  = HOME / ".melani_assistant"
CONFIG_FILE = CONFIG_DIR / "config.json"
LOG_FILE    = CONFIG_DIR / "agent.log"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("melani")

def load_config() -> dict:
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            return json.load(f)
    return {}

def hash_phrase(p: str) -> str:
    return hashlib.sha256(p.strip().encode()).hexdigest()

# ── Ollama (local, free AI) ───────────────────────────────────────────────────
ollama = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")

# ── session ───────────────────────────────────────────────────────────────────
class Session:
    def __init__(self):
        self.unlocked = False
        self.last_active: Optional[datetime] = None
        self.history: list = []
        self.chat_id: Optional[int] = None  # only respond to the first person who unlocks

    def unlock(self, chat_id: int, timeout: int):
        self.unlocked = True
        self.last_active = datetime.now()
        self.history = []
        self.chat_id = chat_id

    def touch(self):
        self.last_active = datetime.now()

    def expired(self, timeout: int) -> bool:
        if not self.unlocked or not self.last_active:
            return True
        return datetime.now() - self.last_active > timedelta(minutes=timeout)

    def lock(self):
        self.unlocked = False
        self.history = []

SESSION = Session()

# ── Telegram helpers ──────────────────────────────────────────────────────────
def tg(method: str, token: str, **params):
    url = f"https://api.telegram.org/bot{token}/{method}"
    r = requests.post(url, json=params, timeout=10)
    return r.json()

def send(token: str, chat_id: int, text: str):
    # Split long messages
    for i in range(0, len(text), 4000):
        tg("sendMessage", token, chat_id=chat_id, text=text[i:i+4000])
        time.sleep(0.3)
    log.info(f"Replied to chat {chat_id}")

def get_updates(token: str, offset: int) -> list:
    try:
        r = tg("getUpdates", token, offset=offset, timeout=20, allowed_updates=["message"])
        return r.get("result", [])
    except Exception as e:
        log.error(f"getUpdates error: {e}")
        return []

# ── tools ─────────────────────────────────────────────────────────────────────
TOOLS = [
    {
        "name": "read_file",
        "description": "Read the contents of a file on Melani's Mac.",
        "input_schema": {"type":"object","properties":{"path":{"type":"string"}},"required":["path"]},
    },
    {
        "name": "list_directory",
        "description": "List files and folders in a directory.",
        "input_schema": {"type":"object","properties":{"path":{"type":"string"},"show_hidden":{"type":"boolean"}},"required":["path"]},
    },
    {
        "name": "search_files",
        "description": "Search for files by name or content.",
        "input_schema": {"type":"object","properties":{"query":{"type":"string"},"directory":{"type":"string"},"content_search":{"type":"boolean"}},"required":["query"]},
    },
    {
        "name": "get_system_info",
        "description": "Get battery, disk space, and memory info.",
        "input_schema": {"type":"object","properties":{}},
    },
    {
        "name": "get_calendar_events",
        "description": "Get upcoming calendar events.",
        "input_schema": {"type":"object","properties":{"days_ahead":{"type":"integer"}}},
    },
    {
        "name": "open_website",
        "description": "Open a website in Safari and read the page content. Works for banking, news, any site.",
        "input_schema": {"type":"object","properties":{"url":{"type":"string"}},"required":["url"]},
    },
    {
        "name": "web_search",
        "description": "Search the web.",
        "input_schema": {"type":"object","properties":{"query":{"type":"string"}},"required":["query"]},
    },
    {
        "name": "take_screenshot",
        "description": "Take a screenshot of the Mac screen.",
        "input_schema": {"type":"object","properties":{}},
    },
    {
        "name": "run_command",
        "description": "Run a safe shell command on the Mac (read-only operations).",
        "input_schema": {"type":"object","properties":{"command":{"type":"string"}},"required":["command"]},
    },
]

HEALTH_TOOLS = [
    {"name": "health_query", "description": "Query Melani's health data: labs, today summary, water, meals, sleep.",
     "input_schema": {"type":"object","properties":{"query":{"type":"string"}}}},
    {"name": "health_lab_summary", "description": "Full lab history with all values and flags.",
     "input_schema": {"type":"object","properties":{}}},
    {"name": "health_screening_due", "description": "List upcoming and overdue medical tests.",
     "input_schema": {"type":"object","properties":{}}},
    {"name": "water_log", "description": "Log water intake in ml toward 4L daily goal.",
     "input_schema": {"type":"object","properties":{"amount_ml":{"type":"integer"}},"required":["amount_ml"]}},
    {"name": "health_checkin", "description": "Log sleep: bedtime, wake_time (HH:MM), optional notes.",
     "input_schema": {"type":"object","properties":{"bedtime":{"type":"string"},"wake_time":{"type":"string"},"notes":{"type":"string"}}}},
    {"name": "grocery_add", "description": "Add item to grocery shopping list.",
     "input_schema": {"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}},
    {"name": "grocery_suggest", "description": "AI suggest groceries based on lab results (LDL, lipids, etc).",
     "input_schema": {"type":"object","properties":{}}},
    {"name": "workout_log", "description": "Log a workout session.",
     "input_schema": {"type":"object","properties":{"type":{"type":"string"},"duration_min":{"type":"integer"},"notes":{"type":"string"}},"required":["type"]}},
    {"name": "health_auto_log", "description": "Parse natural language and log sleep, meals, water, brain fog, weight, workout, period flow, grocery — one message can log multiple things.",
     "input_schema": {"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}},
]

ALL_TOOLS = TOOLS + (HEALTH_TOOLS if HEALTH_ENABLED else [])

def run_tool(name: str, args: dict) -> str:
    try:
        if name == "read_file":
            p = Path(args["path"].replace("~", str(HOME)))
            if not p.exists(): return f"File not found: {p}"
            if p.stat().st_size > 500_000: return "File too large (>500KB)."
            return p.read_text(errors="replace")[:8000]

        elif name == "list_directory":
            p = Path(args["path"].replace("~", str(HOME)))
            if not p.exists(): return f"Not found: {p}"
            show = args.get("show_hidden", False)
            lines = []
            for item in sorted(p.iterdir()):
                if not show and item.name.startswith("."): continue
                tag = "DIR " if item.is_dir() else "FILE"
                size = f"  ({item.stat().st_size:,} bytes)" if item.is_file() else ""
                lines.append(f"{tag}  {item.name}{size}")
            return "\n".join(lines) or "Empty."

        elif name == "search_files":
            q = args["query"]
            d = args.get("directory", str(HOME)).replace("~", str(HOME))
            if args.get("content_search"):
                cmd = ["grep", "-rl", q, d, "--include=*.txt", "--include=*.md",
                       "--include=*.csv", "--include=*.py", "--include=*.json"]
            else:
                cmd = ["find", d, "-iname", f"*{q}*", "-not", "-path", "*/.*"]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            lines = [l for l in r.stdout.strip().split("\n") if l][:40]
            return "\n".join(lines) or "No results."

        elif name == "get_system_info":
            bat  = subprocess.run(["pmset","-g","batt"], capture_output=True, text=True).stdout.strip()
            disk = subprocess.run(["df","-h","/"], capture_output=True, text=True).stdout.strip()
            return f"BATTERY:\n{bat}\n\nDISK:\n{disk}"

        elif name == "get_calendar_events":
            days = args.get("days_ahead", 7)
            script = f'''
            set out to ""
            tell application "Calendar"
                set s to current date
                set e to s + ({days} * days)
                repeat with c in calendars
                    repeat with ev in (every event of c whose start date >= s and start date <= e)
                        set out to out & (summary of ev) & " — " & (start date of ev as string) & "\\n"
                    end repeat
                end repeat
            end tell
            return out
            '''
            r = subprocess.run(["osascript","-e",script], capture_output=True, text=True)
            return r.stdout.strip() or "No upcoming events."

        elif name == "open_website":
            url = args["url"]
            script = f'''
            tell application "Safari"
                activate
                set URL of front document to "{url}"
                delay 3
                return do JavaScript "document.body.innerText" in front document
            end tell
            '''
            r = subprocess.run(["osascript","-e",script], capture_output=True, text=True, timeout=15)
            return r.stdout.strip()[:5000] or f"Opened {url} in Safari."

        elif name == "web_search":
            q = args["query"]
            url = f"https://duckduckgo.com/html/?q={requests.utils.quote(q)}"
            h = {"User-Agent": "Mozilla/5.0"}
            soup = BeautifulSoup(requests.get(url, headers=h, timeout=10).text, "html.parser")
            results = []
            for r in soup.find_all("div", class_="result__body")[:5]:
                t = r.find("a", class_="result__a")
                s = r.find("a", class_="result__snippet")
                if t: results.append(f"• {t.get_text()}\n  {s.get_text() if s else ''}")
            return "\n\n".join(results) or "No results."

        elif name == "take_screenshot":
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            path = f"/tmp/screenshot_{ts}.png"
            subprocess.run(["screencapture", "-x", path], check=True)
            return f"Screenshot saved to {path}"

        elif name == "run_command":
            cmd = args["command"]
            # Safety: block destructive commands
            blocked = ["rm ","rmdir","sudo","mkfs","dd ","chmod","chown","> /","curl","wget"]
            if any(b in cmd for b in blocked):
                return "That command is blocked for safety."
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
            return (r.stdout + r.stderr).strip()[:3000] or "Done."

        elif HEALTH_ENABLED and name in {t["name"] for t in HEALTH_TOOLS}:
            return run_health_tool(name, args)

        return f"Unknown tool: {name}"
    except subprocess.TimeoutExpired:
        return "Timed out."
    except Exception as e:
        return f"Error: {e}"

# ── AI agent ──────────────────────────────────────────────────────────────────
SYSTEM = """You are Dr. Melani — Melani Shrestha's personal health intelligence on Telegram. Clinical, precise, data-first.

Profile: DOB 8/24/2007, F. Migraine/chronic pain + cardio/metabolic monitoring.
Known lab flags (3/26/2026): LDL 120, Total chol 207, TG 119, Non-HDL 143 (HIGH). A1C 5.3%, glucose 89, TSH 1.06 normal.
Provider: Ververis, Megan. Labs: Quest West Hills + USC ESHC.

You track: daily sleep, 4L water, 3 meals (macros), workouts, gains photos, full labs, screening schedule, grocery list.
Never diagnose. Cite numbers and dates. Cross-check evidence with her data. Not a doctor.

Also help with Mac files/calendar when asked. Keep Telegram replies short."""

def run_agent(text: str) -> str:
    openai_tools = [{"type":"function","function":{"name":t["name"],"description":t["description"],"parameters":t["input_schema"]}} for t in ALL_TOOLS]
    messages = [{"role":"system","content":SYSTEM}] + SESSION.history + [{"role":"user","content":text}]

    for _ in range(10):  # max tool rounds
        try:
            resp = ollama.chat.completions.create(model="llama3", messages=messages, tools=openai_tools)
        except Exception as e:
            return f"AI error: {e}"

        msg = resp.choices[0].message
        messages.append({"role":"assistant","content":msg.content,"tool_calls":msg.tool_calls})

        if not msg.tool_calls:
            SESSION.history = messages[1:]  # save without system prompt
            return (msg.content or "").strip()

        for tc in msg.tool_calls:
            try: a = json.loads(tc.function.arguments)
            except: a = {}
            log.info(f"Tool: {tc.function.name}({str(a)[:80]})")
            result = run_tool(tc.function.name, a)
            messages.append({"role":"tool","tool_call_id":tc.id,"content":result})

    return "Sorry, something went wrong."

# ── quick commands + photos ───────────────────────────────────────────────────
def _quick_health(text: str) -> str | None:
    if not HEALTH_ENABLED:
        return None
    t = text.lower().strip()
    if t.startswith("log water") or t.startswith("water "):
        ml = 250
        for part in t.split():
            if part.isdigit():
                ml = int(part)
                break
        if "l" in t and "ml" not in t:
            ml = ml * 1000 if ml < 10 else ml
        from health.nutrition import add_water as aw
        r = aw(ml)
        return f"Water: {r['total_ml']}/{r['goal_ml']} ml"
    if "due" in t and ("test" in t or "screen" in t or "lab" in t):
        msgs = due_reminders(60)
        return "\n".join(msgs) if msgs else "No tests due in 60 days."
    if "grocery" in t and "suggest" in t:
        snap = grocery_mod.suggest_groceries()
        names = [a.get("name", "") for a in snap.get("added", [])]
        return f"Added: {', '.join(names)}. Not medical advice."
    if t.startswith("add ") and "grocery" in t:
        item = t.replace("add", "").replace("to grocery list", "").replace("grocery", "").strip()
        if item:
            grocery_mod.add_item(item)
            return f"Added: {item}"
    return None


def handle_photo(token: str, chat_id: int, file_id: str, caption: str, cfg: dict):
    if not HEALTH_ENABLED or not SESSION.unlocked:
        return
    if SESSION.chat_id and chat_id != SESSION.chat_id:
        return
    try:
        fr = tg("getFile", cfg["telegram_token"], file_id=file_id)
        path = fr["result"]["file_path"]
        url = f"https://api.telegram.org/file/bot{cfg['telegram_token']}/{path}"
        data = requests.get(url, timeout=30).content
        tmp = CONFIG_DIR / "health_data" / "nutrition" / "meals" / f"tg_{file_id}.jpg"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_bytes(data)
        scan = scan_meal_photo(str(tmp))
        slot = "lunch"
        cap = caption.lower()
        if "breakfast" in cap:
            slot = "breakfast"
        elif "snack" in cap:
            slot = "snack_pm" if "pm" in cap or "afternoon" in cap else "snack_am"
        elif "dinner" in cap:
            slot = "dinner"
        save_meal(slot, scan.get("name", "Meal"), scan.get("calories"), scan.get("protein_g"),
                  scan.get("carbs_g"), scan.get("fat_g"), scan.get("fiber_g"), source="ai_scan", photo_path=str(tmp))
        send(token, chat_id,
             f"Meal scanned ({slot}):\n{scan.get('name','')}\n"
             f"Cal {scan.get('calories')} · P {scan.get('protein_g')}g · C {scan.get('carbs_g')}g · F {scan.get('fat_g')}g\n"
             f"Confirm on dashboard if needed.")
    except Exception as e:
        send(token, chat_id, f"Scan failed: {e}")

# ── message handler ───────────────────────────────────────────────────────────
def handle(token: str, chat_id: int, text: str, cfg: dict):
    text = text.strip()
    timeout = cfg.get("session_timeout_minutes", 60)
    log.info(f"Message from {chat_id}: {text[:80]}")

    # Expire old session
    if SESSION.expired(timeout) and SESSION.unlocked:
        SESSION.lock()
        send(token, chat_id, "Session expired. Send 'unlock <passphrase>' to start again.")
        return

    # UNLOCK
    if text.lower().startswith("unlock "):
        attempt = text[7:].strip()
        if hash_phrase(attempt) == cfg.get("passphrase_hash",""):
            SESSION.unlock(chat_id, timeout)
            cfg["nudge_chat_id"] = chat_id
            with open(CONFIG_FILE, "w") as f:
                json.dump(cfg, f, indent=2)
            send(token, chat_id, f"Hi Melani! Dr. Melani ready. Session {timeout} min.")
        else:
            send(token, chat_id, "Wrong passphrase.")
        return

    # LOCK
    if text.lower() in ("lock","lock session"):
        SESSION.lock()
        send(token, chat_id, "Locked. Send 'unlock <passphrase>' to start a new session.")
        return

    # STATUS
    if text.lower() in ("status","ping"):
        if SESSION.unlocked:
            mins = timeout - int((datetime.now() - SESSION.last_active).total_seconds() / 60)
            send(token, chat_id, f"Active — {mins} min remaining.")
        else:
            send(token, chat_id, "Locked. Send 'unlock <passphrase>' to start.")
        return

    # Require unlock
    if not SESSION.unlocked:
        send(token, chat_id, "Send 'unlock <passphrase>' to start a session.")
        return

    # Security: only respond to the person who unlocked
    if SESSION.chat_id and chat_id != SESSION.chat_id:
        return

    SESSION.touch()
    quick = _quick_health(text)
    if quick:
        send(token, chat_id, quick)
        return
    reply = run_agent(text)
    send(token, chat_id, reply)


def maybe_nudge(token: str, cfg: dict):
    """Daily reminders via unified autopilot rules + content calendar."""
    chat_id = cfg.get("nudge_chat_id")
    if not chat_id:
        return
    if HEALTH_ENABLED:
        from health.autopilot import pending_telegram_messages, mark_telegram_sent

        for kind, message in pending_telegram_messages(cfg):
            send(token, chat_id, message)
            mark_telegram_sent(kind)
    try:
        from content.telegram_nudges import pending_nudge_message

        content_msg = pending_nudge_message()
        if content_msg:
            send(token, chat_id, content_msg)
    except Exception as e:
        log.error(f"Content nudge error: {e}")

# ── main loop ─────────────────────────────────────────────────────────────────
def main():
    cfg = load_config()
    token = cfg.get("telegram_token","")
    if not token:
        print("No telegram_token in config. Run: python3 setup.py")
        sys.exit(1)

    # Verify token works
    me = tg("getMe", token)
    if not me.get("ok"):
        print(f"Bad token: {me}")
        sys.exit(1)
    bot_name = me["result"]["first_name"]
    log.info(f"{bot_name} is online. Waiting for messages...")

    offset = 0
    last_nudge_check = 0
    while True:
        updates = get_updates(token, offset)
        for u in updates:
            offset = u["update_id"] + 1
            msg = u.get("message", {})
            chat_id = msg.get("chat", {}).get("id")
            text = msg.get("text", "")
            photos = msg.get("photo", [])
            if chat_id and photos and HEALTH_ENABLED:
                try:
                    if SESSION.unlocked and (not SESSION.chat_id or chat_id == SESSION.chat_id):
                        handle_photo(token, chat_id, photos[-1]["file_id"], text or "", cfg)
                except Exception as e:
                    log.error(f"Photo error: {e}")
            if chat_id and text:
                try:
                    handle(token, chat_id, text, cfg)
                except Exception as e:
                    log.error(f"Handle error: {e}")
        if time.time() - last_nudge_check > 300:
            try:
                maybe_nudge(token, cfg)
            except Exception as e:
                log.error(f"Nudge error: {e}")
            last_nudge_check = time.time()
        time.sleep(1)

if __name__ == "__main__":
    main()
