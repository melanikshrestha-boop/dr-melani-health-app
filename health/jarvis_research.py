"""Evidence search for Dr. Melani — trusted public-health sources."""

from __future__ import annotations

import re
from urllib.parse import quote_plus

import requests

TRUSTED_DOMAINS = (
    "nih.gov",
    "pubmed.ncbi.nlm.nih.gov",
    "heart.org",
    "cdc.gov",
    "health.harvard.edu",
    "diabetes.org",
    "who.int",
    "bmj.com",
    "nejm.org",
    "jamanetwork.com",
    "acc.org",
)

BRAND_TRUST_DOMAINS = TRUSTED_DOMAINS + (
    "fda.gov",
    "consumerlab.com",
    "usp.org",
    "mayoclinic.org",
    "healthline.com",
    "webmd.com",
    "reuters.com",
    "bbc.com",
)

HEADERS = {"User-Agent": "MelaniHealthJarvis/1.0 (personal health assistant)"}
PUBMED_SEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_SUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"

HEALTH_KEYWORDS = (
    "calorie", "protein", "hormone", "cholesterol", "ldl", "triglyceride",
    "brain fog", "migraine", "sleep", "weight", "a1c", "glucose", "fiber",
    "saturated", "omega", "supplement", "vitamin", "exercise", "muscle",
    "evidence", "research", "study", "journal", "guideline", "why", "should i",
    "ashwagandha", "good for me", "is this ok", "is this good", "safe for",
    "capsule", "herb", "product", "take this", "creatine", "patanjali", "immunogrid",
    "brand", "recall", "fake", "quality",
)

SKIP_KEYWORDS = (
    "add ", "trader joe", "target", "grocery list", "hello", "hi jarvis",
    "hi melani", "thanks", "thank you", "bye",
)


def _needs_research(question: str, force: bool = False) -> bool:
    if force:
        return True
    q = question.lower()
    if any(s in q for s in SKIP_KEYWORDS):
        return False
    return any(k in q for k in HEALTH_KEYWORDS)


def personalized_research_query(question: str, briefing: str = "") -> str:
    """Build PubMed query with Melani's context baked in."""
    topic = re.sub(r"\s+", " ", (question or "").strip())[:100]
    extras = ["female", "adolescent", "lipid", "cholesterol", "migraine"]
    if briefing:
        low = briefing.lower()
        if "ldl" in low or "cholesterol" in low:
            extras.append("cardiovascular")
        if "triglyceride" in low:
            extras.append("triglycerides")
        if "brain fog" in low or "migraine" in low:
            extras.append("cognitive")
    if "ashwagandha" in topic.lower():
        extras.extend(["ashwagandha", "adaptogen", "safety"])
    if "creatine" in topic.lower():
        extras.extend(["creatine monohydrate", "adolescent", "safety"])
    if "patanjali" in topic.lower():
        extras.extend(["ayurvedic supplement quality", "heavy metals"])
    if "immunogrid" in topic.lower():
        extras.extend(["immunity supplement", "herbal blend safety"])
    if "supplement" in topic.lower() or "capsule" in topic.lower():
        extras.append("dietary supplement safety")
    unique = []
    for e in extras:
        if e not in unique:
            unique.append(e)
    return f"{topic} {' '.join(unique[:6])}"


def _pubmed_evidence(query: str, max_results: int = 4) -> list[str]:
    topic = re.sub(r"\s+", " ", query.strip())[:120]
    search_term = f"{topic} (review[pt] OR guideline[pt] OR meta-analysis[pt])"
    try:
        search = requests.get(
            PUBMED_SEARCH,
            params={"db": "pubmed", "term": search_term, "retmax": max_results, "retmode": "json"},
            headers=HEADERS,
            timeout=12,
        )
        search.raise_for_status()
        ids = search.json().get("esearchresult", {}).get("idlist", [])
        if not ids:
            search = requests.get(
                PUBMED_SEARCH,
                params={"db": "pubmed", "term": topic, "retmax": max_results, "retmode": "json"},
                headers=HEADERS,
                timeout=12,
            )
            search.raise_for_status()
            ids = search.json().get("esearchresult", {}).get("idlist", [])
        if not ids:
            return []

        summary = requests.get(
            PUBMED_SUMMARY,
            params={"db": "pubmed", "id": ",".join(ids), "retmode": "json"},
            headers=HEADERS,
            timeout=12,
        )
        summary.raise_for_status()
        result = summary.json().get("result", {})
        lines: list[str] = []
        for pmid in ids:
            item = result.get(pmid, {})
            title = item.get("title", "").strip()
            journal = item.get("fulljournalname") or item.get("source") or "PubMed"
            year = (item.get("pubdate") or "")[:4]
            if title:
                lines.append(f"• PubMed {pmid} ({journal}, {year}): {title}")
        return lines
    except Exception:
        return []


