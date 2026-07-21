import { ArrowsClockwise, Check, Play, Plus } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { addLocalTask, loadLocalTasks, saveLocalTasks, startFocus, TASK_EVENT, type WonderTask } from "./taskStore";
import "./my-tasks.css";

export function MyTasks() {
  const [tasks, setTasks] = useState<WonderTask[]>(loadLocalTasks);
  const [title, setTitle] = useState("");
  const [sync, setSync] = useState("Reminders");

  const refresh = useCallback(async () => {
    setSync("Syncing");
    try {
      const response = await fetch("/api/local-tasks");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const local = loadLocalTasks();
      const remote: WonderTask[] = result.tasks.map((task: { id: string; title: string; list?: string }) => ({ ...task, done: false, source: "reminders", createdAt: 0 }));
      const next = [...local.filter((task) => task.source === "wonder"), ...remote];
      setTasks(next); setSync(`${remote.length} from Reminders`);
    } catch { setTasks(loadLocalTasks()); setSync("Allow Reminders access"); }
  }, []);

  useEffect(() => { void refresh(); const update = () => setTasks(loadLocalTasks()); window.addEventListener(TASK_EVENT, update); return () => window.removeEventListener(TASK_EVENT, update); }, [refresh]);

  function add() { const clean = title.trim(); if (!clean) return; addLocalTask(clean); setTasks(loadLocalTasks()); setTitle(""); }
  function toggle(id: string) { const next = tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task); setTasks(next); saveLocalTasks(next.filter((task) => task.source === "wonder")); }

  return <div className="tasks-page"><header><p>Execution</p><h1>My Tasks</h1><span>Pick one thing. Mel can turn any sentence into a 25-minute block.</span></header>
    <div className="tasks-add"><input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="What needs to happen?" /><button onClick={add}><Plus size={16} /> Add</button></div>
    <button className="tasks-sync" onClick={() => void refresh()}><ArrowsClockwise size={14} /> {sync}</button>
    <section>{tasks.length ? tasks.map((task) => <article key={`${task.source}-${task.id}`} className={task.done ? "is-done" : ""}><button className="tasks-check" onClick={() => toggle(task.id)}><Check size={13} /></button><div><strong>{task.title}</strong><span>{task.source === "reminders" ? task.list || "Reminders" : "Wonder"}</span></div><button className="tasks-focus" onClick={() => startFocus(task.title)}><Play size={13} weight="fill" /> 25 min</button></article>) : <p className="tasks-empty">Nothing open. Good.</p>}</section>
  </div>;
}

export function isMyTasksPage(pageId: string) { return pageId === "pg-my-tasks"; }
