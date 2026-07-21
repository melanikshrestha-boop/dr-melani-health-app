/**
 * Hygiene — Melani app layout (sectioned guides · gold step labels · expand for details).
 * Click a step = open how-to bullets. No strikethrough / no check-off.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AM_SECTIONS,
  DAILY_SHOWER_SECTIONS,
  EVERYTHING_SHOWER_SECTIONS,
  HAIR_SECTIONS,
  PM_ROUTINES,
  type RoutineSection,
  type RoutineStep,
} from "./hygieneRoutines";
import {
  amazonShopUrlForTitle,
  isAmazonReady,
  linkForProduct,
  openAmazonLogin,
  openAmazonProductsForTitles,
  resolveAmazonAsin,
  resolveBuyLink,
  setAmazonReady,
  storeLabel,
} from "./productLinks";
import { MinimalIcon } from "../components/MinimalIcon";
import "./hygiene-exact.css";

/** Unique product titles from a set of routine sections */
function titlesFromSections(secs: RoutineSection[]): string[] {
  const titles = new Set<string>();
  for (const s of secs) {
    for (const step of s.steps) {
      if (step.title?.trim()) titles.add(step.title.trim());
    }
  }
  return [...titles].sort((a, b) => a.localeCompare(b));
}

/** AM skincare products only (for restock picker) */
const AM_SKIN_PRODUCTS = titlesFromSections(AM_SECTIONS);

/** PM skincare products (all PM night types, de-duped) */
const PM_SKIN_PRODUCTS = (() => {
  const titles = new Set<string>();
  for (const r of Object.values(PM_ROUTINES)) {
    for (const t of titlesFromSections(r.sections)) titles.add(t);
  }
  return [...titles].sort((a, b) => a.localeCompare(b));
})();

/** User's restock list (starts empty — only what you add) */
const RESTOCK_KEY = "dr-melani-hygiene-restock-v1";

type RestockItem = {
  id: string;
  title: string; // display / match key
  source: "am" | "pm" | "custom";
};

