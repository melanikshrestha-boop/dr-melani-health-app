from __future__ import annotations

"""Progress / gains photos."""

import shutil
from datetime import datetime
from pathlib import Path

from .db import get_conn, today
from .paths import HEALTH_DATA


def save_photo(src_path: str, tag: str = "front", day: str | None = None, notes: str = "") -> dict:
    day = day or today()
    src = Path(src_path)
    if not src.exists():
        raise FileNotFoundError(src_path)
    dest_dir = HEALTH_DATA / "progress_photos"
    dest = dest_dir / f"{day}_{tag}{src.suffix.lower() or '.jpg'}"
    shutil.copy2(src, dest)
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO progress_photos (day, tag, path, notes, uploaded_at)
               VALUES (?, ?, ?, ?, ?)""",
            (day, tag, str(dest), notes, datetime.now().isoformat()),
        )
    return {"day": day, "tag": tag, "path": str(dest)}


def list_photos(limit: int = 50) -> list:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM progress_photos ORDER BY day DESC, id DESC LIMIT ?", (limit,)
        ).fetchall()]
