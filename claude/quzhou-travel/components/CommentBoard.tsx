'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getComments, addComment, deleteComment, getUser, Comment } from '@/lib/config'

interface Photo {
  id: string
  src: string
  name: string
  lat: string
  lng: string
  weather: string
}

interface Props {
  photo: Photo | null
  onClose: () => void
}

export default function CommentBoard({ photo, onClose }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const user = getUser()

  useEffect(() => {
    if (photo) {
      setComments(getComments(photo.id))
      setText('')
      setTimeout(() => {
        textareaRef.current?.focus()
        scrollToBottom()
      }, 350)
    }
  }, [photo?.id])

  const scrollToBottom = () => {
    setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight
      }
    }, 50)
  }

  const handleSubmit = () => {
    if (!text.trim() || !photo || !user) return
    const comment: Comment = {
      id: Date.now().toString(),
      photoId: photo.id,
      userName: user.name,
      userAvatar: user.avatar,
      text: text.trim(),
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }
    addComment(comment)
    setComments(getComments(photo.id))
    setText('')
    scrollToBottom()
  }

  const handleDelete = (commentId: string) => {
    if (!photo) return
    deleteComment(photo.id, commentId)
    setComments(getComments(photo.id))
  }

  // 自动撑高 textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
  }

  return (
    <AnimatePresence>
      {photo && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(20, 20, 18, 0.45)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              zIndex: 900,
            }}
          />

          {/* 弹窗主体 — 居中 */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(480px, 94vw)',
              maxHeight: '82vh',
              zIndex: 901,
              display: 'flex',
              flexDirection: 'column',
              // Glassmorphism
              background: 'rgba(248, 245, 238, 0.78)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.65)',
              borderRadius: '20px',
              boxShadow: '0 24px 64px rgba(20,20,18,0.22), 0 1px 0 rgba(255,255,255,0.8) inset',
              overflow: 'hidden',
            }}
          >
            {/* ===== 顶部照片条 ===== */}
            <div style={{ position: 'relative', height: '120px', flexShrink: 0, overflow: 'hidden' }}>
              <img
                src={photo.src} alt={photo.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(8%) saturate(85%) brightness(0.82)' }}
              />
              {/* 渐变蒙层 */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, rgba(20,20,18,0.55))' }} />
              {/* 关闭按钮 */}
              <motion.button
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                onClick={onClose}
                style={{
                  position: 'absolute', top: '10px', right: '12px',
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.22)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.35)',
                  color: '#fff', fontSize: '14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ×
              </motion.button>
              {/* 照片信息 */}
              <div style={{ position: 'absolute', bottom: '12px', left: '16px', right: '48px' }}>
                <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '16px', fontWeight: 600, color: '#fff', letterSpacing: '2px' }}>
                  {photo.name}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.72)', letterSpacing: '1px', marginTop: '2px' }}>
                  {photo.lat} · {photo.weather}
                </div>
              </div>
              {/* 留言数量 badge */}
              {comments.length > 0 && (
                <div style={{
                  position: 'absolute', top: '10px', left: '12px',
                  padding: '2px 10px',
                  background: 'rgba(74,110,82,0.85)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: '10px',
                  fontSize: '11px', color: '#fff', letterSpacing: '1px',
                }}>
                  {comments.length} 条留言
                </div>
              )}
            </div>

            {/* ===== 留言列表 ===== */}
            <div
              ref={listRef}
              style={{
                flex: 1, overflowY: 'auto',
                padding: '14px 16px 8px',
                display: 'flex', flexDirection: 'column', gap: '10px',
                // 自定义滚动条
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(74,110,82,0.2) transparent',
              }}
            >
              {comments.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--ink-muted)' }}
                >
                  <div style={{ fontSize: '28px', marginBottom: '10px', opacity: 0.35 }}>💬</div>
                  <p style={{ fontSize: '13px', letterSpacing: '2px' }}>还没有留言</p>
                  <p style={{ fontSize: '11px', opacity: 0.55, marginTop: '4px', letterSpacing: '1px' }}>来说点什么吧～</p>
                </motion.div>
              ) : (
                comments.map((c, i) => {
                  const isMine = user?.name === c.userName
                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: i * 0.04 }}
                      style={{
                        display: 'flex',
                        flexDirection: isMine ? 'row-reverse' : 'row',
                        alignItems: 'flex-end',
                        gap: '8px',
                      }}
                    >
                      {/* 头像 */}
                      <img
                        src={c.userAvatar} alt={c.userName}
                        style={{
                          width: '34px', height: '34px', borderRadius: '50%',
                          objectFit: 'cover', flexShrink: 0,
                          border: '2px solid rgba(255,255,255,0.8)',
                          boxShadow: '0 2px 8px rgba(20,20,18,0.1)',
                        }}
                      />

                      {/* 气泡区 */}
                      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: '3px' }}>
                        {/* 名字 + 时间 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexDirection: isMine ? 'row-reverse' : 'row' }}>
                          <span style={{ fontSize: '11px', color: 'var(--ink-muted)', fontWeight: 500, letterSpacing: '0.5px' }}>{c.userName}</span>
                          <span style={{ fontSize: '10px', color: 'var(--ink-muted)', opacity: 0.6 }}>{c.createdAt}</span>
                        </div>

                        {/* 气泡 */}
                        <BubbleMessage
                          text={c.text}
                          isMine={isMine}
                          onDelete={isMine ? () => handleDelete(c.id) : undefined}
                        />
                      </div>
                    </motion.div>
                  )
                })
              )}
            </div>

            {/* ===== 底部分割线 ===== */}
            <div style={{ height: '1px', background: 'rgba(200,195,185,0.4)', flexShrink: 0, margin: '0 16px' }} />

            {/* ===== 输入区 ===== */}
            <div style={{
              flexShrink: 0,
              padding: '10px 14px 14px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '10px',
              background: 'rgba(245,242,235,0.6)',
            }}>
              {/* 当前用户头像 */}
              {user && (
                <img src={user.avatar} alt={user.name}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.8)', marginBottom: '2px' }} />
              )}

              {/* 输入框 */}
              <div style={{
                flex: 1,
                background: 'rgba(255,255,255,0.75)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(200,195,185,0.5)',
                borderRadius: '20px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px',
                boxShadow: '0 1px 4px rgba(20,20,18,0.06) inset',
              }}>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={handleTextChange}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit()
                    }
                  }}
                  placeholder={user ? `以「${user.name}」的身份留言…` : '请先设置身份'}
                  rows={1}
                  disabled={!user}
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
                    fontFamily: 'Noto Sans SC, sans-serif', fontSize: '14px',
                    color: 'var(--ink)', lineHeight: '1.6', letterSpacing: '0.3px',
                    padding: 0, minHeight: '22px', maxHeight: '96px',
                    overflow: 'hidden',
                  }}
                />

                {/* 发送按钮 */}
                <motion.button
                  whileHover={text.trim() ? { scale: 1.08 } : {}}
                  whileTap={text.trim() ? { scale: 0.92 } : {}}
                  onClick={handleSubmit}
                  disabled={!text.trim() || !user}
                  style={{
                    width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                    background: text.trim() ? 'var(--moss)' : 'rgba(180,175,165,0.4)',
                    border: 'none', cursor: text.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.2s ease',
                    boxShadow: text.trim() ? '0 2px 8px rgba(74,110,82,0.3)' : 'none',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.button>
              </div>
            </div>

            {/* Enter 提示 */}
            <div style={{ textAlign: 'center', padding: '0 0 10px', fontSize: '10px', color: 'rgba(120,116,108,0.55)', letterSpacing: '1px' }}>
              Enter 发送 · Shift+Enter 换行
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// 气泡组件
function BubbleMessage({ text, isMine, onDelete }: {
  text: string
  isMine: boolean
  onDelete?: () => void
}) {
  const [longPressed, setLongPressed] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlePressStart = () => {
    pressTimer.current = setTimeout(() => setLongPressed(true), 500)
  }
  const handlePressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }

  return (
    <div style={{ position: 'relative' }}>
      <motion.div
        onPointerDown={handlePressStart}
        onPointerUp={handlePressEnd}
        onPointerLeave={handlePressEnd}
        whileTap={{ scale: 0.97 }}
        style={{
          padding: '9px 13px',
          borderRadius: isMine ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          background: isMine
            ? 'rgba(180, 220, 185, 0.85)'   // 微信绿：淡绿
            : 'rgba(255, 255, 255, 0.88)',   // 他人：纯白
          backdropFilter: 'blur(4px)',
          border: isMine
            ? '1px solid rgba(120,180,130,0.35)'
            : '1px solid rgba(220,215,205,0.6)',
          boxShadow: isMine
            ? '0 1px 4px rgba(74,110,82,0.12)'
            : '0 1px 4px rgba(20,20,18,0.07)',
          cursor: onDelete ? 'context-menu' : 'default',
          userSelect: 'none',
          maxWidth: '100%',
        }}
      >
        <p style={{
          fontSize: '14px', color: '#1c1c1a',
          lineHeight: 1.65, letterSpacing: '0.3px',
          margin: 0, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
        }}>
          {text}
        </p>
      </motion.div>

      {/* 长按/悬停删除菜单（仅自己的留言） */}
      <AnimatePresence>
        {longPressed && onDelete && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setLongPressed(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88 }}
              style={{
                position: 'absolute', bottom: 'calc(100% + 6px)',
                right: isMine ? 0 : 'auto', left: isMine ? 'auto' : 0,
                background: 'rgba(30,30,28,0.92)',
                backdropFilter: 'blur(12px)',
                borderRadius: '10px', zIndex: 20,
                overflow: 'hidden',
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              }}
            >
              <button
                onClick={() => { onDelete(); setLongPressed(false) }}
                style={{
                  padding: '10px 20px', background: 'none', border: 'none',
                  color: '#ff6b6b', fontSize: '13px', cursor: 'pointer',
                  letterSpacing: '1px', fontFamily: 'Noto Sans SC, sans-serif',
                  whiteSpace: 'nowrap',
                }}
              >
                删除留言
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
