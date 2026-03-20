'use client'
import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

function RainCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const drops: { x: number; y: number; speed: number; length: number; opacity: number }[] = []
    for (let i = 0; i < 80; i++) {
      drops.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 2 + Math.random() * 3,
        length: 8 + Math.random() * 12,
        opacity: 0.08 + Math.random() * 0.15,
      })
    }

    let frame: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drops.forEach(drop => {
        ctx.beginPath()
        ctx.moveTo(drop.x, drop.y)
        ctx.lineTo(drop.x - 1, drop.y + drop.length)
        ctx.strokeStyle = `rgba(106,138,154,${drop.opacity})`
        ctx.lineWidth = 0.8
        ctx.stroke()
        drop.y += drop.speed
        if (drop.y > canvas.height) {
          drop.y = -drop.length
          drop.x = Math.random() * canvas.width
        }
      })
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [active])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}

export default function HeroSection({ isRainy }: { isRainy: boolean }) {
  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      padding: '60px 20px',
    }}>
      {/* 背景渐变 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 80% 60% at 50% 30%, rgba(74,110,82,0.07) 0%, transparent 70%),
          radial-gradient(ellipse 50% 40% at 20% 80%, rgba(106,138,154,0.05) 0%, transparent 60%)
        `,
      }} />

      {/* 雨效果 */}
      <RainCanvas active={isRainy} />

      {/* 装饰竹子 */}
      {[-1, 1].map(side => (
        <motion.div
          key={side}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.2, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute',
            [side === -1 ? 'left' : 'right']: '8%',
            bottom: 0,
            width: '3px',
            height: '55vh',
            background: 'linear-gradient(to top, var(--moss) 0%, var(--moss-light) 60%, transparent 100%)',
            opacity: 0.12,
            transformOrigin: 'bottom center',
            animation: `sway${side} ${6 + side}s ease-in-out infinite`,
          }}
        />
      ))}

      {/* 主内容 */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: '700px' }}>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '12px', letterSpacing: '6px', color: 'var(--moss)', marginBottom: '20px', textTransform: 'uppercase' }}
        >
          浙江 · 衢州 · 2025 清明
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="font-calligraphy"
          style={{
            fontSize: 'clamp(80px, 16vw, 130px)',
            lineHeight: 1,
            color: 'var(--ink)',
            marginBottom: '8px',
            letterSpacing: '8px',
          }}
        >
          衢<span style={{ color: 'var(--moss)' }}>州</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.7 }}
          style={{
            fontFamily: 'Noto Serif SC, serif',
            fontSize: 'clamp(16px, 3.5vw, 24px)',
            color: 'var(--ink-muted)',
            letterSpacing: '10px',
            marginBottom: '32px',
          }}
        >
          清 明 踏 青 攻 略
        </motion.p>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          style={{ width: '60px', height: '1px', background: 'var(--moss-light)', margin: '0 auto 28px' }}
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.7 }}
          style={{
            fontSize: '14px',
            color: 'var(--ink-muted)',
            lineHeight: 2,
            letterSpacing: '1.5px',
            maxWidth: '360px',
            margin: '0 auto',
          }}
        >
          {isRainy ? '烟雨蒙蒙，正是江南清明时' : '春光明媚，踏青衢州山水间'}<br />
          三衢道中，芳草鲜美，落英缤纷
        </motion.p>
      </div>

      {/* 红色印章 */}
      <motion.div
        initial={{ opacity: 0, rotate: -15 }}
        animate={{ opacity: 0.65, rotate: -10 }}
        transition={{ delay: 1.4, duration: 0.6 }}
        style={{
          position: 'absolute', right: '14%', top: '22%',
          width: '68px', height: '68px',
          border: '2px solid var(--seal)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: 'rotate(-10deg)',
        }}
      >
        <span className="font-calligraphy" style={{ fontSize: '11px', color: 'var(--seal)', textAlign: 'center', lineHeight: 1.5, letterSpacing: '1px' }}>
          清明<br />踏青
        </span>
      </motion.div>

      {/* 向下提示 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 0.8 }}
        style={{
          position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        }}
      >
        <span style={{ fontSize: '10px', color: 'var(--ink-muted)', letterSpacing: '4px' }}>向下探索</span>
        <motion.div
          animate={{ scaleY: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: '1px', height: '40px',
            background: 'linear-gradient(to bottom, var(--moss-light), transparent)',
            transformOrigin: 'top center',
          }}
        />
      </motion.div>

      <style>{`
        @keyframes sway-1 { 0%,100%{transform:rotate(-1deg)} 50%{transform:rotate(1.5deg)} }
        @keyframes sway1 { 0%,100%{transform:rotate(1deg)} 50%{transform:rotate(-1.5deg)} }
      `}</style>
    </div>
  )
}
