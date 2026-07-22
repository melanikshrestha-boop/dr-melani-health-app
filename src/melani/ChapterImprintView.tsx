/**
 * Imprint UI — animated chapter cards + quiz on main ideas.
 */
import { useEffect, useMemo, useState } from "react";
import type { ChapterImprint, ImprintQuizItem } from "./chapterImprint";
import "./chapter-imprint.css";

type Props = {
  imprint: ChapterImprint;
  onClose: () => void;
  onRebuild: () => void;
};

type Phase = "cards" | "quiz" | "results";

export function ChapterImprintView({ imprint, onClose, onRebuild }: Props) {
  const [phase, setPhase] = useState<Phase>("cards");
  const [cardIndex, setCardIndex] = useState(0);
  const [anim, setAnim] = useState<"in" | "out-left" | "out-right" | "idle">("in");
  const [quizIndex, setQuizIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);

  const cards = imprint.cards;
  const quiz = imprint.quiz;
  const card = cards[cardIndex];
  const question = quiz[quizIndex] as ImprintQuizItem | undefined;

  useEffect(() => {
    setPhase("cards");
    setCardIndex(0);
    setAnim("in");
    setQuizIndex(0);
    setSelected(null);
    setRevealed(false);
    setScore(0);
    setAnswers([]);
  }, [imprint.createdAt, imprint.chapterHref]);

  function goCard(next: number, dir: "left" | "right") {
    if (next < 0 || next >= cards.length) return;
    setAnim(dir === "left" ? "out-left" : "out-right");
    window.setTimeout(() => {
      setCardIndex(next);
      setAnim("in");
    }, 220);
  }

  function startQuiz() {
    if (!quiz.length) return;
    setPhase("quiz");
    setQuizIndex(0);
    setSelected(null);
    setRevealed(false);
    setScore(0);
    setAnswers([]);
  }

  function pickAnswer(choice: string) {
    if (revealed || !question) return;
    setSelected(choice);
    setRevealed(true);
    const ok =
      choice.trim().toLowerCase() === question.answer.trim().toLowerCase() ||
      (question.type === "truefalse" &&
        choice.toLowerCase() === question.answer.toLowerCase());
    setAnswers((a) => [...a, ok]);
    if (ok) setScore((s) => s + 1);
  }

  function nextQuestion() {
    if (quizIndex + 1 >= quiz.length) {
      setPhase("results");
      return;
    }
    setQuizIndex((i) => i + 1);
    setSelected(null);
    setRevealed(false);
  }

  const progressLabel = useMemo(() => {
    if (phase === "cards") return `Card ${cardIndex + 1} / ${cards.length}`;
    if (phase === "quiz") return `Question ${quizIndex + 1} / ${quiz.length}`;
    return "Results";
  }, [phase, cardIndex, cards.length, quizIndex, quiz.length]);

  return (
    <div className="imp-root" role="dialog" aria-label="Chapter imprint">
      <header className="imp-head">
        <button type="button" className="imp-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="imp-head-mid">
          <p className="imp-kicker">Imprint</p>
          <h2 className="imp-title">{imprint.chapterLabel}</h2>
          <p className="imp-meta">
            {progressLabel}
            {imprint.wordCount
              ? ` · ${imprint.wordCount.toLocaleString()} words`
              : ""}
          </p>
        </div>
        <button type="button" className="imp-ghost" onClick={onRebuild}>
          Rebuild
        </button>
      </header>

      <div className="imp-progress" aria-hidden>
        <i
          style={{
            width:
              phase === "results"
                ? "100%"
                : phase === "cards"
                  ? `${((cardIndex + 1) / Math.max(cards.length, 1)) * 100}%`
                  : `${((quizIndex + (revealed ? 1 : 0)) / Math.max(quiz.length, 1)) * 100}%`,
          }}
        />
      </div>

      {phase === "cards" && card ? (
        <div className="imp-stage">
          <article className={`imp-card imp-card-${card.kind} is-${anim}`}>
            <span className="imp-kind">{labelForKind(card.kind)}</span>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>

          <div className="imp-nav">
            <button
              type="button"
              className="imp-btn"
              disabled={cardIndex === 0}
              onClick={() => goCard(cardIndex - 1, "right")}
            >
              Back
            </button>
            {cardIndex < cards.length - 1 ? (
              <button
                type="button"
                className="imp-btn imp-btn-primary"
                onClick={() => goCard(cardIndex + 1, "left")}
              >
                Next idea
              </button>
            ) : (
              <button
                type="button"
                className="imp-btn imp-btn-primary"
                onClick={startQuiz}
                disabled={!quiz.length}
              >
                {quiz.length ? "Test me" : "No quiz yet"}
              </button>
            )}
          </div>
          <p className="imp-hint">Swipe ideas with Next · then prove you got them</p>
        </div>
      ) : null}

      {phase === "quiz" && question ? (
        <div className="imp-stage">
          <article className="imp-card imp-card-quiz is-in">
            <span className="imp-kind">Quiz</span>
            <h3>
              {question.type === "truefalse"
                ? "True or false"
                : question.type === "cloze"
                  ? "Fill the blank"
                  : "Main idea"}
            </h3>
            <p className="imp-quiz-prompt">{question.prompt}</p>
            <div className="imp-choices">
              {(question.choices || [question.answer]).map((choice) => {
                const isSel = selected === choice;
                const isAns =
                  choice.trim().toLowerCase() ===
                  question.answer.trim().toLowerCase();
                let cls = "imp-choice";
                if (revealed && isAns) cls += " is-correct";
                else if (revealed && isSel && !isAns) cls += " is-wrong";
                else if (isSel) cls += " is-sel";
                return (
                  <button
                    key={choice}
                    type="button"
                    className={cls}
                    disabled={revealed}
                    onClick={() => pickAnswer(choice)}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
            {revealed ? (
              <div className="imp-explain">
                <p>
                  {selected?.trim().toLowerCase() ===
                  question.answer.trim().toLowerCase()
                    ? "Correct."
                    : "Not quite."}
                </p>
                <p>{question.explanation}</p>
              </div>
            ) : null}
          </article>
          <div className="imp-nav">
            <button type="button" className="imp-btn" onClick={() => setPhase("cards")}>
              Cards
            </button>
            <button
              type="button"
              className="imp-btn imp-btn-primary"
              disabled={!revealed}
              onClick={nextQuestion}
            >
              {quizIndex + 1 >= quiz.length ? "See score" : "Next question"}
            </button>
          </div>
        </div>
      ) : null}

      {phase === "results" ? (
        <div className="imp-stage">
          <article className="imp-card imp-card-results is-in">
            <span className="imp-kind">Results</span>
            <h3>
              {score} / {quiz.length}
            </h3>
            <p>
              {score === quiz.length
                ? "You own this chapter. Move on when ready."
                : score >= Math.ceil(quiz.length * 0.6)
                  ? "Solid. Skim the beats you missed, then keep reading."
                  : "Revisit the Core idea card, then try the quiz again."}
            </p>
            <ul className="imp-result-list">
              {answers.map((ok, i) => (
                <li key={i} className={ok ? "ok" : "no"}>
                  Q{i + 1}: {ok ? "correct" : "missed"}
                </li>
              ))}
            </ul>
          </article>
          <div className="imp-nav">
            <button
              type="button"
              className="imp-btn"
              onClick={() => {
                setPhase("cards");
                setCardIndex(0);
                setAnim("in");
              }}
            >
              Review cards
            </button>
            <button type="button" className="imp-btn imp-btn-primary" onClick={startQuiz}>
              Retake quiz
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function labelForKind(kind: string): string {
  if (kind === "hook") return "Open";
  if (kind === "idea") return "Core";
  if (kind === "beat") return "Beat";
  if (kind === "detail") return "Detail";
  if (kind === "close") return "Close";
  return "Card";
}
