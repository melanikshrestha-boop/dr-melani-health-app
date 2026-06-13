"""Exercise GIF search — on demand via Dr. Melani (smart, specific queries)."""

from __future__ import annotations

import json
import re
from urllib.parse import quote_plus

import requests

from .paths import HEALTH_DATA

CACHE_FILE = HEALTH_DATA / "gym_gif_cache.json"

EXERCISE_CATALOG: list[str] = [
    "Sumo Squats — 4 x Failure",
    "Barbell Hip Thrusts — 4 x Failure",
    "Bulgarian Split Squats — 4 x Failure",
    "Cable Pull-Throughs — 4 x 8",
    "Glute Kickbacks — 3 x Failure",
    "Lat Pulldown — 3 x 12",
    "Seated Cable Rows — 3 x 12",
    "Barbell Bench Press — 4 x 8",
    "Romanian Deadlift — 3 x 10",
    "Lateral Raises — 3 x 15",
    "Hanging Leg Raises — 3 x Failure",
    "Rope Cable Crunches — 4 x Failure",
    "Plank — 3 x 60 sec",
]

# Verified exercise-form GIFs (fallback after web search)
CURATED_GIFS: list[tuple[str, str, str]] = [
    ("hip thrust", "https://media.giphy.com/media/v0eIEab1B1ade/giphy.gif", "Barbell hip thrust"),
    ("sumo squat", "https://media.giphy.com/media/3o7TKIs1eaMaGI/giphy.gif", "Sumo squat"),
    ("bulgarian", "https://media.giphy.com/media/l0HlBO7yoXlzjp5WM/giphy.gif", "Bulgarian split squat"),
    ("split squat", "https://media.giphy.com/media/l0HlBO7yoXlzjp5WM/giphy.gif", "Split squat"),
    ("rdl", "https://media.giphy.com/media/3o7TKRnVnVGBF4xBvi/giphy.gif", "Romanian deadlift"),
    ("deadlift", "https://media.giphy.com/media/3o7TKRnVnVGBF4xBvi/giphy.gif", "Romanian deadlift"),
    ("lat pulldown", "https://media.giphy.com/media/l0HlNQ03J5JxXj4xa/giphy.gif", "Lat pulldown"),
    ("cable row", "https://media.giphy.com/media/26BRv0ThfloryNOGY/giphy.gif", "Cable row"),
    ("bench press", "https://media.giphy.com/media/l0HlP8XxqQZQZQZQ/giphy.gif", "Bench press"),
    ("lateral raise", "https://media.giphy.com/media/3o7TKUAlfR0bLa8HaE/giphy.gif", "Lateral raise"),
    ("leg raise", "https://media.giphy.com/media/l0HlTyjKqXqZQZQ/giphy.gif", "Leg raise"),
    ("plank", "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif", "Plank"),
    ("squat", "https://media.giphy.com/media/3o7TKIs1eaMaGI/giphy.gif", "Squat"),
    ("kickback", "https://media.giphy.com/media/l0MYtoxymNRXW8/giphy.gif", "Glute kickback"),
    ("pull through", "https://media.giphy.com/media/l0MYtoxymNRXW8/giphy.gif", "Cable pull-through"),
    ("treadmill", "https://media.giphy.com/media/3o7TKSjRrfIPjeiPu/giphy.gif", "Running on treadmill"),
    ("running", "https://media.giphy.com/media/3o7TKSjRrfIPjeiPu/giphy.gif", "Running on treadmill"),
    ("stretch", "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif", "Dynamic stretch"),
]

BLOCKLIST = (
    "spongebob",
    "meme",
    "reaction",
    "funny",
    "cartoon",
    "anime",
    "minecraft",
    "fortnite",
    "tiktok",
    "fail",
    "prank",
    "dance party",
    "celebration",
    "birthday",
    "cat ",
    " dog",
    "puppy",
    "kitten",
    "baby yoda",
    "minion",
    "disney",
    "marvel",
    "nba",
    "nfl",
)

RELEVANCE_HINTS = (
    "exercise",
    "workout",
    "gym",
    "fitness",
    "training",
    "form",
    "lift",
    "squat",
    "cardio",
    "treadmill",
    "stretch",
    "muscle",
)


def google_gif_search_url(name: str) -> str:
    q = quote_plus(f"{name} exercise form gif")
    return f"https://www.google.com/search?tbm=isch&q={q}"


def wants_gif(text: str) -> bool:
    low = (text or "").lower()
    if not low.strip():
        return False
    if re.search(r"\bgif\b|\bgiphy\b|\btenor\b", low):
        return True
    if re.search(r"\b(show|give|send|find)\s+(me\s+)?(a\s+)?(video|clip|animation)\b", low):
        return True
    if re.search(r"\bhow\s+(do|to)\s+.+\s+(look|form)\b", low) and re.search(
        r"\b(show|see|watch|gif|video)\b", low
    ):
        return True
    return False


