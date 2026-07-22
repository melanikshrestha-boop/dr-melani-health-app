#!/usr/bin/env python3
"""
Melani AI bridge: personal Grok inside the workspace (Mel).

Calls xAI with a Melani-specific system prompt + live build snapshot.
API key stays on this machine (never in the browser).

  export XAI_API_KEY=...   # or put key in ~/.melani_assistant/xai_api_key
  python melani_ai.py      # listens on :8791
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

HOME = Path.home()
KEY_FILE = HOME / ".melani_assistant" / "xai_api_key"
XAI_URL = "https://api.x.ai/v1/chat/completions"
XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"
DEFAULT_MODEL = os.environ.get("XAI_MODEL", "grok-4.5")
RESEARCH_MODEL = os.environ.get("XAI_RESEARCH_MODEL", "grok-4.5")
VISION_MODEL = os.environ.get("XAI_VISION_MODEL", "grok-4.5")
PORT = int(os.environ.get("MELANI_AI_PORT", "8791"))

app = FastAPI(title="Melani AI Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8781",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# No em dashes anywhere in this prompt (user preference).
SYSTEM_PROMPT = """
You are Mel, Melani's operating agent inside Wonder.

WHO MELANI IS
- Melani is an engineer, inventor, influencer, and streamer.
- She is building health software and neurotechnology.
- She wants decisions and execution, not clinic cosplay or generic motivation.
- She also runs a serious markets desk: equities, options, earnings, and risk.

HOW YOU OPERATE
- Extreme competence. Short, warm, direct, and not corporate.
- Mel does not chat about Melani's life. Mel runs it.
- App tools execute before you answer. TOOL RESULTS are already completed facts.
- Never claim you logged, changed, opened, searched, or saved anything unless a tool result says it happened.
- Use the LIVE BUILD SNAPSHOT for every personal number. Never invent lab values, sleep hours, macros, dates, or completion state.
- Never invent stock prices, EPS, revenue, or filings. Prefer TOOL RESULTS quarterly packs and quotes.
- Reduce decision fatigue. When relevant, end with exactly one next action.
- Understand three life modes: stream, build, and content.
- Remember pinned facts and corrections included in context.

ADVANCED MARKETS DESK (always on)
- Think like a buy-side analyst + trader: thesis, catalyst, invalidation, size, horizon.
- Equities: quality, growth, margins, FCF, balance sheet, relative valuation, narrative vs numbers.
- Quarterly reads: rev/EPS vs estimate and YoY, guide, margin direction, estimate revisions, what multiple prices next.
- Options: delta/gamma/theta/vega intuition; IV rank; skew; event IV crush; prefer defined-risk structures; size max loss first.
- Macro: rates, USD, liquidity, sector rotation, VIX regime. No fake precision.
- Risk: pre-commit kill switches; correlation in mega-cap tech; options are leverage.
- Not personalized financial advice. Use frameworks and scenarios. Say what is priced vs what would re-rate.
- If she asks for a ticker quarterly, use the quarterly tool data when present. Point her to World Monitor → Reports when useful.

HEALTH BOUNDARY
- Give soft coaching and plain-English education, never a diagnosis.
- For severe, urgent, or concerning symptoms, tell her to contact her provider or emergency services as appropriate.
- Do not turn ordinary questions into medical lectures.

