"""Branded food lookup — famous products, Open Food Facts, and web nutrition search."""

from __future__ import annotations

import json
import re
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any
from urllib.parse import quote_plus

import requests

from .paths import HEALTH_DATA
from .product_scanner import _num, lookup_barcode, meal_macros_from_off

HEADERS = {"User-Agent": "MelaniHealth/1.0 (personal nutrition assistant)"}
CACHE_FILE = HEALTH_DATA / "nutrition" / "brand_lookup_cache.json"
OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl"

# Melani's usual Barebells — exact label (Barebells US, 1 bar / 55g).
MELANI_BAREBELLS_PROTEIN = {
    "name": "Barebells Protein Bar",
    "calories": 200,
    "protein_g": 20,
    "carbs_g": 18,
    "fat_g": 8,
    "fiber_g": 3,
    "net_carbs_g": 15,
    "saturated_fat_g": 3.5,
    "sugar_g": 1,
    "sugar_alcohol_g": 5,
}

# Medium apple with skin (~182g) — Harvard T.H. Chan School of Public Health.
MELANI_MEDIUM_APPLE = {
    "name": "Medium apple (with skin)",
    "calories": 95,
    "protein_g": 0.5,
    "carbs_g": 25,
    "fat_g": 0.3,
    "fiber_g": 4.4,
    "sugar_g": 19,
}

APPLE_EXCLUSIONS = (
    "juice", "pie", "sauce", "cider", "vinegar", "crisp", "fritter",
    "cake", "muffin", "butter", "wood", "pineapple",
)

# Medium kiwi (~69–75g) — Verywell Fit / MyFoodData (midpoint of published ranges).
MELANI_MEDIUM_KIWI = {
    "name": "Medium kiwi",
    "calories": 44,
    "protein_g": 0.8,
    "carbs_g": 10.5,
    "fat_g": 0.4,
    "fiber_g": 2,
    "sugar_g": 6.5,
}

KIWI_EXCLUSIONS = ("juice", "smoothie", "jam", "candy", "gummy", "sorbet")

# Common misspellings → canonical brand
BRAND_ALIASES: dict[str, str] = {
    "barbell protein": "barebells protein",
    "barbell": "barebells",
    "barebell": "barebells",
    "bare bells": "barebells",
    "quest bar": "quest",
    "rx bar": "rxbar",
    "rx-bar": "rxbar",
    "kind bar": "kind",
    "clif bar": "clif",
    "built bar": "built",
    "one bar": "one",
    "fairlife shake": "fairlife",
    "chobani flip": "chobani",
    "perfect bar": "perfect bar",
    "think bar": "think!",
}

