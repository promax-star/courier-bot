// Логика курьерского дашборда: погода, прогноз ставки, советы по одежде.
// Зеркало логики courier_bot.py (rate_advice / clothes_advice).

export const BASE_RATE = 250 // ₽/час — база платформы

export const CITY = { name: 'Новосибирск, Заельцовский', lat: 55.05, lon: 82.92 }

export interface Weather {
  temp: number
  feels: number
  wind: number
  code: number
  desc: string
  rainProb: number
}

export interface HourPoint {
  time: string
  hourLabel: string
  feels: number
  code: number
  rainProb: number
  rateLow: number
  rateHigh: number
  reasons: string[]
}

export const WMO: Record<number, string> = {
  0: 'Ясно', 1: 'В основном ясно', 2: 'Переменная облачность', 3: 'Пасмурно',
  45: 'Туман', 48: 'Изморозь',
  51: 'Морось', 53: 'Морось', 55: 'Сильная морось',
  56: 'Ледяная морось', 57: 'Сильная ледяная морось',
  61: 'Небольшой дождь', 63: 'Дождь', 65: 'Сильный дождь',
  66: 'Ледяной дождь', 67: 'Сильный ледяной дождь',
  71: 'Небольшой снег', 73: 'Снег', 75: 'Сильный снег', 77: 'Снежные зёрна',
  80: 'Ливень', 81: 'Ливень', 82: 'Сильный ливень',
  85: 'Снежный ливень', 86: 'Сильный снежный ливень',
  95: 'Гроза', 96: 'Гроза с градом', 99: 'Сильная гроза с градом',
}

export const RAINY = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])
export const SNOWY = new Set([71, 73, 75, 77, 85, 86, 48])

export function wmoIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code === 1 || code === 2) return '⛅'
  if (code === 3 || code === 45 || code === 48) return '☁️'
  if (SNOWY.has(code)) return '🌨'
  if (code >= 95) return '⛈'
  return '🌧'
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number
    apparent_temperature: number
    weather_code: number
    wind_speed_10m: number
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
    apparent_temperature: number[]
    weather_code: number[]
    wind_speed_10m: number[]
    precipitation_probability: number[]
  }
}

export async function fetchWeather(): Promise<{ now: Weather; hours: HourPoint[] }> {
  const params = new URLSearchParams({
    latitude: String(CITY.lat),
    longitude: String(CITY.lon),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation_probability',
    forecast_days: '2',
    timezone: 'auto',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo: ${res.status}`)
  const data: OpenMeteoResponse = await res.json()

  const now: Weather = {
    temp: data.current.temperature_2m,
    feels: data.current.apparent_temperature,
    wind: data.current.wind_speed_10m,
    code: data.current.weather_code,
    desc: WMO[data.current.weather_code] ?? 'Погода неизвестная',
    rainProb: Math.max(...data.hourly.precipitation_probability.slice(0, 2)),
  }

  // ближайшие 12 часов, начиная со следующего
  const hours: HourPoint[] = data.hourly.time.slice(1, 13).map((t, i) => {
    const idx = i + 1
    const { low, high, reasons } = rateFor(
      new Date(t),
      data.hourly.apparent_temperature[idx],
      data.hourly.weather_code[idx],
    )
    return {
      time: t,
      hourLabel: t.slice(11, 16),
      feels: Math.round(data.hourly.apparent_temperature[idx]),
      code: data.hourly.weather_code[idx],
      rainProb: data.hourly.precipitation_probability[idx],
      rateLow: low,
      rateHigh: high,
      reasons,
    }
  })

  return { now, hours }
}

function rateFor(when: Date, feels: number, code: number) {
  let mult = 1
  const reasons: string[] = []
  if ([65, 82, 67, 95, 96, 99].includes(code)) { mult += 0.45; reasons.push('сильный дождь/гроза +45%') }
  else if ([61, 63, 80, 81, 51, 53, 55, 56, 66].includes(code)) { mult += 0.3; reasons.push('дождь +30%') }
  if (SNOWY.has(code)) { mult += 0.4; reasons.push('снег +40%') }
  if (feels <= -15) { mult += 0.5; reasons.push('мороз ниже −15 +50%') }
  else if (feels <= -5) { mult += 0.25; reasons.push('холод +25%') }
  const weekday = when.getDay() // 0 = вс
  const hour = when.getHours()
  if ((weekday === 5 && hour >= 17) || weekday === 6 || weekday === 0) {
    mult += 0.2; reasons.push('пятничный вечер/выходные +20%')
  } else if (hour >= 18 || hour <= 10) {
    mult += 0.1; reasons.push('вечер/утро +10%')
  }
  const round10 = (x: number) => Math.round(x / 10) * 10
  return {
    low: round10(BASE_RATE * mult),
    high: round10(BASE_RATE * mult * 1.15),
    reasons,
  }
}

export function clothesAdvice(w: Weather): string[] {
  const tips: string[] = []
  const feels = w.feels
  if (feels <= -20) tips.push('🥶 Термобельё + флиска + зимняя куртка, две пары перчаток, балаклава. Бери термос.')
  else if (feels <= -10) tips.push('🧊 Термобельё или флиска под куртку, перчатки, шапка, шарф на лицо.')
  else if (feels <= 0) tips.push('🧥 Тёплая куртка, шапка, перчатки — руки мёрзнут первыми.')
  else if (feels <= 8) tips.push('🎽 Демисезонная куртка, под ней кофта.')
  else if (feels <= 20) tips.push('👕 Кофта или худи — на движении снимешь.')
  else tips.push('🥵 Футболка, кепка, бери воды.')
  if (RAINY.has(w.code)) {
    if (w.rainProb >= 60) tips.push(`🌧 Вероятность дождя ${w.rainProb}% — непромокаемая куртка и чехол на сумку.`)
    else tips.push('🌦 Может накрапывать — закинь дождевик.')
    if (w.code >= 95) tips.push('⚡ Гроза: аккуратнее на дороге.')
  }
  if (SNOWY.has(w.code)) tips.push('❄ Непромокаемая обувь, чехол на рюкзак.')
  if (w.wind >= 10) tips.push(`💨 Ветер ${Math.round(w.wind)} м/с — ветровка сверху.`)
  return tips
}
