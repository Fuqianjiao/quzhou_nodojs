'use client'
import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { callSiliconFlow, getConfig } from '@/lib/config'

interface Stop {
  time: string
  name: string
  tag: string
  tagColor: string
  desc: string
}

interface Route {
  label: string
  en: string
  color: string
  mapKeyword: string
  stops: Stop[]
}

const DEFAULT_ROUTES: Route[] = [
  {
    label: '一日游', en: '1 Day', color: '#4a6e52', mapKeyword: '衢州江郎山廿八都',
    stops: [
      { time: '08:00', name: '廿八都古镇', tag: '历史文化', tagColor: '#7060a0', desc: '清晨薄雾漫步古镇，烟雨石板路，百年老宅静默守候。' },
      { time: '11:00', name: '江郎山', tag: '世界遗产', tagColor: '#4a6e52', desc: '三爿石拔地而起，春季山花烂漫，登顶俯瞰千里江山。' },
      { time: '13:00', name: '午餐 · 清明粿', tag: '特色美食', tagColor: '#b09050', desc: '衢州传统清明节食品，艾草清香，配辣椒炒肉一绝。' },
      { time: '15:00', name: '仙霞古道', tag: '徒步古道', tagColor: '#4a6e52', desc: '千年驿道，杜鹃烂漫，徒步约两小时，清幽至极。' },
      { time: '18:00', name: '南孔庙夜游', tag: '文化体验', tagColor: '#7060a0', desc: '孔子后裔南迁之地，夜晚华灯映古城，意境悠远。' },
    ]
  },
  {
    label: '二日游', en: '2 Days', color: '#6a9272', mapKeyword: '衢州南孔庙烂柯山',
    stops: [
      { time: 'Day1 上午', name: '南孔庙 · 古城', tag: '文化核心', tagColor: '#7060a0', desc: '清明祭祀活动，感受千年孔城文化氛围。' },
      { time: 'Day1 下午', name: '烂柯山', tag: '围棋仙地', tagColor: '#4a6e52', desc: '"山中方七日，世上已千年"典故发源地，天然石室，翠绿山林。' },
      { time: 'Day1 晚', name: '水亭街夜食', tag: '夜市美食', tagColor: '#b09050', desc: '水亭门历史街区，老字号小吃林立，霓虹倒映水中。' },
      { time: 'Day2 全天', name: '江郎山 + 廿八都', tag: '经典线路', tagColor: '#4a6e52', desc: '衢州最经典山水人文线，世界遗产与千年古镇的完美组合。' },
    ]
  },
  {
    label: '三日游', en: '3 Days', color: '#5a8a62', mapKeyword: '衢州开化钱江源',
    stops: [
      { time: 'Day1', name: '衢州城区深度游', tag: '历史文化', tagColor: '#7060a0', desc: '南孔庙、天王塔、水亭街、烂柯山，深挖衢州底蕴。' },
      { time: 'Day2 上午', name: '根宫佛国', tag: '根雕艺术', tagColor: '#b09050', desc: '世界最大根雕艺术景区，奇木异根，鬼斧神工。' },
      { time: 'Day2 下午', name: '钱江源国家公园', tag: '自然生态', tagColor: '#4a6e52', desc: '钱塘江源头，原始森林，清明踏青的极致之选。' },
      { time: 'Day3', name: '江郎山 + 廿八都 + 仙霞古道', tag: '经典三联', tagColor: '#4a6e52', desc: '山水人文全收录，最圆满的衢州收尾之旅。' },
    ]
  }
]

const TAG_COLORS: Record<string, string> = {
  '历史文化': '#7060a0', '世界遗产': '#4a6e52', '特色美食': '#b09050',
  '徒步古道': '#4a6e52', '文化体验': '#7060a0', '文化核心': '#7060a0',
  '围棋仙地': '#4a6e52', '夜市美食': '#b09050', '经典线路': '#4a6e52',
  '根雕艺术': '#b09050', '自然生态': '#4a6e52', '经典三联': '#4a6e52',
  'AI推荐': '#4a8ab0', '景点': '#4a6e52', '美食': '#b09050', '文化': '#7060a0',
}

