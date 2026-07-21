export type WeatherLocation = {
  latitude: number;
  longitude: number;
  label: string;
  source: "device" | "search";
  timezone?: string;
  savedAt: number;
};

export type WeatherHour = {
  time: string;
  temperatureF: number;
  feelsLikeF: number;
  precipitationChance: number;
  precipitationIn: number;
  weatherCode: number;
  windMph: number;
  humidity: number;
  uvIndex: number;
};

export type WeatherDay = {
  date: string;
  weatherCode: number;
  highF: number;
  lowF: number;
  feelsHighF: number;
  feelsLowF: number;
  precipitationChance: number;
  windMph: number;
  uvIndex: number;
  sunrise: string;
  sunset: string;
};

export type WeatherSnapshot = {
  location: WeatherLocation;
  timezone: string;
  fetchedAt: number;
  current: {
    time: string;
    temperatureF: number;
    feelsLikeF: number;
    humidity: number;
    precipitationIn: number;
    rainIn: number;
    weatherCode: number;
    cloudCover: number;
    windMph: number;
    gustMph: number;
    uvIndex: number;
    isDay: boolean;
  };
  hourly: WeatherHour[];
  daily: WeatherDay[];
};

export type StyleBrief = {
  headline: string;
  formula: string[];
  scentTitle: string;
  scentNote: string;
  grooming: string;
  carry: string[];
  reasons: string[];
  rainReady: boolean;
};

export type WardrobeWeatherContext = {
  temperatureF: number;
  rain: boolean;
  location: string;
  condition: string;
};

type OpenMeteoResponse = {
  timezone?: string;
  current?: Record<string, unknown>;
  hourly?: Record<string, unknown[]>;
  daily?: Record<string, unknown[]>;
  reason?: string;
};

type GeocodingResponse = {
  results?: Array<{
    name?: string;
    admin1?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
  }>;
  reason?: string;
};

const LOCATION_KEY = "wonder-weather-location-v1";
const SNAPSHOT_KEY = "wonder-weather-snapshot-v1";
export const WEATHER_UPDATED_EVENT = "wonder-weather-updated";
export const WEATHER_CACHE_MS = 20 * 60 * 1000;

function readStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null") as T | null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* A live result remains useful even when private browsing blocks storage. */
  }
}

function numberAt(values: unknown[] | undefined, index: number, fallback = 0): number {
  const value = Number(values?.[index]);
  return Number.isFinite(value) ? value : fallback;
}

function valueNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringAt(values: unknown[] | undefined, index: number): string {
  return String(values?.[index] || "");
}

function validLocation(value: WeatherLocation | null): value is WeatherLocation {
  return Boolean(
    value
      && Number.isFinite(value.latitude)
      && Number.isFinite(value.longitude)
      && Math.abs(value.latitude) <= 90
      && Math.abs(value.longitude) <= 180
  );
}

export function loadWeatherLocation(): WeatherLocation | null {
  const value = readStorage<WeatherLocation>(LOCATION_KEY);
  return validLocation(value) ? value : null;
}

export function saveWeatherLocation(location: WeatherLocation): void {
  writeStorage(LOCATION_KEY, location);
}

export function loadWeatherSnapshot(): WeatherSnapshot | null {
  const value = readStorage<WeatherSnapshot>(SNAPSHOT_KEY);
  if (!value?.current || !validLocation(value.location) || !Array.isArray(value.daily)) return null;
  return value;
}

export function saveWeatherSnapshot(snapshot: WeatherSnapshot): void {
  writeStorage(SNAPSHOT_KEY, snapshot);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WEATHER_UPDATED_EVENT, { detail: snapshot }));
  }
}

export function isFreshWeather(snapshot: WeatherSnapshot | null, maxAge = WEATHER_CACHE_MS): boolean {
  return Boolean(snapshot && Date.now() - snapshot.fetchedAt <= maxAge);
}

export function requestDeviceLocation(): Promise<WeatherLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location is unavailable in this browser. Search for your city instead."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: "Current location",
          source: "device",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          savedAt: Date.now(),
        });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        reject(new Error(denied
          ? "Location permission is off. Search for your city, or allow location and try again."
          : "Your location could not be read. Search for your city instead."));
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

export async function searchWeatherLocation(query: string, signal?: AbortSignal): Promise<WeatherLocation> {
  const name = query.trim();
  if (name.length < 2) throw new Error("Enter a city or postal code.");
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { signal });
  const payload = await response.json().catch(() => ({})) as GeocodingResponse;
  if (!response.ok) throw new Error(payload.reason || "Location search failed.");
  const match = payload.results?.[0];
  if (!match || !Number.isFinite(match.latitude) || !Number.isFinite(match.longitude)) {
    throw new Error(`No location matched "${name}".`);
  }
  const region = match.admin1 || match.country;
  return {
    latitude: Number(match.latitude),
    longitude: Number(match.longitude),
    label: [match.name, region].filter(Boolean).join(", "),
    source: "search",
    timezone: match.timezone,
    savedAt: Date.now(),
  };
}

