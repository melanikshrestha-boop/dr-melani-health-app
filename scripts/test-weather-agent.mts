import assert from "node:assert/strict";
import {
  buildStyleBrief,
  rainRisk,
  weatherCondition,
  weatherWardrobeContext,
  type WeatherSnapshot,
} from "../src/melani/weather/weatherCore.ts";
import { defaultWorkspace } from "../src/storage.ts";

function fixture(overrides: Partial<WeatherSnapshot["current"]> = {}): WeatherSnapshot {
  const current = {
    time: "2026-07-21T12:00",
    temperatureF: 84,
    feelsLikeF: 89,
    humidity: 82,
    precipitationIn: 0,
    rainIn: 0,
    weatherCode: 80,
    cloudCover: 88,
    windMph: 12,
    gustMph: 19,
    uvIndex: 6,
    isDay: true,
    ...overrides,
  };
  return {
    location: { latitude: 40.7, longitude: -74, label: "New York, New York", source: "search", savedAt: Date.now() },
    timezone: "America/New_York",
    fetchedAt: Date.now(),
    current,
    hourly: Array.from({ length: 8 }, (_, index) => ({
      time: `2026-07-21T${String(12 + index).padStart(2, "0")}:00`,
      temperatureF: 84,
      feelsLikeF: 89,
      precipitationChance: index === 2 ? 72 : 20,
      precipitationIn: 0,
      weatherCode: index === 2 ? 80 : 2,
      windMph: 12,
      humidity: 82,
      uvIndex: 6,
    })),
    daily: [{
      date: "2026-07-21",
      weatherCode: 80,
      highF: 86,
      lowF: 72,
      feelsHighF: 91,
      feelsLowF: 76,
      precipitationChance: 90,
      windMph: 18,
      uvIndex: 7,
      sunrise: "2026-07-21T05:42",
      sunset: "2026-07-21T20:21",
    }],
  };
}

const hotRain = fixture();
const hotBrief = buildStyleBrief(hotRain);
assert.equal(rainRisk(hotRain), 72, "rain decisions should use the upcoming window, not a risk that already passed");
assert.equal(hotBrief.rainReady, true);
assert.ok(hotBrief.formula.includes("Water-resistant outer layer"));
assert.ok(hotBrief.carry.includes("Compact umbrella"));
assert.match(hotBrief.scentTitle, /Citrus|green tea|clean musk/i);
assert.match(hotBrief.grooming, /anti-frizz/i);
assert.deepEqual(weatherWardrobeContext(hotRain), {
  temperatureF: 89,
  rain: true,
  location: "New York, New York",
  condition: "Rain showers",
});

const cold = fixture({
  temperatureF: 31,
  feelsLikeF: 25,
  humidity: 44,
  weatherCode: 0,
  precipitationIn: 0,
  rainIn: 0,
  windMph: 5,
  gustMph: 8,
  uvIndex: 1,
});
cold.hourly = cold.hourly.map((hour) => ({ ...hour, precipitationChance: 0, weatherCode: 0 }));
const coldBrief = buildStyleBrief(cold);
assert.equal(coldBrief.rainReady, false);
assert.ok(coldBrief.formula.includes("Thermal base"));
assert.match(coldBrief.scentTitle, /amber|woods|vanilla/i);
assert.equal(weatherCondition(95), "Thunderstorms");

const weatherPage = defaultWorkspace().pages.find((page) => page.id === "pg-agent-weather");
assert.equal(weatherPage?.title, "Weather");
assert.equal(weatherPage?.parentId, "pg-agents");

console.log("WEATHER_AGENT_TEST_OK");
