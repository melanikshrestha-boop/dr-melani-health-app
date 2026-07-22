/**
 * Minimal line icons — same style as Dr. Melani gym SVGs
 * (stroke 1.6, round caps, no emoji).
 */
import type { Page } from "../types";

type Props = {
  name: string;
  size?: number;
  className?: string;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function MinimalIcon({ name, size = 16, className = "" }: Props) {
  const s = size;
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    className: `min-icon ${className}`.trim(),
    "aria-hidden": true as const,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path {...stroke} d="M4 11.5 12 4l8 7.5" />
          <path {...stroke} d="M6.5 10.5V20h11v-9.5" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle {...stroke} cx="11" cy="11" r="6.5" />
          <path {...stroke} d="m16.5 16.5 4 4" />
        </svg>
      );
    case "fitness":
    case "gym":
      // dumbbell — same idea as gym-upper
      return (
        <svg {...common}>
          <path {...stroke} d="M6 9v6" />
          <path {...stroke} d="M18 9v6" />
          <path {...stroke} d="M4 10v4" />
          <path {...stroke} d="M20 10v4" />
          <path {...stroke} d="M6 12h12" />
          <path {...stroke} d="M2 11v2" />
          <path {...stroke} d="M22 11v2" />
        </svg>
      );
    case "sleep":
      return (
        <svg {...common}>
          <path {...stroke} d="M14 4a7 7 0 1 0 6 10.5A8.5 8.5 0 1 1 14 4Z" />
        </svg>
      );
    case "meals":
      return (
        <svg {...common}>
          <path {...stroke} d="M8 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
          <path {...stroke} d="M10 13v8" />
          <path {...stroke} d="M16 3v18" />
          <path {...stroke} d="M16 8h3a2 2 0 0 1 0 4h-3" />
        </svg>
      );
    case "body":
      return (
        <svg {...common}>
          <circle {...stroke} cx="12" cy="5" r="2.2" />
          <path {...stroke} d="M12 8.5v6" />
          <path {...stroke} d="M8 11h8" />
          <path {...stroke} d="M12 14.5 8.5 21" />
          <path {...stroke} d="m12 14.5 3.5 6.5" />
        </svg>
      );
    case "work":
      return (
        <svg {...common}>
          <rect {...stroke} x="3" y="7" width="18" height="13" rx="1.5" />
          <path {...stroke} d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
          <path {...stroke} d="M3 12h18" />
        </svg>
      );
    case "monitor":
    case "markets":
    case "world-monitor":
      // globe + chart — World Monitor / markets desk
      return (
        <svg {...common}>
          <circle {...stroke} cx="12" cy="12" r="8.5" />
          <path {...stroke} d="M3.5 12h17" />
          <path {...stroke} d="M12 3.5c2.5 2.8 2.5 14.2 0 17" />
          <path {...stroke} d="M12 3.5c-2.5 2.8-2.5 14.2 0 17" />
          <path {...stroke} d="M7 16.5 10 13l2.5 2.5L17 9.5" />
        </svg>
      );
    case "hygiene":
      // sparkle + drop — clean / self-care hub
      return (
        <svg {...common}>
          <path {...stroke} d="M12 3v3" />
          <path {...stroke} d="M12 18v3" />
          <path {...stroke} d="M3 12h3" />
          <path {...stroke} d="M18 12h3" />
          <path {...stroke} d="m6.2 6.2 2 2" />
          <path {...stroke} d="m15.8 15.8 2 2" />
          <path {...stroke} d="m17.8 6.2-2 2" />
          <path {...stroke} d="m8.2 15.8-2 2" />
          <circle {...stroke} cx="12" cy="12" r="2.2" />
        </svg>
      );
    case "shower-daily":
      // shower head raining — quick daily rinse
      return (
        <svg {...common}>
          <path {...stroke} d="M8 4h6a3 3 0 0 1 3 3v1" />
          <path {...stroke} d="M17 8H9.5A2.5 2.5 0 0 0 7 10.5V11" />
          <path {...stroke} d="M9 14v4" />
          <path {...stroke} d="M12 15v4" />
          <path {...stroke} d="M15 14v4" />
          <path {...stroke} d="M7 13.5h.01" />
          <path {...stroke} d="M17 13.5h.01" />
        </svg>
      );
    case "shower-everything":
      // bathtub with bubbles — deep full wash day
      return (
        <svg {...common}>
          <path {...stroke} d="M5 12h14v3.5a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 5 15.5V12Z" />
          <path {...stroke} d="M5 12V9.5A1.5 1.5 0 0 1 6.5 8H8" />
          <path {...stroke} d="M4 19h16" />
          <circle {...stroke} cx="10" cy="6.5" r="1.2" />
          <circle {...stroke} cx="14" cy="5.5" r="1.6" />
          <circle {...stroke} cx="17" cy="7.5" r="1" />
        </svg>
      );
    case "hair":
      // flowing hair strands — hair care
      return (
        <svg {...common}>
          <path {...stroke} d="M8 4c0 4 1.5 7 1.5 11.5S8 21 8 21" />
          <path {...stroke} d="M12 3c0 5 1 8 1 12.5S12 22 12 22" />
          <path {...stroke} d="M16 4c0 4-1 7.5-1 12s1 6 1 6" />
          <path {...stroke} d="M7 8h2" />
          <path {...stroke} d="M15 9h2" />
        </svg>
      );
    case "am-skin":
      // clean morning sun — no extra squiggle
      return (
        <svg {...common}>
          <circle {...stroke} cx="12" cy="12" r="3.4" />
          <path {...stroke} d="M12 3.5v2" />
          <path {...stroke} d="M12 18.5v2" />
          <path {...stroke} d="M3.5 12h2" />
          <path {...stroke} d="M18.5 12h2" />
          <path {...stroke} d="m6.2 6.2 1.4 1.4" />
          <path {...stroke} d="m16.4 16.4 1.4 1.4" />
          <path {...stroke} d="m16.4 6.2-1.4 1.4" />
          <path {...stroke} d="m7.6 16.4-1.4 1.4" />
        </svg>
      );
    case "pm-skin":
      // clean crescent moon — night skincare (no drip)
      return (
        <svg {...common}>
          <path {...stroke} d="M15 5a6.5 6.5 0 1 0 4.2 11.5A7.5 7.5 0 1 1 15 5Z" />
        </svg>
      );
    case "labs":
      return (
        <svg {...common}>
          <path {...stroke} d="M9 3h6" />
          <path {...stroke} d="M10 3v6.5L5.5 20h13L14 9.5V3" />
          <path {...stroke} d="M7 15h10" />
        </svg>
      );
    case "data":
      // mini bar graph
      return (
        <svg {...common}>
          <path {...stroke} d="M4 19V11" />
          <path {...stroke} d="M10 19V5" />
          <path {...stroke} d="M16 19v-7" />
          <path {...stroke} d="M22 19V8" />
          <path {...stroke} d="M2 19h20" />
        </svg>
      );
    case "hard":
    case "75hard":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 3 14 9h6l-5 3.5L17 19l-5-3.5L7 19l2-6.5L4 9h6L12 3Z" />
        </svg>
      );
    case "goals":
      return (
        <svg {...common}>
          <circle {...stroke} cx="12" cy="12" r="8" />
          <circle {...stroke} cx="12" cy="12" r="4" />
          <circle {...stroke} cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "journal":
      return (
        <svg {...common}>
          <path {...stroke} d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path {...stroke} d="M9 3v18" />
          <path {...stroke} d="M12 8h5" />
          <path {...stroke} d="M12 12h5" />
        </svg>
      );
    case "brain":
    case "neuro":
      return (
        <svg {...common}>
          <path
            {...stroke}
            d="M9 5a3 3 0 0 1 6 0 3 3 0 0 1 3 3c0 1.2-.5 2-1.2 2.6A3 3 0 0 1 18 14a3 3 0 0 1-3 3h-1v2h-4v-2H9a3 3 0 0 1-3-3 3 3 0 0 1 1.2-2.4A3 3 0 0 1 6 8a3 3 0 0 1 3-3Z"
          />
        </svg>
      );
    case "doctor":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 4v8" />
          <path {...stroke} d="M8 8h8" />
          <circle {...stroke} cx="12" cy="17" r="3" />
        </svg>
      );
    case "shop":
      return (
        <svg {...common}>
          <path {...stroke} d="M5 7h14l-1.2 11H6.2L5 7Z" />
          <path {...stroke} d="M9 7a3 3 0 0 1 6 0" />
        </svg>
      );
    case "meetings":
      return (
        <svg {...common}>
          <rect {...stroke} x="4" y="5" width="16" height="15" rx="1.5" />
          <path {...stroke} d="M4 10h16" />
          <path {...stroke} d="M9 3v4" />
          <path {...stroke} d="M15 3v4" />
        </svg>
      );
    case "docs":
      return (
        <svg {...common}>
          <path {...stroke} d="M7 3h7l4 4v14H7V3Z" />
          <path {...stroke} d="M14 3v4h4" />
          <path {...stroke} d="M10 12h6" />
          <path {...stroke} d="M10 16h6" />
        </svg>
      );
    case "life":
      // simple leaf / life mark
      return (
        <svg {...common}>
          <path {...stroke} d="M12 21V10" />
          <path {...stroke} d="M12 10c0-4 3-7 8-7-1 5-4 7-8 7Z" />
          <path {...stroke} d="M12 13c0-3-2.5-5.5-6.5-6 1 4 3 6 6.5 6Z" />
        </svg>
      );
    case "fashion":
      return (
        <svg {...common}>
          <path {...stroke} d="M9 5.5c.7 1.1 1.7 1.7 3 1.7s2.3-.6 3-1.7l4.5 2.7-2.2 3.5-2-1.1V21H8.7V10.6l-2 1.1-2.2-3.5L9 5.5Z" />
          <path {...stroke} d="M9 5.5 10 3h4l1 2.5" />
        </svg>
      );
    case "weather":
      return (
        <svg {...common}>
          <circle {...stroke} cx="9" cy="9" r="3" />
          <path {...stroke} d="M9 3V2" />
          <path {...stroke} d="M3 9H2" />
          <path {...stroke} d="m4.7 4.7-.8-.8" />
          <path {...stroke} d="m13.3 4.7.8-.8" />
          <path {...stroke} d="M7 17.5h10.5a3.5 3.5 0 0 0 0-7 5.5 5.5 0 0 0-10.4 1.9A2.6 2.6 0 0 0 7 17.5Z" />
        </svg>
      );
    case "library":
    case "books":
      // open book
      return (
        <svg {...common}>
          <path {...stroke} d="M4 5.5c2.5-1 5-.8 8 .5 3-1.3 5.5-1.5 8-.5v13c-2.5-1-5-.8-8 .5-3-1.3-5.5-1.5-8-.5v-13Z" />
          <path {...stroke} d="M12 6v13" />
        </svg>
      );
    case "tasks":
    case "todo":
      return (
        <svg {...common}>
          <rect {...stroke} x="4" y="4" width="16" height="16" rx="2" />
          <path {...stroke} d="m8 12 2.5 2.5L16 9" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <circle {...stroke} cx="12" cy="12" r="8.5" />
          <path {...stroke} d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.9.4-1.7 1.1-1.7 2.1" />
          <path {...stroke} d="M12 17h.01" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path {...stroke} d="M5 7h14" />
          <path {...stroke} d="M9 7V5h6v2" />
          <path {...stroke} d="M8 7l1 13h6l1-13" />
        </svg>
      );
    case "page":
    default:
      return (
        <svg {...common}>
          <path {...stroke} d="M7 3h7l4 4v14H7V3Z" />
          <path {...stroke} d="M14 3v4h4" />
        </svg>
      );
  }
}

