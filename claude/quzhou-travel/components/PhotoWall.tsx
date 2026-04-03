'use client'
import CommentBoard from './CommentBoard'
import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Photo {
  id: string
  src: string
  name: string
  lat: string
  lng: string
  weather: string
  rotation: number
  isDemo?: boolean
}

const SPOT_DATA = [
  { name: '江郎山顶', lat: '28.4521°N', lng: '118.6234°E', weather: '🌤' },
  { name: '廿八都古镇', lat: '28.3812°N', lng: '118.5567°E', weather: '🌫' },
  { name: '南孔庙', lat: '28.9356°N', lng: '118.8724°E', weather: '⛅' },
  { name: '烂柯山', lat: '28.8934°N', lng: '118.7823°E', weather: '🌧' },
  { name: '钱江源', lat: '29.1234°N', lng: '118.1456°E', weather: '🌤' },
  { name: '仙霞古道', lat: '28.4012°N', lng: '118.6789°E', weather: '🌫' },
]

// 用视觉风格更符合衢州山水气质的图片
// 江郎山：山林雾气 | 廿八都：古镇建筑 | 钱江源：溪流绿意 | 烂柯山：山间幽静
// Demo 图片使用内嵌 SVG，完全不依赖外网，避免 broken image 导致的布局错位
const DEMO_PHOTOS: Photo[] = [
  {
    id: 'demo1',
    src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiB2aWV3Qm94PSIwIDAgNDAwIDMwMCI+CiAgPHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNlOGYwZTAiLz4KICA8IS0tIHNreSBncmFkaWVudCBlZmZlY3QgLS0+CiAgPHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIxODAiIGZpbGw9IiNlOGYwZTAiIG9wYWNpdHk9IjAuOCIvPgogIDwhLS0gZmFyIG1vdW50YWlucyAtLT4KICA8cG9seWdvbiBwb2ludHM9IjAsMjAwIDgwLDEwMCAxNjAsMTYwIDI0MCw4MCAzMjAsMTMwIDQwMCw5MCA0MDAsMjIwIDAsMjIwIiBmaWxsPSIjOGFhYTcyIiBvcGFjaXR5PSIwLjYiLz4KICA8IS0tIG1pZCBtb3VudGFpbnMgLS0+CiAgPHBvbHlnb24gcG9pbnRzPSIwLDI0MCA2MCwxNDAgMTQwLDE4MCAyMDAsMTEwIDI4MCwxNjAgMzYwLDEyMCA0MDAsMTUwIDQwMCwyNjAgMCwyNjAiIGZpbGw9IiM0YTZlNTIiLz4KICA8IS0tIG5lYXIgaGlsbHMgLS0+CiAgPHBvbHlnb24gcG9pbnRzPSIwLDI4MCAxMDAsMjAwIDIwMCwyMzAgMzAwLDE5MCA0MDAsMjEwIDQwMCwzMDAgMCwzMDAiIGZpbGw9IiM2YTg4NjAiLz4KICA8IS0tIHRyZWVzIC0tPgogIDxwb2x5Z29uIHBvaW50cz0iMzAsMjYwIDQwLDIzMCA1MCwyNjAiIGZpbGw9IiM2YTg4NjAiIG9wYWNpdHk9IjAuOCIvPgogIDxwb2x5Z29uIHBvaW50cz0iNjAsMjY1IDcyLDIzMiA4NCwyNjUiIGZpbGw9IiM2YTg4NjAiIG9wYWNpdHk9IjAuNyIvPgogIDxwb2x5Z29uIHBvaW50cz0iMzQwLDI1NSAzNTIsMjIyIDM2NCwyNTUiIGZpbGw9IiM2YTg4NjAiIG9wYWNpdHk9IjAuOCIvPgogIDwhLS0gbWlzdCAtLT4KICA8cmVjdCB4PSIwIiB5PSIxOTUiIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjI1IiByeD0iMTAiLz4KICA8IS0tIHN1bi9tb29uIC0tPgogIDxjaXJjbGUgY3g9IjMyMCIgY3k9IjYwIiByPSIyMiIgZmlsbD0iIzhhYWE3MiIgb3BhY2l0eT0iMC43Ii8+Cjwvc3ZnPg==',
    name: '江郎山',
    lat: '28.4521°N', lng: '118.6234°E', weather: '🌤', rotation: -2.1, isDemo: true
  },
  {
    id: 'demo2',
    src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiB2aWV3Qm94PSIwIDAgNDAwIDMwMCI+CiAgPHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNmMGU4ZDgiLz4KICA8IS0tIHNreSB3aXRoIGhhemUgLS0+CiAgPHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNmMGU4ZDgiIG9wYWNpdHk9IjAuNiIvPgogIDwhLS0gZ3JvdW5kIC0tPgogIDxyZWN0IHk9IjIzMCIgd2lkdGg9IjQwMCIgaGVpZ2h0PSI3MCIgZmlsbD0iI2MwYTg4MCIvPgogIDwhLS0gcm9hZC9wYXRoIC0tPgogIDxwb2x5Z29uIHBvaW50cz0iMTYwLDMwMCAyNDAsMzAwIDI2MCwyMzAgMTgwLDIzMCIgZmlsbD0iIzdhNjA0MCIgb3BhY2l0eT0iMC40Ii8+CiAgPCEtLSBidWlsZGluZ3Mgcm93IC0tPgogIDxyZWN0IHg9IjMwIiB5PSIxNjAiIHdpZHRoPSI1NSIgaGVpZ2h0PSI5MCIgZmlsbD0iIzdhNjA0MCIgcng9IjIiLz4KICA8cG9seWdvbiBwb2ludHM9IjMwLDE2MCA1NywxMzAgODUsMTYwIiBmaWxsPSIjYTA4MDYwIi8+CiAgPHJlY3QgeD0iMzgiIHk9IjE5NSIgd2lkdGg9IjE1IiBoZWlnaHQ9IjIwIiBmaWxsPSIjZjBlOGQ4IiBvcGFjaXR5PSIwLjUiLz4KICA8cmVjdCB4PSI2MCIgeT0iMTk1IiB3aWR0aD0iMTUiIGhlaWdodD0iMjAiIGZpbGw9IiNmMGU4ZDgiIG9wYWNpdHk9IjAuNSIvPgogIDxyZWN0IHg9IjExMCIgeT0iMTcwIiB3aWR0aD0iNzAiIGhlaWdodD0iODAiIGZpbGw9IiM3YTYwNDAiIHJ4PSIyIi8+CiAgPHBvbHlnb24gcG9pbnRzPSIxMTAsMTcwIDE0NSwxMzggMTgwLDE3MCIgZmlsbD0iI2EwODA2MCIvPgogIDxyZWN0IHg9IjEzMCIgeT0iMjAwIiB3aWR0aD0iMTgiIGhlaWdodD0iMjUiIGZpbGw9IiNmMGU4ZDgiIG9wYWNpdHk9IjAuNSIvPgogIDxyZWN0IHg9IjIyMCIgeT0iMTU1IiB3aWR0aD0iODAiIGhlaWdodD0iOTUiIGZpbGw9IiM3YTYwNDAiIHJ4PSIyIi8+CiAgPHBvbHlnb24gcG9pbnRzPSIyMjAsMTU1IDI2MCwxMTggMzAwLDE1NSIgZmlsbD0iI2EwODA2MCIvPgogIDxyZWN0IHg9IjI0MCIgeT0iMTkwIiB3aWR0aD0iMTgiIGhlaWdodD0iMjUiIGZpbGw9IiNmMGU4ZDgiIG9wYWNpdHk9IjAuNSIvPgogIDxyZWN0IHg9IjI2OCIgeT0iMTkwIiB3aWR0aD0iMTgiIGhlaWdodD0iMjUiIGZpbGw9IiNmMGU4ZDgiIG9wYWNpdHk9IjAuNSIvPgogIDxyZWN0IHg9IjMzMCIgeT0iMTc1IiB3aWR0aD0iNTAiIGhlaWdodD0iNzUiIGZpbGw9IiM3YTYwNDAiIHJ4PSIyIi8+CiAgPHBvbHlnb24gcG9pbnRzPSIzMzAsMTc1IDM1NSwxNDggMzgwLDE3NSIgZmlsbD0iI2EwODA2MCIvPgogIDwhLS0gbGFudGVybnMgLS0+CiAgPGNpcmNsZSBjeD0iMTAwIiBjeT0iMTU1IiByPSI1IiBmaWxsPSIjYzg2MDQwIiBvcGFjaXR5PSIwLjgiLz4KICA8Y2lyY2xlIGN4PSIyMDAiIGN5PSIxNDgiIHI9IjUiIGZpbGw9IiNjODYwNDAiIG9wYWNpdHk9IjAuOCIvPgogIDwhLS0gbWlzdHkgb3ZlcmxheSAtLT4KICA8cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuMTIiLz4KPC9zdmc+',
    name: '廿八都',
    lat: '28.3812°N', lng: '118.5567°E', weather: '🌫', rotation: 1.8, isDemo: true
  },
  {
    id: 'demo3',
    src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiB2aWV3Qm94PSIwIDAgNDAwIDMwMCI+CiAgPHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNlMGYwZTgiLz4KICA8IS0tIGhpbGxzIC0tPgogIDxlbGxpcHNlIGN4PSI4MCIgY3k9IjIwMCIgcng9IjEzMCIgcnk9IjEwMCIgZmlsbD0iIzJhNjA0OCIvPgogIDxlbGxpcHNlIGN4PSIzMjAiIGN5PSIyMDAiIHJ4PSIxMzAiIHJ5PSIxMDAiIGZpbGw9IiMyYTYwNDgiLz4KICA8ZWxsaXBzZSBjeD0iODAiIGN5PSIyMDAiIHJ4PSIxMDAiIHJ5PSI4MCIgZmlsbD0iIzZhYTg4OCIgb3BhY2l0eT0iMC41Ii8+CiAgPCEtLSByaXZlciAtLT4KICA8cGF0aCBkPSJNMCwyMDAgUTEwMCwxODAgMjAwLDE5NSBRMzAwLDIxMCA0MDAsMTkwIEw0MDAsMjYwIFEzMDAsMjUwIDIwMCwyNDAgUTEwMCwyMzUgMCwyNTAgWiIgZmlsbD0iI2I4ZDhjOCIgb3BhY2l0eT0iMC44Ii8+CiAgPCEtLSByaXZlciBzaGltbWVyIC0tPgogIDxwYXRoIGQ9Ik0yMCwyMTUgUTgwLDIxMCAxNDAsMjE1IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjEuNSIgZmlsbD0ibm9uZSIgb3BhY2l0eT0iMC41Ii8+CiAgPHBhdGggZD0iTTIwMCwyMTAgUTI4MCwyMDUgMzYwLDIxMiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIxLjUiIGZpbGw9Im5vbmUiIG9wYWNpdHk9IjAuNCIvPgogIDwhLS0gYmFtYm9vIGxlZnQgLS0+CiAgPGxpbmUgeDE9IjIwIiB5MT0iMjgwIiB4Mj0iMjIiIHkyPSIxNTAiIHN0cm9rZT0iIzRhODA2OCIgc3Ryb2tlLXdpZHRoPSIzIi8+CiAgPGVsbGlwc2UgY3g9IjIxIiBjeT0iMTkwIiByeD0iMTUiIHJ5PSI1IiBmaWxsPSIjNGE4MDY4IiBvcGFjaXR5PSIwLjYiLz4KICA8ZWxsaXBzZSBjeD0iMjEiIGN5PSIyMjAiIHJ4PSIxOCIgcnk9IjYiIGZpbGw9IiM0YTgwNjgiIG9wYWNpdHk9IjAuNSIvPgogIDwhLS0gYmFtYm9vIHJpZ2h0IC0tPgogIDxsaW5lIHgxPSIzNzUiIHkxPSIyODAiIHgyPSIzNzMiIHkyPSIxNDAiIHN0cm9rZT0iIzRhODA2OCIgc3Ryb2tlLXdpZHRoPSIzIi8+CiAgPGVsbGlwc2UgY3g9IjM3NCIgY3k9IjE4MCIgcng9IjE2IiByeT0iNSIgZmlsbD0iIzRhODA2OCIgb3BhY2l0eT0iMC42Ii8+CiAgPCEtLSBtaXN0IG9uIHdhdGVyIC0tPgogIDxyZWN0IHg9IjAiIHk9IjIwMCIgd2lkdGg9IjQwMCIgaGVpZ2h0PSIxNSIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuMiIgcng9IjgiLz4KPC9zdmc+',
    name: '钱江源',
    lat: '29.1234°N', lng: '118.1456°E', weather: '🌤', rotation: -1.2, isDemo: true
  },
  {
    id: 'demo4',
    src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiB2aWV3Qm94PSIwIDAgNDAwIDMwMCI+CiAgPHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNlOGVjZDgiLz4KICA8IS0tIGJhY2tncm91bmQgaGlsbHMgLS0+CiAgPGVsbGlwc2UgY3g9IjIwMCIgY3k9IjI4MCIgcng9IjMwMCIgcnk9IjE0MCIgZmlsbD0iIzkwOTg3MCIgb3BhY2l0eT0iMC41Ii8+CiAgPCEtLSB0cmVlIGxpbmUgYmFjayAtLT4KICA8cG9seWdvbiBwb2ludHM9IjAsMjAwIDMwLDE0MCA2MCwxODAgOTAsMTMwIDEyMCwxNjUgMTUwLDEyNSAxODAsMTU1IDIxMCwxMTggMjQwLDE1MCAyNzAsMTI4IDMwMCwxNTggMzMwLDEzNSAzNjAsMTY1IDQwMCwxNDAgNDAwLDIyMCAwLDIyMCIgZmlsbD0iIzUwNTg0MCIgb3BhY2l0eT0iMC43Ii8+CiAgPCEtLSB0cmVlIGxpbmUgZnJvbnQgLS0+CiAgPHBvbHlnb24gcG9pbnRzPSIwLDI0MCAyNSwxODUgNTUsMjE1IDg1LDE3MiAxMTUsMjA1IDE0NSwxNjggMTc1LDIwMCAyMDUsMTYyIDIzNSwxOTUgMjY1LDE3MCAyOTUsMjAwIDMyNSwxNzUgMzYwLDIwOCA0MDAsMTg1IDQwMCwyNjAgMCwyNjAiIGZpbGw9IiM3MDgwNjAiLz4KICA8IS0tIGZvcmVzdCBmbG9vciAtLT4KICA8cmVjdCB5PSIyNTUiIHdpZHRoPSI0MDAiIGhlaWdodD0iNDUiIGZpbGw9IiM1MDU4NDAiLz4KICA8IS0tIGxpZ2h0IHJheXMgLS0+CiAgPHBvbHlnb24gcG9pbnRzPSIxODAsMCAyMjAsMCAyNjAsMjAwIDE0MCwyMDAiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjA2Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIyODAsMCAzMTAsMCAzNTAsMjAwIDI0MCwyMDAiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjA0Ii8+CiAgPCEtLSBmb3JlZ3JvdW5kIGZlcm5zL2dyYXNzIC0tPgogIDxwYXRoIGQ9Ik0wLDI3NSBRMjAsMjU1IDQwLDI3MCBRNjAsMjU1IDgwLDI3MiIgc3Ryb2tlPSIjNzA4MDYwIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz4KICA8cGF0aCBkPSJNMzAwLDI3OCBRMzIwLDI2MCAzNDAsMjc1IFEzNjAsMjU4IDM4MCwyNzMiIHN0cm9rZT0iIzcwODA2MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+Cjwvc3ZnPg==',
    name: '烂柯山',
    lat: '28.8934°N', lng: '118.7823°E', weather: '⛅', rotation: 2.4, isDemo: true
  },
]