# Curated nutrition per serving for famous packaged foods (verified from manufacturer labels).
KNOWN_BRANDS: list[dict[str, Any]] = [
    {
        "brand": "Barebells",
        "aliases": ["barebells", "barbell", "barebell"],
        "product_terms": ["protein bar", "bar", "protein"],
        "serving": "1 bar (55g)",
        "flavors": {
            "sea salt": {
                "name": "Barebells Sea Salt Caramel",
                **{k: MELANI_BAREBELLS_PROTEIN[k] for k in ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g")},
            },
            "caramel": {
                "name": "Barebells Caramel Cashew",
                **{k: MELANI_BAREBELLS_PROTEIN[k] for k in ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g")},
            },
            "peanut": {
                "name": "Barebells Salty Peanut",
                **{k: MELANI_BAREBELLS_PROTEIN[k] for k in ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g")},
            },
            "cookies": {
                "name": "Barebells Cookies & Cream",
                **{k: MELANI_BAREBELLS_PROTEIN[k] for k in ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g")},
            },
            "default": {
                **MELANI_BAREBELLS_PROTEIN,
            },
        },
    },
    {
        "brand": "Quest",
        "aliases": ["quest"],
        "product_terms": ["protein bar", "bar"],
        "serving": "1 bar (60g)",
        "flavors": {
            "default": {
                "name": "Quest Protein Bar",
                "calories": 200,
                "protein_g": 21,
                "carbs_g": 21,
                "fat_g": 8,
                "fiber_g": 14,
            },
        },
    },
    {
        "brand": "RXBAR",
        "aliases": ["rxbar", "rx bar"],
        "product_terms": ["bar", "protein bar"],
        "serving": "1 bar (52g)",
        "flavors": {
            "default": {
                "name": "RXBAR",
                "calories": 210,
                "protein_g": 12,
                "carbs_g": 23,
                "fat_g": 9,
                "fiber_g": 5,
            },
        },
    },
    {
        "brand": "Fairlife",
        "aliases": ["fairlife"],
        "product_terms": ["shake", "protein shake", "core power", "nutrition plan"],
        "serving": "1 bottle",
        "flavors": {
            "default": {
                "name": "Fairlife Core Power Elite",
                "calories": 230,
                "protein_g": 42,
                "carbs_g": 8,
                "fat_g": 3,
                "fiber_g": 1,
            },
        },
    },
]


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().strip())


def _cache_get(key: str) -> dict | None:
    if not CACHE_FILE.exists():
        return None
    try:
        data = json.loads(CACHE_FILE.read_text())
        hit = data.get(key)
        if hit and hit.get("calories"):
            return hit
    except (json.JSONDecodeError, OSError):
        pass
    return None


def _cache_set(key: str, value: dict) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    data: dict[str, Any] = {}
    if CACHE_FILE.exists():
        try:
            data = json.loads(CACHE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            data = {}
    value = {**value, "cached_at": datetime.now().isoformat()}
    data[key] = value
    if len(data) > 200:
        keys = sorted(data, key=lambda k: data[k].get("cached_at", ""), reverse=True)
        data = {k: data[k] for k in keys[:200]}
    CACHE_FILE.write_text(json.dumps(data, indent=2))


def _apply_aliases(text: str) -> str:
    q = _normalize(text)
    for alias, brand in sorted(BRAND_ALIASES.items(), key=lambda x: -len(x[0])):
        q = re.sub(rf"\b{re.escape(alias)}\b", brand, q)
    return q


def _score_name_match(query: str, candidate: str) -> float:
    q = _normalize(query)
    c = _normalize(candidate)
    if not c:
        return 0.0
    if q in c or c in q:
        return 0.95
    q_tokens = set(re.findall(r"[a-z0-9]+", q))
    c_tokens = set(re.findall(r"[a-z0-9]+", c))
    overlap = len(q_tokens & c_tokens) / max(len(q_tokens), 1)
    ratio = SequenceMatcher(None, q, c).ratio()
    return 0.55 * overlap + 0.45 * ratio


def _pick_flavor(text: str, flavors: dict[str, dict]) -> dict:
    q = _normalize(text)
    best_key = "default"
    best_score = 0.0
    for key in flavors:
        if key == "default":
            continue
        tokens = [t for t in re.split(r"[\s/,&-]+", key) if t]
        score = sum(1 for t in tokens if t in q) / max(len(tokens), 1)
        if score > best_score:
            best_score = score
            best_key = key
    return dict(flavors.get(best_key) or flavors["default"])


def _matches_barebells_protein(q: str) -> bool:
    return bool(
        "barebells protein" in q
        or re.search(r"\b(?:barbell|barebells|barebell)\b.*\bprotein\b", q)
    )


def _matches_medium_apple(q: str) -> bool:
    if "pineapple" in q:
        return False
    if not re.search(r"\b(?:an?\s+)?(?:medium\s+)?apples?\b", q):
        return False
    return not any(x in q for x in APPLE_EXCLUSIONS if x != "pineapple")


def _matches_medium_kiwi(q: str) -> bool:
    if not re.search(r"\b(?:a\s+)?(?:medium\s+)?kiwis?\b", q):
        return False
    return not any(x in q for x in KIWI_EXCLUSIONS)


def _lookup_melani_usual(description: str) -> dict | None:
    """Personal defaults Melani uses every day."""
    q = _apply_aliases(description)

    if _matches_barebells_protein(q):
        return {
            **MELANI_BAREBELLS_PROTEIN,
            "confidence": "high",
            "source": "melani_usual",
            "brand": "Barebells",
            "serving": "1 bar (55g)",
        }

    if _matches_medium_apple(q):
        return {
            **MELANI_MEDIUM_APPLE,
            "confidence": "high",
            "source": "melani_usual",
            "serving": "1 medium apple (~182g)",
            "reference": "Harvard T.H. Chan School of Public Health",
        }

    if _matches_medium_kiwi(q):
        return {
            **MELANI_MEDIUM_KIWI,
            "confidence": "high",
            "source": "melani_usual",
            "serving": "1 medium kiwi (~69–75g)",
            "reference": "Verywell Fit / MyFoodData",
        }

    return None


def _lookup_known_brand(description: str) -> dict | None:
    q = _apply_aliases(description)
    for brand in KNOWN_BRANDS:
        if not any(alias in q for alias in brand["aliases"]):
            continue
        if not any(term in q for term in brand["product_terms"]):
            continue
        flavor_key = _best_flavor_key(q, brand["flavors"])
        picked = _pick_flavor(q, brand["flavors"])
        return {
            **picked,
            "confidence": "high" if flavor_key != "default" else "medium",
            "source": "brand_database",
            "brand": brand["brand"],
            "serving": brand.get("serving", "1 serving"),
            "flavor_matched": flavor_key if flavor_key != "default" else None,
        }
    return None


def _best_flavor_key(text: str, flavors: dict[str, dict]) -> str:
    q = _normalize(text)
    best_key = "default"
    best_score = 0.0
    for key in flavors:
        if key == "default":
            continue
        tokens = [t for t in re.split(r"[\s/,&-]+", key) if t]
        score = sum(1 for t in tokens if t in q) / max(len(tokens), 1)
        if score > best_score:
            best_score = score
            best_key = key
    return best_key


def _search_open_food_facts(description: str) -> dict | None:
    query = _apply_aliases(description)
    try:
        resp = requests.get(
            OFF_SEARCH,
            params={
                "search_terms": query,
                "search_simple": 1,
                "action": "process",
                "json": 1,
                "page_size": 8,
            },
            headers=HEADERS,
            timeout=12,
        )
        resp.raise_for_status()
        products = resp.json().get("products") or []
    except Exception:
        return None

    best = None
    best_score = 0.0
    for p in products:
        name = p.get("product_name") or p.get("generic_name") or ""
        brand = p.get("brands") or ""
        candidate = f"{brand} {name}".strip()
        score = _score_name_match(query, candidate)
        if score > best_score and score >= 0.45:
            best_score = score
            best = p

    if not best:
        return None

    macros = meal_macros_from_off(best)
    if not macros.get("calories"):
        return None

    return {
        "name": macros.get("name") or best.get("product_name") or description[:80],
        "calories": macros["calories"],
        "protein_g": macros.get("protein_g"),
        "carbs_g": macros.get("carbs_g"),
        "fat_g": macros.get("fat_g"),
        "fiber_g": macros.get("fiber_g"),
        "confidence": "high" if best_score >= 0.7 else "medium",
        "source": "open_food_facts",
        "brand": best.get("brands") or "",
        "barcode": best.get("code"),
        "serving": macros.get("serving_notes"),
    }


def _parse_nutrition_from_snippets(text: str) -> dict | None:
    """Extract calories/macros from web search snippets."""
    blob = _normalize(text)
    cal = None
    prot = carbs = fat = fiber = None

    m = re.search(r"(\d{2,4})\s*(?:calories|kcal|cal)\b", blob)
    if m:
        cal = float(m.group(1))

    for key, patterns in [
        ("prot", [r"(\d+(?:\.\d+)?)\s*g?\s*protein", r"protein[:\s]+(\d+(?:\.\d+)?)\s*g"]),
        ("carbs", [r"(\d+(?:\.\d+)?)\s*g?\s*carbs?", r"carbohydrates[:\s]+(\d+(?:\.\d+)?)\s*g"]),
        ("fat", [r"(\d+(?:\.\d+)?)\s*g?\s*fat", r"total fat[:\s]+(\d+(?:\.\d+)?)\s*g"]),
        ("fiber", [r"(\d+(?:\.\d+)?)\s*g?\s*fiber"]),
    ]:
        for pat in patterns:
            m = re.search(pat, blob)
            if m:
                val = float(m.group(1))
                if key == "prot":
                    prot = val
                elif key == "carbs":
                    carbs = val
                elif key == "fat":
                    fat = val
                elif key == "fiber":
                    fiber = val
                break

    if cal and (prot or carbs or fat):
        return {
            "calories": cal,
            "protein_g": prot,
            "carbs_g": carbs,
            "fat_g": fat,
            "fiber_g": fiber,
        }
    return None


def _search_web_nutrition(description: str) -> dict | None:
    query = _apply_aliases(description)
    search_q = f"{query} nutrition facts label calories protein per serving"
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(search_q)}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=12)
        resp.raise_for_status()
        html = resp.text
    except Exception:
        return None

    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        chunks: list[str] = []
        for block in soup.select(".result__body")[:6]:
            title = block.select_one("a.result__a")
            snippet = block.select_one(".result__snippet")
            if title:
                chunks.append(title.get_text(" ", strip=True))
            if snippet:
                chunks.append(snippet.get_text(" ", strip=True))
        blob = " ".join(chunks)
    except Exception:
        blob = re.sub(r"<[^>]+>", " ", html)

    parsed = _parse_nutrition_from_snippets(blob)
    if not parsed:
        return None

    name = description.strip()[:80]
    if "barebells" in query or "barbell" in _normalize(description):
        flavor_key = _best_flavor_key(query, KNOWN_BRANDS[0]["flavors"])
        if flavor_key != "default":
            name = KNOWN_BRANDS[0]["flavors"][flavor_key]["name"]

    return {
        "name": name,
        **parsed,
        "confidence": "medium",
        "source": "web_nutrition_search",
    }


# Generic whole/home-cooked foods — never route these to a branded packaged-product
# search (e.g. "2 boiled eggs" must NOT become "Tesco Boiled Eggs with Salad Cream").
GENERIC_FOOD_WORDS = (
    "egg", "eggs", "boiled", "scrambled", "fried", "poached", "omelette", "omelet",
    "chicken", "beef", "steak", "pork", "turkey", "fish", "salmon", "tuna", "shrimp",
    "rice", "pasta", "noodles", "bread", "toast", "oats", "oatmeal", "potato", "potatoes",
    "salad", "soup", "sandwich", "wrap", "burrito", "taco", "stir fry", "stir-fry",
    "vegetable", "veggies", "broccoli", "spinach", "carrot", "tomato", "avocado",
    "banana", "berries", "strawberries", "blueberries", "grapes", "orange",
    "yogurt", "milk", "cheese", "butter", "beans", "lentils", "tofu", "quinoa",
    "smoothie", "coffee", "tea", "water", "homemade", "home-made", "cooked", "grilled",
    "roasted", "baked", "steamed", "raw",
)

_ALL_BRAND_ALIASES = tuple(
    {alias for b in KNOWN_BRANDS for alias in b["aliases"]}
    | set(BRAND_ALIASES.keys())
    | set(BRAND_ALIASES.values())
)


def _looks_branded(description: str) -> bool:
    """True only when the text clearly names a packaged/branded product."""
    raw = description or ""
    q = _apply_aliases(raw)

    if "®" in raw or "™" in raw:
        return True

    if any(re.search(rf"\b{re.escape(a)}\b", q) for a in _ALL_BRAND_ALIASES):
        return True

    # A capitalized proper noun (not sentence-start, not a common food word) → likely a brand.
    words = re.findall(r"\b[A-Z][a-zA-Z]+\b", raw)
    for w in words:
        if w.lower() in GENERIC_FOOD_WORDS:
            continue
        if raw.strip().startswith(w):
            continue
        return True

    return False


def lookup_branded_food(description: str) -> dict | None:
    """Resolve a branded food description to nutrition facts."""
    desc = (description or "").strip()
    if not desc:
        return None

    cache_key = _apply_aliases(desc)

    usual = _lookup_melani_usual(desc)
    if usual:
        _cache_set(cache_key, usual)
        return usual

    cached = _cache_get(cache_key)
    if cached:
        return cached

    barcode = re.search(r"\b(\d{8,14})\b", desc)
    if barcode:
        product = lookup_barcode(barcode.group(1))
        if product:
            macros = meal_macros_from_off(product)
            if macros.get("calories"):
                result = {
                    **macros,
                    "confidence": "high",
                    "source": "open_food_facts_barcode",
                }
                _cache_set(cache_key, result)
                return result

    # Curated brand DB always allowed; online product/label search ONLY for clearly
    # branded items so generic whole foods fall through to smart AI estimation.
    lookups = [_lookup_known_brand]
    if _looks_branded(desc):
        lookups += [_search_open_food_facts, _search_web_nutrition]

    for lookup in lookups:
        hit = lookup(desc)
        if hit and hit.get("calories"):
            _cache_set(cache_key, hit)
            return hit

    return None
