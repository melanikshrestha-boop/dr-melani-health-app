import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  Check,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  CoatHanger,
  Crosshair,
  Drop,
  Heart,
  MagnifyingGlass,
  MapPin,
  Sparkle,
  Sun,
  ThumbsDown,
  Umbrella,
  Wind,
} from "@phosphor-icons/react";
import {
  buildStyleBrief,
  fetchWeatherSnapshot,
  isFreshWeather,
  loadWeatherLocation,
  loadWeatherSnapshot,
  rainRisk,
  requestDeviceLocation,
  saveWeatherLocation,
  searchWeatherLocation,
  weatherCondition,
  weatherTone,
  weatherWardrobeContext,
  type WeatherLocation,
  type WeatherSnapshot,
} from "./weatherCore";
import "./weather-agent.css";

type WardrobeItem = {
  id: string;
  name: string;
  image?: string;
  thumbnail?: string;
};

type WardrobeLook = {
  score?: number;
  confidence?: number;
  items: WardrobeItem[];
  reasons?: string[];
};

type WardrobePayload = {
  looks?: WardrobeLook[];
  warnings?: string[];
  error?: string;
};

type WeatherMode = "everyday" | "build" | "out" | "stream";

const MODE_KEY = "wonder-weather-mode-v1";

function ConditionIcon({ code, size = 28 }: { code: number; size?: number }) {
  const tone = weatherTone(code);
  if (tone === "clear") return code === 0 ? <Sun size={size} weight="light" /> : <CloudSun size={size} weight="light" />;
  if (tone === "cloud") return <Cloud size={size} weight="light" />;
  if (tone === "fog") return <CloudFog size={size} weight="light" />;
  if (tone === "rain") return <CloudRain size={size} weight="light" />;
  if (tone === "snow") return <CloudSnow size={size} weight="light" />;
  return <CloudLightning size={size} weight="light" />;
}

function hourLabel(value: string): string {
  const match = value.match(/T(\d{2}):(\d{2})/);
  if (!match) return value;
  const hour = Number(match[1]);
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? "PM" : "AM"}`;
}

function dayLabel(value: string, index: number): string {
  if (index === 0) return "Today";
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${value}T12:00:00`));
}

function readMode(): WeatherMode {
  if (typeof window === "undefined") return "everyday";
  const value = window.localStorage.getItem(MODE_KEY);
  return value === "build" || value === "out" || value === "stream" ? value : "everyday";
}

async function getWardrobeLook(snapshot: WeatherSnapshot, mode: WeatherMode, signal: AbortSignal): Promise<WardrobePayload> {
  const weather = weatherWardrobeContext(snapshot);
  const response = await fetch("/api/wardrobe/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, temperatureF: weather.temperatureF, rain: weather.rain, count: 1 }),
    signal,
  });
  const payload = await response.json().catch(() => ({})) as WardrobePayload;
  if (!response.ok) throw new Error(payload.error || "Wardrobe could not build today's look.");
  return payload;
}