def extract_gif_subject(text: str) -> str:
    raw = (text or "").strip()
    low = raw.lower()
    patterns = [
        r"(?:give|show|send|find)(?:\s+me)?(?:\s+a)?(?:\s+gif)?(?:\s+of)?(?:\s+this)?(?:\s+person)?(?:\s+)?(.+?)(?:\?|$|\.|,|\s+please)",
        r"\bgif(?:\s+of|\s+for|\s+showing)?(?:\s+)?(.+?)(?:\?|$|\.|,|\s+please)",
        r"\b(?:video|clip|animation)(?:\s+of)?(?:\s+)?(.+?)(?:\?|$|\.|,|\s+please)",
        r"\b(?:demo|demonstration)(?:\s+of)?(?:\s+)?(.+?)(?:\?|$|\.|,|\s+please)",
    ]
    for pat in patterns:
        m = re.search(pat, low, re.I)
        if m:
            subj = m.group(1).strip()
            subj = re.sub(r"\b(this|that|please|thanks|doing|what|its|it s)\b", " ", subj)
            subj = re.sub(r"\s+", " ", subj).strip(" .,-")
            if len(subj) > 3:
                return subj
    cleaned = re.sub(
        r"\b(gif|giphy|tenor|please|give|show|send|find|me|a|an|the|of|for|this|person|video|clip)\b",
        " ",
        low,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,-")
    return cleaned or raw


def _load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text())
        except Exception:
            pass
    return {}


def _save_cache(data: dict) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    keys = list(data.keys())
    if len(keys) > 200:
        for k in keys[:-200]:
            data.pop(k, None)
    CACHE_FILE.write_text(json.dumps(data, indent=2))


def _curated(name: str) -> dict | None:
    low = name.lower()
    best: tuple[int, dict] | None = None
    for key, url, label in CURATED_GIFS:
        if key in low:
            score = len(key)
            if not best or score > best[0]:
                best = (score, {"url": url, "label": label, "source": "curated"})
    return best[1] if best else None


def _score_hit(url: str, title: str, query: str) -> int:
    blob = f"{url} {title} {query}".lower()
    for bad in BLOCKLIST:
        if bad in blob:
            return -100
    score = 0
    q_words = [w for w in re.split(r"\W+", query.lower()) if len(w) > 2]
    for word in q_words:
        if word in blob:
            score += 12
    for hint in RELEVANCE_HINTS:
        if hint in blob:
            score += 4
    if any(x in url.lower() for x in (".gif", "giphy", "tenor", "media.giphy")):
        score += 6
    return score


def _search_images(query: str, limit: int = 16) -> list[dict]:
    try:
        session = requests.Session()
        session.headers["User-Agent"] = "MelaniHealthGym/1.0"
        r = session.get("https://duckduckgo.com/", params={"q": query}, timeout=12)
        r.raise_for_status()
        m = re.search(r'vqd="([\d-]+)"', r.text) or re.search(r"vqd=([\d-]+)&", r.text)
        if not m:
            return []
        r2 = session.get(
            "https://duckduckgo.com/i.js",
            params={"l": "us-en", "o": "json", "q": query, "vqd": m.group(1), "f": ",,,", "p": "1"},
            timeout=12,
        )
        r2.raise_for_status()
        return (r2.json().get("results") or [])[:limit]
    except Exception:
        return []


def _search_web_gif(query: str) -> dict | None:
    hits = _search_images(query)
    best_url = None
    best_score = 0
    best_label = query
    for hit in hits:
        url = (hit.get("image") or "").strip()
        title = (hit.get("title") or "").strip()
        if not url:
            continue
        score = _score_hit(url, title, query)
        if score > best_score:
            best_score = score
            best_url = url
            best_label = title or query
    if best_url and best_score > 0:
        return {"url": best_url, "label": best_label, "source": "web", "score": best_score}
    return None


def _build_queries(subject: str) -> list[str]:
    subj = subject.strip()
    low = subj.lower()
    queries = [
        f"{subj} exercise form gif",
        f"{subj} workout proper form gif",
        f"{subj} gym training gif",
    ]
    if "treadmill" in low or ("running" in low and "treadmill" not in low):
        queries = [
            "person running on treadmill workout gif",
            "treadmill running exercise gif",
            "treadmill incline walking gym gif",
        ] + queries
    if "stretch" in low:
        queries = [f"{subj} dynamic stretch gif", f"{subj} mobility exercise gif"] + queries
    if "hip thrust" in low:
        queries = ["barbell hip thrust glute exercise gif"] + queries
    seen: set[str] = set()
    out: list[str] = []
    for q in queries:
        key = q.lower()
        if key not in seen:
            seen.add(key)
            out.append(q)
    return out


def find_gif_for_request(question: str) -> dict:
    """Find a specific, relevant GIF only when the user asks."""
    subject = extract_gif_subject(question)
    if not subject:
        return {
            "url": None,
            "label": "",
            "source": "none",
            "query": "",
            "google_url": google_gif_search_url("exercise"),
        }

    cache_key = subject.lower()
    cache = _load_cache()
    if cache_key in cache and cache[cache_key].get("url"):
        return {**cache[cache_key], "query": subject, "google_url": google_gif_search_url(subject)}

    best: dict | None = None
    for query in _build_queries(subject):
        hit = _search_web_gif(query)
        if hit and (not best or hit.get("score", 0) > best.get("score", 0)):
            best = hit

    if not best:
        curated = _curated(subject)
        if curated:
            best = curated

    if best and best.get("url"):
        entry = {
            "url": best["url"],
            "label": best.get("label") or subject,
            "source": best.get("source", "web"),
        }
        cache[cache_key] = entry
        _save_cache(cache)
        return {**entry, "query": subject, "google_url": google_gif_search_url(subject)}

    return {
        "url": None,
        "label": subject,
        "source": "none",
        "query": subject,
        "google_url": google_gif_search_url(subject),
    }


def get_demo_gif(name: str, *, allow_web: bool = True) -> dict:
    """Legacy helper — prefer find_gif_for_request for chat."""
    if not allow_web:
        hit = _curated(name)
        if hit:
            return {**hit, "google_url": google_gif_search_url(name)}
        return {"url": None, "label": name, "source": "none", "google_url": google_gif_search_url(name)}
    return find_gif_for_request(f"gif of {name}")
