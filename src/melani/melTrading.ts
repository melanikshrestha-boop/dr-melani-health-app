/**
 * Advanced stock + trading knowledge for Mel / Dr. Melani.
 * Used offline in replies and injected into Grok system context.
 * Not financial advice — decision framework for a sophisticated builder-operator.
 */

/** Core framework Mel always carries (compact, high-signal) */
export const MEL_TRADING_KNOWLEDGE = `
ADVANCED STOCK + TRADING DESK (Dr. Melani / Mel)

ROLE
- You are a highly trained markets operator: equities, options, macro, and risk.
- You speak like a sharp buy-side analyst + trader, not a TikTok tipster.
- Never invent prices, EPS, or filings. Use TOOL RESULTS / LIVE SNAPSHOT numbers only.
- Not personalized financial advice. Frame as decision frameworks and scenarios.
- Never use em dashes.

PILLARS
1) Process over prediction: thesis, catalyst, invalidation, size, time horizon.
2) Asymmetry: risk defined first, upside second.
3) Liquidity + structure: spread, ADV, options OI, borrow, event calendar.
4) Macro context: rates, USD, liquidity, sector rotation, VIX regime.
5) Fundamentals + flow: earnings quality, margins, FCF, guidance, positioning.

EQUITY ANALYSIS STACK
- Business quality: moat, unit economics, reinvestment runway, capital allocation.
- Growth: revenue QoQ/YoY, mix shift, backlog/RPO if relevant, volume vs price.
- Profitability: gross / operating / net margins, incremental margins, FCF conversion.
- Balance sheet: net cash/debt, interest coverage, buybacks vs dilution.
- Valuation: PE/PEG, EV/Sales, EV/EBITDA, FCF yield vs history and peers (relative, not absolute gospel).
- Narrative vs numbers: what the market is pricing; what would re-rate the multiple.

EARNINGS / QUARTERLY READ
- Beat/miss on EPS and revenue vs consensus; more important: guide and commentary.
- Quality of beat: one-time items, buybacks, tax, opex timing.
- Sequential (QoQ) vs year-over-year (YoY) — call both out.
- Estimate revisions: direction of NTM EPS after the print.
- Post-earnings drift: gap vs volume confirmation; fade vs continuation setups.

TECHNICAL / TACTICAL
- Regime: trend (higher highs/lows), range, or breakdown.
- Levels: prior day HVN, 20/50/200-day context in words (not fake exact ticks unless given).
- Relative strength vs SPX/QQQ and sector ETF.
- Volume: expansion on breakouts, dry-up into compression.
- Avoid over-precision on charts without data.

OPTIONS LITERACY (advanced)
- Greeks intuition: delta (directional), gamma (acceleration near strikes), theta (time decay), vega (IV).
- IV rank/percentile: high IV favors defined-risk credit or long vol only with catalyst edge.
- Skew: put demand vs call; crash premium in equities.
- Event vol: earnings IV crush is structural; long straddles need large move vs priced move.
- Structures: long call/put, debit spreads (defined risk), credit spreads, iron condors (range), calendars (term structure).
- Position sizing: max loss known before entry; no naked short convexity for a personal book unless explicit risk capital.
- Assignment / early exercise risk on short options into dividends or deep ITM.

MACRO MAP
- Rates up: duration-sensitive growth multiples compress; financials can benefit with curve.
- Soft landing vs hard landing narratives change beta and quality premium.
- Liquidity: QT/QE, TGA, RRP as color, not religion.
- USD strength: headwind for multinationals' overseas translation.
- VIX: <15 complacency risk; 20-30 active hedging; spikes = opportunity + danger.

RISK + PSYCHOLOGY
- Pre-commit invalidation. If thesis breaks, exit; do not average down without new info.
- Correlation risk: "diversified" mega-cap tech is still one factor.
- Leverage: options ARE leverage; size notional carefully.
- Journal: thesis, entry, exit, lesson.

HOW MEL ANSWERS STOCK QUESTIONS
1) State regime + what matters this week (macro + sector).
2) For a ticker: quality snapshot, last quarter signal, what to watch next.
3) Trade framing (if asked): bull / base / bear with invalidation.
4) One clear next action (check report, set alert, wait for print, size a pilot).
5) Refuse fake certainty. Prefer "priced for X; path is Y if Z."
`.trim();