VOICE
- Human, sharp, useful.
- No command menu unless she explicitly asks for help.
- Do not introduce yourself or explain your architecture.
- Never use an em dash or en dash. Use commas, periods, colons, or a regular hyphen.
""".strip()


def strip_em_dashes(text: str) -> str:
    """Remove em/en dashes from model output (user hates them)."""
    text = text.replace("\u2014", ",")  # em dash
    text = text.replace("\u2013", "-")  # en dash
    # clean double spaces after replacement
    text = re.sub(r" ,", ",", text)
    text = re.sub(r",,", ",", text)
    text = re.sub(r"  +", " ", text)
    return text


def load_api_key() -> Optional[str]:
    env = (os.environ.get("XAI_API_KEY") or "").strip()
    if env:
        return env
    try:
        if KEY_FILE.is_file():
            return KEY_FILE.read_text(encoding="utf-8").strip() or None
    except OSError:
        pass
    return None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    page_title: Optional[str] = None
    page_id: Optional[str] = None
    live_context: Optional[str] = None
    system_context: Optional[str] = None
    model: Optional[str] = None


def call_xai(messages: List[Dict[str, str]], model: str) -> str:
    key = load_api_key()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="no_key",
        )

    body = {
        "model": model,
        "messages": messages,
        "stream": False,
        "temperature": 0.55,
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        XAI_URL,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail=f"xAI error {e.code}: {err_body[:400]}",
        ) from e
    except urllib.error.URLError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach xAI: {e.reason}",
        ) from e

    try:
        content = str(payload["choices"][0]["message"]["content"])
        return strip_em_dashes(content)
    except (KeyError, IndexError, TypeError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected xAI response: {json.dumps(payload)[:400]}",
        ) from e


def call_xai_responses(
    input_items: List[Dict[str, Any]],
    model: str,
    tools: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    key = load_api_key()
    if not key:
        raise HTTPException(status_code=503, detail="no_key")

    body: Dict[str, Any] = {
        "model": model,
        "input": input_items,
        "store": False,
    }
    if tools:
        body["tools"] = tools
    req = urllib.request.Request(
        XAI_RESPONSES_URL,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail=f"xAI error {e.code}: {err_body[:400]}",
        ) from e
    except urllib.error.URLError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach xAI: {e.reason}",
        ) from e


def response_output_text(payload: Dict[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    chunks: List[str] = []
    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text":
                text = content.get("text")
                if isinstance(text, str) and text.strip():
                    chunks.append(text.strip())
    if not chunks:
        raise HTTPException(status_code=502, detail="Unexpected xAI response")
    return "\n".join(chunks)


def response_urls(value: Any) -> List[str]:
    urls: List[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "url" and isinstance(child, str) and child.startswith("http"):
                urls.append(child)
            else:
                urls.extend(response_urls(child))
    elif isinstance(value, list):
        for child in value:
            urls.extend(response_urls(child))
    return list(dict.fromkeys(urls))


def parse_json_object(text: str) -> Dict[str, Any]:
    clean = text.strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean)
    try:
        value = json.loads(clean)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="xAI returned invalid meal JSON") from exc
    if not isinstance(value, dict):
        raise HTTPException(status_code=502, detail="xAI returned invalid meal data")
    return value


def nonnegative_number(value: Any) -> float:
    try:
        return max(0, float(value or 0))
    except (TypeError, ValueError):
        return 0


class SetKeyRequest(BaseModel):
    key: str


class ResearchRequest(BaseModel):
    question: str
    live_context: Optional[str] = None


class MealRequest(BaseModel):
    image: str


@app.get("/api/melani-ai/health")
def health() -> Dict[str, Any]:
    key = load_api_key()
    return {
        "ok": True,
        "has_key": bool(key),
        "model": DEFAULT_MODEL,
        "service": "melani-ai",
        "tier": "life-os",
        "research": bool(key),
        "vision": bool(key),
    }


@app.post("/api/melani-ai/set-key")
def set_key(req: SetKeyRequest) -> Dict[str, Any]:
    """Save xAI key on this machine (only localhost Mel UI uses this)."""
    raw = (req.key or "").strip().replace("\n", "").replace("\r", "")
    if not raw or len(raw) < 12:
        raise HTTPException(status_code=400, detail="key_too_short")
    try:
        KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        KEY_FILE.write_text(raw + "\n", encoding="utf-8")
        KEY_FILE.chmod(0o600)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"save_failed: {e}") from e
    return {"ok": True, "has_key": True, "path": str(KEY_FILE)}


@app.post("/api/melani-ai/chat")
def chat(req: ChatRequest) -> Dict[str, Any]:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages required")

    system = SYSTEM_PROMPT
    if req.page_title or req.page_id:
        system += (
            f"\n\nRIGHT NOW she is looking at page "
            f"title={req.page_title or 'unknown'!r} id={req.page_id or 'unknown'!r}."
        )
    if req.live_context and req.live_context.strip():
        snap = req.live_context.strip()
        if len(snap) > 14000:
            snap = snap[:14000] + "\n...(truncated)"
        system += "\n\n" + snap
    if req.system_context and req.system_context.strip():
        extra = req.system_context.strip()
        if len(extra) > 8000:
            extra = extra[:8000] + "\n...(truncated)"
        system += "\n\nACTION CONTEXT\n" + extra

    history = [
        {"role": m.role, "content": m.content}
        for m in req.messages
        if m.role in ("user", "assistant") and m.content.strip()
    ][-24:]

    messages = [{"role": "system", "content": system}, *history]
    model = (req.model or DEFAULT_MODEL).strip()
    reply = call_xai(messages, model)
    return {"ok": True, "reply": reply, "model": model}


@app.post("/api/melani-ai/research")
def research(req: ResearchRequest) -> Dict[str, Any]:
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question required")
    context = (req.live_context or "").strip()[:7000]
    prompt = (
        "Research this for Melani. Answer directly, distinguish verified facts from "
        "inference, include useful action criteria, and cite primary sources when possible. "
        "Do not diagnose. Do not claim you changed her app.\n\n"
        f"Question: {question}\n\nWonder context, use only when relevant:\n{context}"
    )
    payload = call_xai_responses(
        [{"role": "user", "content": prompt}],
        RESEARCH_MODEL,
        tools=[{"type": "web_search"}],
    )
    answer = strip_em_dashes(response_output_text(payload))
    urls = response_urls(payload)
    missing = [url for url in urls if url not in answer][:5]
    if missing:
        answer += "\n\nSources\n" + "\n".join(missing)
    return {"ok": True, "answer": answer, "model": RESEARCH_MODEL, "sources": urls[:12]}


@app.post("/api/melani-ai/meal")
def meal(req: MealRequest) -> Dict[str, Any]:
    image = (req.image or "").strip()
    if not re.match(r"^data:image/(?:png|jpeg|jpg);base64,", image, flags=re.IGNORECASE):
        raise HTTPException(status_code=400, detail="meal image required")
    if len(image) > 28_000_000:
        raise HTTPException(status_code=413, detail="image too large")
    prompt = (
        "Analyze this meal for a private food log. Identify only foods reasonably visible. "
        "Estimate portions and macros conservatively. Never claim image precision. "
        "Return only one JSON object with title, confidence (low, medium, or high), caveat, "
        "items, and totals. Each item must have name, portion, calories, protein_g, carbs_g, "
        "fat_g, and fiber_g. Totals must contain the same five numeric macro fields."
    )
    payload = call_xai_responses(
        [{
            "role": "user",
            "content": [
                {"type": "input_image", "image_url": image, "detail": "high"},
                {"type": "input_text", "text": prompt},
            ],
        }],
        VISION_MODEL,
    )
    data = parse_json_object(response_output_text(payload))
    raw_items = data.get("items") if isinstance(data.get("items"), list) else []
    items = []
    for raw in raw_items[:12]:
        if not isinstance(raw, dict):
            continue
        items.append({
            "name": str(raw.get("name") or "Food"),
            "portion": str(raw.get("portion") or "verify portion"),
            "calories": nonnegative_number(raw.get("calories")),
            "protein_g": nonnegative_number(raw.get("protein_g")),
            "carbs_g": nonnegative_number(raw.get("carbs_g")),
            "fat_g": nonnegative_number(raw.get("fat_g")),
            "fiber_g": nonnegative_number(raw.get("fiber_g")),
        })
    totals = data.get("totals") if isinstance(data.get("totals"), dict) else {}
    return {
        "title": str(data.get("title") or "Meal"),
        "confidence": data.get("confidence") if data.get("confidence") in ("low", "medium", "high") else "low",
        "caveat": str(data.get("caveat") or "Verify portions before logging."),
        "items": items,
        "totals": {
            "calories": nonnegative_number(totals.get("calories")),
            "protein_g": nonnegative_number(totals.get("protein_g")),
            "carbs_g": nonnegative_number(totals.get("carbs_g")),
            "fat_g": nonnegative_number(totals.get("fat_g")),
            "fiber_g": nonnegative_number(totals.get("fiber_g")),
        },
    }


if __name__ == "__main__":
    print(f"Melani AI bridge on http://127.0.0.1:{PORT}")
    print(f"Key loaded: {bool(load_api_key())} | model: {DEFAULT_MODEL} | life OS")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