function loadRestock(): RestockItem[] {
  try {
    const raw = localStorage.getItem(RESTOCK_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as RestockItem[];
      if (Array.isArray(arr)) return arr;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveRestock(items: RestockItem[]) {
  try {
    localStorage.setItem(RESTOCK_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function newRestockId() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type DayKey = "sat" | "sun" | "mon" | "tue" | "wed" | "thu" | "fri";

const WEEK_DAYS: { key: DayKey; short: string; initial: string }[] = [
  { key: "sat", short: "Sat", initial: "S" },
  { key: "sun", short: "Sun", initial: "S" },
  { key: "mon", short: "Mon", initial: "M" },
  { key: "tue", short: "Tue", initial: "T" },
  { key: "wed", short: "Wed", initial: "W" },
  { key: "thu", short: "Thu", initial: "T" },
  { key: "fri", short: "Fri", initial: "F" },
];

const SHOWER_TYPES = [
  { id: "daily_shower", label: "Daily shower", icon: "shower-daily", color: "#6eb4ff" },
  {
    id: "everything_shower",
    label: "Everything shower",
    icon: "shower-everything",
    color: "#f9a8d4",
  },
  { id: "hair_care", label: "Hair care", icon: "hair", color: "#c4b5fd" },
] as const;

const WEEK_KEY = "dr-melani-hygiene-shower-week";
const PM_WEEK_KEY = "dr-melani-hygiene-pm-week";

// Default PM plan (Melani)
const DEFAULT_PM: Record<string, DayKey[]> = {
  pm_mark_fading: ["sat", "mon", "thu"],
  pm_retinol: ["sun", "fri"],
  pm_clay_night: ["tue"],
  pm_panoxyl: ["wed"],
};

const PM_ORDER = [
  "pm_mark_fading",
  "pm_retinol",
  "pm_clay_night",
  "pm_panoxyl",
] as const;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekdayKey(d: Date = new Date()): DayKey {
  const map: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()];
}

function weekStrip(): {
  key: DayKey;
  initial: string;
  dateNum: number;
  isToday: boolean;
}[] {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const day = today.getDay();
  const daysSinceSat = (day + 1) % 7;
  const sat = new Date(today);
  sat.setDate(today.getDate() - daysSinceSat);
  return WEEK_DAYS.map((wd, i) => {
    const d = new Date(sat);
    d.setDate(sat.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      key: wd.key,
      initial: wd.initial,
      dateNum: d.getDate(),
      isToday: iso === todayKey(),
    };
  });
}

function loadPlan(key: string, fallback: Record<string, DayKey[]>) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Record<string, DayKey[]>;
  } catch {
    /* ignore */
  }
  return { ...fallback };
}

type Props = { pageId: string; onGo: (id: string) => void };

export function isHygienePage(pageId: string): boolean {
  return (
    pageId === "pg-hygiene" ||
    pageId === "pg-shower-daily" ||
    pageId === "pg-shower-everything" ||
    pageId === "pg-hair" ||
    pageId === "pg-am-skin" ||
    pageId === "pg-pm-skin" ||
    pageId.startsWith("pg-pm-")
  );
}

export function HygieneExact({ pageId, onGo }: Props) {
  if (pageId === "pg-hygiene") return <HygieneHub onGo={onGo} />;
  if (pageId === "pg-pm-skin") return <PmHub onGo={onGo} />;
  if (pageId === "pg-am-skin")
    return (
      <SectionedRoutinePage
        key={pageId}
        title="AM skincare"
        icon="am-skin"
        sections={AM_SECTIONS}
        pageId={pageId}
        onBack={() => onGo("pg-hygiene")}
      />
    );
  // Tonight pill / old links may pass these — open PM hub with that routine
  if (pageId.startsWith("pg-pm-") && pageId !== "pg-pm-skin") {
    return <PmHub onGo={onGo} initialRoutine={pmRoutineFromPageId(pageId)} />;
  }
  if (pageId === "pg-shower-daily") {
    return (
      <SectionedRoutinePage
        key={pageId}
        title="Daily shower"
        icon="shower-daily"
        sections={DAILY_SHOWER_SECTIONS}
        pageId={pageId}
        onBack={() => onGo("pg-hygiene")}
      />
    );
  }
  if (pageId === "pg-shower-everything") {
    return (
      <SectionedRoutinePage
        key={pageId}
        title="Everything shower"
        icon="shower-everything"
        sections={EVERYTHING_SHOWER_SECTIONS}
        pageId={pageId}
        onBack={() => onGo("pg-hygiene")}
      />
    );
  }
  if (pageId === "pg-hair") {
    return (
      <SectionedRoutinePage
        key={pageId}
        title="Hair care"
        icon="hair"
        sections={HAIR_SECTIONS}
        pageId={pageId}
        onBack={() => onGo("pg-hygiene")}
      />
    );
  }
  return (
    <div className="hx">
      <button type="button" className="hx-back" onClick={() => onGo("pg-hygiene")}>
        ← Hygiene
      </button>
      <p className="hx-muted">Page not found.</p>
    </div>
  );
}

function HygieneHub({ onGo }: { onGo: (id: string) => void }) {
  const strip = useMemo(() => weekStrip(), []);
  const [showerPlan, setShowerPlan] = useState(() =>
    loadPlan(WEEK_KEY, {
      daily_shower: ["sat", "sun", "tue", "wed", "thu", "fri"],
      everything_shower: ["mon"],
      hair_care: ["mon"],
    })
  );
  // Always start closed — user opens when they want
  const [chooseOpen, setChooseOpen] = useState(false);
  const pmPlan = useMemo(() => loadPlan(PM_WEEK_KEY, DEFAULT_PM), []);
  const todayWd = weekdayKey();

  useEffect(() => {
    try {
      localStorage.setItem(WEEK_KEY, JSON.stringify(showerPlan));
    } catch {
      /* ignore */
    }
  }, [showerPlan]);

  function toggleDay(type: string, day: DayKey) {
    setShowerPlan((prev) => {
      const cur = new Set(prev[type] || []);
      if (cur.has(day)) cur.delete(day);
      else cur.add(day);
      return { ...prev, [type]: [...cur] };
    });
  }

  const TYPE_ICON: Record<string, string> = {
    daily_shower: "shower-daily",
    everything_shower: "shower-everything",
    hair_care: "hair",
  };

  // Tonight PM type for "today's routines"
  const tonightPm = PM_ORDER.find((id) =>
    (pmPlan[id] || []).includes(todayWd)
  );
  const tonightMeta = tonightPm ? PM_ROUTINES[tonightPm] : null;

  function iconsForDay(day: DayKey): string[] {
    const out: string[] = [];
    for (const [type, days] of Object.entries(showerPlan)) {
      if ((days || []).includes(day) && TYPE_ICON[type]) out.push(TYPE_ICON[type]);
    }
    return out;
  }

  return (
    <div className="hx">
      <section className="hx-section">
        <h2 className="hx-h2">Today&apos;s routines</h2>
        {tonightMeta ? (
          <button
            type="button"
            className="hx-today-pill"
            onClick={() => onGo("pg-pm-skin")}
          >
            <MinimalIcon name={tonightMeta.icon} size={16} className="hx-today-icon" />
            <span>
              {tonightMeta.short} night →
            </span>
          </button>
        ) : (
          <p className="hx-muted">No PM type set for today</p>
        )}
      </section>

      <section className="hx-section">
        <h2 className="hx-h2">Shower routine</h2>
        <h3 className="hx-h3">This week</h3>
        <div className="hx-week-strip">
          {strip.map((c) => {
            const icons = iconsForDay(c.key);
            return (
              <div
                key={c.key}
                className={`hx-week-cell${c.isToday ? " is-today" : ""}`}
              >
                <span className="hx-week-dow">{c.initial}</span>
                <span className="hx-week-num">{c.dateNum}</span>
                <span className="hx-week-icons">
                  {icons.length
                    ? icons.map((name) => (
                        <span
                          key={name}
                          className={`hx-week-ic-wrap is-${name}`}
                          title={name}
                        >
                          <MinimalIcon
                            name={name}
                            size={13}
                            className="hx-week-ic"
                          />
                        </span>
                      ))
                    : null}
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="hx-choose-toggle"
          onClick={() => setChooseOpen((v) => !v)}
        >
          {chooseOpen ? "▾" : "▸"} Choose routines for this week
        </button>
        {chooseOpen && (
          <div className="hx-choose">
            {SHOWER_TYPES.map((t) => (
              <div key={t.id} className="hx-choose-row">
                <p className="hx-choose-label">{t.label}</p>
                <div className="hx-day-picks">
                  {WEEK_DAYS.map((d) => {
                    const on = (showerPlan[t.id] || []).includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        className={`hx-day-pick${on ? " is-on" : ""}`}
                        onClick={() => toggleDay(t.id, d.key)}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="hx-nav">
          <button
            type="button"
            className="hx-nav-row is-daily"
            onClick={() => onGo("pg-shower-daily")}
          >
            <MinimalIcon name="shower-daily" size={16} className="hx-nav-ic" />
            <span className="hx-nav-label">Daily shower</span>
            <span className="hx-nav-chev">→</span>
          </button>
          <button
            type="button"
            className="hx-nav-row is-everything"
            onClick={() => onGo("pg-shower-everything")}
          >
            <MinimalIcon name="shower-everything" size={16} className="hx-nav-ic" />
            <span className="hx-nav-label">Everything shower</span>
            <span className="hx-nav-chev">→</span>
          </button>
          <button
            type="button"
            className="hx-nav-row is-hair"
            onClick={() => onGo("pg-hair")}
          >
            <MinimalIcon name="hair" size={16} className="hx-nav-ic" />
            <span className="hx-nav-label">Hair care</span>
            <span className="hx-nav-chev">→</span>
          </button>
        </div>
      </section>

      <section className="hx-section">
        <h2 className="hx-h2">Skincare routine</h2>
        <div className="hx-nav">
          <button
            type="button"
            className="hx-nav-row is-am"
            onClick={() => onGo("pg-am-skin")}
          >
            <MinimalIcon name="am-skin" size={16} className="hx-nav-ic" />
            <span className="hx-nav-label">AM skincare</span>
            <span className="hx-nav-chev">→</span>
          </button>
          <button
            type="button"
            className="hx-nav-row is-pm"
            onClick={() => onGo("pg-pm-skin")}
          >
            <MinimalIcon name="pm-skin" size={16} className="hx-nav-ic" />
            <span className="hx-nav-label">PM skincare</span>
            <span className="hx-nav-chev">→</span>
          </button>
        </div>
      </section>

      <RestockSection />
    </div>
  );
}

/**
 * Products & restock — empty until you add.
 * Amazon path (as far as Amazon allows without Partner APIs):
 * 1) Login to Amazon from Wonder (same browser)
 * 2) Add restock items to cart via Amazon cart-add links
 * 3) Open cart and checkout on Amazon
 */
function RestockSection() {
  const [items, setItems] = useState<RestockItem[]>(() => loadRestock());
  const [menuOpen, setMenuOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [cartFlash, setCartFlash] = useState("");
  const [amazonReady, setAmazonReadyState] = useState(() => isAmazonReady());

  useEffect(() => {
    saveRestock(items);
  }, [items]);

  function addTitle(title: string, source: RestockItem["source"]) {
    const t = title.trim();
    if (!t) return;
    setItems((prev) => {
      if (prev.some((x) => x.title.toLowerCase() === t.toLowerCase())) {
        return prev;
      }
      return [...prev, { id: newRestockId(), title: t, source }];
    });
  }

  function addCustom() {
    const t = customName.trim();
    if (!t) return;
    addTitle(t, "custom");
    setCustomName("");
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  const already = (title: string) =>
    items.some((x) => x.title.toLowerCase() === title.toLowerCase());

  const withAsin = items.filter((it) => resolveAmazonAsin(it.title));
  const needSearch = items.filter((it) => !resolveAmazonAsin(it.title));

  function connectAmazon() {
    openAmazonLogin();
    setAmazonReady(true);
    setAmazonReadyState(true);
    setCartFlash(
      "Amazon sign-in opened. Sign in, then come back and open products to add to cart."
    );
    window.setTimeout(() => setCartFlash(""), 4500);
  }

  /**
   * Working flow (2025 Amazon): open real product pages (or search).
   * On each Amazon tab: tap Add to Cart. Then open cart for checkout.
   * (Silent multi-cart URL is dead on amazon.com without Partner setup.)
   */
  function addAllToAmazonCart() {
    if (!items.length) {
      setCartFlash("Add products with + first.");
      window.setTimeout(() => setCartFlash(""), 2400);
      return;
    }
    // Mark ready if they skip explicit login (already signed in on Amazon)
    if (!amazonReady) {
      setAmazonReady(true);
      setAmazonReadyState(true);
    }
    const titles = items.map((it) => it.title);
    const { opened } = openAmazonProductsForTitles(titles, {
      openCartAfter: true,
    });
    const extra =
      needSearch.length > 0
        ? ` ${needSearch.length} as search (pick the listing).`
        : "";
    setCartFlash(
      `Opened ${opened} Amazon tab${opened === 1 ? "" : "s"}. On each product page tap Add to Cart. Cart tab opens for checkout.${extra}`
    );
    window.setTimeout(() => setCartFlash(""), 6500);
  }

  return (
    <section className="hx-section hx-products">
      <div className="hx-products-head">
        <div className="hx-products-title-row">
          <h2 className="hx-h2">Products &amp; restock</h2>
          <button
            type="button"
            className={`hx-restock-plus${menuOpen ? " is-open" : ""}`}
            aria-label="Add product to restock"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            +
          </button>
        </div>
        <span className="hx-muted">
          {items.length === 0
            ? "none yet"
            : `${items.length} item${items.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Always visible Amazon login step */}
      <div className="hx-amazon-connect">
        <button
          type="button"
          className={`hx-amazon-login${amazonReady ? " is-ready" : ""}`}
          onClick={connectAmazon}
        >
          {amazonReady ? "Amazon ready" : "Login to Amazon"}
        </button>
        {amazonReady ? (
          <button
            type="button"
            className="hx-amazon-unlink"
            onClick={() => {
              setAmazonReady(false);
              setAmazonReadyState(false);
              setCartFlash("Login again before cart add.");
              window.setTimeout(() => setCartFlash(""), 2400);
            }}
          >
            reset
          </button>
        ) : null}
      </div>
      <p className="hx-amazon-bar-note">
        Login in this browser once, then add to cart. Same Chrome profile.
      </p>

      {menuOpen ? (
        <div className="hx-restock-menu">
          <p className="hx-restock-menu-hint">
            Pick from your routines, or type a new product name.
          </p>

          <p className="hx-restock-group-label">AM skincare</p>
          <ul className="hx-restock-pick-list">
            {AM_SKIN_PRODUCTS.map((title) => {
              const on = already(title);
              return (
                <li key={`am-${title}`}>
                  <button
                    type="button"
                    className={`hx-restock-pick${on ? " is-added" : ""}`}
                    disabled={on}
                    onClick={() => addTitle(title, "am")}
                  >
                    <span>{title}</span>
                    <span className="hx-restock-pick-mark">
                      {on ? "Added" : "Add"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="hx-restock-group-label">PM skincare</p>
          <ul className="hx-restock-pick-list">
            {PM_SKIN_PRODUCTS.map((title) => {
              const on = already(title);
              return (
                <li key={`pm-${title}`}>
                  <button
                    type="button"
                    className={`hx-restock-pick${on ? " is-added" : ""}`}
                    disabled={on}
                    onClick={() => addTitle(title, "pm")}
                  >
                    <span>{title}</span>
                    <span className="hx-restock-pick-mark">
                      {on ? "Added" : "Add"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="hx-restock-group-label">New product</p>
          <div className="hx-restock-custom">
            <input
              className="hx-restock-input"
              type="text"
              value={customName}
              placeholder="Type product name…"
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <button
              type="button"
              className="hx-restock-add-btn"
              onClick={addCustom}
              disabled={!customName.trim()}
            >
              Add
            </button>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="hx-restock-empty">
          Tap + to add products you need to restock.
        </p>
      ) : (
        <>
          <div className="hx-amazon-bar">
            <button
              type="button"
              className="hx-amazon-cart-all"
              onClick={addAllToAmazonCart}
              disabled={!items.length}
            >
              {amazonReady
                ? `Open on Amazon${items.length ? ` (${items.length})` : ""}`
                : "Open on Amazon"}
            </button>
            {cartFlash ? (
              <p className="hx-amazon-flash">{cartFlash}</p>
            ) : null}
            <p className="hx-amazon-bar-note">
              {withAsin.length
                ? `${withAsin.length} open as product page (tap Add to Cart on Amazon).`
                : "Opens Amazon search for each name. Pick the listing, then Add to Cart."}
            </p>
          </div>

          <ul className="hx-product-list">
            {items.map((item) => {
              const link = resolveBuyLink(item.title);
              const asin = resolveAmazonAsin(item.title);
              const shopUrl = amazonShopUrlForTitle(item.title);
              return (
                <li key={item.id} className="hx-product-row">
                  <span className="hx-product-name">{link.name}</span>
                  <span className="hx-product-buys">
                    {/* Real href only (product page or search). Never dead cart endpoints. */}
                    <a
                      className="hx-buy-link hx-buy-cart"
                      href={shopUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {asin ? "Amazon" : "Search"}
                    </a>
                    {link.store !== "amazon" && link.url ? (
                      <a
                        className="hx-buy-link hx-buy-alt"
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {storeLabel(link.store)}
                      </a>
                    ) : null}
                    {link.altUrl &&
                    link.altStore &&
                    link.altStore !== "amazon" ? (
                      <a
                        className="hx-buy-link hx-buy-alt"
                        href={link.altUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {storeLabel(link.altStore)}
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="hx-restock-remove"
                      aria-label={`Remove ${link.name}`}
                      onClick={() => removeItem(item.id)}
                    >
                      ×
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function pmRoutineFromPageId(pageId: string): string | null {
  const map: Record<string, string> = {
    "pg-pm-regular": "pm_mark_fading",
    "pg-pm-retinol": "pm_retinol",
    "pg-pm-clay": "pm_clay_night",
    "pg-pm-panoxyl": "pm_panoxyl",
    "pg-pm-mark-fading": "pm_mark_fading",
    "pg-pm-clay-night": "pm_clay_night",
  };
  return map[pageId] || null;
}

function PmHub({
  onGo,
  initialRoutine = null,
}: {
  onGo: (id: string) => void;
  initialRoutine?: string | null;
}) {
  const strip = useMemo(() => weekStrip(), []);
  const [pmPlan, setPmPlan] = useState(() =>
    loadPlan(PM_WEEK_KEY, DEFAULT_PM)
  );
  const [chooseOpen, setChooseOpen] = useState(false);
  // Open a PM routine inside this page (no phantom page IDs — those never opened)
  const [openRoutine, setOpenRoutine] = useState<string | null>(
    initialRoutine
  );

  useEffect(() => {
    try {
      localStorage.setItem(PM_WEEK_KEY, JSON.stringify(pmPlan));
    } catch {
      /* ignore */
    }
  }, [pmPlan]);

  function toggleDay(type: string, day: DayKey) {
    // one PM type per day
    setPmPlan((prev) => {
      const alreadyOn = (prev[type] || []).includes(day);
      const next: Record<string, DayKey[]> = {};
      for (const id of PM_ORDER) {
        next[id] = (prev[id] || []).filter((d) => d !== day);
      }
      // Toggle on only if it wasn't already this type
      if (!alreadyOn) {
        next[type] = [...(next[type] || []), day];
      }
      return next;
    });
  }

  /** Day already assigned to another PM type → gray that day on other rows */
  function isPmDayBlocked(routineId: string, day: DayKey): boolean {
    if ((pmPlan[routineId] || []).includes(day)) return false; // own pick — can toggle off
    for (const id of PM_ORDER) {
      if (id !== routineId && (pmPlan[id] || []).includes(day)) return true;
    }
    return false;
  }

  function iconForDay(day: DayKey): string {
    for (const id of PM_ORDER) {
      if ((pmPlan[id] || []).includes(day)) return PM_ROUTINES[id].icon;
    }
    return "";
  }

  // Detail view for one PM night type (Regular / Retinol / Clay / PanOxyl)
  if (openRoutine && PM_ROUTINES[openRoutine]) {
    const r = PM_ROUTINES[openRoutine];
    return (
      <SectionedRoutinePage
        key={openRoutine}
        title={r.label}
        icon={r.icon}
        sections={r.sections}
        pageId={`pg-pm-inner-${openRoutine}`}
        onBack={() => setOpenRoutine(null)}
        backLabel="← PM skincare"
      />
    );
  }

  return (
    <div className="hx">
      <button type="button" className="hx-back" onClick={() => onGo("pg-hygiene")}>
        ← Hygiene
      </button>
      <h2 className="hx-page-title">
        <MinimalIcon name="pm-skin" size={18} className="hx-title-icon" />
        <span>PM skincare</span>
      </h2>

      <h3 className="hx-h3">This week</h3>
      <div className="hx-week-strip">
        {strip.map((c) => {
          const ic = iconForDay(c.key);
          return (
          <div
            key={c.key}
            className={`hx-week-cell${c.isToday ? " is-today" : ""}`}
          >
            <span className="hx-week-dow">{c.initial}</span>
            <span className="hx-week-num">{c.dateNum}</span>
            <span className="hx-week-icons">
              {ic ? (
                <MinimalIcon name={ic} size={12} className="hx-week-ic" />
              ) : (
                "\u00a0"
              )}
            </span>
          </div>
          );
        })}
      </div>

      <button
        type="button"
        className="hx-choose-toggle"
        onClick={() => setChooseOpen((v) => !v)}
      >
        {chooseOpen ? "▾" : "▸"} Choose PM skincare for this week
      </button>
      {chooseOpen && (
        <div className="hx-choose">
          {PM_ORDER.map((id) => {
            const r = PM_ROUTINES[id];
            return (
              <div key={id} className="hx-choose-row">
                <p className="hx-choose-label hx-choose-label-ic">
                  <MinimalIcon name={r.icon} size={12} /> {r.short}
                </p>
                <div className="hx-day-picks">
                  {WEEK_DAYS.map((d) => {
                    const on = (pmPlan[id] || []).includes(d.key);
                    const blocked = !on && isPmDayBlocked(id, d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        disabled={blocked}
                        title={
                          blocked
                            ? "That day already has another PM routine"
                            : undefined
                        }
                        className={`hx-day-pick${on ? " is-on" : ""}${
                          blocked ? " is-blocked" : ""
                        }`}
                        onClick={() => toggleDay(id, d.key)}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="hx-nav hx-nav-pm">
        {PM_ORDER.map((id) => {
          const r = PM_ROUTINES[id];
          return (
            <button
              key={id}
              type="button"
              className="hx-nav-row hx-nav-row-pm"
              onClick={() => setOpenRoutine(id)}
            >
              <MinimalIcon name={r.icon} size={16} className="hx-nav-ic" />
              <span className="hx-nav-text-stack">
                <span className="hx-nav-label">
                  {r.short}
                </span>
                <span className="hx-nav-sub">{r.subtitle}</span>
              </span>
              <span className="hx-nav-chev">
                →
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Sectioned guide page — matches Melani Daily Shower layout:
 * PRE-WASH / IN THE SHOWER / POST-WASH headers + numbered products with gold labels.
 * Click expands how-to details (bullets). Never crosses out.
 */
function SectionedRoutinePage({
  title,
  icon,
  sections,
  pageId,
  onBack,
  backLabel = "← Back",
}: {
  title: string;
  icon: string;
  sections: RoutineSection[];
  pageId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  // Which step is open — always start with ALL closed
  const [openNum, setOpenNum] = useState<number | null>(null);

  // Reset every time you land on this page
  useEffect(() => {
    setOpenNum(null);
  }, [pageId]);

  function toggleOpen(n: number) {
    setOpenNum((prev) => (prev === n ? null : n));
  }

  const theme =
    pageId === "pg-hair"
      ? "hx-theme-hair"
      : pageId.includes("shower")
        ? "hx-theme-body"
        : "hx-theme-skin";

  return (
    <div className={`hx ${theme}`}>
      <button type="button" className="hx-back" onClick={onBack}>
        {backLabel}
      </button>
      <h2 className="hx-page-title">
        <MinimalIcon name={icon} size={18} className="hx-title-icon" />
        <span>{title}</span>
      </h2>

      {sections.map((sec) => (
        <section key={sec.id} className="hx-guide-section">
          <h3 className="hx-section-head">{sec.title}</h3>
          <ol className="hx-steps">
            {sec.steps.map((s) => (
              <StepRow
                key={s.num}
                step={s}
                open={openNum === s.num}
                onToggle={() => toggleOpen(s.num)}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Open shop URL in a new tab (clean, no parent navigation quirks) */
function openShop(url: string, e: React.MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Melani-style highlight on wait / crucial timing phrases
 * (the mauve callouts in your PM screenshots).
 */
function highlightTimingPhrases(text: string): React.ReactNode {
  // Phrases Melani highlights: waits, crucial dry-skin rule, sit times
  const re =
    /(Crucial:[^.]*\.|Wait[^.]*(?:minutes?|seconds?)[^.]*(?:\.|$)|Let it sit[^.]*(?:\.|$)|exactly \d+ minutes?|bone-dry to the touch|Do not (?:apply|leave)[^.]*\.)/gi;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    parts.push(
      <mark key={k++} className="hx-tip-mark">
        {m[0].trim()}
      </mark>
    );
    last = m.index + m[0].length;
  }
  if (last === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** One product line — pink name · gold role; expand = how-to + buy links */
function StepRow({
  step,
  open,
  onToggle,
}: {
  step: RoutineStep;
  open: boolean;
  onToggle: () => void;
}) {
  const product = linkForProduct(step.title);
  const hasBullets = Boolean(step.bullets && step.bullets.length > 0);
  const hasBuy = Boolean(product && product.url);
  const hasDetails = hasBullets || Boolean(step.note) || hasBuy;

  return (
    <li className={`hx-step-wrap${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="hx-step"
        onClick={hasDetails ? onToggle : undefined}
        style={{ cursor: hasDetails ? "pointer" : "default" }}
        aria-expanded={hasDetails ? open : undefined}
      >
        <span className="hx-step-num">{step.num}.</span>
        <span className="hx-step-body">
          <span className="hx-step-line">
            <span className="hx-step-title">{step.title}</span>
            {step.subtitle ? (
              <span className="hx-step-sub"> · {step.subtitle}</span>
            ) : null}
            {step.note ? (
              <span className="hx-step-note"> · {step.note}</span>
            ) : null}
          </span>
        </span>
      </button>
      {open && hasDetails ? (
        <div className="hx-step-panel">
          {hasBullets ? (
            <ul className="hx-step-details">
              {step.bullets!.map((b, i) => (
                <li key={i}>{highlightTimingPhrases(b)}</li>
              ))}
            </ul>
          ) : null}
          {hasBuy && product ? (
            <div className="hx-buy-row">
              <button
                type="button"
                className="hx-buy-link"
                onClick={(e) => openShop(product.url, e)}
              >
                Buy on {storeLabel(product.store)} →
              </button>
              {product.altUrl && product.altStore ? (
                <button
                  type="button"
                  className="hx-buy-link hx-buy-alt"
                  onClick={(e) => openShop(product.altUrl!, e)}
                >
                  or {storeLabel(product.altStore)} →
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