export function WeatherAgent({ onGo }: { onGo: (pageId: string) => void }) {
  const initialSnapshot = useMemo(() => loadWeatherSnapshot(), []);
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(initialSnapshot);
  const [mode, setMode] = useState<WeatherMode>(readMode);
  const [status, setStatus] = useState(initialSnapshot ? "" : "Finding your weather...");
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [look, setLook] = useState<WardrobeLook | null>(null);
  const [lookWarning, setLookWarning] = useState("");
  const [wearStatus, setWearStatus] = useState("");
  const started = useRef(false);

  const loadLocationWeather = useCallback(async (location: WeatherLocation) => {
    setError("");
    setStatus("Reading the conditions...");
    try {
      saveWeatherLocation(location);
      const next = await fetchWeatherSnapshot(location);
      setSnapshot(next);
      setStatus("");
      setSearchOpen(false);
      return next;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Weather could not be loaded.";
      setError(message);
      setStatus("");
      return null;
    }
  }, []);

  const locate = useCallback(async () => {
    setError("");
    setStatus("Locating you...");
    try {
      const location = await requestDeviceLocation();
      await loadLocationWeather(location);
    } catch (reason) {
      setStatus("");
      setError(reason instanceof Error ? reason.message : "Location could not be read.");
      setSearchOpen(true);
    }
  }, [loadLocationWeather]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const saved = loadWeatherLocation() || initialSnapshot?.location;
    if (saved) {
      if (saved.source === "device") {
        if (isFreshWeather(initialSnapshot)) setStatus("");
        void locate();
      } else if (isFreshWeather(initialSnapshot)) {
        setStatus("");
      } else {
        void loadLocationWeather(saved);
      }
    } else {
      void locate();
    }
  }, [initialSnapshot, loadLocationWeather, locate]);

  useEffect(() => {
    window.localStorage.setItem(MODE_KEY, mode);
    if (!snapshot) return;
    const controller = new AbortController();
    setLookWarning("");
    void getWardrobeLook(snapshot, mode, controller.signal)
      .then((payload) => {
        setLook(payload.looks?.[0] || null);
        setLookWarning(payload.warnings?.join(" ") || (payload.looks?.length ? "" : "Add clean tops and bottoms to Wardrobe for exact-piece dressing."));
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setLook(null);
        setLookWarning("Wardrobe is unavailable, so the weather formula is shown instead.");
      });
    return () => controller.abort();
  }, [mode, snapshot]);

  const styleBrief = snapshot ? buildStyleBrief(snapshot) : null;
  const todayRain = snapshot ? rainRisk(snapshot) : 0;

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("Finding that location...");
    try {
      const location = await searchWeatherLocation(query);
      await loadLocationWeather(location);
      setQuery("");
    } catch (reason) {
      setStatus("");
      setError(reason instanceof Error ? reason.message : "Location search failed.");
    }
  }

  async function refresh() {
    const location = loadWeatherLocation() || snapshot?.location;
    if (location) await loadLocationWeather(location);
    else await locate();
  }

  async function wearLook() {
    if (!look) return;
    setWearStatus("Logging...");
    const response = await fetch("/api/wardrobe/outfit/wear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        index: 1,
        actor: "weather",
        reason: snapshot ? `${weatherCondition(snapshot.current.weatherCode)}, ${Math.round(snapshot.current.feelsLikeF)} F` : "Weather look",
        idempotencyKey: `weather-look:${new Date().toISOString().slice(0, 10)}`,
      }),
    });
    setWearStatus(response.ok ? "Outfit logged" : "Could not log outfit");
  }

  async function sendFeedback(value: "like" | "dislike") {
    if (!look) return;
    const response = await fetch("/api/wardrobe/outfit/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: 1, value, actor: "weather" }),
    });
    setWearStatus(response.ok ? (value === "like" ? "Mel learned this works" : "Mel will rank this lower") : "Feedback was not saved");
  }

  return (
    <main className="weather-agent">
      <header className="weather-head">
        <div>
          <span className="weather-eyebrow">Agent</span>
          <h1>Weather</h1>
        </div>
        <div className="weather-head-actions">
          <button type="button" onClick={() => setSearchOpen((value) => !value)} aria-label="Search location" title="Search location">
            <MagnifyingGlass size={18} />
          </button>
          <button type="button" onClick={() => void locate()} aria-label="Use my location" title="Use my location">
            <Crosshair size={18} />
          </button>
          <button type="button" onClick={() => void refresh()} aria-label="Refresh weather" title="Refresh weather">
            <ArrowClockwise size={18} />
          </button>
        </div>
      </header>

      {searchOpen ? (
        <form className="weather-location-search" onSubmit={(event) => void search(event)}>
          <MapPin size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="City or postal code"
            autoFocus
          />
          <button type="submit">Set</button>
        </form>
      ) : null}

      {error ? <p className="weather-error" role="alert">{error}</p> : null}
      {status ? <p className="weather-loading" role="status">{status}</p> : null}

      {snapshot && styleBrief ? (
        <>
          <section className={`weather-now is-${weatherTone(snapshot.current.weatherCode)}`}>
            <div className="weather-now-reading">
              <ConditionIcon code={snapshot.current.weatherCode} size={46} />
              <strong>{Math.round(snapshot.current.temperatureF)}<span>&deg;</span></strong>
              <div>
                <h2>{weatherCondition(snapshot.current.weatherCode)}</h2>
                <p>Feels like {Math.round(snapshot.current.feelsLikeF)}&deg;</p>
              </div>
            </div>
            <div className="weather-place">
              <MapPin size={14} />
              <span>{snapshot.location.label}</span>
            </div>
            <div className="weather-now-metrics">
              <span><Drop size={14} /> {Math.round(snapshot.current.humidity)}%</span>
              <span><Wind size={14} /> {Math.round(snapshot.current.windMph)} mph</span>
              <span><Umbrella size={14} /> {Math.round(todayRain)}%</span>
              <span><Sun size={14} /> UV {Math.round(Math.max(snapshot.current.uvIndex, snapshot.daily[0]?.uvIndex || 0))}</span>
            </div>
          </section>

          <nav className="weather-mode" aria-label="Dressing context">
            {([
              ["everyday", "Daily"],
              ["build", "Work"],
              ["out", "Going out"],
              ["stream", "On camera"],
            ] as Array<[WeatherMode, string]>).map(([value, label]) => (
              <button key={value} type="button" className={mode === value ? "is-active" : ""} onClick={() => setMode(value)}>
                {label}
              </button>
            ))}
          </nav>

          <section className="weather-decision">
            <header>
              <div>
                <span>Wear today</span>
                <h2>{styleBrief.headline}</h2>
              </div>
              <CoatHanger size={25} weight="light" />
            </header>

            {look?.items?.length ? (
              <div className="weather-owned-look">
                <div className="weather-look-items">
                  {look.items.map((item) => (
                    <article key={item.id}>
                      {item.thumbnail || item.image ? <img src={item.thumbnail || item.image} alt="" /> : <span className="weather-look-placeholder"><CoatHanger size={22} /></span>}
                      <strong>{item.name}</strong>
                    </article>
                  ))}
                </div>
                <div className="weather-look-actions">
                  <button type="button" className="weather-primary-action" onClick={() => void wearLook()}>
                    <Check size={15} /> Wear this
                  </button>
                  <button type="button" onClick={() => void sendFeedback("like")} aria-label="I like this look" title="I like this look"><Heart size={16} /></button>
                  <button type="button" onClick={() => void sendFeedback("dislike")} aria-label="Show less like this" title="Show less like this"><ThumbsDown size={16} /></button>
                  {wearStatus ? <span>{wearStatus}</span> : null}
                </div>
              </div>
            ) : (
              <ol className="weather-formula">
                {styleBrief.formula.map((item) => <li key={item}>{item}</li>)}
              </ol>
            )}

            {lookWarning ? <p className="weather-look-warning">{lookWarning}</p> : null}
            {!look ? <button type="button" className="weather-text-action" onClick={() => onGo("pg-fashion-os")}>Open Wardrobe</button> : null}

            <details className="weather-why">
              <summary>Why this works</summary>
              <ul>
                {(look?.reasons?.length ? look.reasons : styleBrief.reasons).map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </details>
          </section>

          <section className="weather-finish" aria-label="Finish the look">
            <article>
              <Sparkle size={20} />
              <div>
                <span>Scent</span>
                <h3>{styleBrief.scentTitle}</h3>
                <p>{styleBrief.scentNote}</p>
              </div>
            </article>
            <article>
              <Sun size={20} />
              <div>
                <span>Hair + skin</span>
                <h3>Weather-proof the finish</h3>
                <p>{styleBrief.grooming}</p>
              </div>
            </article>
            <article>
              <Umbrella size={20} />
              <div>
                <span>Take</span>
                <h3>{styleBrief.carry.join(" + ")}</h3>
                <p>Only the extras the conditions justify.</p>
              </div>
            </article>
          </section>

          <section className="weather-hours">
            <div className="weather-section-head">
              <h2>Next hours</h2>
              <span>Swipe</span>
            </div>
            <div className="weather-hour-strip">
              {snapshot.hourly.slice(0, 12).map((hour, index) => (
                <article key={hour.time}>
                  <span>{index === 0 ? "Now" : hourLabel(hour.time)}</span>
                  <ConditionIcon code={hour.weatherCode} size={21} />
                  <strong>{Math.round(hour.temperatureF)}&deg;</strong>
                  <small>{Math.round(hour.precipitationChance)}%</small>
                </article>
              ))}
            </div>
          </section>

          <section className="weather-week">
            <h2>Seven days</h2>
            <div className="weather-week-list">
              {snapshot.daily.map((day, index) => (
                <article key={day.date}>
                  <strong>{dayLabel(day.date, index)}</strong>
                  <span className="weather-week-condition"><ConditionIcon code={day.weatherCode} size={19} /> {weatherCondition(day.weatherCode)}</span>
                  <span className="weather-week-rain"><Drop size={13} /> {Math.round(day.precipitationChance)}%</span>
                  <span className="weather-week-temp"><b>{Math.round(day.highF)}&deg;</b> {Math.round(day.lowF)}&deg;</span>
                </article>
              ))}
            </div>
          </section>

          <footer className="weather-source">
            Forecast by Open-Meteo. Location stays in this browser. Updated {new Date(snapshot.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
          </footer>
        </>
      ) : null}
    </main>
  );
}

export function isWeatherAgentPage(pageId: string): boolean {
  return pageId === "pg-agent-weather";
}
