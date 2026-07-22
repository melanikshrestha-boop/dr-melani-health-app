/**
 * Localhost market quotes for World Monitor watchlist.
 * Order: in-memory cache → Finnhub (if FINNHUB_API_KEY) → Yahoo chart.
 * Yahoo often rate-limits; Finnhub free key is recommended for localhost reliability.
 */
const cache = {
  at: 0,
  quotes: /** @type {Array<Record<string, unknown>>} */ ([]),
  key: "",
};

const CACHE_MS = 90_000;

async function finnhubQuote(symbol, token) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`finnhub ${res.status}`);
  const q = await res.json();
  const price = typeof q.c === "number" && q.c > 0 ? q.c : null;
  const prev = typeof q.pc === "number" && q.pc > 0 ? q.pc : null;
  let changePct = null;
  if (price != null && prev != null && prev !== 0) changePct = ((price - prev) / prev) * 100;
  return {
    symbol,
    shortName: symbol,
    regularMarketPrice: price,
    regularMarketChangePercent: changePct,
  };
}

async function yahooChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("yahoo non-json");
  }
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("yahoo empty");
  const meta = result.meta || {};
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const validCloses = closes.filter((n) => typeof n === "number");
  const last =
    typeof meta.regularMarketPrice === "number"
      ? meta.regularMarketPrice
      : validCloses.at(-1) ?? null;
  const prev =
    typeof meta.chartPreviousClose === "number"
      ? meta.chartPreviousClose
      : validCloses.at(-2) ?? null;
  let changePct = null;
  if (typeof last === "number" && typeof prev === "number" && prev !== 0) {
    changePct = ((last - prev) / prev) * 100;
  }
  return {
    symbol: meta.symbol || symbol,
    shortName: meta.shortName || meta.longName || symbol,
    regularMarketPrice: typeof last === "number" ? last : null,
    regularMarketChangePercent: changePct,
  };
}

async function fetchQuotes(symbolsCsv) {
  const symbols = symbolsCsv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 16);
  const key = symbols.join(",");
  if (cache.key === key && Date.now() - cache.at < CACHE_MS && cache.quotes.length) {
    return cache.quotes;
  }

  const finnhub = process.env.FINNHUB_API_KEY || process.env.VITE_FINNHUB_API_KEY || "";
  const out = [];

  for (const symbol of symbols) {
    try {
      if (finnhub) {
        out.push(await finnhubQuote(symbol, finnhub));
      } else {
        out.push(await yahooChart(symbol));
      }
      // gentle pacing
      await new Promise((r) => setTimeout(r, finnhub ? 80 : 120));
    } catch {
      out.push({
        symbol,
        shortName: symbol,
        regularMarketPrice: null,
        regularMarketChangePercent: null,
      });
    }
  }

  const anyLive = out.some((q) => q.regularMarketPrice != null);
  if (anyLive) {
    cache.at = Date.now();
    cache.key = key;
    cache.quotes = out;
  } else if (cache.quotes.length && cache.key === key) {
    return cache.quotes;
  }
  return out;
}

export function marketQuoteApi() {
  return {
    name: "wonder-market-quote-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/market/quote")) return next();
        try {
          const u = new URL(req.url, "http://127.0.0.1");
          const symbols =
            u.searchParams.get("symbols") ||
            "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD";
          const quotes = await fetchQuotes(symbols);
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "public, max-age=30");
          res.end(JSON.stringify({ quotes }));
        } catch (e) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: e instanceof Error ? e.message : "quote failed",
              quotes: [],
            })
          );
        }
      });
    },
  };
}
