import type { MelToolResult } from "../melTools";
import {
  buildStyleBrief,
  getFreshSavedWeather,
  rainRisk,
  weatherCondition,
  weatherWardrobeContext,
} from "./weatherCore";

function isWeatherQuestion(text: string, pageId?: string): boolean {
  if (pageId === "pg-agent-weather") return /\b(weather|forecast|temperature|rain|umbrella|humid|humidity|wind|uv|outside|hot|cold)\b/i.test(text);
  return /\b(?:what(?:'s| is) the weather|weather (?:today|tomorrow|this week|outside)|forecast|how (?:hot|cold|windy|humid) is it|is it (?:raining|cold|hot|windy)|do i need (?:an? )?umbrella|will it rain)\b/i.test(text);
}

export async function runWeatherCommand(text: string, pageId?: string): Promise<MelToolResult | null> {
  if (!isWeatherQuestion(text, pageId)) return null;
  const snapshot = await getFreshSavedWeather();
  if (!snapshot) {
    return {
      ok: false,
      tool: "weather_location_needed",
      summary: "Open Weather once and allow location, or search your city there. Then I can use live conditions automatically.",
      data: { pageId: "pg-agent-weather" },
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
    `Today: ${Math.round(today?.highF || snapshot.current.temperatureF)} F high, ${Math.round(today?.lowF || snapshot.current.temperatureF)} F low. Rain risk in the next 8 hours: ${Math.round(risk)}%.`,
    `Wind ${Math.round(snapshot.current.windMph)} mph, humidity ${Math.round(snapshot.current.humidity)}%, UV ${Math.round(Math.max(snapshot.current.uvIndex, today?.uvIndex || 0))}.`,
  ].join("\n");
  if (umbrellaRequested) {
    summary += `\n${style.rainReady ? "Take the compact umbrella and wear water-safe shoes." : "Skip the umbrella unless the forecast changes."}`;
  }
  if (weekRequested) {
    summary += `\n${snapshot.daily.slice(1, 5).map((day) => `${day.date}: ${weatherCondition(day.weatherCode)}, ${Math.round(day.highF)}/${Math.round(day.lowF)} F`).join("\n")}`;
  }
  return { ok: true, tool: "weather_live", summary, data: { snapshot, style, wardrobe: context } };
}
