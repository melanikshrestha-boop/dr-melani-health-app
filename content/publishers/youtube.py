"""YouTube Data API v3 — Shorts and long-form uploads."""

from __future__ import annotations

import json
import mimetypes
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from ..config import platform_config
from ..oauth import get_tokens, save_tokens

YOUTUBE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
YOUTUBE_TOKEN = "https://oauth2.googleapis.com/token"
YOUTUBE_UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos"
YOUTUBE_CHANNELS = "https://www.googleapis.com/youtube/v3/channels"
SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"


def auth_url(state: str) -> str:
    cfg = platform_config("youtube")
    params = {
        "client_id": cfg.get("client_id", ""),
        "redirect_uri": cfg.get("redirect_uri", ""),
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    q = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{YOUTUBE_AUTH}?{q}"


def exchange_code(code: str) -> dict[str, Any]:
    cfg = platform_config("youtube")
    resp = requests.post(
        YOUTUBE_TOKEN,
        data={
            "code": code,
            "client_id": cfg.get("client_id", ""),
            "client_secret": cfg.get("client_secret", ""),
            "redirect_uri": cfg.get("redirect_uri", ""),
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    resp.raise_for_status()
    tokens = resp.json()
    if tokens.get("expires_in"):
        tokens["expires_at"] = (
            datetime.now(timezone.utc).timestamp() + float(tokens["expires_in"])
        )
    channel = _fetch_channel(tokens["access_token"])
    save_tokens("youtube", tokens, channel.get("title", "YouTube"))
    return tokens


def _refresh_if_needed(tokens: dict[str, Any]) -> dict[str, Any]:
    expires = tokens.get("expires_at")
    if expires and float(expires) > datetime.now(timezone.utc).timestamp() + 60:
        return tokens
    refresh = tokens.get("refresh_token")
    if not refresh:
        raise RuntimeError("YouTube token expired — reconnect in Setup")
    cfg = platform_config("youtube")
    resp = requests.post(
        YOUTUBE_TOKEN,
        data={
            "client_id": cfg.get("client_id", ""),
            "client_secret": cfg.get("client_secret", ""),
            "refresh_token": refresh,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    resp.raise_for_status()
    new_tokens = resp.json()
    merged = {**tokens, **new_tokens}
    if merged.get("expires_in"):
        merged["expires_at"] = (
            datetime.now(timezone.utc).timestamp() + float(merged["expires_in"])
        )
    channel = _fetch_channel(merged["access_token"])
    save_tokens("youtube", merged, channel.get("title", "YouTube"))
    return merged


def _fetch_channel(access_token: str) -> dict[str, Any]:
    resp = requests.get(
        YOUTUBE_CHANNELS,
        params={"part": "snippet", "mine": "true"},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    if not resp.ok:
        return {}
    items = resp.json().get("items") or []
    if not items:
        return {}
    return items[0].get("snippet") or {}


def publish_video(
    video_path: str,
    title: str,
    description: str = "",
    tags: list[str] | None = None,
    is_short: bool = False,
    scheduled_at: str | None = None,
) -> dict[str, Any]:
    tokens = get_tokens("youtube")
    if not tokens:
        return {"ok": False, "error": "YouTube not connected — open Setup tab"}
    tokens = _refresh_if_needed(tokens)
    path = Path(video_path)
    if not path.exists():
        return {"ok": False, "error": f"Video not found: {video_path}"}

    snippet = {
        "title": title[:100],
        "description": description[:5000],
        "categoryId": "22",
    }
    if tags:
        snippet["tags"] = tags[:500]

    body: dict[str, Any] = {
        "snippet": snippet,
        "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False},
    }
    if is_short:
        body["snippet"]["description"] = f"{description}\n#Shorts"[:5000]
    if scheduled_at:
        try:
            dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
            if dt > datetime.now(dt.tzinfo or timezone.utc):
                body["status"]["privacyStatus"] = "private"
                body["status"]["publishAt"] = dt.astimezone(timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                )
        except ValueError:
            pass

    mime, _ = mimetypes.guess_type(str(path))
    mime = mime or "video/mp4"
    metadata = json.dumps(body)
    init = requests.post(
        YOUTUBE_UPLOAD,
        params={"part": "snippet,status", "uploadType": "resumable"},
        headers={
            "Authorization": f"Bearer {tokens['access_token']}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": str(path.stat().st_size),
            "X-Upload-Content-Type": mime,
        },
        data=metadata,
        timeout=60,
    )
    if not init.ok:
        return {"ok": False, "error": init.text[:500]}
    upload_url = init.headers.get("Location")
    if not upload_url:
        return {"ok": False, "error": "YouTube did not return upload URL"}

    with path.open("rb") as f:
        upload = requests.put(
            upload_url,
            headers={
                "Content-Type": mime,
                "Content-Length": str(path.stat().st_size),
            },
            data=f,
            timeout=600,
        )
    if not upload.ok:
        return {"ok": False, "error": upload.text[:500]}
    data = upload.json()
    vid = data.get("id", "")
    return {
        "ok": True,
        "post_url": f"https://youtube.com/watch?v={vid}" if vid else "",
        "platform_id": vid,
    }
