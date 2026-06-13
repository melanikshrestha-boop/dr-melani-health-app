"""Platform setup checklist, quick links, and connection status."""

from __future__ import annotations

from typing import Any

from . import oauth
from .config import load_config, platform_config

PLATFORM_SETUP: dict[str, dict[str, Any]] = {
    "youtube": {
        "order": 1,
        "tagline": "Start here — usually works same day. API is free.",
        "profile_key": "youtube",
        "redirect_field": "redirect_uri",
        "links": [
            {
                "label": "Google Cloud Console",
                "url": "https://console.cloud.google.com/",
                "hint": "Create or open a project",
            },
            {
                "label": "Enable YouTube Data API v3",
                "url": "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
                "hint": "Click Enable",
            },
            {
                "label": "Create OAuth credentials",
                "url": "https://console.cloud.google.com/apis/credentials",
                "hint": "OAuth client → Web application",
            },
            {
                "label": "OAuth consent screen",
                "url": "https://console.cloud.google.com/apis/credentials/consent",
                "hint": "Set to External, add yourself as test user",
            },
        ],
    },
    "linkedin": {
        "order": 2,
        "tagline": "Daily text posts. Developer app is free.",
        "profile_key": "linkedin",
        "redirect_field": "redirect_uri",
        "links": [
            {
                "label": "LinkedIn Developer apps",
                "url": "https://www.linkedin.com/developers/apps",
                "hint": "Create app → add Share on LinkedIn product",
            },
            {
                "label": "Auth settings help",
                "url": "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication",
                "hint": "Paste redirect URI from below",
            },
        ],
    },
    "instagram": {
        "order": 3,
        "tagline": "Reels cross-post. Needs Creator/Business + Meta app review.",
        "profile_key": "instagram",
        "redirect_field": "redirect_uri",
        "links": [
            {
                "label": "Switch to Creator/Business",
                "url": "https://www.instagram.com/accounts/account_type_and_tools/",
                "hint": "Required for API posting",
            },
            {
                "label": "Meta Developer apps",
                "url": "https://developers.facebook.com/apps/",
                "hint": "Create app → Instagram Graph API",
            },
            {
                "label": "Link Facebook Page",
                "url": "https://www.facebook.com/pages/creation/",
                "hint": "Instagram must link to a Page",
            },
            {
                "label": "App Review",
                "url": "https://developers.facebook.com/docs/app-review",
                "hint": "Request instagram_content_publish",
            },
        ],
    },
    "tiktok": {
        "order": 4,
        "tagline": "Reels cross-post. Free API — audit needed for public posts.",
        "profile_key": "tiktok",
        "redirect_field": "redirect_uri",
        "links": [
            {
                "label": "TikTok Developer portal",
                "url": "https://developers.tiktok.com/",
                "hint": "Log in with @melanishresthaa",
            },
            {
                "label": "Create / manage apps",
                "url": "https://developers.tiktok.com/apps/",
                "hint": "Request video.publish scope",
            },
            {
                "label": "Content Posting API docs",
                "url": "https://developers.tiktok.com/doc/content-posting-api-get-started",
                "hint": "Sandbox posts are private until audit passes",
            },
        ],
    },
}


def platform_status(platform: str) -> dict[str, Any]:
    cfg = load_config()
    pcfg = platform_config(platform)
    meta = PLATFORM_SETUP.get(platform, {})
    connected = oauth.is_connected(platform)
    acct = oauth.account_info(platform)
    creds_ok = _credentials_ok(platform, pcfg)
    profile_key = meta.get("profile_key", platform)
    redirect_uri = pcfg.get(meta.get("redirect_field", "redirect_uri"), "")
    return {
        "platform": platform,
        "order": meta.get("order", 99),
        "tagline": meta.get("tagline", ""),
        "connected": connected,
        "credentials_configured": creds_ok,
        "ready": connected and creds_ok,
        "account_name": (acct or {}).get("account_name") or "",
        "connected_at": (acct or {}).get("connected_at") or "",
        "profile_url": (cfg.get("profiles") or {}).get(profile_key, ""),
        "redirect_uri": redirect_uri,
        "links": meta.get("links", []),
        "missing_credentials": _missing_credentials(platform, pcfg),
        "cost_note": "Free — no subscription required",
    }


def _credentials_ok(platform: str, cfg: dict) -> bool:
    if platform == "youtube":
        return bool(cfg.get("client_id") and cfg.get("client_secret"))
    if platform == "linkedin":
        return bool(cfg.get("client_id") and cfg.get("client_secret"))
    if platform == "instagram":
        return bool(cfg.get("app_id") and cfg.get("app_secret"))
    if platform == "tiktok":
        return bool(cfg.get("client_key") and cfg.get("client_secret"))
    return False


def _missing_credentials(platform: str, cfg: dict) -> list[str]:
    missing = []
    if platform in ("youtube", "linkedin"):
        if not cfg.get("client_id"):
            missing.append("client_id")
        if not cfg.get("client_secret"):
            missing.append("client_secret")
    elif platform == "instagram":
        if not cfg.get("app_id"):
            missing.append("app_id")
        if not cfg.get("app_secret"):
            missing.append("app_secret")
    elif platform == "tiktok":
        if not cfg.get("client_key"):
            missing.append("client_key")
        if not cfg.get("client_secret"):
            missing.append("client_secret")
    return missing


def all_platform_status() -> list[dict[str, Any]]:
    items = [platform_status(p) for p in PLATFORM_SETUP]
    items.sort(key=lambda x: x.get("order", 99))
    return items


def short_bundle_ready() -> bool:
    statuses = {s["platform"]: s for s in all_platform_status()}
    return all(statuses[p]["ready"] for p in ("youtube", "instagram", "tiktok"))
