import { Pause, Play, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { FOCUS_EVENT } from "./taskStore";
import "./my-tasks.css";

type Focus = { title: string; endsAt: number; paused: boolean; remaining: number };

export function FocusOverlay() {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const start = (event: Event) => { const detail = (event as CustomEvent<{ title: string; minutes: number }>).detail; setFocus({ title: detail.title, endsAt: Date.now() + detail.minutes * 60_000, paused: false, remaining: detail.minutes * 60 }); }; window.addEventListener(FOCUS_EVENT, start); return () => window.removeEventListener(FOCUS_EVENT, start); }, []);
  useEffect(() => { if (!focus || focus.paused) return; const id = window.setInterval(() => tick((value) => value + 1), 1000); return () => clearInterval(id); }, [focus]);
  if (!focus) return null;
  const seconds = focus.paused ? focus.remaining : Math.max(0, Math.ceil((focus.endsAt - Date.now()) / 1000));
  if (seconds === 0) { window.setTimeout(() => setFocus(null), 0); return null; }
  const pause = () => setFocus((current) => current ? current.paused ? { ...current, paused: false, endsAt: Date.now() + current.remaining * 1000 } : { ...current, paused: true, remaining: Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000)) } : null);
  return <div className="focus-overlay" role="dialog" aria-modal="true" aria-label="Focus timer"><button className="focus-close" onClick={() => setFocus(null)} aria-label="End focus"><X size={20} /></button><div><p>Focus block</p><h1>{focus.title}</h1><strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><button className="focus-pause" onClick={pause}>{focus.paused ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}{focus.paused ? "Resume" : "Pause"}</button><span>One task. Everything else in Wonder waits.</span></div></div>;
}
