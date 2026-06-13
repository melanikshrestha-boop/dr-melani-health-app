"""Simultaneous short-form bundle publish with partial-failure retry."""

from __future__ import annotations

from typing import Any

from .. import calendar
from ..caption import hashtags_from_json, publish_text, youtube_title
from ..oauth import is_connected
from . import instagram, tiktok, youtube

SHORT_PLATFORMS = ("youtube", "instagram", "tiktok")


def publish_short_bundle(bundle_id: int, platforms: list[str] | None = None) -> dict[str, Any]:
    bundle = calendar.get_bundle(bundle_id)
    if not bundle:
        return {"ok": False, "error": "Bundle not found"}
    targets = platforms or list(SHORT_PLATFORMS)
    calendar.update_bundle(bundle_id, status="publishing")

    results: dict[str, dict[str, Any]] = {}
    for platform in targets:
        if not is_connected(platform):
            err = f"{platform.title()} not connected"
            results[platform] = {"ok": False, "error": err}
            calendar.save_publish_result(
                platform=platform,
                status="failed",
                post_type="bundle",
                bundle_id=bundle_id,
                error=err,
            )
            continue
        if platform == "youtube":
            text = publish_text(bundle)
            res = youtube.publish_video(
                bundle["video_path"],
                bundle.get("yt_title")
                or youtube_title(
                    bundle.get("base_caption") or "",
                    hashtags_from_json(bundle.get("hashtags")),
                ),
                text,
                is_short=True,
            )
        elif platform == "instagram":
            res = instagram.publish_reel(
                bundle["video_path"],
                publish_text(bundle),
            )
        elif platform == "tiktok":
            res = tiktok.publish_video(
                bundle["video_path"],
                publish_text(bundle),
            )
        else:
            res = {"ok": False, "error": f"Unknown platform: {platform}"}

        results[platform] = res
        calendar.save_publish_result(
            platform=platform,
            status="published" if res.get("ok") else "failed",
            post_type="bundle",
            bundle_id=bundle_id,
            post_url=res.get("post_url"),
            error=res.get("error"),
        )

    ok_count = sum(1 for r in results.values() if r.get("ok"))
    if ok_count == len(targets):
        status = "published"
    elif ok_count == 0:
        status = "failed"
    else:
        status = "partial"
    calendar.update_bundle(bundle_id, status=status)
    return {"ok": ok_count > 0, "status": status, "results": results}


def retry_failed_platforms(bundle_id: int) -> dict[str, Any]:
    failed = []
    for row in calendar.publish_results_for_bundle(bundle_id):
        if row.get("status") == "failed":
            p = row.get("platform")
            if p and p not in failed:
                failed.append(p)
    if not failed:
        return {"ok": False, "error": "No failed platforms to retry"}
    return publish_short_bundle(bundle_id, platforms=failed)