export default function RouteSection() {
  const [active, setActive] = useState(0)
  const [routes, setRoutes] = useState<Route[]>(DEFAULT_ROUTES)
  const [savedRoutes, setSavedRoutes] = useState<Route[]>(DEFAULT_ROUTES)

  // 编辑模式
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Route[]>([])

  // AI 生成
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  // 地图全屏
  const [mapFullscreen, setMapFullscreen] = useState(false)

  const route = routes[active]

  useEffect(() => {
    if (!mapFullscreen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mapFullscreen])

  useEffect(() => {
    if (!mapFullscreen) return

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMapFullscreen(false)
      }
    }

    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [mapFullscreen])


  // ===== 进入编辑 =====
  const startEdit = () => {
    setEditDraft(JSON.parse(JSON.stringify(routes)))
    setEditing(true)
  }

  // ===== 保存编辑 =====
  const saveEdit = () => {
    setRoutes(editDraft)
    setSavedRoutes(editDraft)
    setEditing(false)
  }

  // ===== 取消编辑 =====
  const cancelEdit = () => {
    setEditDraft([])
    setEditing(false)
  }

  // ===== 编辑某个 stop 字段 =====
  const editStop = (routeIdx: number, stopIdx: number, field: keyof Stop, value: string) => {
    setEditDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next[routeIdx].stops[stopIdx][field] = value
      if (field === 'tag') {
        next[routeIdx].stops[stopIdx].tagColor = TAG_COLORS[value] || '#4a6e52'
      }
      return next
    })
  }

  // ===== 移动 stop 顺序 =====
  const moveStop = (routeIdx: number, stopIdx: number, dir: -1 | 1) => {
    setEditDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const stops = next[routeIdx].stops
      const target = stopIdx + dir
      if (target < 0 || target >= stops.length) return prev
      ;[stops[stopIdx], stops[target]] = [stops[target], stops[stopIdx]]
      return next
    })
  }

  // ===== 删除 stop =====
  const deleteStop = (routeIdx: number, stopIdx: number) => {
    setEditDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next[routeIdx].stops.splice(stopIdx, 1)
      return next
    })
  }

  // ===== 新增 stop =====
  const addStop = (routeIdx: number) => {
    setEditDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next[routeIdx].stops.push({ time: '待定', name: '新增景点', tag: '景点', tagColor: '#4a6e52', desc: '点击编辑描述…' })
      return next
    })
  }

  // ===== AI 生成路线 =====
  const generateAI = useCallback(async () => {
    const { siliconflowApiKey } = getConfig()
    if (!siliconflowApiKey) {
      setAiError('请先在右上角 ⚙️ 配置硅基流动 API Key')
      setTimeout(() => setAiError(''), 4000)
      return
    }
    setAiLoading(true)
    setAiError('')
    try {
      const prompt = `你是衢州旅游专家。请为清明节出行的游客设计一日游、二日游、三日游三套路线方案。
每套路线包含4-5个打卡点，按时间顺序排列。

严格按照如下JSON格式返回，不要有任何多余文字：
[
  {
    "label": "一日游",
    "stops": [
      {"time": "08:00", "name": "景点名", "tag": "分类标签", "desc": "两句话描述，突出清明时节特色"}
    ]
  },
  {"label": "二日游", "stops": [...]},
  {"label": "三日游", "stops": [...]}
]

tag 只能从以下选择：历史文化、世界遗产、特色美食、徒步古道、文化体验、围棋仙地、夜市美食、经典线路、根雕艺术、自然生态、景点、美食、文化`

      const raw = await callSiliconFlow(prompt, '你是专业的旅游攻略生成器，只输出纯JSON，不加markdown代码块，不加任何解释。')
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed: { label: string; stops: { time: string; name: string; tag: string; desc: string }[] }[] = JSON.parse(cleaned)

      const mapKeywords = ['衢州江郎山廿八都', '衢州南孔庙烂柯山', '衢州开化钱江源']
      const colors = ['#4a6e52', '#6a9272', '#5a8a62']

      const newRoutes: Route[] = parsed.slice(0, 3).map((r, i) => ({
        label: r.label,
        en: ['1 Day', '2 Days', '3 Days'][i],
        color: colors[i],
        mapKeyword: mapKeywords[i],
        stops: r.stops.map(s => ({
          time: s.time,
          name: s.name,
          tag: s.tag,
          tagColor: TAG_COLORS[s.tag] || '#4a6e52',
          desc: s.desc,
        }))
      }))

      setRoutes(newRoutes)
      setEditDraft(JSON.parse(JSON.stringify(newRoutes)))
      setEditing(true) // AI生成后直接进入编辑模式，方便微调
    } catch (e: unknown) {
      setAiError('AI 生成失败：' + ((e as Error).message || '未知错误'))
      setTimeout(() => setAiError(''), 5000)
    } finally {
      setAiLoading(false)
    }
  }, [])

  const displayRoutes = editing ? editDraft : routes

  return (
    <section style={{ padding: '80px 0' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>

        {/* 标题 + AI 按钮 */}
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
              <span className="font-calligraphy" style={{ fontSize: '52px', color: 'var(--paper-deep)', lineHeight: 1 }}>二</span>
              <div>
                <div style={{ fontSize: '11px', letterSpacing: '4px', color: 'var(--moss-light)', textTransform: 'uppercase', marginBottom: '4px' }}>Itinerary</div>
                <h2 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '3px' }}>推荐路线</h2>
              </div>
            </div>

            {/* AI 生成按钮 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {aiError && (
                <span style={{ fontSize: '12px', color: 'var(--seal)', letterSpacing: '0.5px' }}>{aiError}</span>
              )}
              {!editing && (
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={generateAI}
                  disabled={aiLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '9px 20px',
                    background: aiLoading ? 'var(--ink-muted)' : 'linear-gradient(135deg, #4a6e52, #6a9272)',
                    color: 'var(--paper)', border: 'none', borderRadius: '20px',
                    fontFamily: 'Noto Serif SC, serif', fontSize: '13px', letterSpacing: '2px',
                    cursor: aiLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 12px rgba(74,110,82,0.25)',
                  }}
                >
                  {aiLoading ? (
                    <>
                      <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-block' }}>✦</motion.span>
                      AI 生成中…
                    </>
                  ) : (
                    <> ✦ AI 重新规划路线</>
                  )}
                </motion.button>
              )}
              {!editing && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={startEdit}
                  style={{
                    padding: '9px 20px',
                    background: 'rgba(255,255,255,0.6)',
                    backdropFilter: 'blur(8px)',
                    color: 'var(--ink-muted)', border: '1px solid var(--paper-deep)',
                    borderRadius: '20px', fontFamily: 'Noto Serif SC, serif',
                    fontSize: '13px', letterSpacing: '2px', cursor: 'pointer',
                  }}
                >
                  ✎ 手动编辑
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Tab */}
        <div style={{ display: 'flex', marginBottom: '40px', borderBottom: '1px solid var(--paper-deep)' }}>
          {displayRoutes.map((r, i) => (
            <button key={i} onClick={() => setActive(i)} style={{
              padding: '12px 32px', fontFamily: 'Noto Serif SC, serif', fontSize: '14px',
              letterSpacing: '2px', cursor: 'pointer', background: 'none', border: 'none',
              borderBottom: `2px solid ${active === i ? r.color : 'transparent'}`,
              color: active === i ? r.color : 'var(--ink-muted)',
              transition: 'all 0.25s ease', marginBottom: '-1px',
            }}>
              {r.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'start' }}>

          {/* 左：步骤条 */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${active}-${editing}`}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.3 }}
            >
              <div style={{ position: 'relative', paddingLeft: '36px' }}>
                <div style={{
                  position: 'absolute', left: '10px', top: '8px', bottom: '20px',
                  width: '1px',
                  background: `linear-gradient(to bottom, ${displayRoutes[active]?.color || '#4a6e52'}, transparent)`,
                }} />

                {displayRoutes[active]?.stops.map((stop, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    style={{
                      position: 'relative', marginBottom: '24px',
                      padding: editing ? '12px 12px 12px 0' : '0',
                      borderRadius: editing ? '8px' : '0',
                      background: editing ? 'rgba(255,255,255,0.35)' : 'transparent',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {/* 圆点 */}
                    <div style={{
                      position: 'absolute', left: editing ? '-24px' : '-30px', top: '5px',
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: displayRoutes[active].color,
                      border: '2px solid var(--paper)',
                      boxShadow: `0 0 0 3px ${displayRoutes[active].color}22`,
                    }} />

                    {/* 编辑模式 */}
                    {editing ? (
                      <div>
                        {/* 排序控件 */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginBottom: '8px' }}>
                          <button onClick={() => moveStop(active, i, -1)} disabled={i === 0}
                            style={{ padding: '2px 8px', fontSize: '12px', background: 'rgba(255,255,255,0.7)', border: '1px solid var(--paper-deep)', borderRadius: '4px', cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                          <button onClick={() => moveStop(active, i, 1)} disabled={i === displayRoutes[active].stops.length - 1}
                            style={{ padding: '2px 8px', fontSize: '12px', background: 'rgba(255,255,255,0.7)', border: '1px solid var(--paper-deep)', borderRadius: '4px', cursor: i === displayRoutes[active].stops.length - 1 ? 'not-allowed' : 'pointer', opacity: i === displayRoutes[active].stops.length - 1 ? 0.4 : 1 }}>↓</button>
                          <button onClick={() => deleteStop(active, i)}
                            style={{ padding: '2px 8px', fontSize: '12px', background: 'rgba(176,48,48,0.08)', border: '1px solid rgba(176,48,48,0.2)', borderRadius: '4px', cursor: 'pointer', color: 'var(--seal)' }}>删除</button>
                        </div>
                        {/* 时间 */}
                        <input value={stop.time} onChange={e => editStop(active, i, 'time', e.target.value)}
                          style={{ fontSize: '11px', color: displayRoutes[active].color, letterSpacing: '2px', marginBottom: '4px', background: 'none', border: 'none', borderBottom: '1px dashed var(--paper-deep)', outline: 'none', width: '100%', fontFamily: 'Noto Sans SC, sans-serif', padding: '2px 0' }} />
                        {/* 名称 */}
                        <input value={stop.name} onChange={e => editStop(active, i, 'name', e.target.value)}
                          style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '1px', color: 'var(--ink)', marginBottom: '6px', background: 'none', border: 'none', borderBottom: '1px dashed var(--paper-deep)', outline: 'none', width: '100%', fontFamily: 'Noto Serif SC, serif', padding: '2px 0' }} />
                        {/* 标签 */}
                        <input value={stop.tag} onChange={e => editStop(active, i, 'tag', e.target.value)}
                          style={{ fontSize: '10px', letterSpacing: '1px', padding: '2px 8px', borderRadius: '3px', background: `${stop.tagColor}18`, color: stop.tagColor, border: `1px dashed ${stop.tagColor}40`, outline: 'none', marginBottom: '6px', fontFamily: 'Noto Sans SC, sans-serif', width: 'auto' }} />
                        {/* 描述 */}
                        <textarea value={stop.desc} onChange={e => editStop(active, i, 'desc', e.target.value)}
                          rows={2}
                          style={{ fontSize: '13px', color: 'var(--ink-muted)', lineHeight: '1.8', letterSpacing: '0.5px', background: 'rgba(255,255,255,0.4)', border: '1px dashed var(--paper-deep)', borderRadius: '4px', outline: 'none', width: '100%', resize: 'none', padding: '6px 8px', fontFamily: 'Noto Sans SC, sans-serif' }} />
                      </div>
                    ) : (
                      // 展示模式
                      <div>
                        <div style={{ fontSize: '11px', color: displayRoutes[active].color, letterSpacing: '2px', marginBottom: '3px' }}>{stop.time}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                          <h3 style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '1px', color: 'var(--ink)' }}>{stop.name}</h3>
                          <span style={{ padding: '2px 9px', fontSize: '10px', borderRadius: '3px', letterSpacing: '1px', background: `${stop.tagColor}18`, color: stop.tagColor }}>{stop.tag}</span>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--ink-muted)', lineHeight: '1.8', letterSpacing: '0.5px' }}>{stop.desc}</p>
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* 编辑模式：新增按钮 */}
                {editing && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => addStop(active)}
                    style={{
                      marginLeft: '-36px', padding: '8px 20px',
                      background: 'rgba(74,110,82,0.08)',
                      border: '1px dashed var(--moss-pale)',
                      borderRadius: '6px', cursor: 'pointer',
                      fontSize: '12px', color: 'var(--moss)',
                      letterSpacing: '2px', fontFamily: 'Noto Serif SC, serif',
                      width: 'calc(100% + 36px)',
                    }}
                  >
                    + 新增打卡点
                  </motion.button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* 右：地图 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            style={{
              position: 'sticky', top: '100px',
              background: 'rgba(255,255,255,0.5)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.7)',
              borderRadius: '12px',
              boxShadow: '0 4px 24px rgba(28,28,26,0.08)',
              overflow: 'hidden',
            }}
          >
            {/* 地图头部 */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--paper-deep)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: route.color }} />
                <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '13px', letterSpacing: '2px', color: 'var(--ink)' }}>
                  {route.label}路线 · 衢州
                </span>
              </div>
              {/* 放大按钮 */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setMapFullscreen(true)}
                title="全屏查看地图"
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 12px',
                  background: 'rgba(255,255,255,0.7)',
                  border: '1px solid var(--paper-deep)',
                  borderRadius: '5px',
                  fontSize: '11px', color: 'var(--ink-muted)',
                  letterSpacing: '1px', cursor: 'pointer',
                  fontFamily: 'Noto Sans SC, sans-serif',
                }}
              >
                <span style={{ fontSize: '13px' }}>⛶</span> 全屏
              </motion.button>
            </div>

            {/* 地图容器 */}
            <div
              style={{ position: 'relative', height: '400px', background: 'var(--paper-warm)', overflow: 'hidden' }}
            >
              <iframe
                key={route.mapKeyword}
                src={`https://m.amap.com/search/?query=${encodeURIComponent(route.mapKeyword)}&city=330800&zoom=10`}
                style={{
                  border: 'none',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  filter: 'sepia(8%) saturate(90%)',
                }}
                title="高德地图"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-top-navigation"
              />
              {!mapFullscreen && (
                <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', padding: '5px 10px', borderRadius: '5px', fontSize: '10px', color: 'var(--ink-muted)', letterSpacing: '1px', pointerEvents: 'none' }}>
                  📍 高德地图 · 点全屏登录
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ===== 大屏地图覆盖层（Portal 到 body，避免被局部容器裁切） ===== */}
      {mapFullscreen && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMapFullscreen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(28,28,26,0.55)',
              backdropFilter: 'blur(6px)',
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(1360px, calc(100vw - 28px))',
              height: 'min(90vh, 940px)',
              zIndex: 1003,
              background: 'rgba(245,242,235,0.98)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.75)',
              borderRadius: '18px',
              boxShadow: '0 20px 60px rgba(28,28,26,0.22)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--paper-deep)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: route.color }} />
                <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '14px', letterSpacing: '2px', color: 'var(--ink)' }}>
                  {route.label}路线 · 衢州
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px', background: 'rgba(74,110,82,0.08)', borderRadius: '20px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--moss-light)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontSize: '11px', color: 'var(--moss)', letterSpacing: '1px' }}>按 ESC 或右下角退出</span>
                </div>
              </div>
              <button
                onClick={() => setMapFullscreen(false)}
                aria-label="关闭大屏地图"
                style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'rgba(255,255,255,0.95)', border: '1px solid var(--paper-deep)', cursor: 'pointer', fontSize: '17px', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                ×
              </button>
            </div>
            <div style={{ position: 'relative', flex: 1, minHeight: 0, background: 'var(--paper-warm)' }}>
              <iframe
                src={`https://m.amap.com/search/?query=${encodeURIComponent(route.mapKeyword)}&city=330800&zoom=10`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  filter: 'none',
                }}
                title="高德地图"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-top-navigation"
              />
            </div>
          </motion.div>
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => setMapFullscreen(false)}
            style={{
              position: 'fixed',
              right: '22px',
              bottom: '22px',
              zIndex: 1004,
              padding: '10px 14px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.6)',
              background: 'rgba(28,28,26,0.85)',
              color: '#fff',
              letterSpacing: '1px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            退出大屏
          </motion.button>
        </AnimatePresence>,
        document.body
      )}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* ===== 浮动编辑工具栏（编辑模式时出现） ===== */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            style={{
              position: 'fixed', bottom: '32px', left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 20px',
              background: 'rgba(28,28,26,0.88)',
              backdropFilter: 'blur(20px)',
              borderRadius: '40px',
              boxShadow: '0 8px 32px rgba(28,28,26,0.25)',
              zIndex: 500,
            }}
          >
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', letterSpacing: '1px', marginRight: '4px' }}>
              编辑模式
            </span>

            {/* 切换 tab 提示 */}
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.5px' }}>
              可切换上方 tab 编辑各路线
            </span>

            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }} />

            {/* 取消 */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={cancelEdit}
              style={{
                padding: '8px 20px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '20px', color: 'rgba(255,255,255,0.75)',
                fontFamily: 'Noto Serif SC, serif', fontSize: '13px',
                letterSpacing: '2px', cursor: 'pointer',
              }}
            >
              取消
            </motion.button>

            {/* 保存 */}
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: '0 4px 16px rgba(74,110,82,0.4)' }}
              whileTap={{ scale: 0.97 }}
              onClick={saveEdit}
              style={{
                padding: '8px 24px',
                background: 'linear-gradient(135deg, #4a6e52, #6a9272)',
                border: 'none', borderRadius: '20px',
                color: '#fff', fontFamily: 'Noto Serif SC, serif',
                fontSize: '13px', letterSpacing: '2px', cursor: 'pointer',
                boxShadow: '0 2px 12px rgba(74,110,82,0.3)',
              }}
            >
              保存路线
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
