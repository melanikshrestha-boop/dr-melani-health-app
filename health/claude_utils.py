"""Shared Claude API utilities."""

from __future__ import annotations

import json
import re
from typing import Optional, Dict, Any


def get_claude_client():
    """Get Anthropic Claude client (singleton)."""
    try:
        from anthropic import Anthropic
        return Anthropic()
    except ImportError:
        return None


def extract_json_from_response(response_text: str) -> Optional[Dict[str, Any]]:
    """Extract JSON object from Claude response text.

    Safely extracts first JSON object {...} from response.
    Returns None if no valid JSON found or parsing fails.
    """
    if not response_text:
        return None

    try:
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if not json_match:
            return None

        return json.loads(json_match.group())
    except (json.JSONDecodeError, AttributeError):
        return None


def safe_api_response_text(response) -> Optional[str]:
    """Safely extract text from Claude API response.

    Handles empty/malformed responses gracefully.
    """
    if not response or not hasattr(response, 'content'):
        return None

    if not response.content or len(response.content) == 0:
        return None

    content = response.content[0]
    if not hasattr(content, 'text'):
        return None

    return content.text
