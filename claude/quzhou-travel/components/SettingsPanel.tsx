'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getConfig, saveConfig, SILICONFLOW_MODELS, DEFAULT_CONFIG, callSiliconFlow } from '@/lib/config'

type Config = typeof DEFAULT_CONFIG

export default function SettingsPanel() {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState<'mcp' | 'ai' | null>(null)
  const [testResult, setTestResult] = useState<{ type: 'mcp' | 'ai'; ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    setCfg(getConfig())
  }, [open])

  const handleSave = () => {
    saveConfig(cfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testMcp = async () => {
    setTesting('mcp')
    setTestResult(null)
    try {
      const res = await fetch(cfg.xhsMcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        setTestResult({ type: 'mcp', ok: true, msg: `连接成功 · HTTP ${res.status}` })
      } else {
        setTestResult({ type: 'mcp', ok: false, msg: `HTTP ${res.status}` })
      }
    } catch (e: unknown) {
      setTestResult({ type: 'mcp', ok: false, msg: (e as Error).message || '连接超时' })
    } finally {
      setTesting(null)
    }
  }

  const testAi = async () => {
    setTesting('ai')
    setTestResult(null)
    // 临时保存当前输入的key用于测试
    const tempCfg = { ...getConfig(), ...cfg }
    saveConfig(tempCfg)
    try {
      const reply = await callSiliconFlow('用一句话介绍衢州')
      setTestResult({ type: 'ai', ok: true, msg: reply.slice(0, 60) + '…' })
    } catch (e: unknown) {
      setTestResult({ type: 'ai', ok: false, msg: (e as Error).message || '调用失败' })
    } finally {
      setTesting(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    background: 'rgba(255,255,255,0.7)',
    border: '1px solid var(--paper-deep)',
    borderRadius: '6px',
    fontFamily: 'Noto Sans SC, monospace',
    fontSize: '12px',
    color: 'var(--ink)',
    outline: 'none',
    letterSpacing: '0.3px',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04)',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'var(--ink-muted)',
    letterSpacing: '1.5px',
    marginBottom: '6px',
    display: 'block',
    textTransform: 'uppercase' as const,
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: '28px',
    paddingBottom: '24px',
    borderBottom: '1px solid var(--paper-deep)',
  }

  return (
    <>
      {/* 齿轮按钮 */}
      <motion.button
        whileHover={{ rotate: 45, scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        transition={{ duration: 0.3 }}
        title="配置设置"
        style={{
          width: '36px', height: '36px',
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.7)',
          borderRadius: '50%',
          boxShadow: '0 2px 12px rgba(28,28,26,0.08)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px',
        }}
      >
        ⚙️
      </motion.button>

      {/* 遮罩 */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(28,28,26,0.3)',
                backdropFilter: 'blur(4px)',
                zIndex: 998,
              }}
            />

            {/* 抽屉 */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 'min(420px, 95vw)',
                background: 'rgba(240,237,230,0.97)',
                backdropFilter: 'blur(20px)',
                boxShadow: '-8px 0 40px rgba(28,28,26,0.12)',
                zIndex: 999,
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* 抽屉头部 */}
              <div style={{
                padding: '24px 24px 20px',
                borderBottom: '1px solid var(--paper-deep)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
              }}>
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '4px', color: 'var(--moss-light)', marginBottom: '3px' }}>SETTINGS</div>
                  <h3 style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '18px', fontWeight: 600, letterSpacing: '2px' }}>
                    配置中心
                  </h3>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    width: '32px', height: '32px',
                    background: 'rgba(255,255,255,0.6)',
                    border: '1px solid var(--paper-deep)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: 'var(--ink-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </div>

              {/* 抽屉内容 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

                {/* ===== XHS MCP 配置 ===== */}
                <div style={sectionStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '18px' }}>📕</span>
                    <div>
                      <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '15px', fontWeight: 600, letterSpacing: '1px' }}>
                        小红书 MCP
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-muted)', letterSpacing: '0.5px' }}>
                        民宿笔记数据来源
                      </div>
                    </div>
                  </div>

                  <label style={labelStyle}>MCP 服务地址</label>
                  <input
                    style={inputStyle}
                    value={cfg.xhsMcpUrl}
                    onChange={e => setCfg(c => ({ ...c, xhsMcpUrl: e.target.value }))}
                    placeholder="https://v1.broxy.dev/mcp/..."
                    spellCheck={false}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--ink-muted)', marginTop: '6px', letterSpacing: '0.5px' }}>
                    在 Cherry Studio → MCP 服务器 中查看你的 URL
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                    <button
                      onClick={testMcp}
                      disabled={testing === 'mcp'}
                      style={{
                        padding: '7px 16px',
                        background: 'var(--moss)',
                        color: 'var(--paper)',
                        border: 'none',
                        borderRadius: '5px',
                        fontSize: '12px',
                        letterSpacing: '2px',
                        cursor: testing === 'mcp' ? 'not-allowed' : 'pointer',
                        fontFamily: 'Noto Serif SC, serif',
                        opacity: testing === 'mcp' ? 0.7 : 1,
                      }}
                    >
                      {testing === 'mcp' ? '测试中…' : '测试连接'}
                    </button>
                    {testResult?.type === 'mcp' && (
                      <span style={{ fontSize: '12px', color: testResult.ok ? 'var(--moss)' : 'var(--seal)', letterSpacing: '0.5px' }}>
                        {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
                      </span>
                    )}
                  </div>
                </div>

                {/* ===== 硅基流动 API ===== */}
                <div style={sectionStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '18px' }}>🤖</span>
                    <div>
                      <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: '15px', fontWeight: 600, letterSpacing: '1px' }}>
                        硅基流动 API
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-muted)', letterSpacing: '0.5px' }}>
                        AI 路线生成 / 民宿描述优化
                      </div>
                    </div>
                  </div>

                  <label style={labelStyle}>API Key</label>
                  <input
                    style={inputStyle}
                    type="password"
                    value={cfg.siliconflowApiKey}
                    onChange={e => setCfg(c => ({ ...c, siliconflowApiKey: e.target.value }))}
                    placeholder="sk-..."
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <div style={{ fontSize: '11px', color: 'var(--ink-muted)', marginTop: '6px', letterSpacing: '0.5px' }}>
                    前往 <a href="https://cloud.siliconflow.cn" target="_blank" rel="noreferrer" style={{ color: 'var(--moss)', textDecoration: 'none' }}>cloud.siliconflow.cn</a> 获取
                  </div>

                  <label style={{ ...labelStyle, marginTop: '16px' }}>API Base URL</label>
                  <input
                    style={inputStyle}
                    value={cfg.siliconflowBaseUrl}
                    onChange={e => setCfg(c => ({ ...c, siliconflowBaseUrl: e.target.value }))}
                    placeholder="https://api.siliconflow.cn/v1"
                    spellCheck={false}
                  />

                  <label style={{ ...labelStyle, marginTop: '16px' }}>模型选择</label>
                  <select
                    style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' as const }}
                    value={cfg.siliconflowModel}
                    onChange={e => setCfg(c => ({ ...c, siliconflowModel: e.target.value }))}
                  >
                    {SILICONFLOW_MODELS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                    <option value="custom">自定义…</option>
                  </select>

                  {cfg.siliconflowModel === 'custom' && (
                    <input
                      style={{ ...inputStyle, marginTop: '8px' }}
                      placeholder="输入模型名称，如 Qwen/Qwen2.5-14B-Instruct"
                      onChange={e => setCfg(c => ({ ...c, siliconflowModel: e.target.value }))}
                      spellCheck={false}
                    />
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                    <button
                      onClick={testAi}
                      disabled={testing === 'ai' || !cfg.siliconflowApiKey}
                      style={{
                        padding: '7px 16px',
                        background: cfg.siliconflowApiKey ? 'var(--moss)' : 'var(--ink-muted)',
                        color: 'var(--paper)',
                        border: 'none',
                        borderRadius: '5px',
                        fontSize: '12px',
                        letterSpacing: '2px',
                        cursor: (!cfg.siliconflowApiKey || testing === 'ai') ? 'not-allowed' : 'pointer',
                        fontFamily: 'Noto Serif SC, serif',
                        opacity: testing === 'ai' ? 0.7 : 1,
                      }}
                    >
                      {testing === 'ai' ? '测试中…' : '测试 AI'}
                    </button>
                    {testResult?.type === 'ai' && (
                      <span style={{ fontSize: '11px', color: testResult.ok ? 'var(--moss)' : 'var(--seal)', letterSpacing: '0.5px', flex: 1 }}>
                        {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
                      </span>
                    )}
                  </div>
                </div>

                {/* ===== 使用说明 ===== */}
                <div style={{ padding: '16px', background: 'rgba(74,110,82,0.06)', borderRadius: '8px', borderLeft: '3px solid var(--moss-pale)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--ink-muted)', lineHeight: 1.8, letterSpacing: '0.5px' }}>
                    <strong style={{ color: 'var(--ink-light)', fontWeight: 500 }}>配置说明</strong><br />
                    · 配置保存在本地浏览器，刷新不丢失<br />
                    · XHS MCP 搜索民宿笔记<br />
                    · 硅基流动 AI 用于路线生成、笔记摘要等<br />
                    · MCP 离线时自动展示示例数据
                  </div>
                </div>
              </div>

              {/* 底部保存按钮 */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--paper-deep)',
                flexShrink: 0,
                background: 'rgba(240,237,230,0.95)',
              }}>
                <motion.button
                  whileHover={{ scale: 1.01, y: -1 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleSave}
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: saved ? 'var(--spring)' : 'var(--moss)',
                    color: 'var(--paper)',
                    border: 'none',
                    borderRadius: '7px',
                    fontFamily: 'Noto Serif SC, serif',
                    fontSize: '14px',
                    letterSpacing: '4px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 12px rgba(74,110,82,0.25)',
                    transition: 'background 0.3s ease',
                  }}
                >
                  {saved ? '✓ 已保存' : '保 存 配 置'}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
