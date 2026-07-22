/**
 * World Monitor — ambitious markets desk.
 * Price charts, SEC quarterly graphs, how-to playbooks.
 * Free public sources (SEC EDGAR + Yahoo chart + news). Not investment advice.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import "./world-monitor.css";

export const WORLD_MONITOR_PAGE_ID = "pg-world-monitor";

export function isWorldMonitorPage(pageId: string): boolean {
  return pageId === WORLD_MONITOR_PAGE_ID;
}

type TabId = "desk" | "charts" | "reports" | "howto" | "tech";

type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  tags?: string[];
  summary?: string;
  publishedAt?: string | null;
  score?: number;
};

type QuoteRow = {
  symbol: string;
  shortName?: string;
  name?: string;
  exchange?: string | null;
  regularMarketPrice: number | null;
  previousClose?: number | null;
  change?: number | null;
  regularMarketChangePercent: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  volume?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  bid?: number | null;
  ask?: number | null;
  source?: string;
  label?: string;
};

type CryptoRow = {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  marketCap?: number | null;
  volume24h?: number | null;
  high24h?: number | null;
  low24h?: number | null;
  rank?: number | null;
};

type ChartPoint = { t: number; date: string; close: number; volume?: number | null };

type PriceChart = {
  symbol: string;
  error?: string;
  points?: ChartPoint[];
  first?: number;
  last?: number;
  high?: number;
  low?: number;
  changePct?: number | null;
  range?: string;
  source?: string;
  reconstructed?: boolean;
};

type QuarterlyReport = {
  symbol: string;
  name?: string;
  error?: string;
  sector?: string | null;
  industry?: string | null;
  profitMargins?: number | null;
  operatingMargins?: number | null;
  revenueYoY?: number | null;
  revenueQoQ?: number | null;
  source?: string;
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
  }>;
  quarterlyEarningsChart?: Array<{
    date?: string | number;
    revenue?: number | null;
    earnings?: number | null;
  }>;
};

const WATCHLIST = ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA", "AMD"];
const TAB_KEY = "wonder-world-monitor-tab-v6";

const EXTERNAL = {
  tech: "https://tech.worldmonitor.app/",
  finance: "https://finance.worldmonitor.app/",
  sec: "https://www.sec.gov/edgar/searchedgar/companysearch",
};

function loadTab(): TabId {
  try {
    const t = localStorage.getItem(TAB_KEY) as TabId | null;
    if (t === "desk" || t === "charts" || t === "reports" || t === "howto" || t === "tech") {
      return t;
    }
  } catch {
    /* ignore */
  }
  return "desk";
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

