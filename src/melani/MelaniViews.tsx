/**
 * Rich Melani pages inside workspace shell.
 * Fitness = FitnessExact. Data = profile + cycle + smart labs.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Page } from "../types";
import {
  footerForLab,
  formatLabDate,
  labDisplayName,
  labOneLiner,
  statusLabel,
  type LabItem,
} from "./labData";
import {
  buildSections,
  importLabPayload,
  loadLabs,
  type BuiltSection,
} from "./labEngine";
import { FitnessExact, isFitnessPage } from "./FitnessExact";
import { HygieneExact, isHygienePage } from "./HygieneExact";
import { BooksLibrary, isBooksPage } from "./BooksLibrary";
import { isGmailAgentPage } from "./gmailRoute";
import { CycleTracker } from "./CycleTracker";
import { ExpandableText } from "./ExpandableText";
import { isWardrobePage } from "./wardrobe/route";
import { isShoppingAgentPage, ShoppingAgent } from "./ShoppingAgent";
import { isMyTasksPage, MyTasks } from "./MyTasks";
import { isWeatherAgentPage, WeatherAgent } from "./weather/WeatherAgent";
import "./melani.css";

const WardrobeFrame = lazy(async () => {
  const module = await import("./wardrobe/WardrobeFrame");
  return { default: module.WardrobeFrame };
});

const GmailConnector = lazy(async () => {
  const module = await import("./GmailConnector");
  return { default: module.GmailConnector };
});

/** One page: Profile → Period → Labs (status cards + tables + smart import) */
export function MelaniData() {
  const [labs, setLabs] = useState<LabItem[]>(() => loadLabs());
  const [labPopup, setLabPopup] = useState<LabItem | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!labPopup) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLabPopup(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [labPopup]);

  const sections: BuiltSection[] = useMemo(
    () => buildSections(labs),
    [labs]
  );

  const applyImport = useCallback((raw: string) => {
    const result = importLabPayload(labs, raw);
    setLabs(result.items);
    setImportMsg(result.message);
    window.setTimeout(() => setImportMsg(""), 4000);
  }, [labs]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    const name = file.name.toLowerCase();

    if (name.endsWith(".pdf")) {
      // Browser can't parse PDF without a library — ask for paste of text
      setPasteOpen(true);
      setImportMsg(
        "PDF detected — copy the results text from the PDF and paste below (or drop a .txt/.csv export)."
      );
      return;
    }

    const text = await file.text();
    applyImport(text);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="melani-shell">
      {/* No age/sex/height banner — profile lives in context for Mel, not this page chrome */}
      <div className="melani-inner">
        <CycleTracker />

        {/* ── CURRENT STATUS cards ── */}
        <section className="lab-status-block">
          <h2 className="lab-h2">Current status</h2>
          <div className="lab-status-grid">
            {sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                className={`lab-status-card lab-status-${sec.status}${
                  sections.length % 3 === 1 &&
                  sec === sections[sections.length - 1]
                    ? " lab-status-wide"
                    : ""
                }`}
                onClick={() => {
                  document
                    .getElementById(`lab-sec-${sec.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span className="lab-status-name">{sec.label}</span>
                <span className="lab-status-date">
                  Date: {formatLabDate(sec.date)}
                </span>
                <span className={`lab-pill lab-pill-${sec.status}`}>
                  {statusLabel(sec.status)}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Smart drop / import */}
        <div
          className={`lab-drop${dragOver ? " is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p className="lab-drop-title">Drop new lab results</p>
          <p className="lab-drop-hint">
            Drop a .txt / .csv / .json export, or paste results. Same tests update
            (HIGH → OK). New tests get their own section and explanation.
          </p>
          <div className="lab-drop-actions">
            <button
              type="button"
              className="lab-drop-btn"
              onClick={() => fileRef.current?.click()}
            >
              Choose file
            </button>
            <button
              type="button"
              className="lab-drop-btn"
              onClick={() => setPasteOpen((v) => !v)}
            >
              {pasteOpen ? "Hide paste" : "Paste text"}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.json,.tsv,text/plain,text/csv,application/json"
            className="lab-file-input"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          {pasteOpen ? (
            <div className="lab-paste">
              <textarea
                className="lab-paste-area"
                placeholder={`Example:\nLDL Cholesterol 95 mg/dL OK\nGlucose 88 mg/dL\nFerritin 22 ng/mL Low\nVitamin D 28 ng/mL`}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
              />
              <button
                type="button"
                className="lab-drop-btn"
                onClick={() => {
                  applyImport(pasteText);
                  setPasteText("");
                }}
              >
                Import paste
              </button>
            </div>
          ) : null}
          {importMsg ? <p className="lab-import-msg">{importMsg}</p> : null}
        </div>

        {/* Section tables — no extra “results by section” header */}
        {sections.map((sec) => (
          <section
            key={sec.id}
            id={`lab-sec-${sec.id}`}
            className="lab-section"
          >
            <div className="lab-section-head">
              <div className="lab-section-text">
                <h3 className="lab-section-label">{sec.label}</h3>
                <ExpandableText
                  text={sec.blurb}
                  className="lab-section-blurb"
                  lines={3}
                />
              </div>
              <span className={`lab-pill lab-pill-${sec.status}`}>
                {statusLabel(sec.status)}
              </span>
            </div>
            <p className="lab-section-date">
              Date: {formatLabDate(sec.date)}
            </p>

            <div className="lab-table" role="table">
              <div className="lab-table-head" role="row">
                <span role="columnheader">Test</span>
                <span role="columnheader">Result</span>
                <span role="columnheader">Status</span>
              </div>
              {sec.items.map((lab) => (
                <button
                  key={lab.id}
                  type="button"
                  role="row"
                  className="lab-table-row"
                  onClick={() => setLabPopup(lab)}
                >
                  <span className="lab-table-name" role="cell">
                    {labDisplayName(lab)}
                  </span>
                  <span className="lab-table-val" role="cell">
                    {lab.value}
                    {lab.unit ? ` ${lab.unit}` : ""}
                  </span>
                  <span role="cell" className="lab-table-status">
                    <span className={`lab-pill lab-pill-${lab.status}`}>
                      {statusLabel(lab.status)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {labPopup && (
        <div
          className="lab-popup-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lab-popup-title"
          onClick={() => setLabPopup(null)}
        >
          <div className="lab-popup" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lab-popup-close"
              onClick={() => setLabPopup(null)}
              aria-label="Close"
            >
              ×
            </button>

            <div className="lab-popup-top">
              <h3 id="lab-popup-title" className="lab-popup-title">
                {labDisplayName(labPopup)}
              </h3>
              <span className="lab-popup-top-val">
                {labPopup.value}
                {labPopup.unit ? ` ${labPopup.unit}` : ""}
              </span>
              <span className={`lab-pill lab-pill-${labPopup.status}`}>
                {statusLabel(labPopup.status)}
              </span>
            </div>

            <ExpandableText
              text={labOneLiner(labPopup)}
              className="lab-popup-oneliner"
              lines={3}
            />

            <div className="lab-popup-block">
              <p className="lab-popup-label">Normal range</p>
              <p>{labPopup.normalRange}</p>
            </div>

            <div className="lab-popup-block">
              <p className="lab-popup-label">Your result</p>
              <p className={`lab-popup-result lab-val-${labPopup.status}`}>
                <strong>
                  {labPopup.value}
                  {labPopup.unit ? ` ${labPopup.unit}` : ""}
                </strong>
              </p>
            </div>

            <div className="lab-popup-block">
              <p className="lab-popup-label">What it is</p>
              <ExpandableText text={labPopup.simple} lines={3} />
            </div>

            <div className="lab-popup-block">
              <p className="lab-popup-label">Why we measure it</p>
              <ExpandableText text={labPopup.testsFor} lines={3} />
            </div>

            <div className="lab-popup-block">
              <p className="lab-popup-label">If high</p>
              <ExpandableText text={labPopup.highMeans} lines={3} />
            </div>

            <div className="lab-popup-block">
              <p className="lab-popup-label">If low</p>
              <ExpandableText text={labPopup.lowMeans} lines={3} />
            </div>

            <p
              className={`lab-popup-footer lab-popup-footer-${labPopup.status}`}
            >
              {footerForLab(labPopup)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function isMelaniRichPage(pageId: string): boolean {
  return (
    isFitnessPage(pageId) ||
    isHygienePage(pageId) ||
    isGmailAgentPage(pageId) ||
    isBooksPage(pageId) ||
    isWardrobePage(pageId) ||
    isWeatherAgentPage(pageId) ||
    isShoppingAgentPage(pageId) ||
    isMyTasksPage(pageId) ||
    pageId === "pg-life" ||
    pageId === "pg-data" ||
    pageId === "pg-my-data"
  );
}

export function MelaniRichPage({
  pageId,
  onGo,
  pages,
}: {
  pageId: string;
  onGo: (id: string) => void;
  pages: Page[];
}) {
  if (isFitnessPage(pageId)) {
    return <FitnessExact pageId={pageId} onGo={onGo} />;
  }

  if (isHygienePage(pageId)) {
    return <HygieneExact pageId={pageId} onGo={onGo} />;
  }

  if (isGmailAgentPage(pageId)) {
    return (
      <Suspense fallback={<div className="melani-page-loading is-dark">Loading Gmail</div>}>
        <GmailConnector onGo={onGo} />
      </Suspense>
    );
  }

  if (isWardrobePage(pageId)) {
    return (
      <Suspense fallback={<div className="melani-page-loading">Loading Wardrobe</div>}>
        <WardrobeFrame />
      </Suspense>
    );
  }

  if (isWeatherAgentPage(pageId)) {
    return <WeatherAgent onGo={onGo} />;
  }

  if (isShoppingAgentPage(pageId)) {
    return <ShoppingAgent />;
  }

  if (isMyTasksPage(pageId)) {
    return <MyTasks />;
  }

  // Life + Books both open the real library (not a blank Notion page)
  if (pageId === "pg-life" || isBooksPage(pageId)) {
    return <BooksLibrary onGo={onGo} workspacePages={pages} />;
  }

  if (pageId === "pg-data" || pageId === "pg-my-data") {
    return <MelaniData />;
  }

  return null;
}
