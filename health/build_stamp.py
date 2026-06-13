"""Health app build stamp — changes when code updates so refresh picks up new features."""

from __future__ import annotations

import hashlib
from pathlib import Path

from .paths import CONFIG_DIR

BUILD_FILE = CONFIG_DIR / "health_build.txt"
ROOT = Path(__file__).resolve().parent.parent
WATCH_DIRS = (ROOT / "web", ROOT / "health")
WATCH_SUFFIXES = {".py", ".html", ".js", ".css"}


def _code_fingerprint() -> str:
    parts: list[str] = []
    for base in WATCH_DIRS:
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix not in WATCH_SUFFIXES:
                continue
            rel = path.relative_to(ROOT).as_posix()
            parts.append(f"{rel}:{path.stat().st_mtime_ns}")
    digest = hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()
    return digest[:12]


def write_build_stamp() -> str:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = _code_fingerprint()
    BUILD_FILE.write_text(stamp, encoding="utf-8")
    return stamp


def read_build_stamp() -> str:
    current = _code_fingerprint()
    if BUILD_FILE.exists():
        try:
            saved = BUILD_FILE.read_text(encoding="utf-8").strip()
            if saved == current:
                return saved
        except OSError:
            pass
    return write_build_stamp()
