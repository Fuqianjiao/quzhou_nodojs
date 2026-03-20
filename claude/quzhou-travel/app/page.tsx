'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import { getUser } from '@/lib/config'

const HeroSection    = dynamic(() => import('@/components/HeroSection'),    { ssr: false })
const WeatherWidget  = dynamic(() => import('@/components/WeatherWidget'),  { ssr: false })
const PhotoWall      = dynamic(() => import('@/components/PhotoWall'),      { ssr: false })
const RouteSection   = dynamic(() => import('@/components/RouteSection'),   { ssr: false })
const HomestaySection= dynamic(() => import('@/components/HomestaySection'),{ ssr: false })
const Footer         = dynamic(() => import('@/components/Footer'),         { ssr: false })
const SettingsPanel  = dynamic(() => import('@/components/SettingsPanel'),  { ssr: false })
const WelcomeScreen  = dynamic(() => import('@/components/WelcomeScreen'),  { ssr: false })

export default function Home() {
  const [isRainy, setIsRainy]       = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [ready, setReady]           = useState(false)
  const [user, setUser]             = useState<{ name: string; avatar: string } | null>(null)

  useEffect(() => {
    const u = getUser()
    if (!u) {
      setShowWelcome(true)
    } else {
      setUser(u)
    }
    setReady(true)
  }, [])

  const handleWelcomeDone = () => {
    const u = getUser()
    setUser(u)
    setShowWelcome(false)
  }

  if (!ready) return null

  return (
    <>
      {/* 欢迎屏 */}
      <AnimatePresence>
        {showWelcome && <WelcomeScreen onDone={handleWelcomeDone} />}
      </AnimatePresence>

      {/* 主页面 */}
      <main style={{
        filter: isRainy ? 'saturate(0.93) hue-rotate(6deg)' : 'none',
        transition: 'filter 1.5s ease',
        position: 'relative', zIndex: 1,
      }}>
        {/* 右上角工具栏 */}
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 200, display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* 用户身份展示 */}
          {user && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '6px 12px 6px 6px',
                background: 'rgba(255,255,255,0.55)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.7)',
                borderRadius: '20px',
                boxShadow: '0 2px 12px rgba(28,28,26,0.06)',
                cursor: 'pointer',
              }}
              onClick={() => setShowWelcome(true)}
              title="点击重设身份"
            >
              <img src={user.avatar} alt={user.name}
                style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--moss-pale)' }} />
              <span style={{ fontSize: '13px', color: 'var(--ink-light)', letterSpacing: '0.5px', fontFamily: 'Noto Serif SC, serif', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name}
              </span>
            </motion.div>
          )}
          <SettingsPanel />
          <WeatherWidget onRainy={setIsRainy} />
        </div>

        {/* 浮动导航点 */}
        <FloatNav />

        <HeroSection isRainy={isRainy} />
        <div className="divider" style={{ background: 'linear-gradient(to right, transparent, var(--paper-deep), transparent)', height: '1px', position: 'relative', zIndex: 1 }} />
        <PhotoWall />
        <div style={{ background: 'linear-gradient(to right, transparent, var(--paper-deep), transparent)', height: '1px', position: 'relative', zIndex: 1 }} />
        <RouteSection />
        <div style={{ background: 'linear-gradient(to right, transparent, var(--paper-deep), transparent)', height: '1px', position: 'relative', zIndex: 1 }} />
        <HomestaySection />
        <Footer />
      </main>
    </>
  )
}

function FloatNav() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 1.8 }}
      style={{
        position: 'fixed', right: '20px', top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: '10px',
        zIndex: 100,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <button
          key={i}
          onClick={() => window.scrollTo({ top: i * window.innerHeight * 1.2, behavior: 'smooth' })}
          style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--paper-deep)', border: 'none',
            cursor: 'pointer', transition: 'all 0.3s ease', padding: 0,
          }}
          onMouseEnter={e => { const b = e.target as HTMLButtonElement; b.style.background = 'var(--moss)'; b.style.transform = 'scale(1.6)' }}
          onMouseLeave={e => { const b = e.target as HTMLButtonElement; b.style.background = 'var(--paper-deep)'; b.style.transform = 'scale(1)' }}
        />
      ))}
    </motion.div>
  )
}