export async function fetchWeatherSnapshot(location: WeatherLocation, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("current", [
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
    "precipitation",
    "rain",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_gusts_10m",
    "uv_index",
    "is_day",
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m",
    "apparent_temperature",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "relative_humidity_2m",
    "uv_index",
  ].join(","));
  url.searchParams.set("daily", [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "uv_index_max",
    "sunrise",
    "sunset",
  ].join(","));
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "7");

  const response = await fetch(url, { signal });
  const payload = await response.json().catch(() => ({})) as OpenMeteoResponse;
  if (!response.ok || !payload.current || !payload.hourly || !payload.daily) {
    throw new Error(payload.reason || "Weather could not be loaded.");
  }

  const current = payload.current;
  const hourlyValues = payload.hourly;
  const times = (hourlyValues.time || []).map(String);
  const currentTime = String(current.time || "");
  const startIndex = Math.max(0, times.findIndex((time) => time >= currentTime));
  const hourly: WeatherHour[] = times.slice(startIndex, startIndex + 24).map((time, offset) => {
    const index = startIndex + offset;
    return {
      time,
      temperatureF: numberAt(hourlyValues.temperature_2m, index),
      feelsLikeF: numberAt(hourlyValues.apparent_temperature, index),
      precipitationChance: numberAt(hourlyValues.precipitation_probability, index),
      precipitationIn: numberAt(hourlyValues.precipitation, index),
      weatherCode: numberAt(hourlyValues.weather_code, index),
      windMph: numberAt(hourlyValues.wind_speed_10m, index),
      humidity: numberAt(hourlyValues.relative_humidity_2m, index),
      uvIndex: numberAt(hourlyValues.uv_index, index),
    };
  });

  const dailyValues = payload.daily;
  const dailyTimes = (dailyValues.time || []).map(String);
  const daily: WeatherDay[] = dailyTimes.map((date, index) => ({
    date,
    weatherCode: numberAt(dailyValues.weather_code, index),
    highF: numberAt(dailyValues.temperature_2m_max, index),
    lowF: numberAt(dailyValues.temperature_2m_min, index),
    feelsHighF: numberAt(dailyValues.apparent_temperature_max, index),
    feelsLowF: numberAt(dailyValues.apparent_temperature_min, index),
    precipitationChance: numberAt(dailyValues.precipitation_probability_max, index),
    windMph: numberAt(dailyValues.wind_speed_10m_max, index),
    uvIndex: numberAt(dailyValues.uv_index_max, index),
    sunrise: stringAt(dailyValues.sunrise, index),
    sunset: stringAt(dailyValues.sunset, index),
  }));

  const timezone = String(payload.timezone || location.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const snapshot: WeatherSnapshot = {
    location: { ...location, timezone },
    timezone,
    fetchedAt: Date.now(),
    current: {
      time: currentTime,
      temperatureF: valueNumber(current.temperature_2m),
      feelsLikeF: valueNumber(current.apparent_temperature),
      humidity: valueNumber(current.relative_humidity_2m),
      precipitationIn: valueNumber(current.precipitation),
      rainIn: valueNumber(current.rain),
      weatherCode: valueNumber(current.weather_code),
      cloudCover: valueNumber(current.cloud_cover),
      windMph: valueNumber(current.wind_speed_10m),
      gustMph: valueNumber(current.wind_gusts_10m),
      uvIndex: valueNumber(current.uv_index),
      isDay: valueNumber(current.is_day, 1) === 1,
    },
    hourly,
    daily,
  };
  saveWeatherLocation(snapshot.location);
  saveWeatherSnapshot(snapshot);
  return snapshot;
}

export async function getFreshSavedWeather(maxAge = WEATHER_CACHE_MS): Promise<WeatherSnapshot | null> {
  const cached = loadWeatherSnapshot();
  if (isFreshWeather(cached, maxAge)) return cached;
  let location = loadWeatherLocation() || cached?.location;
  if (!location) return cached;
  if (location.source === "device") {
    try {
      location = await requestDeviceLocation();
      saveWeatherLocation(location);
    } catch {
      /* Keep the last precise coordinate when permission is temporarily unavailable. */
    }
  }
  try {
    return await fetchWeatherSnapshot(location);
  } catch {
    return cached;
  }
}

export function weatherCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorms";
  return "Changing conditions";
}

export function weatherTone(code: number): "clear" | "cloud" | "fog" | "rain" | "snow" | "storm" {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
  return "storm";
}

