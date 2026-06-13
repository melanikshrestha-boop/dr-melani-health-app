"""Instagram Graph API — Reels publishing."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from ..config import load_config, platform_config
from ..oauth import get_tokens, save_tokens

META_AUTH = "https://www.facebook.com/v21.0/dialog/oauth"
META_TOKEN = "https://graph.facebook.com/v21.0/oauth/access_token"
GRAPH = "https://graph.facebook.com/v21.0"
SCOPES = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement"


def auth_url(state: str) -> str:
    cfg = platform_config("instagram")
    params = {
        "client_id": cfg.get("app_id", ""),
        "redirect_uri": cfg.get("redirect_uri", ""),
        "scope": SCOPES,
        "response_type": "code",
        "state": state,
    }
    q = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{META_AUTH}?{q}"


def exchange_code(code: str) -> dict[str, Any]:
    cfg = platform_config("instagram")
    resp = requests.get(
        META_TOKEN,
        params={
            "client_id": cfg.get("app_id", ""),
            "client_secret": cfg.get("app_secret", ""),
            "redirect_uri": cfg.get("redirect_uri", ""),
            "code": code,
        },
        timeout=30,
    )
    resp.raise_for_status()
    tokens = resp.json()
    if tokens.get("expires_in"):
        tokens["expires_at"] = (
            datetime.now(timezone.utc).timestamp() + float(tokens["expires_in"])
        )
    ig_id, ig_name = _resolve_ig_account(tokens["access_token"])
    tokens["instagram_business_id"] = ig_id
    save_tokens("instagram", tokens, ig_name or "Instagram")
    return tokens


def _resolve_ig_account(access_token: str) -> tuple[str, str]:
    pages = requests.get(
        f"{GRAPH}/me/accounts",
        params={"access_token": access_token},
        timeout=30,
    )
    pages.raise_for_status()
    for page in pages.json().get("data") or []:
        page_token = page.get("access_token")
        page_id = page.get("id")
        ig = requests.get(
            f"{GRAPH}/{page_id}",
            params={
                "fields": "instagram_business_account{name,username}",
                "access_token": page_token,
            },
            timeout=30,
        )
        if not ig.ok:
            continue
        acct = (ig.json().get("instagram_business_account") or {})
        if acct.get("id"):
            return acct["id"], acct.get("username") or acct.get("name") or "Instagram"
    raise RuntimeError("No Instagram Business account linked to your Facebook Pages")


def publish_reel(video_path: str, caption: str) -> dict[str, Any]:
    tokens = get_tokens("instagram")
    if not tokens:
        return {"ok": False, "error": "Instagram not connected — open Setup tab"}
    ig_id = tokens.get("instagram_business_id")
    if not ig_id:
        return {"ok": False, "error": "Instagram business ID missing — reconnect in Setup"}
    path = Path(video_path)
    if not path.exists():
        return {"ok": False, "error": f"Video not found: {video_path}"}

    # Meta requires a public video URL for container creation.
    cfg = load_config()
    video_url = tokens.get("public_video_base_url") or cfg.get("public_video_base_url")
    if not video_url:
        return {
            "ok": False,
            "error": (
                "Instagram requires a public video URL. Set public_video_base_url in "
                "content_config.json pointing to your tunnel, or use Publish Now while "
                "Melani Content tunnel is running."
            ),
        }
    public_url = f"{video_url.rstrip('/')}/media/{path.name}"

    create = requests.post(
        f"{GRAPH}/{ig_id}/media",
        data={
            "media_type": "REELS",
            "video_url": public_url,
            "caption": caption[:2200],
            "access_token": tokens["access_token"],
        },
        timeout=60,
    )
    if not create.ok:
        return {"ok": False, "error": create.text[:500]}
    container_id = create.json().get("id")
    if not container_id:
        return {"ok": False, "error": "Instagram container creation failed"}

    for _ in range(30):
        status = requests.get(
            f"{GRAPH}/{container_id}",
            params={"fields": "status_code", "access_token": tokens["access_token"]},
            timeout=30,
        )
        code = (status.json() or {}).get("status_code")
        if code == "FINISHED":
            break
        if code == "ERROR":
            return {"ok": False, "error": "Instagram video processing failed"}
        time.sleep(2)
    else:
        return {"ok": False, "error": "Instagram video processing timed out"}

    publish = requests.post(
        f"{GRAPH}/{ig_id}/media_publish",
        data={"creation_id": container_id, "access_token": tokens["access_token"]},
        timeout=60,
    )
    if not publish.ok:
        return {"ok": False, "error": publish.text[:500]}
    media_id = publish.json().get("id", "")
    return {
        "ok": True,
        "post_url": f"https://instagram.com/reel/{media_id}" if media_id else "",
        "platform_id": media_id,
    }
