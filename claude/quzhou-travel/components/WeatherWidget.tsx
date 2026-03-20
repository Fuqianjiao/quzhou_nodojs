'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface WeatherData {
  condition: 'sunny' | 'cloudy' | 'rainy' | 'misty'
  temp: number
  desc: string
  icon: string
}

function getSeasonalWeather(): WeatherData {
  const hour = new Date().getHours()
  const rand = Math.random()
  // 清明时节多阴雨，模拟真实概率
  if (rand < 0.45) return { condition: 'rainy', temp: 14 + Math.floor(Math.random()*4), desc: '烟雨蒙蒙', icon: '🌧' }
  if (rand < 0.65) return { condition: 'misty', temp: 16 + Math.floor(Math.random()*3), desc: '薄雾轻笼', icon: '🌫' }
  if (rand < 0.82) return { condition: 'cloudy', temp: 17 + Math.floor(Math.random()*4), desc: '云淡风轻', icon: '⛅' }
  return { condition: 'sunny', temp: 19 + Math.floor(Math.random()*4), desc: '春光明媚', icon: '🌤' }
}

export default function WeatherWidget({ onRainy }: { onRainy: (r: boolean) => void }) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const w = getSeasonalWeather()
    setWeather(w)
    onRainy(w.condition === 'rainy' || w.condition === 'misty')
  }, [])

  if (!weather) return null

  const isRainy = weather.condition === 'rainy' || weather.condition === 'misty'

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.5 }}
      className="relative"
    >
      <motion.button
        onClick={() => setExpanded(!expanded)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.7)',
          borderRadius: '20px',
          boxShadow: '0 2px 12px rgba(28,28,26,0.06)',
          cursor: 'pointer',
          fontSize: '13px',
          color: 'var(--ink-light)',
          letterSpacing: '0.5px',
          fontFamily: 'Noto Sans SC, sans-serif',
        }}
      >
        <span style={{ fontSize: '18px' }}>{weather.icon}</span>
        <span style={{ fontFamily: 'Noto Serif SC, serif' }}>{weather.temp}°</span>
        <span style={{ color: 'var(--ink-muted)', fontSize: '12px' }}>衢州</span>
        {isRainy && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              fontSize: '10px',
              padding: '2px 7px',
              background: 'rgba(106,138,154,0.15)',
              color: 'var(--rain-blue)',
              borderRadius: '10px',
              letterSpacing: '1px',
            }}
          >
            色温已调冷
          </motion.span>
        )}
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              minWidth: '180px',
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.8)',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 8px 32px rgba(28,28,26,0.1)',
              zIndex: 100,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>{weather.icon}</div>
              <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '22px', color: 'var(--ink)', marginBottom: '4px' }}>
                {weather.temp}°C
              </div>
              <div style={{ fontSize: '13px', color: 'var(--moss)', letterSpacing: '2px', marginBottom: '12px' }}>
                {weather.desc}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--ink-muted)', letterSpacing: '1px', borderTop: '1px solid var(--paper-deep)', paddingTop: '10px' }}>
                衢州 · 清明时节
              </div>
              {isRainy && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--rain-blue)', letterSpacing: '1px' }}>
                  阴雨天 · 色温 -5%
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
