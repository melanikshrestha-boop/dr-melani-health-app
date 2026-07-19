/**
 * Exact Dr. Melani Gym — not a clone.
 * Loads the live app UI (week plan, warm-up, set checklists, rest timer)
 * through the Vite proxy at /melani/*
 */
import { useMemo, useState } from "react";
import "./gym-exact.css";

const ROUTES = [
  { id: "hub", label: "Gym home", path: "/melani/gym" },
  { id: "lower", label: "Lower", path: "/melani/gym/lower" },
  { id: "upper", label: "Upper + Abs", path: "/melani/gym/upper" },
  { id: "cardio", label: "Cardio", path: "/melani/gym/cardio" },
] as const;

export function GymExact() {
  const [route, setRoute] = useState<(typeof ROUTES)[number]["path"]>(
    "/melani/gym"
  );
  // embed=1 → Melani hides its outer chrome so only gym content shows
  const src = useMemo(() => `${route}?embed=1`, [route]);

  return (
    <div className="melani-gym-embed">
      <div className="melani-gym-tabs" role="tablist" aria-label="Gym sections">
        {ROUTES.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            className={`melani-gym-tab${route === r.path ? " is-active" : ""}`}
            aria-selected={route === r.path}
            onClick={() => setRoute(r.path)}
          >
            {r.label}
          </button>
        ))}
        <a
          className="melani-gym-tab melani-gym-tab-ext"
          href={route.replace("/melani", "http://127.0.0.1:8781")}
          target="_blank"
          rel="noreferrer"
        >
          Full window ↗
        </a>
      </div>

      <iframe
        key={src}
        className="melani-gym-frame"
        src={src}
        title="Dr. Melani Gym"
        // allow same-site forms/API inside iframe
      />

      <p className="melani-gym-hint">
        Exact Melani Gym. If you see login, PIN is <strong>8299</strong> — once
        is enough.
      </p>
    </div>
  );
}
