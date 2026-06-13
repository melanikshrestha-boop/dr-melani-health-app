from pathlib import Path

HOME = Path.home()
CONFIG_DIR = HOME / ".melani_assistant"
CONTENT_DATA = CONFIG_DIR / "content_data"
DB_PATH = CONFIG_DIR / "content.db"
CONTENT_INBOX = CONFIG_DIR / "content_inbox"
CONTENT_CONFIG = CONFIG_DIR / "content_config.json"
PHONE_URL_FILE = CONFIG_DIR / "content_phone_url.json"
TOKEN_DIR = CONTENT_DATA / "tokens"

DIRS = [
    CONTENT_DATA,
    CONTENT_DATA / "videos",
    CONTENT_DATA / "shorts",
    CONTENT_DATA / "linkedin",
    CONTENT_DATA / "youtube",
    CONTENT_DATA / "thumbnails",
    CONTENT_INBOX,
    TOKEN_DIR,
]

PLATFORMS = ("youtube", "linkedin", "instagram", "tiktok")


def ensure_dirs():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    for d in DIRS:
        d.mkdir(parents=True, exist_ok=True)
