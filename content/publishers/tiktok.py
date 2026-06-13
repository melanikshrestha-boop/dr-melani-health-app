"""TikTok Content Posting API — direct video publish."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from ..config import platform_config
from ..oauth import get_tokens, save_tokens

TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_CREATOR = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/"
TIKTOK_INIT = "https://open.tiktokapis.com/v2/post/publish/video/init/"
TIKTOK_STATUS = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"
SCOPES = "video.publish"


def auth_url(state: str) -> str:
    cfg = platform_config("tiktok")
    params = {
        "client_key": cfg.get("client_key", ""),
        "response_type": "code",
        "scope": SCOPES,
        "redirect_uri": cfg.get("redirect_uri", ""),
        "state": state,
    }
    q = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{TIKTOK_AUTH}?{q}"


def exchange_code(code: str) -> dict[str, Any]:
    cfg = platform_config("tiktok")
    resp = requests.post(
        TIKTOK_TOKEN,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "client_key": cfg.get("client_key", ""),
            "client_secret": cfg.get("client_secret", ""),
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": cfg.get("redirect_uri", ""),
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    tokens = data.get("data") or data
    if tokens.get("expires_in"):
        tokens["expires_at"] = (
            datetime.now(timezone.utc).timestamp() + float(tokens["expires_in"])
        )
    name = _creator_name(tokens.get("access_token", ""))
    save_tokens("tiktok", tokens, name)
    return tokens


def _creator_name(access_token: str) -> str:
    if not access_token:
        return "TikTok"
    resp = requests.post(
        TIKTOK_CREATOR,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json={},
        timeout=30,
    )
    if not resp.ok:
        return "TikTok"
    data = (resp.json().get("data") or {})
    return data.get("creator_nickname") or data.get("creator_username") or "TikTok"


def publish_video(video_path: str, caption: str) -> dict[str, Any]:
    tokens = get_tokens("tiktok")
    if not tokens:
        return {"ok": False, "error": "TikTok not connected — open Setup tab"}
    access = tokens.get("access_token")
    if not access:
        return {"ok": False, "error": "TikTok token missing — reconnect in Setup"}
    path = Path(video_path)
    if not path.exists():
        return {"ok": False, "error": f"Video not found: {video_path}"}

    creator = requests.post(
        TIKTOK_CREATOR,
        headers={
            "Authorization": f"Bearer {access}",
            "Content-Type": "application/json",
        },
        json={},
        timeout=30,
    )
    if not creator.ok:
        return {"ok": False, "error": creator.text[:500]}
    privacy_options = (creator.json().get("data") or {}).get("privacy_level_options") or []
    privacy = privacy_options[0] if privacy_options else "PUBLIC_TO_EVERYONE"

    init = requests.post(
        TIKTOK_INIT,
        headers={
            "Authorization": f"Bearer {access}",
            "Content-Type": "application/json",
        },
        json={
            "post_info": {
                "title": caption[:150],
                "description": caption[:2200],
                "privacy_level": privacy,
                "disable_duet": False,
                "disable_comment": False,
                "disable_stitch": False,
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": path.stat().st_size,
                "chunk_size": path.stat().st_size,
                "total_chunk_count": 1,
            },
        },
        timeout=60,
    )
    if not init.ok:
        return {"ok": False, "error": init.text[:500]}
    init_data = (init.json().get("data") or {})
    upload_url = init_data.get("upload_url")
    publish_id = init_data.get("publish_id")
    if not upload_url or not publish_id:
        return {"ok": False, "error": "TikTok init failed"}

    video_bytes = path.read_bytes()
    upload = requests.put(
        upload_url,
        headers={
            "Content-Type": "video/mp4",
            "Content-Length": str(len(video_bytes)),
            "Content-Range": f"bytes 0-{len(video_bytes) - 1}/{len(video_bytes)}",
        },
        data=video_bytes,
        timeout=600,
    )
    if not upload.ok:
        return {"ok": False, "error": upload.text[:500]}

    for _ in range(60):
        status = requests.post(
            TIKTOK_STATUS,
            headers={
                "Authorization": f"Bearer {access}",
                "Content-Type": "application/json",
            },
            json={"publish_id": publish_id},
            timeout=30,
        )
        if status.ok:
            st = (status.json().get("data") or {}).get("status")
            if st == "PUBLISH_COMPLETE":
                return {"ok": True, "post_url": "", "platform_id": publish_id}
            if st == "FAILED":
                return {"ok": False, "error": "TikTok publish failed"}
        time.sleep(2)
    return {"ok": False, "error": "TikTok publish timed out"}
