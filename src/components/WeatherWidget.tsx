import { useState, useEffect } from "react";
import { Cloud, Sun, CloudRain, CloudSnow, Wind, Droplets, Eye, CloudLightning } from "lucide-react";
import weatherSunny from "@/assets/weather-sunny.jpg";
import weatherPartlyCloudy from "@/assets/weather-partly-cloudy.jpg";
import weatherCloudy from "@/assets/weather-cloudy.jpg";
import weatherRainy from "@/assets/weather-rainy.jpg";
import weatherSnowy from "@/assets/weather-snowy.jpg";
import weatherStormy from "@/assets/weather-stormy.jpg";

type WeatherType = "sunny" | "partly-cloudy" | "cloudy" | "rainy" | "snowy" | "stormy";

interface WeatherData {
  location: string;
  temp: number;
  feelsLike: number;
  condition: string;
  icon: WeatherType;
  humidity: number;
  wind: number;
  visibility: number;
  forecast: { day: string; high: number; low: number; icon: WeatherType }[];
}

const weatherIcons: Record<string, typeof Sun> = {
  sunny: Sun,
  "partly-cloudy": Cloud,
  cloudy: Cloud,
  rainy: CloudRain,
  snowy: CloudSnow,
  stormy: CloudLightning,
};

const weatherBackgrounds: Record<WeatherType, string> = {
  sunny: weatherSunny,
  "partly-cloudy": weatherPartlyCloudy,
  cloudy: weatherCloudy,
  rainy: weatherRainy,
  snowy: weatherSnowy,
  stormy: weatherStormy,
};

