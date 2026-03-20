'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { callXhsMcp } from '@/lib/config'

// 从任意 MCP 返回的笔记对象中提取小红书跳转链接
function resolveXhsUrl(note: Record<string, unknown>): string {
  // 遍历所有字段，找包含 xhs/xiaohongshu/note 的 url
  const keys = Object.keys(note)

  // 直接是完整链接的字段
  for (const k of keys) {
    const v = note[k]
    if (typeof v === 'string' && v.includes('xiaohongshu.com')) return v
    if (typeof v === 'string' && v.includes('xhslink.com')) return v
  }

  // 用 note_id / noteId / id 构造链接
  const idFields = ['note_id', 'noteId', 'id', 'note_url', 'noteUrl', 'url', 'link', 'share_url']
  for (const k of idFields) {
    const v = note[k]
    if (typeof v !== 'string' || !v) continue
    if (v.startsWith('http')) return v
    // 看起来像笔记 ID（24位hex或更短）
    if (/^[0-9a-f]{16,32}$/i.test(v) || v.length >= 16) {
      return `https://www.xiaohongshu.com/explore/${v}`
    }
  }

  return ''
}

// 从笔记对象提取显示字段（字段名因 MCP 版本而异）

const DEMO_NOTES: Record<string, unknown>[] = [
  { title: '江郎山下·云隐精品民宿', desc: '推开窗就是江郎山，清晨薄雾漫山，夜晚星河璀璨。原木+石材设计，搭配衢州传统竹编摆件。强烈推荐清明前后来，院子里的樱花正好。', cover: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500&q=70', liked_count: 2341, location: '江山市', price: '￥380起' },
  { title: '廿八都·烟雨人家', desc: '古镇核心区，清代老宅改造。进门是天井，满眼青苔石板。老板讲古镇故事，早餐有自制青团，住一晚胜过很多五星酒店的感觉。', cover: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=500&q=70', liked_count: 1876, location: '廿八都古镇', price: '￥298起' },
  { title: '钱江源·林间隐居', desc: '开化县深山，只有6间房。周围原始森林，清明时节新绿初发，空气里都是植物清香。有户外火堆，夜里围坐聊天，是都市人最需要的放空。', cover: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=500&q=70', liked_count: 3102, location: '开化县', price: '￥520起' },
  { title: '衢州古城·孔裔书房', desc: '南孔庙旁，由民国书局改造，保留老式木质书架和雕花窗棂。清晨能听到孔庙晨钟。主理人是本地文化研究者，会分享很多衢州冷知识。', cover: 'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=500&q=70', liked_count: 989, location: '衢州古城', price: '￥428起' },
  { title: '烂柯山·棋隐居', desc: '围棋仙地旁，庭院里有棋盘石桌。清明踏青完回来下几盘，配上主人泡的三清茶，时光就这样慢下来了。', cover: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&q=70', liked_count: 654, location: '柯城区', price: '￥260起' },
  { title: '仙霞古道·驿站民宿', desc: '千年驿道旁，融合古驿站元素。清明徒步完古道，泡个澡吃顿热饭，幸福感爆棚。老板会接送，不用担心交通。', cover: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=500&q=70', liked_count: 1203, location: '江山市', price: '￥320起' },
]

export default function HomestaySection() {
  const [query, setQuery] = useState('衢州 清明 民宿')
  const [notes, setNotes] = useState<Record<string, unknown>[]>(DEMO_NOTES)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [toolName, setToolName] = useState('')
  // 调试面板
  const [showDebug, setShowDebug] = useState(false)
  const [rawResponse, setRawResponse] = useState('')

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setSearched(true)
    setRawResponse('')
    try {
      const result = await callXhsMcp(query)
      setToolName(result.toolName)
      setRawResponse(result.rawResponse)
      if (result.notes.length > 0) {
        setNotes(result.notes)
      } else {
        setNotes(DEMO_NOTES)
        setError('MCP 返回数据为空，展示示例数据。点「调试」查看原始响应。')
      }
    } catch (e: unknown) {
      setError((e as Error).message || '连接失败')
      setNotes(DEMO_NOTES)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section style={{ padding: '80px 0' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>

        {/* 标题 */}
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '8px' }}>
            <span className="font-calligraphy" style={{ fontSize: '52px', color: 'var(--paper-deep)', lineHeight: 1 }}>三</span>
            <div>
              <div style={{ fontSize: '11px', letterSpacing: '4px', color: 'var(--moss-light)', textTransform: 'uppercase', marginBottom: '4px' }}>Homestay · XHS MCP</div>
              <h2 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '3px' }}>民宿推荐</h2>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--ink-muted)', letterSpacing: '1px', paddingLeft: '68px' }}>实时抓取小红书热门民宿笔记，发现最真实的住宿体验</p>
        </motion.div>

        {/* 搜索栏 */}
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="搜索民宿关键词，如：江郎山民宿…"
            style={{ flex: 1, padding: '12px 18px', background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--paper-deep)', borderRadius: '6px', fontFamily: 'Noto Sans SC, sans-serif', fontSize: '14px', color: 'var(--ink)', outline: 'none', transition: 'border-color 0.25s' }} />
          <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }} onClick={search} disabled={loading}
            style={{ padding: '12px 28px', background: loading ? 'var(--ink-muted)' : 'var(--moss)', color: 'var(--paper)', border: 'none', borderRadius: '6px', fontFamily: 'Noto Serif SC, serif', fontSize: '14px', letterSpacing: '3px', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 2px 12px rgba(74,110,82,0.25)', whiteSpace: 'nowrap' }}>
            {loading ? '搜索中…' : '搜 索'}
          </motion.button>
        </motion.div>

        {/* 状态栏 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--paper-deep)', borderRadius: '12px', fontSize: '11px', color: 'var(--ink-muted)', letterSpacing: '1px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: error ? '#b03030' : searched ? 'var(--moss-light)' : 'var(--paper-deep)', display: 'inline-block', animation: searched && !error ? 'pulse 2s infinite' : 'none' }} />
            {error ? 'MCP 离线' : searched ? `XHS MCP · 工具: ${toolName || 'search_notes'}` : 'XHS MCP · 点击搜索'}
          </div>
          {searched && rawResponse && (
            <button onClick={() => setShowDebug(v => !v)}
              style={{ padding: '4px 12px', background: showDebug ? 'var(--ink)' : 'rgba(255,255,255,0.5)', color: showDebug ? 'var(--paper)' : 'var(--ink-muted)', border: '1px solid var(--paper-deep)', borderRadius: '12px', fontSize: '11px', letterSpacing: '1px', cursor: 'pointer', fontFamily: 'Noto Sans SC, sans-serif' }}>
              {showDebug ? '隐藏调试' : '🔍 调试 · 查看原始响应'}
            </button>
          )}
          {error && <span style={{ fontSize: '12px', color: 'var(--seal)', letterSpacing: '0.5px' }}>{error}</span>}
        </div>

        {/* 调试面板 */}
        <AnimatePresence>
          {showDebug && rawResponse && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ marginBottom: '24px', background: '#1a1a18', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#888', letterSpacing: '2px', fontFamily: 'monospace' }}>MCP RAW RESPONSE · {toolName}</span>
                <span style={{ fontSize: '10px', color: '#666', letterSpacing: '1px' }}>找到链接字段后告知开发者更新 resolveXhsUrl</span>
              </div>
              <pre style={{ padding: '16px', margin: 0, fontSize: '11px', color: '#a8d8a8', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '320px', overflowY: 'auto', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {rawResponse}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 卡片网格 */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--ink-muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '16px' }}>
                {[0,1,2].map(i => (
                  <motion.div key={i} animate={{ y: [0, -10, 0] }} transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
                    style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--moss-light)' }} />
                ))}
              </div>
              <p style={{ fontSize: '13px', letterSpacing: '2px' }}>正在从小红书抓取民宿笔记…</p>
            </motion.div>
          ) : (
            <motion.div key="cards" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
              {notes.map((note, i) => <MagazineCard key={i} note={note} index={i} />)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </section>
  )
}

function MagazineCard({ note, index }: { note: Record<string, unknown>; index: number }) {
  const [hovered, setHovered] = useState(false)

  const title = extractField(note, 'title', 'name', 'note_title', 'display_title')
  const desc = extractField(note, 'desc', 'content', 'description', 'summary', 'note_desc', 'interact_info')
  const cover = extractField(note, 'cover', 'cover_url', 'image', 'image_url', 'thumb', 'thumbnail')
  const location = extractField(note, 'location', 'poi', 'address', 'poi_name', 'ip_location')
  const likes = extractField(note, 'liked_count', 'likes', 'like_count', 'likes_count', 'interact_info')
  const xhsUrl = resolveXhsUrl(note)

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.07, duration: 0.5 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ y: -5 }}
      style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.75)', borderRadius: '12px', overflow: 'hidden', boxShadow: hovered ? '0 16px 48px rgba(28,28,26,0.12)' : '0 4px 20px rgba(28,28,26,0.07)', transition: 'box-shadow 0.3s ease', cursor: xhsUrl ? 'pointer' : 'default' }}
      onClick={() => xhsUrl && window.open(xhsUrl, '_blank')}
    >
      {/* 封面 */}
      <div style={{ height: '200px', overflow: 'hidden', position: 'relative', background: 'var(--paper-warm)' }}>
        {cover ? (
          <motion.img src={cover} alt={title} animate={{ scale: hovered ? 1.06 : 1 }} transition={{ duration: 0.4 }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(10%) saturate(88%)' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', opacity: 0.3 }}>🏡</div>
        )}
        {/* 链接状态标签 */}
        <div style={{ position: 'absolute', top: '10px', right: '10px', padding: '3px 10px', background: xhsUrl ? 'rgba(255,255,255,0.92)' : 'rgba(180,60,60,0.85)', borderRadius: '12px', fontSize: '10px', color: xhsUrl ? 'var(--seal)' : '#fff', letterSpacing: '1px', backdropFilter: 'blur(4px)' }}>
          {xhsUrl ? '🔗 可跳转' : '无链接'}
        </div>
      </div>

      {/* 内容 */}
      <div style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--moss)', letterSpacing: '1px' }}>📍 {location || '衢州'}</span>
          {likes && <span style={{ fontSize: '11px', color: 'var(--gold)', letterSpacing: '1px' }}>♥ {likes}</span>}
        </div>
        <h3 style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '10px', letterSpacing: '1px', lineHeight: 1.5 }}>{title || '衢州民宿'}</h3>
        <p style={{ fontSize: '13px', color: 'var(--ink-muted)', lineHeight: 1.8, letterSpacing: '0.5px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '14px' }}>{desc}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--paper-deep)' }}>
          <span style={{ fontSize: '11px', color: 'var(--ink-muted)', letterSpacing: '1px' }}>来自小红书</span>
          {xhsUrl ? (
            <motion.a href={xhsUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} whileHover={{ x: 3 }}
              style={{ fontSize: '11px', color: 'var(--moss)', letterSpacing: '2px', padding: '4px 12px', border: '1px solid var(--moss-pale)', borderRadius: '4px', textDecoration: 'none', display: 'inline-block' }}>
              查看笔记 →
            </motion.a>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--ink-muted)', opacity: 0.45, letterSpacing: '1px' }}>
              暂无链接
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function extractField(note: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = note[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}