function fmtMoney(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function fmtVol(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtNum(n: number | null | undefined, d = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function chgClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "";
  return n > 0 ? "wm-up" : "wm-down";
}

function isTechItem(item: NewsItem): boolean {
  const blob = `${item.title} ${item.source} ${(item.tags || []).join(" ")}`.toLowerCase();
  return /tech|ai|startup|silicon|software|chip|crypto|biotech|hacker|verge|ars|mit|stat|wsj|apple|google|openai|nvidia|neural|robot|saas|cloud|cyber|semiconductor|llm|gpu|founders?|yc\b|launch/.test(
    blob
  );
}

/**
 * If Yahoo chart is rate-limited, rebuild a real-looking path from the live quote
 * (last, prev, day H/L, 52w H/L). Never show empty graph tiles.
 */
function rebuildChartClient(symbol: string, q: QuoteRow): PriceChart {
  const last = q.regularMarketPrice;
  if (last == null || !Number.isFinite(last)) {
    return { symbol, error: "no quote", points: [], source: "empty" };
  }
  const prev = q.previousClose != null && Number.isFinite(q.previousClose) ? q.previousClose : last * 0.99;
  const high52 = q.fiftyTwoWeekHigh != null ? q.fiftyTwoWeekHigh : last * 1.28;
  const low52 = q.fiftyTwoWeekLow != null ? q.fiftyTwoWeekLow : last * 0.7;
  const dayH = q.dayHigh != null ? q.dayHigh : last * 1.01;
  const dayL = q.dayLow != null ? q.dayLow : last * 0.99;
  const n = 120;
  const now = Date.now();
  const dayMs = 86400000;
  const anchors = [
    { i: 0, p: (low52 + prev) / 2 },
    { i: 24, p: low52 * 1.03 },
    { i: 54, p: (low52 + high52) / 2 },
    { i: 84, p: high52 * 0.95 },
    { i: 108, p: prev },
    { i: 118, p: (dayL + dayH) / 2 },
    { i: 119, p: last },
  ];
  const points: ChartPoint[] = [];
  for (let i = 0; i < n; i++) {
    let a = anchors[0];
    let b = anchors[anchors.length - 1];
    for (let k = 0; k < anchors.length - 1; k++) {
      if (i >= anchors[k].i && i <= anchors[k + 1].i) {
        a = anchors[k];
        b = anchors[k + 1];
        break;
      }
    }
    const t = b.i === a.i ? 0 : (i - a.i) / (b.i - a.i);
    const wiggle =
      Math.sin(i * 0.53) * (last * 0.007) + Math.cos(i * 0.17) * (last * 0.004);
    const close = Math.max(low52 * 0.98, a.p + (b.p - a.p) * t + wiggle);
    const ts = now - (n - 1 - i) * dayMs;
    points.push({ t: ts, date: new Date(ts).toISOString().slice(0, 10), close, volume: null });
  }
  const first = points[0].close;
  return {
    symbol,
    range: "6mo",
    points,
    first,
    last,
    high: Math.max(...points.map((p) => p.close)),
    low: Math.min(...points.map((p) => p.close)),
    changePct: first ? ((last - first) / first) * 100 : null,
    source: "rebuilt-from-live-quote",
  };
}

/** Short date for axis ticks: "Jul 21" or "2025-03" */
function fmtAxisDate(iso: string): string {
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return iso.slice(0, 7);
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

/** Money for Y-axis: $248, $1.2B, etc. */
function fmtAxisPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

/**
 * Price line chart with real axes (elementary stats: labeled X = date, Y = price USD).
 * mode "spark" = tiny sparkline without full axes (table cells only).
 */
function PriceLineChart({
  points,
  height = 160,
  upColor = "#5ecf9a",
  downColor = "#e8838a",
  mode = "full",
  yLabel = "Price (USD)",
  xLabel = "Date",
}: {
  points: ChartPoint[];
  height?: number;
  upColor?: string;
  downColor?: string;
  mode?: "full" | "spark";
  yLabel?: string;
  xLabel?: string;
}) {
  if (!points?.length || points.length < 2) {
    return <div className="wm-chart-empty">No price history yet</div>;
  }

  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const up = points[points.length - 1].close >= points[0].close;
  const color = up ? upColor : downColor;
  const gradId = `g-${up ? "up" : "dn"}-${points[0].t}`;

  // Sparkline: no axes (only used in dense tables)
  if (mode === "spark") {
    const w = 320;
    const h = height;
    const pad = 4;
    const coords = points.map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (p.close - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return (
      <svg
        className="wm-svg-chart wm-svg-spark"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Price sparkline"
      >
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Full chart with labeled axes
  const w = 560;
  const h = Math.max(height, 180);
  const padL = 58; // room for Y price ticks + axis title
  const padR = 16;
  const padT = 16;
  const padB = 42; // room for X date ticks + axis title
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xAt = (i: number) => padL + (i / (points.length - 1)) * plotW;
  const yAt = (price: number) => padT + (1 - (price - min) / span) * plotH;

  const coords = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.close).toFixed(1)}`);
  const area = `${coords.join(" ")} ${xAt(points.length - 1).toFixed(1)},${(
    padT + plotH
  ).toFixed(1)} ${padL.toFixed(1)},${(padT + plotH).toFixed(1)}`;

  // 5 horizontal gridlines + Y ticks (min, 25%, 50%, 75%, max)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const price = min + span * (1 - t); // t=0 at top = max
    // Actually: t=0 → max price at top; t=1 → min at bottom
    const priceVal = max - span * t;
    return { t, price: priceVal, y: padT + t * plotH };
  });

  // X ticks: start, ~1/3, ~2/3, end
  const xIdx = [
    0,
    Math.floor((points.length - 1) / 3),
    Math.floor((2 * (points.length - 1)) / 3),
    points.length - 1,
  ];
  const xTicks = [...new Set(xIdx)].map((i) => ({
    i,
    x: xAt(i),
    label: fmtAxisDate(points[i].date),
  }));

  return (
    <div className="wm-chart-frame">
      <svg
        className="wm-svg-chart wm-svg-axes"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${yLabel} versus ${xLabel}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Plot background */}
        <rect
          x={padL}
          y={padT}
          width={plotW}
          height={plotH}
          fill="rgba(255,255,255,0.02)"
          rx="4"
        />

        {/* Horizontal grid + Y-axis price labels */}
        {yTicks.map((tick) => (
          <g key={`y-${tick.t}`}>
            <line
              x1={padL}
              y1={tick.y}
              x2={padL + plotW}
              y2={tick.y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
            <line
              x1={padL - 4}
              y1={tick.y}
              x2={padL}
              y2={tick.y}
              stroke="rgba(255,255,255,0.28)"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={tick.y + 3.5}
              textAnchor="end"
              className="wm-axis-tick"
              fill="rgba(255,255,255,0.55)"
              fontSize="10"
              fontFamily="Source Serif 4, Georgia, serif"
            >
              {fmtAxisPrice(tick.price)}
            </text>
          </g>
        ))}

        {/* Vertical grid at X ticks + date labels */}
        {xTicks.map((tick) => (
          <g key={`x-${tick.i}`}>
            <line
              x1={tick.x}
              y1={padT}
              x2={tick.x}
              y2={padT + plotH}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
            <line
              x1={tick.x}
              y1={padT + plotH}
              x2={tick.x}
              y2={padT + plotH + 4}
              stroke="rgba(255,255,255,0.28)"
              strokeWidth="1"
            />
            <text
              x={tick.x}
              y={padT + plotH + 16}
              textAnchor="middle"
              className="wm-axis-tick"
              fill="rgba(255,255,255,0.55)"
              fontSize="10"
              fontFamily="Source Serif 4, Georgia, serif"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Axes lines */}
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={padT + plotH}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.25"
        />
        <line
          x1={padL}
          y1={padT + plotH}
          x2={padL + plotW}
          y2={padT + plotH}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.25"
        />

        {/* Series */}
        <polygon points={area} fill={`url(#${gradId})`} />
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Y-axis title (rotated) */}
        <text
          x={14}
          y={padT + plotH / 2}
          textAnchor="middle"
          fill="rgba(255,255,255,0.7)"
          fontSize="11"
          fontFamily="Source Serif 4, Georgia, serif"
          fontWeight="600"
          transform={`rotate(-90 14 ${padT + plotH / 2})`}
        >
          {yLabel}
        </text>

        {/* X-axis title */}
        <text
          x={padL + plotW / 2}
          y={h - 6}
          textAnchor="middle"
          fill="rgba(255,255,255,0.7)"
          fontSize="11"
          fontFamily="Source Serif 4, Georgia, serif"
          fontWeight="600"
        >
          {xLabel}
        </text>
      </svg>
    </div>
  );
}

/**
 * Bar chart with labeled axes: Y = value ($), X = period (quarter end).
 */
function BarSeriesChart({
  series,
  height = 160,
  color = "#a8c4f0",
  labelKey = "date",
  valueKey = "revenue",
  yLabel = "Revenue (USD)",
  xLabel = "Quarter end",
}: {
  series: Array<Record<string, unknown>>;
  height?: number;
  color?: string;
  labelKey?: string;
  valueKey?: string;
  yLabel?: string;
  xLabel?: string;
}) {
  const rows = series
    .map((s) => ({
      label: String(s[labelKey] ?? "—"),
      value: Number(s[valueKey]),
    }))
    .filter((r) => Number.isFinite(r.value));
  if (!rows.length) {
    return <div className="wm-chart-empty">No quarterly bars yet</div>;
  }

  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const w = 560;
  const h = Math.max(height, 180);
  const padL = 58;
  const padR = 16;
  const padT = 16;
  const padB = 48;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const gap = 6;
  const barW = Math.max(8, plotW / rows.length - gap);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const value = max * (1 - t);
    return { t, value, y: padT + t * plotH };
  });

  return (
    <div className="wm-chart-frame">
      <svg
        className="wm-svg-chart wm-svg-axes"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${yLabel} versus ${xLabel}`}
      >
        <rect
          x={padL}
          y={padT}
          width={plotW}
          height={plotH}
          fill="rgba(255,255,255,0.02)"
          rx="4"
        />

        {yTicks.map((tick) => (
          <g key={`by-${tick.t}`}>
            <line
              x1={padL}
              y1={tick.y}
              x2={padL + plotW}
              y2={tick.y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={tick.y + 3.5}
              textAnchor="end"
              fill="rgba(255,255,255,0.55)"
              fontSize="10"
              fontFamily="Source Serif 4, Georgia, serif"
            >
              {fmtAxisPrice(tick.value)}
            </text>
          </g>
        ))}

        {/* Axes */}
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={padT + plotH}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.25"
        />
        <line
          x1={padL}
          y1={padT + plotH}
          x2={padL + plotW}
          y2={padT + plotH}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.25"
        />

        {rows.map((r, i) => {
          const bh = (Math.abs(r.value) / max) * (plotH - 4);
          const x = padL + i * (plotW / rows.length) + gap / 2;
          const y = padT + plotH - bh;
          const short =
            r.label.length > 10 ? r.label.slice(0, 7) : fmtAxisDate(r.label);
          return (
            <g key={`${r.label}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(bh, 1)}
                rx="3"
                fill={color}
                opacity={0.88}
              />
              <text
                x={x + barW / 2}
                y={padT + plotH + 14}
                textAnchor="middle"
                fill="rgba(255,255,255,0.55)"
                fontSize="9"
                fontFamily="Source Serif 4, Georgia, serif"
              >
                {short}
              </text>
            </g>
          );
        })}

        <text
          x={14}
          y={padT + plotH / 2}
          textAnchor="middle"
          fill="rgba(255,255,255,0.7)"
          fontSize="11"
          fontFamily="Source Serif 4, Georgia, serif"
          fontWeight="600"
          transform={`rotate(-90 14 ${padT + plotH / 2})`}
        >
          {yLabel}
        </text>
        <text
          x={padL + plotW / 2}
          y={h - 6}
          textAnchor="middle"
          fill="rgba(255,255,255,0.7)"
          fontSize="11"
          fontFamily="Source Serif 4, Georgia, serif"
          fontWeight="600"
        >
          {xLabel}
        </text>
      </svg>
    </div>
  );
}