/** Short offline briefing when Melani asks for market education without live data */
export function offlineTradingBrief(topic?: string): string {
  const t = (topic || "").toLowerCase();
  if (/option|call|put|iv |implied|straddle|spread|greek/.test(t)) {
    return [
      "Options desk (quick):",
      "- Define max loss first. Prefer debit or credit spreads over naked shorts.",
      "- High IV into events: sellers of vol need edge; buyers need a bigger move than priced.",
      "- After earnings, IV crush often hurts long premium even if direction is right.",
      "- Delta ≈ directional exposure; theta is rent you pay/earn daily; vega moves with fear.",
      "Next: name a ticker + horizon (days vs weeks) and I will frame structures.",
    ].join("\n");
  }
  if (/quarter|earnings|eps|revenue|report/.test(t)) {
    return [
      "Quarterly read (how Mel does it):",
      "1) Revenue + EPS vs estimate and vs last year.",
      "2) Guide: raise / reiterate / cut.",
      "3) Margin direction and FCF quality.",
      "4) What multiple the market is paying after the print.",
      "Open World Monitor → Reports for live quarterly packs on the watchlist.",
    ].join("\n");
  }
  if (/risk|size|position|stop/.test(t)) {
    return [
      "Risk rules Mel uses:",
      "- Risk a small fixed % of book per idea; options max loss = premium or spread width.",
      "- Invalidation before entry; no hope-mode averaging.",
      "- Know if the idea is beta (market), factor (tech), or idiosyncratic.",
      "Next action: write the thesis in one line and the kill switch in one line.",
    ].join("\n");
  }
  return [
    "Markets mode is on.",
    "I can walk equities, earnings, options structures, and risk like a serious desk.",
    "Ask for a ticker quarterly (e.g. NVDA quarterly), an options structure, or open World Monitor → Reports.",
    "Not advice: frameworks only.",
  ].join("\n");
}

/** Format one quarterly API row into Mel-readable text */
export function formatQuarterlyForMel(report: {
  symbol?: string;
  name?: string;
  error?: string;
  sector?: string | null;
  industry?: string | null;
  quarters?: Array<{
    period?: string;
    totalRevenue?: number | null;
    netIncome?: number | null;
    operatingIncome?: number | null;
    grossProfit?: number | null;
  }>;
  epsHistory?: Array<{
    period?: string;
    epsActual?: number | null;
    epsEstimate?: number | null;
    surprisePercent?: number | null;
  }>;
  revenueYoY?: number | null;
  revenueQoQ?: number | null;
  trailingPE?: number | null;
  forwardPE?: number | null;
  profitMargins?: number | null;
  recommendationKey?: string | null;
  targetMeanPrice?: number | null;
  currentPrice?: number | null;
}): string {
  if (report.error) {
    return `${report.symbol || "Ticker"}: quarterly pack unavailable (${report.error}).`;
  }
  const lines: string[] = [];
  lines.push(
    `${report.symbol}${report.name ? ` · ${report.name}` : ""}${
      report.sector ? ` · ${report.sector}` : ""
    }`
  );
  if (report.currentPrice != null || report.trailingPE != null || report.forwardPE != null) {
    lines.push(
      [
        report.currentPrice != null ? `price ~$${report.currentPrice.toFixed(2)}` : null,
        report.trailingPE != null ? `ttm PE ${report.trailingPE.toFixed(1)}` : null,
        report.forwardPE != null ? `fwd PE ${report.forwardPE.toFixed(1)}` : null,
        report.profitMargins != null
          ? `profit margin ${(report.profitMargins * 100).toFixed(1)}%`
          : null,
        report.recommendationKey ? `street ${report.recommendationKey}` : null,
        report.targetMeanPrice != null ? `target ~$${report.targetMeanPrice.toFixed(0)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
  }
  if (report.revenueYoY != null || report.revenueQoQ != null) {
    lines.push(
      [
        report.revenueYoY != null ? `rev YoY ${report.revenueYoY.toFixed(1)}%` : null,
        report.revenueQoQ != null ? `rev QoQ ${report.revenueQoQ.toFixed(1)}%` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
  }
  const qs = report.quarters || [];
  if (qs.length) {
    lines.push("Last quarters (revenue / net income):");
    for (const q of qs.slice(0, 4)) {
      lines.push(
        `  ${q.period || "—"}: rev ${fmtCompact(q.totalRevenue)} · NI ${fmtCompact(q.netIncome)}`
      );
    }
  }
  const eps = report.epsHistory || [];
  if (eps.length) {
    lines.push("EPS actual vs est:");
    for (const e of eps.slice(0, 4)) {
      const surprise =
        e.surprisePercent != null ? ` (surprise ${e.surprisePercent.toFixed(1)}%)` : "";
      lines.push(
        `  ${e.period || "—"}: act ${fmtEps(e.epsActual)} vs est ${fmtEps(e.epsEstimate)}${surprise}`
      );
    }
  }
  return lines.join("\n");
}

function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtEps(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}
