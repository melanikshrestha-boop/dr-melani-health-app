/**
 * Full gym — your plans + set checklist + rest timer (from Dr. Melani).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SetRow = { done?: boolean; failure?: boolean; label?: string };
type PlanItem = {
  id: string;
  text?: string;
  name?: string;
  display_name?: string;
  subtitle?: string;
  checked?: boolean;
  sets_target?: number;
  reps_label?: string;
  rest_sec?: number;
  rest_label?: string;
  notes?: string[];
  notes_label?: string;
  instructions?: string[];
  set_specs?: Record<string, { label?: string; failure?: boolean }>;
  sets?: SetRow[];
  superset_group?: string;
};
type PlanSection = { id?: string; title?: string; items?: PlanItem[] };
type Plan = {
  day_key?: string;
  title?: string;
  subtitle?: string;
  sections?: PlanSection[];
  placeholder?: string;
};

const WORKOUTS: { key: string; file: string; label: string; sub: string; icon: string }[] = [
  { key: "lower_one", file: "lower_one.json", label: "Lower body 1", sub: "Hip thrusts · RDL…", icon: "/icons/gym-lower.svg" },
  { key: "lower_two", file: "lower_two.json", label: "Lower body 2", sub: "Workout 2", icon: "/icons/gym-lower.svg" },
  { key: "lower_three", file: "lower_three.json", label: "Lower body 3", sub: "Workout 3", icon: "/icons/gym-lower.svg" },
  { key: "upper_abs_one", file: "upper_abs_one.json", label: "Upper + Abs 1", sub: "Lats · core", icon: "/icons/gym-upper.svg" },
  { key: "upper_abs_two", file: "upper_abs_two.json", label: "Upper + Abs 2", sub: "Workout 2", icon: "/icons/gym-upper.svg" },
  { key: "monday", file: "monday.json", label: "Monday — Glutes + Abs", sub: "Full day", icon: "/icons/gym-lower.svg" },
  { key: "tuesday", file: "tuesday.json", label: "Tuesday — Upper + Abs", sub: "Full day", icon: "/icons/gym-upper.svg" },
  { key: "wednesday", file: "wednesday.json", label: "Wednesday — Glutes + Abs", sub: "Full day", icon: "/icons/gym-lower.svg" },
  { key: "thursday", file: "thursday.json", label: "Thursday — Chest + Abs", sub: "Full day", icon: "/icons/gym-upper.svg" },
  { key: "friday", file: "friday.json", label: "Friday — Glutes + Abs", sub: "Full day", icon: "/icons/gym-lower.svg" },
  { key: "saturday", file: "saturday.json", label: "Saturday — Glutes + Abs", sub: "Full day", icon: "/icons/gym-lower.svg" },
  { key: "sunday", file: "sunday.json", label: "Sunday — Leg day", sub: "Full day", icon: "/icons/gym-lower.svg" },
  { key: "cardio_running", file: "cardio_running.json", label: "Running", sub: "Cardio", icon: "/icons/gym-cardio.svg" },
];

const WARMUP = [
  { id: "head_stretch", text: "1.  Head stretch" },
  { id: "upper_neck", text: "2.  Upper neck" },
  { id: "upper_body", text: "3.  Upper body" },
  { id: "lower_body", text: "4.  Lower body" },
  { id: "jump_squats", text: "5.  10 jump squats + high knees" },
  { id: "swing_legs", text: "6.  Swing legs" },
  { id: "open_close_gate", text: "7.  Open and close a gate" },
];

function todayKey(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function ensureSets(item: PlanItem): SetRow[] {
  if (item.sets && item.sets.length) return item.sets.map((s) => ({ ...s }));
  const n = item.sets_target || 0;
  if (n > 0) {
    const rows: SetRow[] = [];
    for (let i = 1; i <= n; i++) {
      const spec = item.set_specs?.[String(i)];
      rows.push({
        done: false,
        failure: !!spec?.failure,
        label: spec?.label || item.reps_label || `Set ${i}`,
      });
    }
    return rows;
  }
  // simple checklist item → one "set"
  return [{ done: !!item.checked, label: "Done" }];
}

function formatTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function GymExact() {
  const [view, setView] = useState<"home" | "session">("home");
  const [planKey, setPlanKey] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<
    { sectionTitle: string; item: PlanItem; sets: SetRow[] }[]
  >([]);
  const [warmup, setWarmup] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(`gym-warmup:${todayKey()}`) || "{}"
      );
    } catch {
      return {};
    }
  });
  const [err, setErr] = useState("");

  // Rest timer overlay
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerSec, setTimerSec] = useState(0);
  const [timerMsg, setTimerMsg] = useState("");
  const [timerHint, setTimerHint] = useState("");
  const [showMsg, setShowMsg] = useState(true);
  const tick = useRef<number | null>(null);
  const phase = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (tick.current) window.clearInterval(tick.current);
    if (phase.current) window.clearTimeout(phase.current);
    tick.current = null;
    phase.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  function startRest(restSec: number, restLabel: string, msg: string) {
    clearTimers();
    setTimerMsg(msg);
    setTimerHint(restLabel || "");
    setShowMsg(true);
    setTimerOpen(true);
    setTimerSec(restSec || 120);
    phase.current = window.setTimeout(() => {
      setShowMsg(false);
      tick.current = window.setInterval(() => {
        setTimerSec((s) => {
          if (s <= 1) {
            clearTimers();
            setTimerOpen(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }, 1600);
  }

  function openPlan(file: string, key: string) {
    setErr("");
    fetch(`/gym-plans/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error("Could not load plan");
        return r.json();
      })
      .then((data: Plan) => {
        setPlan(data);
        setPlanKey(key);
        const flat: { sectionTitle: string; item: PlanItem; sets: SetRow[] }[] =
          [];
        for (const sec of data.sections || []) {
          for (const it of sec.items || []) {
            flat.push({
              sectionTitle: sec.title || "",
              item: it,
              sets: ensureSets(it),
            });
          }
        }
        // restore progress
        try {
          const saved = localStorage.getItem(`gym-session:${key}:${todayKey()}`);
          if (saved) {
            const map = JSON.parse(saved) as Record<string, boolean[]>;
            flat.forEach((row) => {
              const flags = map[row.item.id];
              if (flags) {
                row.sets = row.sets.map((s, i) => ({
                  ...s,
                  done: !!flags[i],
                }));
              }
            });
          }
        } catch {
          /* ignore */
        }
        setItems(flat);
        setView("session");
      })
      .catch((e) => setErr(String(e.message || e)));
  }

  function persist(
    key: string,
    next: { sectionTitle: string; item: PlanItem; sets: SetRow[] }[]
  ) {
    const map: Record<string, boolean[]> = {};
    next.forEach((row) => {
      map[row.item.id] = row.sets.map((s) => !!s.done);
    });
    localStorage.setItem(
      `gym-session:${key}:${todayKey()}`,
      JSON.stringify(map)
    );
  }

  function toggleSet(itemId: string, setIndex: number) {
    if (!planKey) return;
    setItems((prev) => {
      const next = prev.map((row) => {
        if (row.item.id !== itemId) return row;
        const sets = row.sets.map((s, i) =>
          i === setIndex ? { ...s, done: !s.done } : s
        );
        return { ...row, sets };
      });
      persist(planKey, next);
      const row = next.find((r) => r.item.id === itemId);
      const justDone = row?.sets[setIndex]?.done;
      if (justDone && row) {
        const rest = row.item.rest_sec || 120;
        const label = row.item.rest_label || "Rest";
        const fail = row.sets[setIndex]?.failure;
        startRest(
          rest,
          label,
          fail ? "True failure. Rest up." : "Set done — rest."
        );
      }
      return next;
    });
  }

  function toggleSimple(itemId: string) {
    toggleSet(itemId, 0);
  }

  function toggleWarmup(id: string) {
    setWarmup((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(
        `gym-warmup:${todayKey()}`,
        JSON.stringify(next)
      );
      return next;
    });
  }

  function resetSession() {
    if (!planKey || !confirm("Reset all sets for this workout today?")) return;
    setItems((prev) => {
      const next = prev.map((row) => ({
        ...row,
        sets: row.sets.map((s) => ({ ...s, done: false })),
      }));
      persist(planKey, next);
      return next;
    });
  }

  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const row of items) {
      const k = row.sectionTitle || "Workout";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return [...map.entries()];
  }, [items]);

  // ── Session view ──
  if (view === "session" && plan) {
    return (
      <div className="gx">
        {timerOpen && (
          <div className="gx-timer-overlay">
            <div className="gx-timer-card">
              {showMsg ? (
                <p className="gx-timer-msg">{timerMsg}</p>
              ) : (
                <>
                  <p className="gx-timer-label">Rest</p>
                  <p className="gx-timer-count">{formatTime(timerSec)}</p>
                  {timerHint ? (
                    <p className="gx-timer-hint">{timerHint}</p>
                  ) : null}
                  <div className="gx-timer-actions">
                    <button
                      type="button"
                      className="gx-btn"
                      onClick={() => setTimerSec((s) => s + 30)}
                    >
                      +30s
                    </button>
                    <button
                      type="button"
                      className="gx-btn"
                      onClick={() => {
                        clearTimers();
                        setTimerOpen(false);
                      }}
                    >
                      Skip rest
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <button type="button" className="gx-back" onClick={() => setView("home")}>
          ← Workouts
        </button>
        <h2 className="gx-title">{plan.title || planKey}</h2>
        {plan.subtitle ? <p className="gx-sub">{plan.subtitle}</p> : null}
        <button type="button" className="gx-btn gx-btn-sm" onClick={resetSession}>
          Reset sets
        </button>

        {grouped.map(([secTitle, rows]) => (
          <section key={secTitle} className="gx-section">
            {secTitle ? <h3 className="gx-sec-title">{secTitle}</h3> : null}
            {rows.map(({ item, sets }) => {
              const name =
                item.display_name || item.name || item.text || "Exercise";
              const multi = sets.length > 1 || (item.sets_target || 0) > 1;
              const allDone = sets.every((s) => s.done);
              return (
                <div
                  key={item.id}
                  className={`gx-ex${allDone ? " is-done" : ""}`}
                >
                  <h4 className="gx-ex-name">{name}</h4>
                  {item.subtitle ? (
                    <p className="gx-ex-sub">{item.subtitle}</p>
                  ) : null}
                  {(item.reps_label || item.rest_label) && (
                    <p className="gx-ex-meta">
                      {sets.length} sets
                      {item.reps_label ? ` · ${item.reps_label}` : ""}
                      {item.rest_label ? ` · rest ${item.rest_label}` : ""}
                    </p>
                  )}
                  {item.notes?.length ? (
                    <details className="gx-notes">
                      <summary>{item.notes_label || "Notes"}</summary>
                      <ul>
                        {item.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  {multi ? (
                    <ul className="gx-sets">
                      {sets.map((s, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            className={`gx-set${s.done ? " is-done" : ""}${
                              s.failure ? " is-fail" : ""
                            }`}
                            onClick={() => toggleSet(item.id, i)}
                          >
                            <span className="gx-set-box">
                              {s.done ? "✓" : ""}
                            </span>
                            <span>
                              Set {i + 1}
                              {s.label ? ` · ${s.label}` : ""}
                              {s.failure ? " · failure" : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <button
                      type="button"
                      className={`gx-set${sets[0]?.done ? " is-done" : ""}`}
                      onClick={() => toggleSimple(item.id)}
                    >
                      <span className="gx-set-box">
                        {sets[0]?.done ? "✓" : ""}
                      </span>
                      <span>{item.text || "Done"}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ))}

        {!items.length && (
          <p className="gx-sub">
            {plan.placeholder || "No exercises in this plan yet."}
          </p>
        )}
      </div>
    );
  }

  // ── Home / pick workout ──
  return (
    <div className="gx">
      <a
        className="gx-live"
        href="http://127.0.0.1:8781/fitness"
        target="_blank"
        rel="noreferrer"
      >
        Open live Dr. Melani Gym →
      </a>

      <section className="gx-section">
        <h2 className="gx-h2">WARM-UP</h2>
        <ol className="gx-warmup">
          {WARMUP.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                className={`gx-warmup-item${warmup[w.id] ? " is-done" : ""}`}
                onClick={() => toggleWarmup(w.id)}
              >
                {w.text}
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="gx-section">
        <h2 className="gx-h2">WORKOUTS</h2>
        <p className="gx-sub">Tap a plan — sets + rest timer like your app</p>
        {err ? <p className="gx-err">{err}</p> : null}
        <div className="gx-nav">
          {WORKOUTS.map((w) => (
            <button
              key={w.key}
              type="button"
              className="gx-nav-row"
              onClick={() => openPlan(w.file, w.key)}
            >
              <img src={w.icon} alt="" width={18} height={18} className="gx-nav-icon" />
              <span className="gx-nav-text">
                <strong>{w.label}</strong>
                <small>{w.sub}</small>
              </span>
              <span className="gx-chev">→</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
