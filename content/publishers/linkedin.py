"""LinkedIn Share API — daily text posts with optional image."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from ..config import platform_config
from ..oauth import get_tokens, save_tokens

LINKEDIN_AUTH = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_UGC = "https://api.linkedin.com/v2/ugcPosts"
LINKEDIN_USER = "https://api.linkedin.com/v2/userinfo"
LINKEDIN_ASSETS = "https://api.linkedin.com/v2/assets?action=registerUpload"
SCOPES = "openid profile w_member_social"


def auth_url(state: str) -> str:
    cfg = platform_config("linkedin")
    params = {
        "response_type": "code",
        "client_id": cfg.get("client_id", ""),
        "redirect_uri": cfg.get("redirect_uri", ""),
        "scope": SCOPES,
        "state": state,
    }
    q = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{LINKEDIN_AUTH}?{q}"


def exchange_code(code: str) -> dict[str, Any]:
    cfg = platform_config("linkedin")
    resp = requests.post(
        LINKEDIN_TOKEN,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": cfg.get("redirect_uri", ""),
            "client_id": cfg.get("client_id", ""),
            "client_secret": cfg.get("client_secret", ""),
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    resp.raise_for_status()
    tokens = resp.json()
    if tokens.get("expires_in"):
        tokens["expires_at"] = (
            datetime.now(timezone.utc).timestamp() + float(tokens["expires_in"])
        )
    name = "LinkedIn"
    if tokens.get("access_token"):
        info = requests.get(
            LINKEDIN_USER,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            timeout=30,
        )
        if info.ok:
            name = info.json().get("name") or info.json().get("email") or name
            tokens["sub"] = info.json().get("sub")
    save_tokens("linkedin", tokens, name)
    return tokens


def _person_urn(tokens: dict[str, Any]) -> str:
    sub = tokens.get("sub")
    if not sub:
        info = requests.get(
            LINKEDIN_USER,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            timeout=30,
        )
        info.raise_for_status()
        sub = info.json().get("sub")
        tokens["sub"] = sub
    return f"urn:li:person:{sub}"


def publish_post(body: str, image_path: str | None = None) -> dict[str, Any]:
    tokens = get_tokens("linkedin")
    if not tokens:
        return {"ok": False, "error": "LinkedIn not connected — open Setup tab"}
    if not tokens.get("access_token"):
        return {"ok": False, "error": "LinkedIn token missing — reconnect in Setup"}

    author = _person_urn(tokens)
    share_content: dict[str, Any] = {
        "shareCommentary": {"text": body[:3000]},
        "shareMediaCategory": "NONE",
    }

    if image_path and Path(image_path).exists():
        asset = _upload_image(tokens, image_path, author)
        if asset.get("ok"):
            share_content = {
                "shareCommentary": {"text": body[:3000]},
                "shareMediaCategory": "IMAGE",
                "media": [
                    {
                        "status": "READY",
                        "description": {"text": body[:200]},
                        "media": asset["asset"],
                        "title": {"text": "Post"},
                    }
                ],
            }
        elif asset.get("error"):
            return asset

    payload = {
        "author": author,
        "lifecycleState": "PUBLISHED",
        "specificContent": {"com.linkedin.ugc.ShareContent": share_content},
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    resp = requests.post(
        LINKEDIN_UGC,
        headers={
            "Authorization": f"Bearer {tokens['access_token']}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        },
        json=payload,
        timeout=60,
    )
    if not resp.ok:
        return {"ok": False, "error": resp.text[:500]}
    post_id = resp.headers.get("x-restli-id") or resp.json().get("id", "")
    return {
        "ok": True,
        "post_url": f"https://www.linkedin.com/feed/update/{post_id}" if post_id else "",
        "platform_id": post_id,
    }


def _upload_image(tokens: dict[str, Any], image_path: str, author: str) -> dict[str, Any]:
    reg = requests.post(
        LINKEDIN_ASSETS,
        headers={
            "Authorization": f"Bearer {tokens['access_token']}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        },
        json={
            "registerUploadRequest": {
                "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
                "owner": author,
                "serviceRelationships": [
                    {
                        "relationshipType": "OWNER",
                        "identifier": "urn:li:userGeneratedContent",
                    }
                ],
            }
        },
        timeout=30,
    )
    if not reg.ok:
        return {"ok": False, "error": reg.text[:300]}
    value = reg.json().get("value") or {}
    upload_url = (value.get("uploadMechanism") or {}).get(
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest", {}
    ).get("uploadUrl")
    asset = value.get("asset")
    if not upload_url or not asset:
        return {"ok": False, "error": "LinkedIn image upload registration failed"}
    img = Path(image_path).read_bytes()
    up = requests.put(
        upload_url,
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        data=img,
        timeout=120,
    )
    if not up.ok:
        return {"ok": False, "error": up.text[:300]}
    return {"ok": True, "asset": asset}
