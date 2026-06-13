"""App build stamp — bumps on every server start so refresh always picks up updates."""

from __future__ import annotations

from datetime import datetime

from .paths import CONFIG_DIR

BUILD_FILE = CONFIG_DIR / "content_build.txt"


def write_build_stamp() -> str:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    BUILD_FILE.write_text(stamp, encoding="utf-8")
    return stamp


def read_build_stamp() -> str:
    if BUILD_FILE.exists():
        try:
            return BUILD_FILE.read_text(encoding="utf-8").strip()
        except OSError:
            pass
    return write_build_stamp()
