'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const POEMS = [
  { text: '渐行渐远渐无书，水阔鱼沉何处问', author: '欧阳修《木兰花》' },
  { text: '三衢道中，芳草鲜美，落英缤纷', author: '改自陶渊明《桃花源记》' },
  { text: '清明时节雨纷纷，路上行人欲断魂', author: '杜牧《清明》' },
  { text: '春城无处不飞花，寒食东风御柳斜', author: '韩翃《寒食》' },
  { text: '独怜幽草涧边生，上有黄鹂深树鸣', author: '韦应物《滁州西涧》' },
  { text: '绿树村边合，青山郭外斜', author: '孟浩然《过故人庄》' },
  { text: '迟日江山丽，春风花草香', author: '杜甫《绝句》' },
]

// 手绘风柳树 SVG
function WillowTree() {
  return (
    <svg width="120" height="160" viewBox="0 0 120 160" fill="none" style={{ opacity: 0.55 }}>
      {/* 树干 */}
      <motion.path
        d="M60 155 Q58 120 60 80 Q62 60 60 40"
        stroke="#5a7a4a"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* 柳枝们 */}
      {[
        { d: "M60 50 Q40 70 30 100 Q28 110 32 115", delay: 0 },
        { d: "M60 55 Q45 75 38 108 Q36 118 40 120", delay: 0.1 },
        { d: "M60 48 Q80 68 90 98 Q92 108 88 112", delay: 0.2 },
        { d: "M60 52 Q75 72 82 105 Q84 115 80 118", delay: 0.15 },
        { d: "M60 60 Q50 80 44 112 Q42 122 46 124", delay: 0.25 },
        { d: "M60 58 Q70 78 76 110 Q78 120 74 122", delay: 0.05 },
        { d: "M60 65 Q42 82 35 115 Q33 125 37 127", delay: 0.3 },
        { d: "M60 63 Q78 80 85 112 Q87 122 83 124", delay: 0.18 },
      ].map((branch, i) => (
        <motion.path
          key={i}
          d={branch.d}
          stroke="#6a9272"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          animate={{ rotate: [-1.5, 2, -1.5] }}
          transition={{ duration: 3 + i * 0.3, delay: branch.delay, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '60px 50px' }}
        />
      ))}
      {/* 叶片点缀 */}
      {[
        [32, 114], [40, 119], [88, 111], [80, 117], [46, 123], [74, 121], [37, 126], [83, 123]
      ].map(([x, y], i) => (
        <motion.ellipse
          key={`leaf-${i}`}
          cx={x} cy={y} rx="3" ry="5"
          fill="#8aaa72"
          opacity="0.7"
          animate={{ rotate: [-3, 3, -3], y: [-1, 1, -1] }}
          transition={{ duration: 2.5 + i * 0.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: `${x}px ${y - 5}px` }}
        />
      ))}
    </svg>
  )
}

export default function Footer() {
  const [poem, setPoem] = useState(POEMS[0])

  useEffect(() => {
    setPoem(POEMS[Math.floor(Math.random() * POEMS.length)])
  }, [])

  return (
    <footer style={{
      position: 'relative',
      zIndex: 1,
      borderTop: '1px solid var(--paper-deep)',
      padding: '60px 24px 40px',
      overflow: 'hidden',
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'flex-end', gap: '48px' }}>

        {/* 柳树 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          style={{ flexShrink: 0 }}
        >
          <WillowTree />
        </motion.div>

        {/* 诗词 */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
          style={{ flex: 1, paddingBottom: '16px' }}
        >
          <div style={{
            fontFamily: 'Noto Serif SC, serif',
            fontSize: 'clamp(16px, 2.5vw, 22px)',
            color: 'var(--ink-light)',
            letterSpacing: '4px',
            lineHeight: 1.8,
            marginBottom: '12px',
          }}>
            「{poem.text}」
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ink-muted)', letterSpacing: '2px' }}>
            —— {poem.author}
          </div>
        </motion.div>

        {/* 印章区 */}
        <motion.div
          initial={{ opacity: 0, rotate: -10 }}
          whileInView={{ opacity: 0.5, rotate: -8 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.6 }}
          style={{
            flexShrink: 0,
            width: '64px', height: '64px',
            border: '2px solid var(--seal)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: 'rotate(-8deg)',
          }}
        >
          <span className="font-calligraphy" style={{ fontSize: '11px', color: 'var(--seal)', textAlign: 'center', lineHeight: 1.4, letterSpacing: '1px' }}>
            清明<br/>踏青
          </span>
        </motion.div>
      </div>

      {/* 底部版权 */}
      <div style={{ textAlign: 'center', marginTop: '48px', fontSize: '11px', color: 'var(--ink-muted)', letterSpacing: '3px', opacity: 0.6 }}>
        衢州 · 清明踏青攻略 · 愿你此行春光正好
      </div>
    </footer>
  )
}
