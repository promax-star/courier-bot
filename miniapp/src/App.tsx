import { useEffect, useState } from 'react'
import { clothesAdvice, fetchWeather, wmoIcon, type HourPoint, type Weather } from './lib/courier'

function tg() {
  const w = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void } } }).Telegram
  return w?.WebApp
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4 ${className}`}>
      <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">{title}</h2>
      {children}
    </section>
  )
}

export default function App() {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [hours, setHours] = useState<HourPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    tg()?.ready()
    tg()?.expand()
    fetchWeather()
      .then(({ now, hours }) => { setWeather(now); setHours(hours) })
      .catch((e) => setError(String(e)))
  }, [])

  const maxRate = Math.max(...hours.map((h) => h.rateHigh), 1)

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans px-4 pt-6 pb-10 max-w-md mx-auto">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🛴 Курьер-дашборд</h1>
          <p className="text-sm text-zinc-500">Новосибирск, Заельцовский</p>
        </div>
        <button
          onClick={() => { setError(null); setWeather(null); fetchWeather().then(({ now, hours }) => { setWeather(now); setHours(hours) }).catch((e) => setError(String(e))) }}
          className="text-zinc-500 hover:text-zinc-200 text-sm px-3 py-1.5 rounded-full border border-zinc-800"
        >
          Обновить
        </button>
      </header>

      {error && (
        <div className="rounded-xl bg-red-950/60 border border-red-900 p-4 mb-4 text-sm">
          Не удалось загрузить погоду: {error}
        </div>
      )}

      {!weather && !error && <p className="text-zinc-500 animate-pulse">Загружаю погоду…</p>}

      {weather && (
        <div className="space-y-4">
          <Card title="Сейчас">
            <div className="flex items-center gap-4">
              <span className="text-5xl">{wmoIcon(weather.code)}</span>
              <div>
                <div className="text-3xl font-bold">{Math.round(weather.temp)}° <span className="text-base font-normal text-zinc-500">ощущается {Math.round(weather.feels)}°</span></div>
                <div className="text-sm text-zinc-400">{weather.desc} · 💨 {Math.round(weather.wind)} м/с · 🌧 {weather.rainProb}%</div>
              </div>
            </div>
          </Card>

          <Card title="Ставка на ближайшие 12 часов">
            <div className="flex items-end gap-1 h-32 mb-3">
              {hours.map((h) => (
                <div key={h.time} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-emerald-700 to-emerald-400 min-h-1"
                    style={{ height: `${(h.rateHigh / maxRate) * 100}%` }}
                  />
                  <div className="absolute -top-9 hidden group-hover:block bg-zinc-800 text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                    {h.rateLow}–{h.rateHigh} ₽
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-1 text-[10px] text-zinc-500 mb-2">
              {hours.map((h) => (
                <div key={h.time} className="flex-1 text-center">{h.hourLabel}</div>
              ))}
            </div>
            <div className="text-sm">
              <span className="text-zinc-500">Ближайший час: </span>
              <span className="font-bold text-emerald-400">~{hours[0]?.rateLow}–{hours[0]?.rateHigh} ₽/час</span>
              {hours[0]?.reasons.length ? (
                <span className="text-zinc-500"> ({hours[0].reasons.join(', ')})</span>
              ) : (
                <span className="text-zinc-500"> — обычный спрос</span>
              )}
            </div>
          </Card>

          <Card title="Что надеть">
            <ul className="space-y-2 text-sm leading-snug">
              {clothesAdvice(weather).map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <footer className="mt-8 text-center text-xs text-zinc-600">
        Погода: Open-Meteo · обновляется автоматически каждые 15 мин ботом
      </footer>
    </main>
  )
}