export function rainRisk(snapshot: WeatherSnapshot): number {
  const upcoming = snapshot.hourly.slice(0, 8).map((hour) => hour.precipitationChance);
  const fallback = upcoming.length ? 0 : snapshot.daily[0]?.precipitationChance || 0;
  return Math.max(snapshot.current.precipitationIn > 0 || snapshot.current.rainIn > 0 ? 100 : 0, ...upcoming, fallback);
}

export function buildStyleBrief(snapshot: WeatherSnapshot): StyleBrief {
  const feels = snapshot.current.feelsLikeF;
  const risk = rainRisk(snapshot);
  const wetCode = weatherTone(snapshot.current.weatherCode) === "rain" || weatherTone(snapshot.current.weatherCode) === "storm";
  const rainReady = wetCode || risk >= 45;
  const windy = snapshot.current.windMph >= 18 || snapshot.current.gustMph >= 25;
  const humid = snapshot.current.humidity >= 70;
  const uv = Math.max(snapshot.current.uvIndex, snapshot.daily[0]?.uvIndex || 0);

  let headline = "Clean layers, polished finish";
  let formula = ["Breathable top", "Straight-leg trousers or jeans", "Clean closed shoes"];
  if (feels < 38) {
    headline = "Insulate first, then sharpen it";
    formula = ["Thermal base", "Structured knit", "Insulated coat", "Closed boots"];
  } else if (feels < 50) {
    headline = "Warm structure without bulk";
    formula = ["Long-sleeve base", "Knit or cardigan", "Coat", "Closed shoes"];
  } else if (feels < 62) {
    headline = "Light layers, crisp proportions";
    formula = ["Fitted or clean-line top", "Trousers or jeans", "Light jacket", "Closed shoes"];
  } else if (feels < 73) {
    headline = "One clean layer is enough";
    formula = ["Breathable top or dress", "Trousers, skirt, or clean denim", "Light layer for later", "Polished shoes"];
  } else if (feels < 83) {
    headline = "Keep it light and intentional";
    formula = ["Lightweight top or dress", "Breathable bottom", "Minimal layer", "Clean low-profile shoes"];
  } else {
    headline = "Minimal fabric, maximum polish";
    formula = ["Loose breathable top or dress", "Lightweight bottom", "Open or ventilated shoes"];
  }
  if (rainReady) {
    formula = formula.filter((item) => !/layer|coat|jacket/i.test(item));
    formula.push("Water-resistant outer layer", "Water-safe shoes");
  }

  let scentTitle = "Airy floral + soft woods";
  let scentNote = "2 to 3 light sprays. Keep the trail close and clean.";
  if (feels >= 78 || humid) {
    scentTitle = "Citrus, green tea, or clean musk";
    scentNote = "1 to 2 sprays. Heat amplifies fragrance, so keep it bright and restrained.";
  } else if (feels < 50) {
    scentTitle = "Soft amber, woods, or vanilla";
    scentNote = "2 to 3 sprays. Cold air can carry a warmer base without becoming heavy.";
  } else if (rainReady) {
    scentTitle = "Iris, tea, or clean musk";
    scentNote = "2 sprays. A dry, clean scent reads polished against wet weather.";
  }

  const grooming: string[] = [];
  if (humid) grooming.push("Use anti-frizz leave-in or a controlled updo");
  else if (windy) grooming.push("Choose secured hair or a shape that survives wind");
  else grooming.push("Keep hair smooth with a light finishing product");
  if (feels >= 76) grooming.push("Use reliable deodorant and a breathable base layer");
  if (uv >= 3) grooming.push(`Finish with SPF; UV peaks near ${Math.round(uv)}`);

  const carry: string[] = [];
  if (rainReady) carry.push("Compact umbrella");
  if (windy) carry.push("Hair tie or compact comb");
  if (feels >= 78) carry.push("Travel deodorant or blotting papers");
  if (!carry.length) carry.push("Nothing weather-specific");

  const reasons = [
    `Feels like ${Math.round(feels)} degrees`,
    `${Math.round(risk)}% peak rain risk in the next 8 hours`,
    `${Math.round(snapshot.current.humidity)}% humidity`,
  ];
  if (windy) reasons.push(`Gusts near ${Math.round(snapshot.current.gustMph)} mph`);

  return {
    headline,
    formula: [...new Set(formula)],
    scentTitle,
    scentNote,
    grooming: grooming.join(". ") + ".",
    carry,
    reasons,
    rainReady,
  };
}

export function weatherWardrobeContext(snapshot: WeatherSnapshot): WardrobeWeatherContext {
  return {
    temperatureF: Math.round(snapshot.current.feelsLikeF),
    rain: buildStyleBrief(snapshot).rainReady,
    location: snapshot.location.label,
    condition: weatherCondition(snapshot.current.weatherCode),
  };
}
