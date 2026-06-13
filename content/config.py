"""Content app API credentials — stored locally, never committed."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

from .paths import CONTENT_CONFIG, ensure_dirs

DEFAULT_CONFIG = {
    "oauth_redirect_base": "http://127.0.0.1:8782",
    "linkedin_daily_time": "09:00",
    "youtube_weekly_day": "sunday",
    "youtube_weekly_time": "10:00",
    "profiles": {
        "youtube": "https://www.youtube.com/@melanishresthaa",
        "linkedin": "https://www.linkedin.com/in/melanishresthaa/",
        "instagram": "https://www.instagram.com/melanishresthaa",
        "tiktok": "https://www.tiktok.com/@melanishresthaa",
    },
    "platforms": {
        "youtube": {
            "client_id": "",
            "client_secret": "",
            "redirect_uri": "http://127.0.0.1:8782/oauth/youtube/callback",
        },
        "linkedin": {
            "client_id": "",
            "client_secret": "",
            "redirect_uri": "http://127.0.0.1:8782/oauth/linkedin/callback",
        },
        "instagram": {
            "app_id": "",
            "app_secret": "",
            "redirect_uri": "http://127.0.0.1:8782/oauth/instagram/callback",
        },
        "tiktok": {
            "client_key": "",
            "client_secret": "",
            "redirect_uri": "http://127.0.0.1:8782/oauth/tiktok/callback",
        },
    },
}


def load_config() -> dict:
    ensure_dirs()
    if not CONTENT_CONFIG.exists():
        save_config(deepcopy(DEFAULT_CONFIG))
        return deepcopy(DEFAULT_CONFIG)
    try:
        data = json.loads(CONTENT_CONFIG.read_text())
    except (json.JSONDecodeError, OSError):
        data = deepcopy(DEFAULT_CONFIG)
        save_config(data)
    merged = deepcopy(DEFAULT_CONFIG)
    merged.update({k: v for k, v in data.items() if k not in ("platforms", "profiles")})
    merged["profiles"] = deepcopy(DEFAULT_CONFIG["profiles"])
    merged["profiles"].update(data.get("profiles") or {})
    merged["platforms"] = deepcopy(DEFAULT_CONFIG["platforms"])
    for platform, cfg in (data.get("platforms") or {}).items():
        if platform in merged["platforms"]:
            merged["platforms"][platform].update(cfg)
    return merged


def save_config(cfg: dict) -> None:
    ensure_dirs()
    CONTENT_CONFIG.write_text(json.dumps(cfg, indent=2))


def platform_config(platform: str) -> dict:
    return load_config().get("platforms", {}).get(platform, {})