/** Map page id / title → minimal icon name */
export function iconForPage(page: Pick<Page, "id" | "title" | "kind" | "icon">): string {
  if (page.kind === "database") return "docs";
  const id = page.id || "";
  const t = (page.title || "").toLowerCase();

  if (id === "pg-home" || t === "home") return "home";
  if (id.includes("fitness") || t === "fitness") return "fitness";
  if (id.includes("sleep") || t.includes("sleep")) return "sleep";
  if (id.includes("meal") || t.includes("meal")) return "meals";
  if (id.includes("gym") || t.includes("gym")) return "gym";
  if (id.includes("body") || t === "body") return "body";
  if (id.includes("work") || t === "work") return "work";
  if (
    id === "pg-world-monitor" ||
    id.includes("world-monitor") ||
    t.includes("world monitor") ||
    t.includes("markets desk") ||
    (t.includes("monitor") && t.includes("world"))
  ) {
    return "monitor";
  }
  // Hygiene family — each page gets its own creative icon (not one shared glass)
  if (id === "pg-shower-daily" || (t.includes("daily") && t.includes("shower")))
    return "shower-daily";
  if (id === "pg-shower-everything" || (t.includes("everything") && t.includes("shower")))
    return "shower-everything";
  if (id === "pg-hair" || t.includes("hair care") || t === "hair")
    return "hair";
  if (id === "pg-am-skin" || (t.includes("am") && t.includes("skin")))
    return "am-skin";
  if (id === "pg-pm-skin" || (t.includes("pm") && t.includes("skin")))
    return "pm-skin";
  if (id.includes("hygiene") || t.includes("hygiene")) return "hygiene";
  // leftover shower / skin / hair titles still get something sensible
  if (t.includes("shower")) return "shower-daily";
  if (t.includes("skin")) return "am-skin";
  if (t.includes("hair")) return "hair";
  if (id === "pg-data" || id === "pg-my-data" || t === "data" || t === "my data")
    return "data";
  if (id.includes("lab") || t.includes("lab")) return "labs";
  if (id === "pg-life" || t === "life") return "life";
  if (id.includes("library") || t.includes("library")) return "library";
  if (id.includes("book") || t.includes("book") || t.includes("reading") || t.includes("innovator") || t.includes("photo"))
    return "books";
  if (id.includes("todo") || id.includes("task") || t.includes("to do") || t.includes("task"))
    return "tasks";
  if (id.includes("help") || t === "help") return "help";
  if (id.includes("trash") || t.includes("trash")) return "trash";
  if (id.includes("goal") || t.includes("goal")) return "goals";
  if (id.includes("journal") || t.includes("journal")) return "journal";
  if (id.includes("housing") || t.includes("housing")) return "home";
  if (id.includes("car") || t.includes("car payment")) return "finance";
  if (id.includes("travel") || t.includes("travel")) return "meetings";
  if (id.includes("morning") || t.includes("morning")) return "sleep";
  if (id.includes("night") || t.includes("night")) return "sleep";
  if (id.includes("manifest") || t.includes("manifest") || t.includes("why"))
    return "goals";
  if (id.includes("fashion") || t.includes("fashion") || t.includes("wardrobe"))
    return "fashion";
  if (id.includes("weather") || t.includes("weather") || t.includes("forecast"))
    return "weather";
  if (t.includes("art")) return "page";
  if (id.includes("neuro") || t.includes("neuro") || t.includes("openneuro"))
    return "brain";
  if (id.includes("doctor") || t.includes("doctor")) return "doctor";
  if (id.includes("grocery") || t.includes("shop") || t.includes("grocery")) return "shop";
  if (id.includes("meeting") || t.includes("meeting")) return "meetings";
  if (id.includes("doc") || t.includes("document") || t.includes("class") || t.includes("content"))
    return "docs";
  if (id.includes("suppl") || t.includes("suppl")) return "doctor";
  if (id.includes("finance") || t.includes("finance")) return "goals";
  if (id.includes("startup") || t.includes("startup")) return "work";
  if (id.includes("gmail") || t.includes("gmail") || t.includes("email"))
    return "work";
  if (id.includes("agent") || t.includes("agent")) return "brain";
  if (id.includes("cycle") || t.includes("period") || t.includes("profile") || t.includes("wearable") || t.includes("test") || t.includes("analytic"))
    return "labs";

  return "page";
}
