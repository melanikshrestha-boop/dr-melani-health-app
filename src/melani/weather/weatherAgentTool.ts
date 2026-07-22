/**
 * Weather is Mel-only (not a sidebar page).
 * Default city: New York City.
 */
import type { MelToolResult } from "../melTools";
import { wonderEmit } from "../core/eventBus";
import {
  buildStyleBrief,
  ensureDefaultWeatherLocation,
  getFreshSavedWeather,
  rainRisk,
  weatherCondition,
  weatherWardrobeContext,
} from "./weatherCore";

function isWeatherQuestion(text: string): boolean {
  return /\b(?:what(?:'s| is) the weather|weather(?:\s+today|\s+tomorrow|\s+this week|\s+outside)?|forecast|how (?:hot|cold|windy|humid) is it|is it (?:raining|cold|hot|windy)|do i need (?:an? )?umbrella|will it rain|temperature outside|nyc weather|new york weather)\b/i.test(
    text
  )
    || /^(weather|forecast|rain\??|umbrella\??)[.!?]*$/i.test(text.trim());
}

export async function runWeatherCommand(
  text: string,
  _pageId?: string
): Promise<MelToolResult | null> {
  if (!isWeatherQuestion(text)) return null;

  // Always have NYC (or saved city) before fetch
  ensureDefaultWeatherLocation();

  const snapshot = await getFreshSavedWeather();
  if (!snapshot) {
    return {
      ok: false,
      tool: "weather_unavailable",
      summary:
        "Weather is offline right now. Default city is New York City — try again in a moment.",
      data: { defaultCity: "New York City, NY" },
    };
  }

  const style = buildStyleBrief(snapshot);
  const context = weatherWardrobeContext(snapshot);
  const risk = rainRisk(snapshot);
  const today = snapshot.daily[0];
  const weekRequested = /\b(?:week|seven days|7 days)\b/i.test(text);
  const umbrellaRequested = /\bumbrella|rain\b/i.test(text);

  let summary = [
    `${snapshot.location.label}: ${Math.round(snapshot.current.temperatureF)} F, feels like ${Math.round(snapshot.current.feelsLikeF)} F, ${weatherCondition(snapshot.current.weatherCode).toLowerCase()}.`,
    `Today: ${Math.round(today?.highF || snapshot.current.temperatureF)} F high, ${Math.round(today?.lowF || snapshot.current.temperatureF)} F low. Rain risk next 8h: ${Math.round(risk)}%.`,
    `Wind ${Math.round(snapshot.current.windMph)} mph · humidity ${Math.round(snapshot.current.humidity)}% · UV ${Math.round(Math.max(snapshot.current.uvIndex, today?.uvIndex || 0))}.`,
  ].join("\n");

  if (umbrellaRequested) {
    summary += `\n${style.rainReady ? "Take a compact umbrella and water-safe shoes." : "Skip the umbrella unless the forecast changes."}`;
  }
  if (weekRequested) {
    summary += `\n${snapshot.daily
      .slice(0, 5)
      .map(
        (day) =>
          `${day.date}: ${weatherCondition(day.weatherCode)}, ${Math.round(day.highF)}/${Math.round(day.lowF)} F`
      )
      .join("\n")}`;
  }

  summary += `\nDress hint: ${style.headline}`;

  wonderEmit("weather.updated", "weatherAgentTool", {
    label: snapshot.location.label,
  });

  return {
    ok: true,
    tool: "weather_live",
    summary,
    data: { snapshot, style, wardrobe: context },
  };
}

/** Direct tool for Mel plan runtime */
export async function getWeatherToolResult(): Promise<MelToolResult> {
  return (
    (await runWeatherCommand("weather today")) || {
      ok: false,
      tool: "weather_unavailable",
      summary: "Weather unavailable.",
    }
  );
}