export default function PhotoWall() {
  const [photos, setPhotos] = useState<Photo[]>(DEMO_PHOTOS)
  const [dragOver, setDragOver] = useState(false)
  const [lightbox, setLightbox] = useState<Photo | null>(null)
  const [commentPhoto, setCommentPhoto] = useState<Photo | null>(null)
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([])
  const [showNamingModal, setShowNamingModal] = useState(false)
  const [namingIndex, setNamingIndex] = useState(0)
  const [currentName, setCurrentName] = useState('')
  const [currentSpot, setCurrentSpot] = useState(SPOT_DATA[0])
  const fileRef = useRef<HTMLInputElement>(null)
  const denseMode = photos.length >= 20

  const handleFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (!imageFiles.length) return

    // 生成预览并弹出命名弹窗
    Promise.all(imageFiles.map(f => new Promise<{ file: File; preview: string }>((res) => {
      const reader = new FileReader()
      reader.onload = e => res({ file: f, preview: e.target?.result as string })
      reader.readAsDataURL(f)
    }))).then(results => {
      setPendingFiles(results)
      setNamingIndex(0)
      const spot = SPOT_DATA[Math.floor(Math.random() * SPOT_DATA.length)]
      setCurrentSpot(spot)
      setCurrentName(results[0].file.name.replace(/\.[^.]+$/, ''))
      setShowNamingModal(true)
    })
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  const confirmName = useCallback(() => {
    if (!pendingFiles[namingIndex]) return
    
    const pending = pendingFiles[namingIndex]
    const newPhoto: Photo = {
      id: Date.now().toString() + Math.random(),
      src: pending.preview,
      name: currentName || currentSpot.name,
      lat: currentSpot.lat,
      lng: currentSpot.lng,
      weather: currentSpot.weather,
      rotation: (Math.random() - 0.5) * 6,
      isDemo: false,
    }
    
    setPhotos(prev => [newPhoto, ...prev].slice(0, 20))

    if (namingIndex < pendingFiles.length - 1) {
      const next = namingIndex + 1
      setNamingIndex(next)
      const spot = SPOT_DATA[Math.floor(Math.random() * SPOT_DATA.length)]
      setCurrentSpot(spot)
      setCurrentName(pendingFiles[next].file.name.replace(/\.[^.]+$/, ''))
    } else {
      setShowNamingModal(false)
      setPendingFiles([])
      setNamingIndex(0)
    }
  }, [pendingFiles, namingIndex, currentSpot, currentName])

  const removePhoto = (id: string) => setPhotos(prev => prev.filter(p => p.id !== id))

  // 替换某张照片的图片（保留名称、坐标等元信息）
  const replacePhoto = (id: string, newSrc: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, src: newSrc, isDemo: false } : p))
  }

  const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } }
  }
  const cardVariants = {
    hidden: { opacity: 0, y: 24, scale: 0.94 },
    show: { opacity: 1, y: 0, scale: 1 }
  }

  return (
    <section style={{ padding: '80px 0' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>

        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ marginBottom: '48px' }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '8px' }}>
            <span className="font-calligraphy" style={{ fontSize: '52px', color: 'var(--paper-deep)', lineHeight: 1 }}>一</span>
            <div>
              <div style={{ fontSize: '11px', letterSpacing: '4px', color: 'var(--moss-light)', textTransform: 'uppercase', marginBottom: '4px' }}>Photo Wall</div>
              <h2 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '3px', color: 'var(--ink)' }}>衢州瞬间</h2>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--ink-muted)', letterSpacing: '1px', paddingLeft: '68px' }}>
            记录每一处打卡足迹，定格清明时节的山水光影
          </p>
        </motion.div>

        {/* 上传区 */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.5 }}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragOver ? 'var(--moss)' : 'var(--paper-deep)'}`,
            borderRadius: '8px',
            padding: '36px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'rgba(74,110,82,0.04)' : 'rgba(255,255,255,0.3)',
            transition: 'all 0.25s ease',
            marginBottom: '40px',
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: '10px', opacity: 0.45 }}>📷</div>
          <p style={{ fontSize: '13px', color: 'var(--ink-muted)', letterSpacing: '1px' }}>拖拽或点击上传照片</p>
          <p style={{ fontSize: '11px', color: 'var(--ink-muted)', opacity: 0.55, marginTop: '4px' }}>上传后可为每张照片命名打卡点</p>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => { handleFiles(Array.from(e.target.files || [])); e.target.value = '' }} style={{ display: 'none' }} />
        </motion.div>

        {/* 瀑布流 */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-50px' }}
          style={{ columns: denseMode ? '3 220px' : '3 260px', columnGap: denseMode ? '12px' : '16px' }}
        >
          {photos.map((photo) => (
            <motion.div key={photo.id} variants={cardVariants} style={{ breakInside: 'avoid', marginBottom: denseMode ? '12px' : '16px', display: 'inline-block', width: '100%' }}>
              <PolaroidCard
                dense={denseMode}
                photo={photo}
                onRemove={removePhoto}
                onReplace={replacePhoto}
                onOpen={setLightbox}
                onComment={setCommentPhoto}
              />
            </motion.div>
          ))}
        </motion.div>

        {/* 统计 */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{
            display: 'flex', gap: '32px', marginTop: '32px',
            padding: '20px 28px',
            background: 'rgba(255,255,255,0.4)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.6)',
            borderRadius: '8px',
            borderLeft: '3px solid var(--moss)',
          }}
        >
          {[
            { num: photos.length, label: '张照片' },
            { num: Math.ceil(photos.length / 4) || 0, label: '天行程' },
            { num: Math.min(photos.filter(p => !p.isDemo).length + 4, SPOT_DATA.length), label: '个打卡点' },
          ].map(({ num, label }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div className="font-calligraphy" style={{ fontSize: '32px', color: 'var(--moss)', lineHeight: 1 }}>{num}</div>
              <div style={{ fontSize: '11px', color: 'var(--ink-muted)', letterSpacing: '2px', marginTop: '4px' }}>{label}</div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ===== 命名弹窗 ===== */}
      <AnimatePresence>
        {showNamingModal && pendingFiles[namingIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(28,28,26,0.55)',
              backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={(e) => e.target === e.currentTarget && confirmName()}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0 }}
              style={{
                background: 'rgba(245,242,235,0.98)',
                backdropFilter: 'blur(20px)',
                borderRadius: '16px',
                padding: '32px',
                width: 'min(420px, 92vw)',
                boxShadow: '0 24px 64px rgba(28,28,26,0.2)',
              }}
            >
              {/* 进度 */}
              {pendingFiles.length > 1 && (
                <div style={{ fontSize: '11px', color: 'var(--ink-muted)', letterSpacing: '2px', marginBottom: '16px', textAlign: 'center' }}>
                  {namingIndex + 1} / {pendingFiles.length}
                </div>
              )}

              {/* 预览缩略图（拍立得样式） */}
              <div style={{
                background: '#fff',
                padding: '10px 10px 32px',
                boxShadow: '0 4px 20px rgba(28,28,26,0.12)',
                transform: `rotate(${(Math.random() - 0.5) * 2}deg)`,
                marginBottom: '24px',
              }}>
                <img
                  src={pendingFiles[namingIndex].preview}
                  alt="preview"
                  style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block', filter: 'sepia(6%) saturate(90%)' }}
                />
              </div>

              {/* 命名输入 */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', color: 'var(--ink-muted)', letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
                  打卡点名称
                </label>
                <input
                  autoFocus
                  value={currentName}
                  onChange={e => setCurrentName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmName()}
                  placeholder="如：江郎山顶、廿八都古镇…"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    background: 'rgba(255,255,255,0.8)',
                    border: '1px solid var(--paper-deep)',
                    borderRadius: '7px',
                    fontFamily: 'Noto Serif SC, serif',
                    fontSize: '15px',
                    color: 'var(--ink)',
                    outline: 'none',
                    letterSpacing: '1px',
                    textAlign: 'center',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--moss-light)'}
                  onBlur={e => e.target.style.borderColor = 'var(--paper-deep)'}
                />
              </div>

              {/* 打卡点快选 */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-muted)', letterSpacing: '2px', marginBottom: '8px' }}>
                  快速选择景点
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {SPOT_DATA.map(spot => (
                    <button
                      key={spot.name}
                      onClick={() => { setCurrentName(spot.name); setCurrentSpot(spot) }}
                      style={{
                        padding: '5px 12px',
                        background: currentName === spot.name ? 'var(--moss)' : 'rgba(255,255,255,0.7)',
                        color: currentName === spot.name ? 'var(--paper)' : 'var(--ink-muted)',
                        border: `1px solid ${currentName === spot.name ? 'var(--moss)' : 'var(--paper-deep)'}`,
                        borderRadius: '4px',
                        fontSize: '12px',
                        letterSpacing: '0.5px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontFamily: 'Noto Sans SC, sans-serif',
                      }}
                    >
                      {spot.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 确认按钮 */}
              <motion.button
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.99 }}
                onClick={confirmName}
                style={{
                  width: '100%',
                  padding: '13px',
                  background: 'var(--moss)',
                  color: 'var(--paper)',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: 'Noto Serif SC, serif',
                  fontSize: '14px',
                  letterSpacing: '4px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 12px rgba(74,110,82,0.25)',
                }}
              >
                {namingIndex < pendingFiles.length - 1 ? '下一张 →' : '加入照片墙'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CommentBoard photo={commentPhoto} onClose={() => setCommentPhoto(null)} />

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(28,28,26,0.88)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1000, cursor: 'pointer',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, rotate: lightbox.rotation }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ background: '#fff', padding: '16px 16px 40px', boxShadow: '0 32px 64px rgba(0,0,0,0.4)', maxWidth: '90vw', maxHeight: '90vh' }}
            >
              <img src={lightbox.src} alt={lightbox.name} style={{ maxWidth: '80vw', maxHeight: '70vh', objectFit: 'contain', display: 'block', filter: 'sepia(6%) saturate(90%)' }} />
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '14px', color: '#333', letterSpacing: '3px' }}>{lightbox.name}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', letterSpacing: '1px' }}>
                  {lightbox.lat} · {lightbox.lng} · {lightbox.weather}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function PolaroidCard({ photo, onRemove, onReplace, onOpen, onComment, dense }: {
  photo: Photo
  onRemove: (id: string) => void
  onReplace: (id: string, src: string) => void
  onOpen: (p: Photo) => void
  onComment: (p: Photo) => void
  dense: boolean
}) {
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [imgError, setImgError] = useState(false)
  const matPadding = 0
  const matRadius = 4

  useEffect(() => {
    setImgError(false)
  }, [photo.src])

  const handleReplaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      if (ev.target?.result) onReplace(photo.id, ev.target.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      animate={{ rotate: hovered ? 0 : photo.rotation, y: hovered ? -6 : 0, scale: hovered ? 1.03 : 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        background: '#fefefe',
        padding: dense ? '6px' : '8px',
        boxShadow: hovered ? '0 20px 48px rgba(28,28,26,0.16)' : '0 3px 16px rgba(28,28,26,0.09)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'box-shadow 0.3s ease',
      }}
      onClick={() => onOpen(photo)}
    >
      {/* 照片 */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--paper-warm)',
          padding: `${matPadding}px`,
          borderRadius: `${matRadius}px`,
          border: dense ? '1px solid rgba(74,110,82,0.35)' : '1.5px solid rgba(74,110,82,0.35)',
          boxShadow: matPadding ? 'inset 0 0 0 1px rgba(74,110,82,0.10)' : undefined,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: `${matRadius}px` }}>
          {!imgError ? (
            <motion.img
              src={photo.src}
              alt={photo.name}
              animate={{ scale: hovered ? 1.04 : 1 }}
              transition={{ duration: 0.4 }}
              onError={() => setImgError(true)}
              style={{
                width: '100%',
                display: 'block',
                aspectRatio: '4/3',
                objectFit: 'cover',
                position: 'relative',
                zIndex: 2,
                filter: 'sepia(8%) saturate(85%) brightness(1.02)',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                aspectRatio: '4/3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ink-muted)',
                fontSize: '12px',
                letterSpacing: '1px',
                background: 'rgba(255,255,255,0.55)',
              }}
            >
              图片加载失败
            </div>
          )}
          {/* 悬停信息 */}
          <motion.div
            animate={{ opacity: hovered ? 1 : 0 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(28,28,26,0.62) 0%, transparent 55%)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '12px',
              zIndex: 3,
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '2px' }}>
              📍 {photo.lat}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '3px' }}>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{photo.lng}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: '12px' }}>
              {photo.weather} 天气记录
            </div>
          </motion.div>
        </div>
      </div>

      {/* 拍立得底部名称 */}
      <div style={{ textAlign: 'center', marginTop: '8px', padding: '0 4px', paddingBottom: '4px' }}>
        <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '12px', color: '#555', letterSpacing: '3px' }}>
          {photo.name}
        </div>
      </div>

      {/* 删除按钮 */}
      <motion.button
        animate={{ opacity: hovered ? 1 : 0, scale: hovered ? 1 : 0.7 }}
        onClick={e => { e.stopPropagation(); onRemove(photo.id) }}
        style={{
          position: 'absolute', top: '6px', right: '6px',
          width: '22px', height: '22px',
          background: 'rgba(176,48,48,0.82)', border: 'none',
          borderRadius: '50%', color: '#fff', fontSize: '12px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ×
      </motion.button>

      {/* 留言按钮 */}
      <motion.button
        animate={{ opacity: hovered ? 1 : 0, scale: hovered ? 1 : 0.7 }}
        onClick={e => { e.stopPropagation(); onComment(photo) }}
        style={{
          position: 'absolute', bottom: '38px', right: '8px',
          padding: '4px 10px',
          background: 'rgba(74,110,82,0.88)',
          border: 'none', borderRadius: '12px',
          color: '#fff', fontSize: '11px', letterSpacing: '1px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
          fontFamily: 'Noto Sans SC, sans-serif',
          backdropFilter: 'blur(4px)',
        }}
      >
        <span style={{ fontSize: '12px' }}>💬</span> 留言
      </motion.button>

      {/* 替换图片按钮 */}
      <motion.button
        animate={{ opacity: hovered ? 1 : 0, scale: hovered ? 1 : 0.7 }}
        onClick={e => { e.stopPropagation(); replaceInputRef.current?.click() }}
        style={{
          position: 'absolute', bottom: '38px', left: '8px',
          padding: '4px 10px',
          background: 'rgba(80,100,140,0.88)',
          border: 'none', borderRadius: '12px',
          color: '#fff', fontSize: '11px', letterSpacing: '1px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
          fontFamily: 'Noto Sans SC, sans-serif',
          backdropFilter: 'blur(4px)',
        }}
      >
        <span style={{ fontSize: '12px' }}>🔄</span> 替换
      </motion.button>
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        onChange={handleReplaceFile}
        style={{ display: 'none' }}
        onClick={e => e.stopPropagation()}
      />
    </motion.div>
  )
}
