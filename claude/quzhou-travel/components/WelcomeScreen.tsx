'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { saveUser, getMBTIAvatar, MBTI_TYPES, type MBTIType, getConfig } from '@/lib/config'

interface Props { onDone: () => void }

const WELCOME_POEMS = [
  '清明时节雨纷纷，路上行人欲断魂',
  '三衢道中，芳草鲜美，落英缤纷',
  '迟日江山丽，春风花草香',
  '绿树村边合，青山郭外斜',
]

const MBTI_LABELS: Record<string, string> = {
  INTJ:'建筑师', INTP:'逻辑学家', ENTJ:'指挥官', ENTP:'辩论家',
  INFJ:'提倡者', INFP:'调停者', ENFJ:'主人公', ENFP:'竞选者',
  ISTJ:'物流师', ISFJ:'守卫者', ESTJ:'总经理', ESFJ:'执政官',
  ISTP:'鉴赏家', ISFP:'探险家', ESTP:'企业家', ESFP:'表演者',
}

export default function WelcomeScreen({ onDone }: Props) {
  const [step, setStep] = useState<'intro'|'naming'|'mbti'|'done'>('intro')
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'male'|'female'>('female')
  const [mbti, setMbti] = useState<MBTIType|''>('')
  const [avatar, setAvatar] = useState('')
  const [error, setError] = useState('')
  const [poem] = useState(() => WELCOME_POEMS[Math.floor(Math.random()*WELCOME_POEMS.length)])

  const handleNameDone = () => {
    if (!name.trim()) { setError('请输入你的名字'); return }
    setError('')
    setStep('mbti')
  }

  const handleMBTISelect = (type: MBTIType) => {
    setMbti(type)
    const url = getMBTIAvatar(type, gender)
    setAvatar(url)
    setStep('done')
  }

  const handleConfirm = () => {
    if (!avatar || !mbti) return
    saveUser({ name: name.trim(), avatar, joinedAt: new Date().toLocaleString('zh-CN') })
    onDone()
  }

  const handleReselect = () => {
    setMbti('')
    setAvatar('')
    setStep('mbti')
  }

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      style={{ position:'fixed', inset:0, zIndex:2000, background:'var(--paper)',
        display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>

      {/* 飘叶 */}
      {[...Array(6)].map((_,i) => (
        <motion.div key={i}
          animate={{ y:['0vh','110vh'], x:[0, i%2===0?40:-40], rotate:[0, 360*(i%2===0?1:-1)] }}
          transition={{ duration:6+i*1.5, delay:i*0.8, repeat:Infinity, ease:'linear' }}
          style={{ position:'absolute', left:`${10+i*15}%`, top:'-20px',
            width:`${6+i*2}px`, height:`${9+i*2}px`, borderRadius:'50% 0 50% 0',
            background:`rgba(74,110,82,${0.08+i*0.02})`, pointerEvents:'none' }}
        />
      ))}

      <div style={{ position:'relative', zIndex:1, width:'min(520px,94vw)', textAlign:'center' }}>
        <AnimatePresence mode="wait">

          {/* ===== STEP 1: 欢迎 ===== */}
          {step==='intro' && (
            <motion.div key="intro" initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}}>
              <motion.div initial={{rotate:-15,opacity:0}} animate={{rotate:-10,opacity:0.6}} transition={{delay:0.3}}
                style={{ display:'inline-block', border:'2px solid var(--seal)', padding:'8px 14px', marginBottom:'28px', transform:'rotate(-10deg)' }}>
                <span className="font-calligraphy" style={{ fontSize:'13px', color:'var(--seal)', letterSpacing:'2px' }}>清明踏青</span>
              </motion.div>
              <motion.h1 className="font-calligraphy" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.4}}
                style={{ fontSize:'clamp(48px,12vw,80px)', lineHeight:1, color:'var(--ink)', marginBottom:'16px', letterSpacing:'6px' }}>
                衢<span style={{color:'var(--moss)'}}>州</span>
              </motion.h1>
              <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.6}}
                style={{ fontFamily:'Noto Serif SC,serif', fontSize:'13px', color:'var(--ink-muted)', letterSpacing:'3px', marginBottom:'28px' }}>
                「{poem}」
              </motion.p>
              <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:0.8}}
                style={{ padding:'20px 24px', background:'rgba(255,255,255,0.45)', backdropFilter:'blur(8px)',
                  border:'1px solid rgba(255,255,255,0.7)', borderRadius:'16px', marginBottom:'24px' }}>
                <p style={{ fontSize:'14px', color:'var(--ink-light)', lineHeight:2, letterSpacing:'1px' }}>
                  欢迎来到衢州清明旅行地图<br/>
                  <span style={{color:'var(--ink-muted)',fontSize:'13px'}}>选择你的 MBTI · 生成专属卡通头像</span><br/>
                  <span style={{color:'var(--ink-muted)',fontSize:'13px'}}>记录打卡足迹，给照片留下专属留言</span>
                </p>
              </motion.div>
              <motion.button initial={{opacity:0}} animate={{opacity:1}} transition={{delay:1}}
                whileHover={{scale:1.03,y:-2}} whileTap={{scale:0.97}}
                onClick={() => setStep('naming')}
                style={{ padding:'14px 48px', background:'linear-gradient(135deg,var(--moss),var(--moss-light))',
                  color:'var(--paper)', border:'none', borderRadius:'32px',
                  fontFamily:'Noto Serif SC,serif', fontSize:'16px', letterSpacing:'4px',
                  cursor:'pointer', boxShadow:'0 4px 20px rgba(74,110,82,0.3)' }}>
                开始旅程
              </motion.button>
            </motion.div>
          )}

          {/* ===== STEP 2: 取名 + 性别 ===== */}
          {step==='naming' && (
            <motion.div key="naming" initial={{opacity:0,x:30}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-30}}>
              <div style={{ marginBottom:'28px' }}>
                <div style={{ fontSize:'11px', letterSpacing:'4px', color:'var(--moss-light)', marginBottom:'8px', textTransform:'uppercase' }}>Your Identity</div>
                <h2 style={{ fontFamily:'Noto Serif SC,serif', fontSize:'24px', fontWeight:600, letterSpacing:'4px', color:'var(--ink)' }}>给自己取个名字</h2>
                <p style={{ fontSize:'13px', color:'var(--ink-muted)', marginTop:'6px', letterSpacing:'1px' }}>无长度限制，随心取名</p>
              </div>
              <input autoFocus value={name} onChange={e=>{setName(e.target.value);setError('')}}
                onKeyDown={e=>e.key==='Enter'&&handleNameDone()}
                placeholder="你的旅行昵称…"
                style={{ width:'100%', padding:'16px 20px', background:'rgba(255,255,255,0.7)', backdropFilter:'blur(8px)',
                  border:`1px solid ${error?'var(--seal)':'var(--paper-deep)'}`, borderRadius:'12px',
                  fontFamily:'Noto Serif SC,serif', fontSize:'20px', color:'var(--ink)', outline:'none',
                  textAlign:'center', letterSpacing:'3px', marginBottom:'6px',
                  boxShadow:'0 2px 12px rgba(28,28,26,0.06)', transition:'border-color 0.2s' }} />
              {error && <p style={{ fontSize:'12px', color:'var(--seal)', marginBottom:'12px' }}>{error}</p>}

              {/* 性别 */}
              <div style={{ marginTop:'16px', marginBottom:'20px' }}>
                <div style={{ fontSize:'11px', color:'var(--ink-muted)', letterSpacing:'2px', marginBottom:'10px' }}>头像风格</div>
                <div style={{ display:'flex', gap:'12px' }}>
                  {([['female','👧 女生风格'],['male','👦 男生风格']] as const).map(([g,label])=>(
                    <button key={g} onClick={()=>setGender(g)}
                      style={{ flex:1, padding:'12px 8px',
                        background:gender===g?'var(--moss)':'rgba(255,255,255,0.6)',
                        color:gender===g?'var(--paper)':'var(--ink-muted)',
                        border:`1.5px solid ${gender===g?'var(--moss)':'var(--paper-deep)'}`,
                        borderRadius:'10px', fontFamily:'Noto Serif SC,serif', fontSize:'14px',
                        letterSpacing:'1px', cursor:'pointer', transition:'all 0.2s ease' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <motion.button whileHover={{scale:1.02,y:-1}} whileTap={{scale:0.98}} onClick={handleNameDone}
                style={{ width:'100%', padding:'14px', background:'linear-gradient(135deg,var(--moss),var(--moss-light))',
                  color:'var(--paper)', border:'none', borderRadius:'12px',
                  fontFamily:'Noto Serif SC,serif', fontSize:'16px', letterSpacing:'4px',
                  cursor:'pointer', boxShadow:'0 4px 16px rgba(74,110,82,0.25)' }}>
                选择我的 MBTI →
              </motion.button>
            </motion.div>
          )}

          {/* ===== STEP 3: MBTI 选择 ===== */}
          {step==='mbti' && (
            <motion.div key="mbti" initial={{opacity:0,x:30}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-30}}>
              <div style={{ marginBottom:'20px' }}>
                <div style={{ fontSize:'11px', letterSpacing:'4px', color:'var(--moss-light)', marginBottom:'6px', textTransform:'uppercase' }}>MBTI</div>
                <h2 style={{ fontFamily:'Noto Serif SC,serif', fontSize:'22px', fontWeight:600, letterSpacing:'3px', color:'var(--ink)' }}>
                  你的 MBTI 是？
                </h2>
                <p style={{ fontSize:'12px', color:'var(--ink-muted)', marginTop:'4px', letterSpacing:'1px' }}>
                  点击选择，系统将为「{name}」生成对应头像
                </p>
              </div>

              {/* MBTI 4×4 网格 */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px', marginBottom:'16px' }}>
                {MBTI_TYPES.map(type => {
                  const previewUrl = getMBTIAvatar(type, gender)
                  return (
                    <motion.button key={type} whileHover={{scale:1.06,y:-2}} whileTap={{scale:0.96}}
                      onClick={()=>handleMBTISelect(type)}
                      style={{ padding:'8px 4px', background:'rgba(255,255,255,0.6)', backdropFilter:'blur(8px)',
                        border:'1.5px solid rgba(255,255,255,0.8)', borderRadius:'10px',
                        cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'4px',
                        boxShadow:'0 2px 8px rgba(28,28,26,0.06)', transition:'box-shadow 0.2s' }}>
                      <img src={previewUrl} alt={type}
                        style={{ width:'44px', height:'44px', borderRadius:'50%', objectFit:'cover',
                          border:'2px solid rgba(255,255,255,0.9)', boxShadow:'0 2px 8px rgba(28,28,26,0.12)' }} />
                      <div style={{ fontFamily:'monospace', fontSize:'10px', fontWeight:700, color:'var(--ink-light)', letterSpacing:'0.5px' }}>{type}</div>
                      <div style={{ fontSize:'9px', color:'var(--ink-muted)', letterSpacing:'0.3px' }}>{MBTI_LABELS[type]}</div>
                    </motion.button>
                  )
                })}
              </div>

              <button onClick={()=>setStep('naming')}
                style={{ fontSize:'12px', color:'var(--ink-muted)', background:'none', border:'none', cursor:'pointer', letterSpacing:'1px', textDecoration:'underline' }}>
                ← 返回修改名字
              </button>
            </motion.div>
          )}

          {/* ===== STEP 4: 确认 ===== */}
          {step==='done' && avatar && (
            <motion.div key="done" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0}}>
              <motion.div initial={{scale:0.8,opacity:0}} animate={{scale:1,opacity:1}}
                transition={{type:'spring',damping:15,stiffness:200}}
                style={{ width:'110px', height:'110px', borderRadius:'50%', overflow:'hidden',
                  margin:'0 auto 16px', border:'4px solid var(--paper)',
                  boxShadow:'0 8px 32px rgba(74,110,82,0.2)' }}>
                <img src={avatar} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              </motion.div>

              <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.15}}>
                <p style={{ fontFamily:'Noto Serif SC,serif', fontSize:'22px', color:'var(--ink)', letterSpacing:'4px', marginBottom:'4px' }}>{name}</p>
                <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', padding:'4px 14px',
                  background:'rgba(74,110,82,0.1)', borderRadius:'20px', marginBottom:'6px' }}>
                  <span style={{ fontFamily:'monospace', fontSize:'14px', fontWeight:700, color:'var(--moss)', letterSpacing:'1px' }}>{mbti}</span>
                  <span style={{ fontSize:'12px', color:'var(--moss)', letterSpacing:'1px' }}>· {MBTI_LABELS[mbti]}</span>
                </div>
                <p style={{ fontSize:'12px', color:'var(--ink-muted)', letterSpacing:'1px', marginBottom:'24px' }}>
                  你的旅行身份已生成 ✓
                </p>
              </motion.div>

              <div style={{ display:'flex', gap:'12px' }}>
                <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} onClick={handleReselect}
                  style={{ flex:1, padding:'12px', background:'rgba(255,255,255,0.6)', backdropFilter:'blur(8px)',
                    border:'1px solid var(--paper-deep)', borderRadius:'10px',
                    fontFamily:'Noto Serif SC,serif', fontSize:'14px', letterSpacing:'2px',
                    cursor:'pointer', color:'var(--ink-muted)' }}>
                  重选 MBTI
                </motion.button>
                <motion.button whileHover={{scale:1.02,y:-1}} whileTap={{scale:0.98}} onClick={handleConfirm}
                  style={{ flex:2, padding:'12px', background:'linear-gradient(135deg,var(--moss),var(--moss-light))',
                    color:'var(--paper)', border:'none', borderRadius:'10px',
                    fontFamily:'Noto Serif SC,serif', fontSize:'14px', letterSpacing:'3px',
                    cursor:'pointer', boxShadow:'0 4px 16px rgba(74,110,82,0.25)' }}>
                  就这个，出发！
                </motion.button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  )
}
