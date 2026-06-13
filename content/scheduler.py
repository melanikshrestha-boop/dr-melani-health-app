"""Repurpose.io-style auto-publish — queue + schedule slots + workflows."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from . import calendar, workflows
from .config import load_config
from .publishers import bundle as bundle_pub
from .publishers import linkedin as linkedin_pub
from .publishers import youtube as youtube_pub

log = logging.getLogger("melani.content.scheduler")
_scheduler: BackgroundScheduler | None = None


def _publish_due_calendar() -> None:
    """Legacy one-off scheduled_at items."""
    due = calendar.due_items()
    for item in due["bundles"]:
        try:
            result = bundle_pub.publish_short_bundle(item["id"])
            calendar.log_scheduler("bundle", item["id"], str(result.get("status")))
        except Exception as exc:
            calendar.log_scheduler("bundle", item["id"], f"error: {exc}")
            calendar.update_bundle(item["id"], status="failed")

    for item in due["linkedin"]:
        try:
            result = linkedin_pub.publish_post(item["body"], item.get("image_path"))
            if result.get("ok"):
                calendar.update_linkedin_post(
                    item["id"],
                    status="published",
                    post_url=result.get("post_url"),
                )
                if item.get("recurring"):
                    _schedule_next_linkedin(item)
            else:
                calendar.update_linkedin_post(item["id"], status="failed")
            calendar.log_scheduler("linkedin", item["id"], str(result))
        except Exception as exc:
            calendar.log_scheduler("linkedin", item["id"], f"error: {exc}")
            calendar.update_linkedin_post(item["id"], status="failed")

    for item in due["youtube"]:
        try:
            tags = item.get("tags_list") or []
            result = youtube_pub.publish_video(
                item["video_path"],
                item["title"],
                item.get("description") or "",
                tags=tags,
                is_short=bool(item.get("is_short")),
            )
            if result.get("ok"):
                calendar.update_youtube_video(
                    item["id"],
                    status="published",
                    post_url=result.get("post_url"),
                )
            else:
                calendar.update_youtube_video(item["id"], status="failed")
            calendar.log_scheduler("youtube", item["id"], str(result))
        except Exception as exc:
            calendar.log_scheduler("youtube", item["id"], f"error: {exc}")
            calendar.update_youtube_video(item["id"], status="failed")


def _run_workflow(wf: dict) -> None:
    kind = wf.get("kind")
    if kind == "short_bundle":
        entry = workflows.next_queued(wf["id"])
        if not entry or not entry.get("bundle_id"):
            return
        bundle_id = entry["bundle_id"]
        try:
            dests = wf.get("destinations_list") or ["instagram", "tiktok", "youtube"]
            result = bundle_pub.publish_short_bundle(bundle_id, platforms=dests)
            err = None if result.get("ok") else str(result.get("results"))
            workflows.mark_queue_done(entry["id"], error=err if not result.get("ok") else None)
            workflows.record_workflow_run(wf["id"])
            calendar.log_scheduler("workflow", wf["id"], f"short_bundle {bundle_id}: {result.get('status')}")
        except Exception as exc:
            workflows.mark_queue_done(entry["id"], error=str(exc))
            calendar.log_scheduler("workflow", wf["id"], f"error: {exc}")
    elif kind == "linkedin":
        posts = [
            p
            for p in calendar.list_linkedin_posts(limit=10)
            if p.get("status") == "scheduled"
        ]
        if not posts:
            return
        post = posts[0]
        try:
            result = linkedin_pub.publish_post(post["body"], post.get("image_path"))
            if result.get("ok"):
                calendar.update_linkedin_post(
                    post["id"], status="published", post_url=result.get("post_url")
                )
                if post.get("recurring"):
                    _schedule_next_linkedin(post)
            workflows.record_workflow_run(wf["id"])
        except Exception as exc:
            calendar.log_scheduler("workflow", wf["id"], f"linkedin error: {exc}")
    elif kind == "youtube_long":
        vids = [
            v
            for v in calendar.list_youtube_videos(short_only=False, limit=10)
            if v.get("status") in ("scheduled", "queued") and not v.get("is_short")
        ]
        if not vids:
            return
        vid = vids[0]
        try:
            result = youtube_pub.publish_video(
                vid["video_path"],
                vid["title"],
                vid.get("description") or "",
                tags=vid.get("tags_list") or [],
                is_short=False,
            )
            if result.get("ok"):
                calendar.update_youtube_video(
                    vid["id"], status="published", post_url=result.get("post_url")
                )
            workflows.record_workflow_run(wf["id"])
        except Exception as exc:
            calendar.log_scheduler("workflow", wf["id"], f"youtube error: {exc}")


def _publish_due() -> None:
    workflows.ensure_defaults()
    _publish_due_calendar()
    for wf in workflows.workflows_due_now():
        _run_workflow(wf)


def _schedule_next_linkedin(item: dict) -> None:
    cfg = load_config()
    time_str = cfg.get("linkedin_daily_time") or "09:00"
    hour, minute = (int(x) for x in time_str.split(":"))
    next_day = datetime.now().replace(hour=hour, minute=minute, second=0, microsecond=0)
    if next_day <= datetime.now():
        next_day += timedelta(days=1)
    calendar.create_linkedin_post(
        body=item["body"],
        image_path=item.get("image_path"),
        scheduled_at=next_day.isoformat(timespec="seconds"),
        recurring=True,
        status="scheduled",
    )


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(_publish_due, "interval", minutes=1, id="content_due_posts")
    _scheduler.start()
    log.info("Content scheduler started (Repurpose-style workflows)")
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None
