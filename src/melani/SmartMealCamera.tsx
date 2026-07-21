import { Camera, Check, ImageSquare, MagicWand, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";

export type SmartMealDraft = {
  title: string;
  confidence: "low" | "medium" | "high";
  caveat: string;
  items: Array<{
    name: string;
    portion: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  }>;
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  };
};

const EMPTY: SmartMealDraft = {
  title: "New meal",
  confidence: "low",
  caveat: "Enter or verify the portions before logging.",
  items: [],
  totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
};

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.readAsDataURL(file);
  });
}

export function SmartMealCamera({ onLog }: { onLog: (meal: SmartMealDraft) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState("");
  const [draft, setDraft] = useState<SmartMealDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(file?: File) {
    if (!file) return;
    setOpen(true);
    setError("");
    setBusy(true);
    try {
      const image = await readImage(file);
      setPreview(image);
      const response = await fetch("/api/melani-ai/meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Grok meal analysis is unavailable");
      setDraft(result as SmartMealDraft);
    } catch (cause) {
      setDraft({ ...EMPTY });
      setError(cause instanceof Error ? cause.message : "Meal analysis is unavailable");
    } finally {
      setBusy(false);
    }
  }

  function setTotal(key: keyof SmartMealDraft["totals"], value: string) {
    setDraft((current) => ({
      ...current,
      totals: { ...current.totals, [key]: Math.max(0, Number(value) || 0) },
    }));
  }

  function close() {
    setOpen(false);
    setPreview("");
    setDraft(EMPTY);
    setError("");
  }

  return (
    <section className="smart-meal">
      <div className="smart-meal-head">
        <div>
          <p className="smart-meal-kicker">Smart log</p>
          <h2>Photograph what you ate</h2>
          <p>Mel estimates the plate. You verify it before anything enters your record.</p>
        </div>
        <button type="button" className="smart-meal-camera" onClick={() => cameraRef.current?.click()}>
          <Camera size={19} weight="light" /> Camera
        </button>
      </div>
      <button type="button" className="smart-meal-upload" onClick={() => uploadRef.current?.click()}>
        <ImageSquare size={17} weight="light" /> Choose a meal photo
      </button>
      <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => void choose(event.target.files?.[0])} />
      <input ref={uploadRef} hidden type="file" accept="image/*" onChange={(event) => void choose(event.target.files?.[0])} />

      {open && (
        <div className="smart-meal-modal" role="dialog" aria-modal="true" aria-label="Review meal analysis">
          <div className="smart-meal-sheet">
            <header>
              <div><p className="smart-meal-kicker">Review before log</p><h2>{busy ? "Reading your plate" : "What Mel sees"}</h2></div>
              <button type="button" onClick={close} aria-label="Close"><X size={20} /></button>
            </header>
            {preview && <img src={preview} alt="Meal selected for analysis" />}
            {busy ? <p className="smart-meal-thinking"><MagicWand size={17} /> Identifying foods and portions</p> : (
              <>
                {error && <p className="smart-meal-error">{error}. You can still enter the totals manually.</p>}
                <label className="smart-meal-title">Meal name<input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} /></label>
                {!!draft.items.length && <div className="smart-meal-items">{draft.items.map((item, index) => <p key={`${item.name}-${index}`}><strong>{item.name}</strong><span>{item.portion}</span></p>)}</div>}
                <p className={`smart-meal-confidence is-${draft.confidence}`}>{draft.confidence} confidence</p>
                <p className="smart-meal-caveat">{draft.caveat}</p>
                <div className="smart-meal-macros">
                  {(["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"] as const).map((key) => (
                    <label key={key}><span>{key === "calories" ? "Cal" : key.replace("_g", "")}</span><input type="number" min="0" inputMode="decimal" value={draft.totals[key]} onChange={(e) => setTotal(key, e.target.value)} /></label>
                  ))}
                </div>
                <button type="button" className="smart-meal-confirm" onClick={() => { onLog(draft); close(); }}>
                  <Check size={18} weight="bold" /> Log verified meal
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