def _web_evidence(query: str, max_results: int = 3, domains: tuple[str, ...] | None = None) -> list[str]:
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return []

    domain_list = domains or TRUSTED_DOMAINS
    topic = re.sub(r"\s+", " ", query.strip())[:100]
    site_filter = " OR ".join(f"site:{d}" for d in domain_list[:6])
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(f'{topic} ({site_filter})')}"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=12)
        resp.raise_for_status()
    except Exception:
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    lines: list[str] = []
    for block in soup.select(".result__body")[: max_results + 2]:
        link = block.select_one("a.result__a")
        snippet = block.select_one(".result__snippet")
        if not link:
            continue
        href = link.get("href") or ""
        if not any(d in href for d in domain_list):
            continue
        title = link.get_text(" ", strip=True)
        body = snippet.get_text(" ", strip=True) if snippet else ""
        if title:
            lines.append(f"• {title}: {body[:200]}")
        if len(lines) >= max_results:
            break
    return lines


def search_brand_product(
    product_name: str,
    brand: str = "",
    ingredients: str = "",
    *,
    max_results: int = 4,
) -> str:
    """Look up brand quality, recalls, and adulteration reports."""
    name = re.sub(r"\s+", " ", (product_name or "").strip())[:80]
    brand_s = re.sub(r"\s+", " ", (brand or "").strip())[:40]
    if not name and not brand_s:
        return ""

    queries: list[str] = []
    if brand_s:
        queries.append(f'"{brand_s}" "{name}" supplement recall FDA safety')
        if "patanjali" in brand_s.lower():
            queries.append(f"Patanjali {name} ayurvedic supplement quality heavy metals")
        else:
            queries.append(f'"{brand_s}" third party tested NSF USP quality')
    else:
        queries.append(f'"{name}" dietary supplement recall counterfeit')
    if ingredients:
        queries.append(f'"{name}" {ingredients[:40]} supplement safety')

    lines: list[str] = []
    for q in queries[:3]:
        lines.extend(_web_evidence(q, max_results=2, domains=BRAND_TRUST_DOMAINS))
        if len(lines) >= max_results:
            break

    if not lines:
        return ""
    deduped: list[str] = []
    seen = set()
    for line in lines:
        key = line[:60]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(line)
    return "Brand / quality web check (verify yourself — not medical advice):\n" + "\n".join(
        deduped[:max_results]
    )


def search_supplement_bundle(
    product_name: str,
    brand: str = "",
    briefing: str = "",
    ingredients: str = "",
) -> tuple[str, str]:
    """PubMed evidence + brand web check."""
    evidence_q = personalized_research_query(f"{brand} {product_name}".strip(), briefing)
    evidence = search_evidence(evidence_q, max_results=4, force=True)
    brand_block = search_brand_product(product_name, brand, ingredients, max_results=4)
    combined = ""
    if evidence:
        combined += evidence
    if brand_block:
        combined += ("\n\n" if combined else "") + brand_block
    return evidence, brand_block or ""


def search_evidence(question: str, max_results: int = 4, *, force: bool = False) -> str:
    """Pull journal/guideline snippets — not a substitute for her doctor."""
    if not _needs_research(question, force=force):
        return ""

    lines = _pubmed_evidence(question, max_results=max_results)
    if len(lines) < 2:
        lines.extend(_web_evidence(question, max_results=2))

    if not lines:
        return ""
    return "Verified sources (summaries — not medical advice):\n" + "\n".join(lines[:max_results])