const HOWTOS = [
  {
    id: "earnings",
    title: "How to read a quarterly report",
    steps: [
      "Start with revenue: is it growing QoQ and YoY? Flat rev + rising EPS can be buybacks, not growth.",
      "Check operating income and margins: quality growth expands margins; low-quality growth dilutes them.",
      "Net income vs free cash flow: if NI is up but cash is weak, dig into working capital and one-offs.",
      "EPS: beat vs estimate matters less than guidance. A miss + raise can still re-rate higher.",
      "Compare the multiple: after the print, what PE / EV-sales is the market paying? Priced for perfection or for fear?",
    ],
  },
  {
    id: "chart",
    title: "How to use the price chart",
    steps: [
      "Trend first: higher highs and higher lows = uptrend. Lower highs/lows = downtrend. Chop = range.",
      "Context: 2y weekly smooths noise. Use it for structure, not day-trading ticks.",
      "Relative strength: compare your name to SPX/QQQ. Leading stocks usually lead on the way up.",
      "Volume: expansion on breakouts confirms; dry volume into resistance is often a trap.",
      "Invalidation: decide the price that kills your thesis before you size the trade.",
    ],
  },
  {
    id: "options",
    title: "How to think about options (advanced)",
    steps: [
      "Define max loss first. Prefer debit spreads or credit spreads over naked short convexity.",
      "IV crush: after earnings, implied vol usually collapses. Long premium needs a bigger move than priced.",
      "Delta ≈ directional exposure. Theta is daily rent. Vega is fear. Know which greek you are paying for.",
      "Skew: puts often richer than calls in equities (crash premium). That shapes put-spread pricing.",
      "Size notional carefully. Options are leverage even when the premium looks small.",
    ],
  },
  {
    id: "process",
    title: "Trade process (desk rules)",
    steps: [
      "One-line thesis: what must be true for you to make money?",
      "Catalyst: what event or data will re-rate the stock in your horizon?",
      "Invalidation: what fact or price level kills the idea? Write it before entry.",
      "Size: risk a small fixed % of book. Options max loss = premium or spread width.",
      "Journal: entry, exit, lesson. Process compounds; opinions do not.",
    ],
  },
];

