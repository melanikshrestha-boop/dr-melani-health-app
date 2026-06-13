"""Media uploads and inbox scanning."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from . import calendar
from .paths import CONTENT_DATA, CONTENT_INBOX, ensure_dirs

VIDEO_EXT = {".mp4", ".mov", ".webm", ".m4v"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def save_upload(file_bytes: bytes, filename: str, kind: str = "shorts") -> str:
    ensure_dirs()
    ext = Path(filename).suffix.lower() or ".mp4"
    dest_dir = CONTENT_DATA / kind
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    path = dest_dir / name
    path.write_bytes(file_bytes)
    return str(path)


def save_thumbnail(file_bytes: bytes, filename: str) -> str:
    ensure_dirs()
    ext = Path(filename).suffix.lower() or ".jpg"
    path = CONTENT_DATA / "thumbnails" / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(file_bytes)
    return str(path)


def save_linkedin_image(file_bytes: bytes, filename: str) -> str:
    ensure_dirs()
    ext = Path(filename).suffix.lower() or ".jpg"
    path = CONTENT_DATA / "linkedin" / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(file_bytes)
    return str(path)


def scan_inbox() -> list[dict]:
    ensure_dirs()
    created = []
    for path in sorted(CONTENT_INBOX.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in VIDEO_EXT:
            continue
        dest = CONTENT_DATA / "shorts" / path.name
        if not dest.exists():
            shutil.move(str(path), str(dest))
        else:
            dest = CONTENT_DATA / "shorts" / f"{uuid.uuid4().hex}{path.suffix}"
            shutil.move(str(path), str(dest))
        bundle = calendar.create_bundle(
            video_path=str(dest),
            caption=path.stem.replace("_", " "),
            status="queued",
        )
        try:
            from . import workflows

            workflows.enqueue_bundle(bundle["id"])
        except Exception:
            pass
        created.append(bundle)
    return created