const WMO_TO_TYPE: Record<number, { type: WeatherType; label: string }> = {
  0: { type: "sunny", label: "Despejado" },
  1: { type: "sunny", label: "Mayormente despejado" },
  2: { type: "partly-cloudy", label: "Parcialmente nublado" },
  3: { type: "cloudy", label: "Nublado" },
  45: { type: "cloudy", label: "Niebla" },
  48: { type: "cloudy", label: "Niebla escarchada" },
  51: { type: "rainy", label: "Llovizna ligera" },
  53: { type: "rainy", label: "Llovizna" },
  55: { type: "rainy", label: "Llovizna intensa" },
  61: { type: "rainy", label: "Lluvia ligera" },
  63: { type: "rainy", label: "Lluvia" },
  65: { type: "rainy", label: "Lluvia intensa" },
  71: { type: "snowy", label: "Nieve ligera" },
  73: { type: "snowy", label: "Nieve" },
  75: { type: "snowy", label: "Nieve intensa" },
  80: { type: "rainy", label: "Chubascos" },
  81: { type: "rainy", label: "Chubascos fuertes" },
  82: { type: "rainy", label: "Chubascos violentos" },
  85: { type: "snowy", label: "Nieve" },
  86: { type: "snowy", label: "Nieve intensa" },
  95: { type: "stormy", label: "Tormenta" },
  96: { type: "stormy", label: "Tormenta con granizo" },
  99: { type: "stormy", label: "Tormenta con granizo fuerte" },
};

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function getWmoInfo(code: number) {
  return WMO_TO_TYPE[code] || { type: "cloudy" as WeatherType, label: "Desconocido" };
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWeather() {
      try {
        // Get user location
        let lat = 40.4168; // Madrid default
        let lon = -3.7038;
        let city = "Madrid";

        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
          );
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;

          // Reverse geocode
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=&latitude=${lat}&longitude=${lon}&count=1&language=es`
          );
          // Use a simple approach - just show coordinates-based city
          try {
            const revRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`
            );
            const revData = await revRes.json();
            city = revData.address?.city || revData.address?.town || revData.address?.village || "Tu ubicación";
          } catch {
            city = "Tu ubicación";
          }
        } catch {
          // Use Madrid as default
        }

        // Fetch weather from Open-Meteo (free, no API key needed)
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`
        );
        const data = await res.json();

        const currentCode = data.current.weather_code;
        const currentInfo = getWmoInfo(currentCode);

        const forecast = data.daily.time.map((date: string, i: number) => {
          const d = new Date(date);
          const info = getWmoInfo(data.daily.weather_code[i]);
          return {
            day: i === 0 ? "Hoy" : DAY_NAMES[d.getDay()],
            high: Math.round(data.daily.temperature_2m_max[i]),
            low: Math.round(data.daily.temperature_2m_min[i]),
            icon: info.type,
          };
        });

        setWeather({
          location: city,
          temp: Math.round(data.current.temperature_2m),
          feelsLike: Math.round(data.current.apparent_temperature),
          condition: currentInfo.label,
          icon: currentInfo.type,
          humidity: Math.round(data.current.relative_humidity_2m),
          wind: Math.round(data.current.wind_speed_10m),
          visibility: Math.round((data.current.visibility || 10000) / 1000),
          forecast,
        });
      } catch (err) {
        console.error("Weather fetch error:", err);
        // Fallback
        setWeather({
          location: "Madrid",
          temp: 18,
          feelsLike: 16,
          condition: "Parcialmente nublado",
          icon: "partly-cloudy",
          humidity: 52,
          wind: 12,
          visibility: 10,
          forecast: [
            { day: "Hoy", high: 20, low: 12, icon: "partly-cloudy" },
            { day: "Mar", high: 22, low: 13, icon: "sunny" },
            { day: "Mié", high: 19, low: 11, icon: "cloudy" },
            { day: "Jue", high: 17, low: 10, icon: "rainy" },
            { day: "Vie", high: 21, low: 12, icon: "sunny" },
          ],
        });
      } finally {
        setLoading(false);
      }
    }

    fetchWeather();
  }, []);

  if (loading || !weather) {
    return (
      <div className="relative rounded-xl overflow-hidden h-full flex items-center justify-center glass-elevated min-h-[200px]">
        <div className="animate-pulse text-muted-foreground text-sm">Cargando tiempo...</div>
      </div>
    );
  }

  const MainIcon = weatherIcons[weather.icon] || Cloud;
  const bgImage = weatherBackgrounds[weather.icon] || weatherPartlyCloudy;

  return (
    <div className="relative rounded-xl overflow-hidden h-full flex flex-col glass-elevated">
      <div className="absolute inset-0">
        <img src={bgImage} alt="" className="w-full h-full object-cover" width={800} height={512} />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/40 to-background/20" />
      </div>

      <div className="relative z-10 p-4 flex flex-col h-full">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-bold text-foreground/80 uppercase tracking-wider drop-shadow-sm">
              {weather.location}
            </p>
            <div className="flex items-end gap-1.5 mt-1">
              <span className="text-3xl font-bold text-foreground leading-none drop-shadow-sm">
                {weather.temp}°
              </span>
              <span className="text-xs text-foreground/70 mb-1 drop-shadow-sm">
                Sensación {weather.feelsLike}°
              </span>
            </div>
            <p className="text-xs text-foreground/70 mt-0.5 drop-shadow-sm">{weather.condition}</p>
          </div>
          <div className="glass-subtle rounded-xl p-2">
            <MainIcon className="h-8 w-8 text-foreground/70" />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-foreground/80 mb-3">
          <span className="flex items-center gap-1 glass-subtle rounded-full px-2 py-1">
            <Droplets className="h-3 w-3" />
            {weather.humidity}%
          </span>
          <span className="flex items-center gap-1 glass-subtle rounded-full px-2 py-1">
            <Wind className="h-3 w-3" />
            {weather.wind} km/h
          </span>
          <span className="flex items-center gap-1 glass-subtle rounded-full px-2 py-1">
            <Eye className="h-3 w-3" />
            {weather.visibility} km
          </span>
        </div>

        <div className="flex-1 flex items-end">
          <div className="w-full glass-subtle rounded-xl p-3">
            <div className="flex justify-between w-full gap-1">
              {weather.forecast.map((day) => {
                const DayIcon = weatherIcons[day.icon] || Cloud;
                return (
                  <div key={day.day} className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px] text-foreground/70 font-medium">{day.day}</span>
                    <DayIcon className="h-3.5 w-3.5 text-foreground/70" />
                    <span className="text-[10px] font-semibold text-foreground">{day.high}°</span>
                    <span className="text-[10px] text-foreground/70">{day.low}°</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