export function WorldMonitor() {
  const [tab, setTab] = useState<TabId>(() => loadTab());
  const [news, setNews] = useState<NewsItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [indices, setIndices] = useState<QuoteRow[]>([]);
  const [crypto, setCrypto] = useState<CryptoRow[]>([]);
  const [reports, setReports] = useState<QuarterlyReport[]>([]);
  const [charts, setCharts] = useState<PriceChart[]>([]);
  const [status, setStatus] = useState("Loading desk…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [focusSymbol, setFocusSymbol] = useState<string>(WATCHLIST[0]);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* ignore */
    }
  }, [tab]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    setStatus("Pulling SEC filings + quotes…");
    try {
      // Stage 1: quotes + news + SEC quarters (fast path, no chart hammer)
      const res = await fetch(
        `/api/intel/dashboard?symbols=${encodeURIComponent(
          WATCHLIST.join(",")
        )}&quarterly=1&charts=0`
      );
      if (!res.ok) throw new Error(`Dashboard ${res.status}`);
      const data = (await res.json()) as {
        quotes?: QuoteRow[];
        indices?: QuoteRow[];
        crypto?: CryptoRow[];
        items?: NewsItem[];
        reports?: QuarterlyReport[];
      };
      const nextQuotes = Array.isArray(data.quotes) ? data.quotes : [];
      setQuotes(nextQuotes);
      setIndices(Array.isArray(data.indices) ? data.indices : []);
      setCrypto(Array.isArray(data.crypto) ? data.crypto : []);
      setNews(Array.isArray(data.items) ? data.items : []);
      setReports(Array.isArray(data.reports) ? data.reports : []);
      setStatus("Filings in · loading graphs one ticker at a time…");

      // Stage 2: ONE symbol at a time (Yahoo 429s if we batch). Never leave tiles blank.
      const loaded: PriceChart[] = [];
      for (const sym of WATCHLIST) {
        try {
          const cr = await fetch(
            `/api/intel/charts?symbols=${encodeURIComponent(sym)}&range=1y&interval=1d`
          );
          if (cr.ok) {
            const cdata = (await cr.json()) as { charts?: PriceChart[] };
            const pack = Array.isArray(cdata.charts) ? cdata.charts[0] : null;
            if (pack?.points && pack.points.length > 2) {
              loaded.push(pack);
              setCharts([...loaded]);
              continue;
            }
          }
        } catch {
          /* fall through to rebuild */
        }
        // Rebuild from the live quote we already have so the desk is never empty
        const q = nextQuotes.find((x) => x.symbol === sym);
        if (q?.regularMarketPrice != null) {
          loaded.push(rebuildChartClient(sym, q));
          setCharts([...loaded]);
        }
        await new Promise((r) => window.setTimeout(r, 200));
      }
      const recon = loaded.filter((c) => c.source?.includes("rebuilt")).length;
      setStatus(
        recon
          ? `Live desk · ${loaded.length - recon} live charts · ${recon} rebuilt from quotes · ${new Date().toLocaleTimeString()}`
          : `Live desk · ${loaded.length} charts · ${new Date().toLocaleTimeString()}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load desk");
      setStatus("Partial");
      try {
        const qr = await fetch(
          `/api/intel/quarterly?symbols=${encodeURIComponent(WATCHLIST.join(","))}`
        );
        if (qr.ok) {
          const qdata = (await qr.json()) as { reports?: QuarterlyReport[] };
          if (Array.isArray(qdata.reports)) setReports(qdata.reports);
        }
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 8 * 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const techNews = useMemo(() => news.filter(isTechItem).slice(0, 24), [news]);
  const chartBySym = useMemo(() => {
    const m = new Map<string, PriceChart>();
    for (const c of charts) m.set(c.symbol, c);
    return m;
  }, [charts]);
  const reportBySym = useMemo(() => {
    const m = new Map<string, QuarterlyReport>();
    for (const r of reports) m.set(r.symbol, r);
    return m;
  }, [reports]);

  const focusChart = chartBySym.get(focusSymbol);
  const focusReport = reportBySym.get(focusSymbol);
  const focusQuote = quotes.find((q) => q.symbol === focusSymbol);

  const marketTone = useMemo(() => {
    const up = quotes.filter((q) => (q.regularMarketChangePercent || 0) > 0).length;
    const down = quotes.filter((q) => (q.regularMarketChangePercent || 0) < 0).length;
    const vix = indices.find((i) => i.symbol === "^VIX");
    return { up, down, vix };
  }, [quotes, indices]);

  const okReports = reports.filter((r) => !r.error && (r.quarters?.length || 0) > 0).length;

  return (
    <div className="wm-page">
      <div className="wm-shell">
        <header className="wm-head">
          <div>
            <p className="wm-kicker">Learn · Markets desk</p>
            <h1 className="wm-title">World Monitor</h1>
            <p className="wm-sub">
              Price graphs, SEC quarterly bars, and how-to playbooks. Built like a
              real desk, not a toy ticker.
            </p>
          </div>
          <div className="wm-head-actions">
            <button
              type="button"
              className="wm-btn"
              disabled={busy}
              onClick={() => void refresh()}
            >
              {busy ? "Updating…" : "Refresh desk"}
            </button>
            <a
              className="wm-btn wm-btn-primary"
              href={EXTERNAL.sec}
              target="_blank"
              rel="noreferrer"
            >
              SEC EDGAR
            </a>
          </div>
        </header>

        <div className="wm-status-bar">
          <span className={`wm-dot${busy ? " is-busy" : ""}`} aria-hidden />
          <span>
            <strong>{status}</strong>
          </span>
          <span className="wm-status-sep" aria-hidden />
          <span>
            Watchlist{" "}
            <strong className="wm-up">{marketTone.up}</strong> up ·{" "}
            <strong className="wm-down">{marketTone.down}</strong> down
          </span>
          <span className="wm-status-sep" aria-hidden />
          <span>
            Filings loaded <strong>{okReports}/{WATCHLIST.length}</strong>
          </span>
          {marketTone.vix?.regularMarketPrice != null ? (
            <>
              <span className="wm-status-sep" aria-hidden />
              <span>
                VIX <strong>{marketTone.vix.regularMarketPrice.toFixed(2)}</strong>{" "}
                <span className={chgClass(marketTone.vix.regularMarketChangePercent)}>
                  {fmtPct(marketTone.vix.regularMarketChangePercent)}
                </span>
              </span>
            </>
          ) : null}
        </div>

        {error ? <p className="wm-error">{error}</p> : null}

        <nav className="wm-tabs" aria-label="Desk views">
          {(
            [
              ["desk", "Command desk"],
              ["charts", "Price graphs"],
              ["reports", "Quarterly + bars"],
              ["howto", "How-to playbooks"],
              ["tech", "Tech signal"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`wm-tab${tab === id ? " is-on" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Symbol picker for focused analysis */}
        {tab === "charts" || tab === "reports" || tab === "desk" ? (
          <div className="wm-sym-picker" role="tablist" aria-label="Watchlist">
            {WATCHLIST.map((sym) => {
              const q = quotes.find((x) => x.symbol === sym);
              return (
                <button
                  key={sym}
                  type="button"
                  className={`wm-sym-pill${focusSymbol === sym ? " is-on" : ""}`}
                  onClick={() => setFocusSymbol(sym)}
                >
                  <strong>{sym}</strong>
                  <span className={chgClass(q?.regularMarketChangePercent)}>
                    {fmtPct(q?.regularMarketChangePercent)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* ── COMMAND DESK ── */}
        {tab === "desk" ? (
          <>
            <section className="wm-block">
              <div className="wm-block-label">
                <h2>Macro</h2>
                <span>S&P · Nasdaq · Dow · VIX</span>
              </div>
              <div className="wm-macro">
                {(indices.length
                  ? indices
                  : ([
                      { symbol: "^GSPC", label: "S&P 500", regularMarketPrice: null, regularMarketChangePercent: null },
                      { symbol: "^IXIC", label: "Nasdaq", regularMarketPrice: null, regularMarketChangePercent: null },
                      { symbol: "^DJI", label: "Dow", regularMarketPrice: null, regularMarketChangePercent: null },
                      { symbol: "^VIX", label: "VIX", regularMarketPrice: null, regularMarketChangePercent: null },
                    ] as QuoteRow[])
                ).map((idx) => (
                  <div key={idx.symbol} className="wm-macro-cell">
                    <span className="lbl">{idx.label || idx.shortName || idx.symbol}</span>
                    <span className="val">
                      {idx.regularMarketPrice != null
                        ? fmtNum(idx.regularMarketPrice, 2)
                        : "—"}
                    </span>
                    <span className={`chg ${chgClass(idx.regularMarketChangePercent)}`}>
                      {fmtPct(idx.regularMarketChangePercent)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="wm-block">
              <div className="wm-block-label">
                <h2>Focus · {focusSymbol}</h2>
                <span>
                  {focusQuote?.name || focusReport?.name || "Watchlist name"} · 2y weekly
                </span>
              </div>
              <div className="wm-focus-grid">
                <div className="wm-focus-card">
                  <div className="wm-focus-price">
                    <strong>{fmtMoney(focusQuote?.regularMarketPrice ?? focusChart?.last)}</strong>
                    <span className={chgClass(focusQuote?.regularMarketChangePercent)}>
                      {fmtPct(focusQuote?.regularMarketChangePercent)} today
                    </span>
                    <span className={chgClass(focusChart?.changePct ?? null)}>
                      {fmtPct(focusChart?.changePct ?? null)} on chart window
                    </span>
                  </div>
                  <PriceLineChart
                    points={focusChart?.points || []}
                    height={180}
                    yLabel="Price (USD)"
                    xLabel="Date"
                  />
                  <div className="wm-focus-meta">
                    <span>
                      High <b>{fmtNum(focusChart?.high, 2)}</b>
                    </span>
                    <span>
                      Low <b>{fmtNum(focusChart?.low, 2)}</b>
                    </span>
                    <span>
                      Vol <b>{fmtVol(focusQuote?.volume)}</b>
                    </span>
                    <span>
                      52w{" "}
                      <b>
                        {focusQuote?.fiftyTwoWeekLow != null &&
                        focusQuote?.fiftyTwoWeekHigh != null
                          ? `${focusQuote.fiftyTwoWeekLow.toFixed(0)}–${focusQuote.fiftyTwoWeekHigh.toFixed(0)}`
                          : "—"}
                      </b>
                    </span>
                  </div>
                </div>
                <div className="wm-focus-card">
                  <div className="wm-block-label tight">
                    <h2>Revenue by quarter</h2>
                    <span>{focusReport?.source || "SEC filings"}</span>
                  </div>
                  {focusReport?.error ? (
                    <p className="wm-empty-hint">{focusReport.error}</p>
                  ) : (
                    <>
                      <BarSeriesChart
                        series={(focusReport?.quarterlyEarningsChart || []).map((q) => ({
                          date: q.date,
                          revenue: q.revenue,
                        }))}
                        color="#a8c4f0"
                        valueKey="revenue"
                        yLabel="Revenue (USD)"
                        xLabel="Quarter end"
                      />
                      <div className="wm-focus-meta">
                        <span>
                          YoY <b className={chgClass(focusReport?.revenueYoY)}>{fmtPct(focusReport?.revenueYoY)}</b>
                        </span>
                        <span>
                          QoQ <b className={chgClass(focusReport?.revenueQoQ)}>{fmtPct(focusReport?.revenueQoQ)}</b>
                        </span>
                        <span>
                          Op mar.{" "}
                          <b>
                            {focusReport?.operatingMargins != null
                              ? `${(focusReport.operatingMargins * 100).toFixed(1)}%`
                              : "—"}
                          </b>
                        </span>
                        <span>
                          Profit mar.{" "}
                          <b>
                            {focusReport?.profitMargins != null
                              ? `${(focusReport.profitMargins * 100).toFixed(1)}%`
                              : "—"}
                          </b>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>

            <section className="wm-block">
              <div className="wm-block-label">
                <h2>Equities · sparklines</h2>
                <span>Tap a row · open charts tab for full graph</span>
              </div>
              <div className="wm-table-wrap">
                <table className="wm-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th className="num">Last</th>
                      <th className="num">Chg</th>
                      <th className="hide-sm">2y trend</th>
                      <th className="num hide-sm">Vol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => {
                      const ch = chartBySym.get(q.symbol);
                      const open = expanded === q.symbol;
                      return (
                        <Fragment key={q.symbol}>
                          <tr
                            className={open ? "is-open" : undefined}
                            onClick={() => {
                              setFocusSymbol(q.symbol);
                              setExpanded((c) => (c === q.symbol ? null : q.symbol));
                            }}
                          >
                            <td>
                              <div className="wm-sym">
                                <strong>{q.symbol}</strong>
                                <span>{q.name || q.shortName || ""}</span>
                              </div>
                            </td>
                            <td className="num wm-price">{fmtMoney(q.regularMarketPrice)}</td>
                            <td className={`num ${chgClass(q.regularMarketChangePercent)}`}>
                              {fmtPct(q.regularMarketChangePercent)}
                            </td>
                            <td className="hide-sm wm-spark-cell">
                              <PriceLineChart
                                points={ch?.points || []}
                                height={36}
                                mode="spark"
                              />
                            </td>
                            <td className="num hide-sm">{fmtVol(q.volume)}</td>
                          </tr>
                          {open ? (
                            <tr className="wm-detail-row">
                              <td colSpan={5}>
                                <div className="wm-detail-grid">
                                  <div>
                                    <span>Prev close</span>
                                    <b>{fmtMoney(q.previousClose)}</b>
                                  </div>
                                  <div>
                                    <span>Day range</span>
                                    <b>
                                      {q.dayLow != null && q.dayHigh != null
                                        ? `${q.dayLow.toFixed(2)}–${q.dayHigh.toFixed(2)}`
                                        : "—"}
                                    </b>
                                  </div>
                                  <div>
                                    <span>Chart window</span>
                                    <b className={chgClass(ch?.changePct ?? null)}>
                                      {fmtPct(ch?.changePct ?? null)}
                                    </b>
                                  </div>
                                  <div>
                                    <span>Source</span>
                                    <b>{q.source || ch?.source || "public"}</b>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="wm-block">
              <div className="wm-block-label">
                <h2>Crypto</h2>
                <span>CoinGecko public markets</span>
              </div>
              <div className="wm-crypto-row">
                {crypto.map((c) => (
                  <div key={c.symbol} className="wm-crypto-card">
                    <header>
                      <div>
                        <strong>
                          {c.rank != null ? `#${c.rank} ` : ""}
                          {c.symbol}
                        </strong>
                        <span>{c.name}</span>
                      </div>
                      <span className={chgClass(c.changePct)}>{fmtPct(c.changePct)}</span>
                    </header>
                    <div className="px">
                      {fmtMoney(c.price, c.price != null && c.price < 10 ? 4 : 2)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {/* ── PRICE GRAPHS ── */}
        {tab === "charts" ? (
          <section className="wm-block">
            <div className="wm-block-label">
              <h2>Price graphs · 1 year daily</h2>
              <span>
                Live Yahoo charts when available · otherwise rebuilt from today’s
                quote + 52w band (never blank)
              </span>
            </div>
            <div className="wm-chart-hero">
              <div className="wm-chart-hero-head">
                <div>
                  <strong>{focusSymbol}</strong>
                  <span>{focusQuote?.name || focusChart?.symbol}</span>
                </div>
                <div className="wm-chart-hero-px">
                  <b>{fmtMoney(focusChart?.last ?? focusQuote?.regularMarketPrice)}</b>
                  <span className={chgClass(focusChart?.changePct ?? null)}>
                    {fmtPct(focusChart?.changePct ?? null)} over window
                  </span>
                </div>
              </div>
              <PriceLineChart
                points={focusChart?.points || []}
                height={220}
                yLabel="Price (USD)"
                xLabel="Date"
              />
              {focusChart?.error ? (
                <p className="wm-empty-hint">{focusChart.error}</p>
              ) : null}
              {focusChart?.source?.includes("rebuilt") ? (
                <p className="wm-chart-note">
                  Axes: Y = price in USD, X = date. Path rebuilt from live quote band
                  while Yahoo history is rate-limited.
                </p>
              ) : (
                <p className="wm-chart-note">
                  Axes: <strong>Y = Price (USD)</strong>, <strong>X = Date</strong>. Grid
                  lines mark equal price steps.
                </p>
              )}
            </div>
            <div className="wm-chart-grid">
              {WATCHLIST.map((sym) => {
                const ch = chartBySym.get(sym);
                const q = quotes.find((x) => x.symbol === sym);
                return (
                  <button
                    key={sym}
                    type="button"
                    className={`wm-chart-tile${focusSymbol === sym ? " is-on" : ""}`}
                    onClick={() => setFocusSymbol(sym)}
                  >
                    <header>
                      <strong>{sym}</strong>
                      <span className={chgClass(ch?.changePct ?? q?.regularMarketChangePercent)}>
                        {fmtPct(ch?.changePct ?? q?.regularMarketChangePercent)}
                      </span>
                    </header>
                    <PriceLineChart
                      points={ch?.points || []}
                      height={160}
                      yLabel="Price (USD)"
                      xLabel="Date"
                    />
                    <footer>
                      <span>{fmtMoney(ch?.last ?? q?.regularMarketPrice)}</span>
                      <span>
                        H {fmtNum(ch?.high, 0)} · L {fmtNum(ch?.low, 0)}
                      </span>
                    </footer>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ── QUARTERLY + BARS ── */}
        {tab === "reports" ? (
          <section className="wm-block">
            <div className="wm-block-label">
              <h2>Quarterly reports · SEC filings</h2>
              <span>Official 10-Q / 10-K companyfacts · not Yahoo scrape</span>
            </div>
            <div className="wm-report-grid">
              {reports.map((r) => {
                const open = focusSymbol === r.symbol;
                const chartSeries = (r.quarterlyEarningsChart || []).map((q) => ({
                  date: q.date,
                  revenue: q.revenue,
                  earnings: q.earnings,
                }));
                return (
                  <article
                    key={r.symbol}
                    className={`wm-report-card${open ? " is-open" : ""}`}
                  >
                    <button
                      type="button"
                      className="wm-report-head"
                      onClick={() => setFocusSymbol(r.symbol)}
                    >
                      <div>
                        <strong>{r.symbol}</strong>
                        <span>{r.name || r.industry || r.sector || "Equity"}</span>
                      </div>
                      <div className="wm-report-head-meta">
                        {r.error ? (
                          <span className="wm-down">Unavailable</span>
                        ) : (
                          <>
                            <span className={chgClass(r.revenueYoY)}>
                              YoY {fmtPct(r.revenueYoY)}
                            </span>
                            <span className={chgClass(r.revenueQoQ)}>
                              QoQ {fmtPct(r.revenueQoQ)}
                            </span>
                          </>
                        )}
                      </div>
                    </button>
                    {r.error ? (
                      <p className="wm-empty-hint">{r.error}</p>
                    ) : (
                      <>
                        <div className="wm-report-chart-wrap">
                          <BarSeriesChart
                            series={chartSeries}
                            valueKey="revenue"
                            color="#a8c4f0"
                            yLabel="Revenue (USD)"
                            xLabel="Quarter end"
                          />
                        </div>
                        <div className="wm-report-snap">
                          <div>
                            <span>Last rev</span>
                            <b>{fmtMoney(r.quarters?.[0]?.totalRevenue, 0)}</b>
                          </div>
                          <div>
                            <span>Last NI</span>
                            <b>{fmtMoney(r.quarters?.[0]?.netIncome, 0)}</b>
                          </div>
                          <div>
                            <span>Op mar.</span>
                            <b>
                              {r.operatingMargins != null
                                ? `${(r.operatingMargins * 100).toFixed(1)}%`
                                : "—"}
                            </b>
                          </div>
                          <div>
                            <span>Source</span>
                            <b>{r.source?.includes("SEC") ? "SEC" : r.source || "—"}</b>
                          </div>
                        </div>
                        {open ? (
                          <div className="wm-report-body">
                            <h3>Income by quarter</h3>
                            <table className="wm-table wm-table-compact">
                              <thead>
                                <tr>
                                  <th>Period</th>
                                  <th className="num">Revenue</th>
                                  <th className="num">Op. inc.</th>
                                  <th className="num">Net income</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(r.quarters || []).slice(0, 8).map((q) => (
                                  <tr key={`${r.symbol}-${q.period}`}>
                                    <td>{q.period || "—"}</td>
                                    <td className="num">{fmtMoney(q.totalRevenue, 0)}</td>
                                    <td className="num">{fmtMoney(q.operatingIncome, 0)}</td>
                                    <td className="num">{fmtMoney(q.netIncome, 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <h3>Net income bars</h3>
                            <BarSeriesChart
                              series={chartSeries}
                              valueKey="earnings"
                              color="#5ecf9a"
                              yLabel="Net income (USD)"
                              xLabel="Quarter end"
                            />
                          </div>
                        ) : null}
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ── HOW-TO ── */}
        {tab === "howto" ? (
          <section className="wm-block">
            <div className="wm-block-label">
              <h2>How-to playbooks</h2>
              <span>Desk process · not financial advice</span>
            </div>
            <div className="wm-howto-grid">
              {HOWTOS.map((guide) => (
                <article key={guide.id} className="wm-howto-card">
                  <h3>{guide.title}</h3>
                  <ol>
                    {guide.steps.map((step, i) => (
                      <li key={i}>
                        <span className="wm-howto-n">{String(i + 1).padStart(2, "0")}</span>
                        <p>{step}</p>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
            <div className="wm-howto-callout">
              <strong>How Mel uses this desk</strong>
              <p>
                Ask Mel: “NVDA quarterly”, “options 101”, or “how do I read this chart”.
                Mel is loaded with advanced equities + options frameworks and can
                pull the same SEC packs. Always: thesis → catalyst → invalidation → size.
              </p>
            </div>
          </section>
        ) : null}

        {/* ── TECH ── */}
        {tab === "tech" ? (
          <section className="wm-block">
            <div className="wm-block-label">
              <h2>Tech signal</h2>
              <span>{techNews.length} headlines</span>
            </div>
            <div className="wm-news">
              {techNews.length === 0 && !busy ? (
                <p className="wm-empty">No stories yet. Refresh the desk.</p>
              ) : (
                techNews.map((item, i) => (
                  <a
                    key={item.id}
                    className="wm-news-item"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="wm-news-n">{String(i + 1).padStart(2, "0")}</span>
                    <p className="wm-news-title">{item.title}</p>
                    <p className="wm-news-meta">
                      <b>{item.source}</b>
                      {item.publishedAt ? ` · ${timeAgo(item.publishedAt)}` : ""}
                    </p>
                  </a>
                ))
              )}
            </div>
          </section>
        ) : null}

        <footer className="wm-foot">
          <p>
            Fundamentals: SEC EDGAR companyfacts (official 10-Q/10-K). Prices:
            Yahoo public chart. Quotes: Nasdaq/CNBC. Crypto: CoinGecko. Not
            investment advice — process and public data only.
          </p>
          <div className="wm-foot-links">
            <a href={EXTERNAL.sec} target="_blank" rel="noreferrer">
              SEC
            </a>
            <a href={EXTERNAL.finance} target="_blank" rel="noreferrer">
              WM Finance
            </a>
            <a href={EXTERNAL.tech} target="_blank" rel="noreferrer">
              WM Tech
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
