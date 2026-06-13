from pathlib import Path

HOME = Path.home()
CONFIG_DIR = HOME / ".melani_assistant"
HEALTH_DATA = CONFIG_DIR / "health_data"
DB_PATH = CONFIG_DIR / "health.db"
HEALTH_INBOX = CONFIG_DIR / "health_inbox"
SEED_FILE = Path(__file__).parent / "seed_baseline.json"

DIRS = [
    HEALTH_DATA,
    HEALTH_DATA / "labs" / "draws",
    HEALTH_DATA / "labs",
    HEALTH_DATA / "daily",
    HEALTH_DATA / "vitals",
    HEALTH_DATA / "symptoms",
    HEALTH_DATA / "supplements",
    HEALTH_DATA / "hygiene",
    HEALTH_DATA / "cycle",
    HEALTH_DATA / "nutrition" / "meals",
    HEALTH_DATA / "nutrition" / "daily_totals",
    HEALTH_DATA / "water",
    HEALTH_DATA / "workouts",
    HEALTH_DATA / "workouts" / "runs",
    HEALTH_DATA / "progress_photos",
    HEALTH_DATA / "grocery" / "suggestions",
    HEALTH_DATA / "documents",
    HEALTH_DATA / "journal",
    HEALTH_INBOX,
]


def ensure_dirs():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    for d in DIRS:
        d.mkdir(parents=True, exist_ok=True)
