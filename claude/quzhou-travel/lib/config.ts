'use client'

// ========== 默认配置 ==========
export const DEFAULT_CONFIG = {
  // 小红书 MCP
  xhsMcpUrl: 'https://v1.broxy.dev/mcp/5e1661de-1978-4bfb-a709-9b2acaccee34',

  // 硅基流动 API
  siliconflowApiKey: '',
  siliconflowBaseUrl: 'https://api.siliconflow.cn/v1',
  siliconflowModel: 'Qwen/Qwen2.5-7B-Instruct',  // 默认模型，可改
}

const CONFIG_KEY = 'quzhou_travel_config'

// ========== 读写工具 ==========
export function getConfig(): typeof DEFAULT_CONFIG {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const saved = localStorage.getItem(CONFIG_KEY)
    if (!saved) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...JSON.parse(saved) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(config: Partial<typeof DEFAULT_CONFIG>) {
  if (typeof window === 'undefined') return
  const current = getConfig()
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...current, ...config }))
}

// ========== XHS MCP 调用 ==========
// MCP 调用返回类型：包含原始数据便于调试
export interface McpResult {
  notes: Record<string, unknown>[]
  rawResponse: string   // 原始响应，用于调试链接字段
  toolName: string      // 实际调用的工具名
}

async function mcpPost(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const ct = res.headers.get('content-type') || ''
  const text = await res.text()
  // SSE 格式：取最后一个有效 data 行
  if (ct.includes('event-stream') || text.startsWith('data:')) {
    const lines = text.split('\n').filter(l => l.startsWith('data: ') && l.length > 6)
    for (const line of lines.reverse()) {
      try { return JSON.parse(line.slice(6)) } catch {}
    }
    throw new Error('SSE 无有效数据行')
  }
  return JSON.parse(text)
}

export async function callXhsMcp(keyword: string, count = 9): Promise<McpResult> {
  const { xhsMcpUrl } = getConfig()
  if (!xhsMcpUrl) throw new Error('未配置 XHS MCP 地址')

  // Step 1: 获取真实工具列表
  let toolName = 'search_notes'
  try {
    const listRaw = await mcpPost(xhsMcpUrl, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) as Record<string, unknown>
    const tools = (listRaw?.result as Record<string, unknown>)?.tools as { name: string; description?: string }[]
    if (Array.isArray(tools) && tools.length > 0) {
      // 优先找搜索/笔记相关工具
      const found = tools.find(t =>
        /search|note|find|query|笔记|搜索/i.test(t.name + (t.description || ''))
      ) || tools[0]
      toolName = found.name
    }
  } catch { /* 用默认 search_notes */ }

  // Step 2: 调用工具
  const callRaw = await mcpPost(xhsMcpUrl, {
    jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
    params: { name: toolName, arguments: { keyword, count, num: count, limit: count } }
  }) as Record<string, unknown>

  const rawResponse = JSON.stringify(callRaw, null, 2)

  // Step 3: 多层解析，尽可能提取笔记列表
  const notes = extractNotes(callRaw, count)
  return { notes, rawResponse, toolName }
}

function extractNotes(raw: unknown, count: number): Record<string, unknown>[] {
  if (!raw || typeof raw !== 'object') return []
  const r = raw as Record<string, unknown>

  // 直接是数组
  if (Array.isArray(raw)) return (raw as Record<string, unknown>[]).slice(0, count)

  // result 层
  const result = r.result
  if (Array.isArray(result)) return (result as Record<string, unknown>[]).slice(0, count)

  if (result && typeof result === 'object') {
    const res = result as Record<string, unknown>

    // result.content 是 MCP 标准格式
    if (Array.isArray(res.content)) {
      const content = res.content as Record<string, unknown>[]
      // 找 text 类型的 block
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          const parsed = tryParseJson(block.text)
          if (parsed) {
            if (Array.isArray(parsed)) return (parsed as Record<string, unknown>[]).slice(0, count)
            // 可能是 {items: [...]} 或 {notes: [...]} 或 {data: [...]}
            const lists = ['items','notes','data','results','list','records']
            for (const k of lists) {
              if (Array.isArray((parsed as Record<string, unknown>)[k])) {
                return ((parsed as Record<string, unknown>)[k] as Record<string, unknown>[]).slice(0, count)
              }
            }
            // 单条笔记对象
            if (typeof parsed === 'object' && parsed !== null) {
              return [parsed as Record<string, unknown>]
            }
          }
          // 纯文本降级
          return textToNotes(block.text, count)
        }
      }
    }

    // result 本身有 items/notes/data
    const lists = ['items','notes','data','results','list','records']
    for (const k of lists) {
      if (Array.isArray(res[k])) return (res[k] as Record<string, unknown>[]).slice(0, count)
    }
  }

  return []
}

function tryParseJson(text: string): unknown {
  const t = text.trim()
  // 去掉 markdown 代码块
  const cleaned = t.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()
  try { return JSON.parse(cleaned) } catch {}
  try { return JSON.parse(t) } catch {}
  return null
}

function textToNotes(text: string, count: number): Record<string, unknown>[] {
  return text.split(/\n\n+/).filter(p => p.trim()).slice(0, count).map(p => {
    const lines = p.trim().split('\n')
    return { title: lines[0].replace(/^[#*\-\s\d.]+/, '').slice(0, 50), desc: lines.slice(1).join(' ').trim().slice(0, 300) }
  })
}

// ========== 硅基流动 AI 调用 ==========
export async function callSiliconFlow(prompt: string, systemPrompt?: string) {
  const { siliconflowApiKey, siliconflowBaseUrl, siliconflowModel } = getConfig()
  if (!siliconflowApiKey) throw new Error('未配置硅基流动 API Key')

  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const res = await fetch(`${siliconflowBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${siliconflowApiKey}`,
    },
    body: JSON.stringify({
      model: siliconflowModel,
      messages,
      max_tokens: 1024,
      temperature: 0.7,
      stream: false,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`硅基流动 API ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// 硅基流动可用模型列表（常用）
export const SILICONFLOW_MODELS = [
  { value: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B（推荐·免费）' },
  { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5-72B（强力）' },
  { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3' },
  { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek-R1（推理）' },
  { value: 'THUDM/glm-4-9b-chat', label: 'GLM-4-9B' },
  { value: 'meta-llama/Meta-Llama-3.1-8B-Instruct', label: 'Llama-3.1-8B' },
]

// ========== 用户身份存储 ==========
const USER_KEY = 'quzhou_travel_user'

export interface UserProfile {
  name: string
  avatar: string   // base64 or svg data URL
  joinedAt: string
}

export function getUser(): UserProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem(USER_KEY)
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

export function saveUser(user: UserProfile) {
  if (typeof window === 'undefined') return
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearUser() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(USER_KEY)
}

// ========== 留言存储 ==========
const COMMENTS_KEY = 'quzhou_travel_comments'

export interface Comment {
  id: string
  photoId: string
  userName: string
  userAvatar: string
  text: string
  createdAt: string
}

export function getComments(photoId: string): Comment[] {
  if (typeof window === 'undefined') return []
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}')
    return all[photoId] || []
  } catch { return [] }
}

export function addComment(comment: Comment) {
  if (typeof window === 'undefined') return
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}')
    if (!all[comment.photoId]) all[comment.photoId] = []
    all[comment.photoId].unshift(comment)
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all))
  } catch {}
}

export function deleteComment(photoId: string, commentId: string) {
  if (typeof window === 'undefined') return
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}')
    if (all[photoId]) {
      all[photoId] = all[photoId].filter((c: Comment) => c.id !== commentId)
      localStorage.setItem(COMMENTS_KEY, JSON.stringify(all))
    }
  } catch {}
}

// ========== 硅基流动图像生成 ==========
export async function generateAvatar(name: string, gender?: 'male' | 'female'): Promise<string> {
  const { siliconflowApiKey, siliconflowBaseUrl } = getConfig()

  // 无 API Key 时返回 SVG 占位头像
  if (!siliconflowApiKey) {
    return generateSVGAvatar(name, gender)
  }

  try {
    const prompt = `A cute chibi Japanese cartoon character avatar, flat illustration style, ${gender === "female" ? "girl with big round eyes and pink cheeks, cute hairstyle" : "boy with short hair and simple expression"}, representing a person named "${name}". Kawaii style, pastel background, white background, portrait format, no text.`

    const res = await fetch(`${siliconflowBaseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${siliconflowApiKey}`,
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell',
        prompt,
        image_size: '256x256',
        num_inference_steps: 4,
        num_images: 1,
      }),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const url = data?.images?.[0]?.url
    if (url) return url
    throw new Error('无图像URL')
  } catch {
    return generateSVGAvatar(name, gender)
  }
}

// 无 API 时的 SVG 占位头像（根据名字生成色彩）
// ========== 卡通风格 SVG 头像（日系 chibi 风格，男/女两款）==========
export function generateSVGAvatar(name: string, gender?: 'male' | 'female'): string {
  const charCode = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)

  // 根据名字 hash 决定性别（如未传入）
  const isFemale = gender === 'female' || (gender !== 'male' && charCode % 2 === 0)

  // 调色板：肤色固定，服装色根据名字变化
  const skinTone = '#fdd5b1'
  const skinShade = '#f5b88a'
  const hairColors = isFemale
    ? ['#2a1a0e', '#4a2010', '#1a1a2a', '#3a2010', '#5a3018']
    : ['#1a1a1a', '#2a1a0e', '#0a0a18', '#3a2010', '#1a1808']
  const hairColor = hairColors[charCode % hairColors.length]

  const clothColors = isFemale
    ? [['#e05878', '#c03858'], ['#9060c0', '#7040a0'], ['#40a060', '#2a8048'], ['#e07040', '#c05028'], ['#5080c0', '#3060a0']]
    : [['#4060c0', '#2040a0'], ['#406040', '#285028'], ['#804040', '#602828'], ['#408080', '#286068'], ['#606060', '#404040']]
  const [clothMain, clothShade] = clothColors[charCode % clothColors.length]

  const eyeStyles = ['happy', 'normal', 'shy', 'excited', 'calm']
  const eyeStyle = eyeStyles[charCode % eyeStyles.length]
  const mouthStyles = ['smile', 'grin', 'open', 'small']
  const mouthStyle = mouthStyles[(charCode >> 2) % mouthStyles.length]

  // 背景色（柔和）
  const bgColors = ['#fef0f5', '#f0f5fe', '#f0fef5', '#fefaf0', '#f5f0fe', '#f0fefe']
  const bg = bgColors[charCode % bgColors.length]

  // 眼睛 SVG
  function drawEyes(style: string, female: boolean): string {
    const lx = 27, rx = 41, y = 36
    if (style === 'happy') return `
      <path d="M${lx-5} ${y} Q${lx} ${y-5} ${lx+5} ${y}" stroke="#2a1a0e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M${rx-5} ${y} Q${rx} ${y-5} ${rx+5} ${y}" stroke="#2a1a0e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      ${female ? `<circle cx="${lx}" cy="${y+2}" r="3" fill="#f0a0b0" opacity="0.5"/><circle cx="${rx}" cy="${y+2}" r="3" fill="#f0a0b0" opacity="0.5"/>` : ''}
    `
    if (style === 'excited') return `
      <circle cx="${lx}" cy="${y}" r="6" fill="#1a1a1a"/>
      <circle cx="${rx}" cy="${y}" r="6" fill="#1a1a1a"/>
      <circle cx="${lx}" cy="${y}" r="4.5" fill="#3a3a6a"/>
      <circle cx="${rx}" cy="${y}" r="4.5" fill="#3a3a6a"/>
      <circle cx="${lx+2}" cy="${y-2}" r="1.5" fill="white"/>
      <circle cx="${rx+2}" cy="${y-2}" r="1.5" fill="white"/>
      ${female ? `<path d="M${lx-7} ${y-5} Q${lx} ${y-9} ${lx+7} ${y-5}" stroke="#2a1a0e" stroke-width="1.5" fill="none"/>
        <path d="M${rx-7} ${y-5} Q${rx} ${y-9} ${rx+7} ${y-5}" stroke="#2a1a0e" stroke-width="1.5" fill="none"/>` : ''}
      ${female ? `<circle cx="${lx}" cy="${y+5}" r="4" fill="#f0a0b0" opacity="0.45"/><circle cx="${rx}" cy="${y+5}" r="4" fill="#f0a0b0" opacity="0.45"/>` : ''}
    `
    if (style === 'shy') return `
      <circle cx="${lx}" cy="${y}" r="5.5" fill="#1a1a1a"/>
      <circle cx="${rx}" cy="${y}" r="5.5" fill="#1a1a1a"/>
      <circle cx="${lx}" cy="${y}" r="4" fill="#3a3a5a"/>
      <circle cx="${rx}" cy="${y}" r="4" fill="#3a3a5a"/>
      <circle cx="${lx+1.5}" cy="${y-1.5}" r="1.2" fill="white"/>
      <circle cx="${rx+1.5}" cy="${y-1.5}" r="1.2" fill="white"/>
      <path d="M${lx-8} ${y-4} L${lx+8} ${y-4}" stroke="#2a1a0e" stroke-width="1.5" fill="none" opacity="0.8"/>
      <path d="M${rx-8} ${y-4} L${rx+8} ${y-4}" stroke="#2a1a0e" stroke-width="1.5" fill="none" opacity="0.8"/>
      <circle cx="${lx}" cy="${y+5}" r="5" fill="#f08090" opacity="0.5"/>
      <circle cx="${rx}" cy="${y+5}" r="5" fill="#f08090" opacity="0.5"/>
    `
    if (style === 'calm') return `
      <ellipse cx="${lx}" cy="${y}" rx="5.5" ry="4.5" fill="#1a1a1a"/>
      <ellipse cx="${rx}" cy="${y}" rx="5.5" ry="4.5" fill="#1a1a1a"/>
      <ellipse cx="${lx}" cy="${y}" rx="4" ry="3.2" fill="#3a3a5a"/>
      <ellipse cx="${rx}" cy="${y}" rx="4" ry="3.2" fill="#3a3a5a"/>
      <circle cx="${lx+1.5}" cy="${y-1}" r="1.2" fill="white"/>
      <circle cx="${rx+1.5}" cy="${y-1}" r="1.2" fill="white"/>
      ${female ? `<path d="M${lx-7} ${y-7} Q${lx} ${y-11} ${lx+7} ${y-7}" stroke="#2a1a0e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path d="M${rx-7} ${y-7} Q${rx} ${y-11} ${rx+7} ${y-7}" stroke="#2a1a0e" stroke-width="1.8" fill="none" stroke-linecap="round"/>` : ''}
    `
    // normal
    return `
      <ellipse cx="${lx}" cy="${y}" rx="5.5" ry="5.5" fill="#1a1a1a"/>
      <ellipse cx="${rx}" cy="${y}" rx="5.5" ry="5.5" fill="#1a1a1a"/>
      <ellipse cx="${lx}" cy="${y}" rx="4" ry="4" fill="#3a3a6a"/>
      <ellipse cx="${rx}" cy="${y}" rx="4" ry="4" fill="#3a3a6a"/>
      <circle cx="${lx+1.5}" cy="${y-1.5}" r="1.5" fill="white"/>
      <circle cx="${rx+1.5}" cy="${y-1.5}" r="1.5" fill="white"/>
      <circle cx="${lx-1}" cy="${y+1.5}" r="0.8" fill="white" opacity="0.6"/>
      <circle cx="${rx-1}" cy="${y+1.5}" r="0.8" fill="white" opacity="0.6"/>
      ${female ? `<path d="M${lx-7} ${y-7} Q${lx} ${y-11} ${lx+7} ${y-7}" stroke="#2a1a0e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path d="M${rx-7} ${y-7} Q${rx} ${y-11} ${rx+7} ${y-7}" stroke="#2a1a0e" stroke-width="1.8" fill="none" stroke-linecap="round"/>` : ''}
    `
  }

  // 嘴巴 SVG
  function drawMouth(style: string): string {
    const x = 34, y = 46
    if (style === 'grin') return `
      <path d="M${x-8} ${y} Q${x} ${y+8} ${x+8} ${y}" fill="#c06070" stroke="#9a4050" stroke-width="1"/>
      <path d="M${x-6} ${y+1} Q${x} ${y+7} ${x+6} ${y+1}" fill="white"/>
      <line x1="${x-2}" y1="${y}" x2="${x-2}" y2="${y+5}" stroke="#9a4050" stroke-width="0.8" opacity="0.5"/>
      <line x1="${x+2}" y1="${y}" x2="${x+2}" y2="${y+5}" stroke="#9a4050" stroke-width="0.8" opacity="0.5"/>
    `
    if (style === 'open') return `
      <ellipse cx="${x}" cy="${y+3}" rx="7" ry="5" fill="#c06070" stroke="#9a4050" stroke-width="1"/>
      <ellipse cx="${x}" cy="${y+5}" rx="5" ry="3" fill="white" opacity="0.9"/>
    `
    if (style === 'small') return `
      <path d="M${x-4} ${y+1} Q${x} ${y+5} ${x+4} ${y+1}" stroke="#c06070" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    `
    // smile default
    return `
      <path d="M${x-7} ${y} Q${x} ${y+7} ${x+7} ${y}" stroke="#c06070" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M${x-5} ${y+1} Q${x} ${y+5} ${x+5} ${y+1}" fill="white" opacity="0.6"/>
    `
  }

  // 女生发型
  function drawFemaleHair(hc: string): string {
    const variant = charCode % 4
    if (variant === 0) return `
      <!-- 短鲍勃发型 -->
      <ellipse cx="34" cy="25" rx="20" ry="19" fill="${hc}"/>
      <rect x="14" y="25" width="6" height="22" rx="3" fill="${hc}"/>
      <rect x="54" y="25" width="6" height="22" rx="3" fill="${hc}"/>
      <ellipse cx="34" cy="15" rx="20" ry="13" fill="${hc}"/>
      <!-- 刘海 -->
      <path d="M14 24 Q20 16 34 14 Q48 16 54 24" fill="${hc}"/>
      <path d="M16 26 Q22 19 34 18" stroke="${hc}" stroke-width="3" fill="none"/>
    `
    if (variant === 1) return `
      <!-- 双马尾 -->
      <ellipse cx="34" cy="25" rx="19" ry="18" fill="${hc}"/>
      <ellipse cx="34" cy="15" rx="19" ry="12" fill="${hc}"/>
      <path d="M14 24 Q20 16 34 14 Q48 16 54 24" fill="${hc}"/>
      <ellipse cx="12" cy="28" rx="6" ry="12" fill="${hc}" transform="rotate(-15 12 28)"/>
      <ellipse cx="56" cy="28" rx="6" ry="12" fill="${hc}" transform="rotate(15 56 28)"/>
      <circle cx="12" cy="20" r="4" fill="${clothMain}" opacity="0.8"/>
      <circle cx="56" cy="20" r="4" fill="${clothMain}" opacity="0.8"/>
    `
    if (variant === 2) return `
      <!-- 长直发 -->
      <ellipse cx="34" cy="25" rx="20" ry="19" fill="${hc}"/>
      <ellipse cx="34" cy="15" rx="20" ry="13" fill="${hc}"/>
      <rect x="13" y="25" width="8" height="38" rx="4" fill="${hc}"/>
      <rect x="47" y="25" width="8" height="38" rx="4" fill="${hc}"/>
      <path d="M14 24 Q20 16 34 14 Q48 16 54 24" fill="${hc}"/>
    `
    // variant 3: 卷发
    return `
      <ellipse cx="34" cy="25" rx="20" ry="19" fill="${hc}"/>
      <ellipse cx="34" cy="15" rx="20" ry="13" fill="${hc}"/>
      <path d="M14 24 Q20 16 34 14 Q48 16 54 24" fill="${hc}"/>
      <ellipse cx="11" cy="30" rx="7" ry="9" fill="${hc}"/>
      <ellipse cx="57" cy="30" rx="7" ry="9" fill="${hc}"/>
      <ellipse cx="11" cy="40" rx="6" ry="8" fill="${hc}"/>
      <ellipse cx="57" cy="40" rx="6" ry="8" fill="${hc}"/>
    `
  }

  // 男生发型
  function drawMaleHair(hc: string): string {
    const variant = charCode % 3
    if (variant === 0) return `
      <!-- 短寸头 -->
      <ellipse cx="34" cy="22" rx="19" ry="16" fill="${hc}"/>
      <path d="M15 22 Q20 12 34 10 Q48 12 53 22" fill="${hc}"/>
      <path d="M15 22 Q16 18 20 16" fill="${hc}"/>
    `
    if (variant === 1) return `
      <!-- 旁分 -->
      <ellipse cx="34" cy="22" rx="19" ry="16" fill="${hc}"/>
      <path d="M15 22 Q20 12 34 10 Q48 12 53 22" fill="${hc}"/>
      <path d="M15 20 Q18 12 28 10 Q20 14 18 22" fill="${hc}" opacity="0.9"/>
      <path d="M16 22 Q20 14 30 11" stroke="${hc}" stroke-width="2.5" fill="none"/>
    `
    // 竖刘海
    return `
      <ellipse cx="34" cy="22" rx="19" ry="16" fill="${hc}"/>
      <path d="M15 22 Q20 12 34 10 Q48 12 53 22" fill="${hc}"/>
      <rect x="24" y="10" width="5" height="12" rx="2.5" fill="${hc}"/>
      <rect x="31" y="9" width="5" height="14" rx="2.5" fill="${hc}"/>
      <rect x="38" y="10" width="5" height="12" rx="2.5" fill="${hc}"/>
    `
  }

  const svg = isFemale ? `
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <!-- 背景 -->
  <circle cx="40" cy="40" r="40" fill="${bg}"/>
  <!-- 脖子 -->
  <rect x="30" y="54" width="8" height="10" rx="2" fill="${skinTone}"/>
  <rect x="30" y="54" width="8" height="10" rx="2" fill="${skinShade}" opacity="0.3"/>
  <!-- 身体 / 衣服 -->
  <ellipse cx="34" cy="72" rx="16" ry="14" fill="${clothMain}"/>
  <!-- 衣领 -->
  <path d="M26 63 Q34 68 42 63 L40 58 Q34 62 28 58 Z" fill="white" opacity="0.9"/>
  <path d="M28 58 Q34 64 34 64 Q34 64 40 58" stroke="${clothShade}" stroke-width="0.8" fill="none"/>
  <!-- 头部皮肤 -->
  <ellipse cx="34" cy="33" rx="18" ry="20" fill="${skinTone}"/>
  <!-- 耳朵 -->
  <ellipse cx="16" cy="35" rx="4" ry="5" fill="${skinTone}"/>
  <ellipse cx="52" cy="35" rx="4" ry="5" fill="${skinTone}"/>
  <ellipse cx="16" cy="35" rx="2.5" ry="3.5" fill="${skinShade}" opacity="0.3"/>
  <ellipse cx="52" cy="35" rx="2.5" ry="3.5" fill="${skinShade}" opacity="0.3"/>
  <!-- 发型 -->
  ${drawFemaleHair(hairColor)}
  <!-- 眼睛 -->
  ${drawEyes(eyeStyle, true)}
  <!-- 鼻子 -->
  <circle cx="34" cy="42" r="1.2" fill="${skinShade}" opacity="0.6"/>
  <!-- 嘴巴 -->
  ${drawMouth(mouthStyle)}
  <!-- 腮红 -->
  <ellipse cx="22" cy="44" rx="6" ry="4" fill="#f0a0b0" opacity="0.38"/>
  <ellipse cx="46" cy="44" rx="6" ry="4" fill="#f0a0b0" opacity="0.38"/>
</svg>` : `
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <!-- 背景 -->
  <circle cx="40" cy="40" r="40" fill="${bg}"/>
  <!-- 脖子 -->
  <rect x="29" y="54" width="9" height="10" rx="2" fill="${skinTone}"/>
  <!-- 身体 / 衣服 -->
  <ellipse cx="34" cy="73" rx="17" ry="14" fill="${clothMain}"/>
  <!-- 衣领 -->
  <path d="M25 62 Q34 70 43 62 L41 57 Q34 63 27 57 Z" fill="white" opacity="0.9"/>
  <path d="M27 57 Q34 65 34 65 Q34 65 41 57" stroke="${clothShade}" stroke-width="0.8" fill="none"/>
  <!-- 领带 / 领结 -->
  <polygon points="32,60 36,60 35,67 33,67" fill="${clothShade}" opacity="0.8"/>
  <!-- 头部皮肤 -->
  <ellipse cx="34" cy="32" rx="18" ry="20" fill="${skinTone}"/>
  <!-- 耳朵 -->
  <ellipse cx="16" cy="34" rx="4" ry="5" fill="${skinTone}"/>
  <ellipse cx="52" cy="34" rx="4" ry="5" fill="${skinTone}"/>
  <ellipse cx="16" cy="34" rx="2.5" ry="3.5" fill="${skinShade}" opacity="0.3"/>
  <ellipse cx="52" cy="34" rx="2.5" ry="3.5" fill="${skinShade}" opacity="0.3"/>
  <!-- 发型 -->
  ${drawMaleHair(hairColor)}
  <!-- 眼睛 -->
  ${drawEyes(eyeStyle, false)}
  <!-- 鼻子 -->
  <circle cx="34" cy="42" r="1.5" fill="${skinShade}" opacity="0.5"/>
  <!-- 嘴巴 -->
  ${drawMouth(mouthStyle)}
</svg>`

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

// ========== MBTI 头像图库（男生M_ / 女生F_ 各16款）==========
export const MBTI_AVATAR_LIBRARY: Record<string, string> = {
  'M_INTJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2U4ZTBmMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjNjA0MGEwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzQwMjA4MCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiM1YTIwODAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iIzVhMjA4MCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNCIgcnk9IjQiIGZpbGw9IiMxYTFhMWEiLz4KICAgICAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjQiIHJ5PSI0IiBmaWxsPSIjMWExYTFhIi8+CiAgICAgICAgPGNpcmNsZSBjeD0iMzEiIGN5PSIzNyIgcj0iMS4yIiBmaWxsPSJ3aGl0ZSIvPgogICAgICAgIDxjaXJjbGUgY3g9IjUxIiBjeT0iMzciIHI9IjEuMiIgZmlsbD0id2hpdGUiLz4KICA8cmVjdCB4PSIyMiIgeT0iMzQiIHdpZHRoPSIxNCIgaGVpZ2h0PSI5IiByeD0iMSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNDA0MGEwIiBzdHJva2Utd2lkdGg9IjIiLz4KICAgICAgICA8cmVjdCB4PSI0NCIgeT0iMzQiIHdpZHRoPSIxNCIgaGVpZ2h0PSI5IiByeD0iMSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNDA0MGEwIiBzdHJva2Utd2lkdGg9IjIiLz4KICAgICAgICA8bGluZSB4MT0iMzYiIHkxPSIzOCIgeDI9IjQ0IiB5Mj0iMzgiIHN0cm9rZT0iIzQwNDBhMCIgc3Ryb2tlLXdpZHRoPSIxLjUiLz4KICAgICAgICA8bGluZSB4MT0iMjIiIHkxPSIzOCIgeDI9IjE4IiB5Mj0iMzYiIHN0cm9rZT0iIzQwNDBhMCIgc3Ryb2tlLXdpZHRoPSIxLjUiLz4KICAgICAgICA8bGluZSB4MT0iNTgiIHkxPSIzOCIgeDI9IjYyIiB5Mj0iMzYiIHN0cm9rZT0iIzQwNDBhMCIgc3Ryb2tlLXdpZHRoPSIxLjUiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNSIvPgogIDxwYXRoIGQ9Ik0zMiA1MSBRNDAgNTggNDggNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICAgIDxwYXRoIGQ9Ik0zNCA1MiBRNDAgNTYgNDYgNTIiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjUiLz4KPC9zdmc+',
  'F_INTJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2U4ZTBmMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjNjA0MGEwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI2IiByeD0iMjEiIHJ5PSIyMCIgZmlsbD0iIzdhMjBhMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE1IiByeD0iMjEiIHJ5PSIxMyIgZmlsbD0iIzdhMjBhMCIvPgogICAgICAgIDxyZWN0IHg9IjE4IiB5PSIyNiIgd2lkdGg9IjkiIGhlaWdodD0iNDAiIHJ4PSI0LjUiIGZpbGw9IiM3YTIwYTAiLz4KICAgICAgICA8cmVjdCB4PSI1MyIgeT0iMjYiIHdpZHRoPSI5IiBoZWlnaHQ9IjQwIiByeD0iNC41IiBmaWxsPSIjN2EyMGEwIi8+CiAgICAgICAgPHBhdGggZD0iTTE5IDI2IFEyNSAxNiA0MCAxNCBRNTUgMTYgNjEgMjYiIGZpbGw9IiM3YTIwYTAiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxjaXJjbGUgY3g9IjMxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8Y2lyY2xlIGN4PSI1MS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPHBhdGggZD0iTTIzIDMyIFEzMCAyOCAzNyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNNDMgMzIgUTUwIDI4IDU3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'M_INTP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2RkZWVmZiIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjNDA4MGMwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzIwNjBhMCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIxIiByeT0iMTkiIGZpbGw9IiM4YTYwMzAiLz4KICAgICAgICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIxNSIgcng9IjIxIiByeT0iMTMiIGZpbGw9IiM4YTYwMzAiLz4KICAgICAgICA8cGF0aCBkPSJNMTkgMjYgUTI0IDE0IDQwIDEyIFE1NiAxNCA2MSAyNiIgZmlsbD0iIzhhNjAzMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSIyNCIgY3k9IjE2IiByeD0iNyIgcnk9IjUiIGZpbGw9IiM4YTYwMzAiIHRyYW5zZm9ybT0icm90YXRlKC0yMCAyNCAxNikiLz4KICAgICAgICA8ZWxsaXBzZSBjeD0iNTUiIGN5PSIxNCIgcng9IjYiIHJ5PSI0IiBmaWxsPSIjOGE2MDMwIiB0cmFuc2Zvcm09InJvdGF0ZSgxNSA1NSAxNCkiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQiIHJ5PSI0IiBmaWxsPSIjMWExYTFhIi8+CiAgICAgICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzFhMWExYSIvPgogICAgICAgIDxjaXJjbGUgY3g9IjMxIiBjeT0iMzciIHI9IjEuMiIgZmlsbD0id2hpdGUiLz4KICAgICAgICA8Y2lyY2xlIGN4PSI1MSIgY3k9IjM3IiByPSIxLjIiIGZpbGw9IndoaXRlIi8+CiAgPGNpcmNsZSBjeD0iMzAiIGN5PSIzOCIgcj0iNyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjYzA2MDIwIiBzdHJva2Utd2lkdGg9IjIiLz4KICAgICAgICA8Y2lyY2xlIGN4PSI1MCIgY3k9IjM4IiByPSI3IiBmaWxsPSJub25lIiBzdHJva2U9IiNjMDYwMjAiIHN0cm9rZS13aWR0aD0iMiIvPgogICAgICAgIDxsaW5lIHgxPSIzNyIgeTE9IjM4IiB4Mj0iNDMiIHkyPSIzOCIgc3Ryb2tlPSIjYzA2MDIwIiBzdHJva2Utd2lkdGg9IjEuNSIvPgogICAgICAgIDxsaW5lIHgxPSIyMyIgeTE9IjM4IiB4Mj0iMTkiIHkyPSIzNiIgc3Ryb2tlPSIjYzA2MDIwIiBzdHJva2Utd2lkdGg9IjEuNSIvPgogICAgICAgIDxsaW5lIHgxPSI1NyIgeTE9IjM4IiB4Mj0iNjEiIHkyPSIzNiIgc3Ryb2tlPSIjYzA2MDIwIiBzdHJva2Utd2lkdGg9IjEuNSIvPgogIDxjaXJjbGUgY3g9IjQwIiBjeT0iNDQiIHI9IjEuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC41Ii8+CiAgPHBhdGggZD0iTTMyIDUxIFE0MCA1OCA0OCA1MSIgc3Ryb2tlPSIjYzA2MDcwIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogICAgPHBhdGggZD0iTTM0IDUyIFE0MCA1NiA0NiA1MiIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuNSIvPgo8L3N2Zz4=',
  'F_INTP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2RkZWVmZiIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjNDA4MGMwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI2IiByeD0iMjEiIHJ5PSIyMCIgZmlsbD0iI2IwOTBlMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE1IiByeD0iMjEiIHJ5PSIxMyIgZmlsbD0iI2IwOTBlMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSIxOCIgY3k9IjMyIiByeD0iOSIgcnk9IjEyIiBmaWxsPSIjYjA5MGUwIi8+CiAgICAgICAgPGVsbGlwc2UgY3g9IjYyIiBjeT0iMzIiIHJ4PSI5IiByeT0iMTIiIGZpbGw9IiNiMDkwZTAiLz4KICAgICAgICA8ZWxsaXBzZSBjeD0iMTgiIGN5PSI0NCIgcng9IjgiIHJ5PSIxMCIgZmlsbD0iI2IwOTBlMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI2MiIgY3k9IjQ0IiByeD0iOCIgcnk9IjEwIiBmaWxsPSIjYjA5MGUwIi8+CiAgICAgICAgPCEtLSBoZWFkcGhvbmUgLS0+CiAgICAgICAgPHBhdGggZD0iTTIwIDI2IFE0MCAxMiA2MCAyNiIgc3Ryb2tlPSIjODA4MDgwIiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiLz4KICAgICAgICA8cmVjdCB4PSIxNCIgeT0iMjgiIHdpZHRoPSIxMCIgaGVpZ2h0PSIxNCIgcng9IjUiIGZpbGw9IiM5MDkwOTAiLz4KICAgICAgICA8cmVjdCB4PSI1NiIgeT0iMjgiIHdpZHRoPSIxMCIgaGVpZ2h0PSIxNCIgcng9IjUiIGZpbGw9IiM5MDkwOTAiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxjaXJjbGUgY3g9IjMxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8Y2lyY2xlIGN4PSI1MS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPHBhdGggZD0iTTIzIDMyIFEzMCAyOCAzNyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNNDMgMzIgUTUwIDI4IDU3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'M_ENTJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZTBkOCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjYzA0MDQwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iI2EwMjAyMCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiMxYTFhMWEiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iIzFhMWExYSIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_ENTJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZTBkOCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjYzA0MDQwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI4IiByeD0iMjAiIHJ5PSIyMCIgZmlsbD0iI2MwMjAyMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE2IiByeD0iMjAiIHJ5PSIxMiIgZmlsbD0iI2MwMjAyMCIvPgogICAgICAgIDxjaXJjbGUgY3g9IjQwIiBjeT0iMTAiIHI9IjkiIGZpbGw9IiNjMDIwMjAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjggUTI1IDE2IDQwIDE0IFE1NSAxNiA2MCAyOCIgZmlsbD0iI2MwMjAyMCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNiIgcnk9IjYiIGZpbGw9IiMxYTFhMWEiLz4KICAgIDxlbGxpcHNlIGN4PSI1MCIgY3k9IjM4IiByeD0iNiIgcnk9IjYiIGZpbGw9IiMxYTFhMWEiLz4KICAgIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNC41IiByeT0iNC41IiBmaWxsPSIjM2EzYTZhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8cGF0aCBkPSJNMjMgMzIgUTMwIDI4IDM3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICAgIDxwYXRoIGQ9Ik00MyAzMiBRNTAgMjggNTcgMzIiIHN0cm9rZT0iIzJhMWEwZSIgc3Ryb2tlLXdpZHRoPSIxLjgiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxlbGxpcHNlIGN4PSIyMyIgY3k9IjQ2IiByeD0iNyIgcnk9IjQuNSIgZmlsbD0iI2YwODA5MCIgb3BhY2l0eT0iMC40MiIvPgogIDxlbGxpcHNlIGN4PSI1NyIgY3k9IjQ2IiByeD0iNyIgcnk9IjQuNSIgZmlsbD0iI2YwODA5MCIgb3BhY2l0eT0iMC40MiIvPgogIDxjaXJjbGUgY3g9IjQwIiBjeT0iNDQiIHI9IjEuMiIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC42Ii8+CiAgPHBhdGggZD0iTTMzIDUxIFE0MCA1NyA0NyA1MSIgc3Ryb2tlPSIjYzA2MDcwIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0zNSA1MiBRNDAgNTYgNDUgNTIiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjUiLz4KPC9zdmc+',
  'M_ENTP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZjBkMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjZTA4MDMwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iI2MwNjAxMCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiNkMDgwNDAiLz4KICAgICAgICA8cG9seWdvbiBwb2ludHM9IjI4LDE2IDMyLDUgMzYsMTYiIGZpbGw9IiNkMDgwNDAiLz4KICAgICAgICA8cG9seWdvbiBwb2ludHM9IjM2LDE0IDQwLDMgNDQsMTQiIGZpbGw9IiNkMDgwNDAiLz4KICAgICAgICA8cG9seWdvbiBwb2ludHM9IjQ0LDE2IDQ4LDUgNTIsMTYiIGZpbGw9IiNkMDgwNDAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iI2QwODA0MCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_ENTP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZjBkMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjZTA4MDMwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI2IiByeD0iMjAiIHJ5PSIxOCIgZmlsbD0iI2UwNzAyMCIvPgogICAgICAgIDxwb2x5Z29uIHBvaW50cz0iMjgsMTYgMzIsMyAzNiwxNiIgZmlsbD0iI2UwNzAyMCIvPgogICAgICAgIDxwb2x5Z29uIHBvaW50cz0iMzYsMTQgNDAsMSA0NCwxNCIgZmlsbD0iI2UwNzAyMCIvPgogICAgICAgIDxwb2x5Z29uIHBvaW50cz0iNDQsMTYgNDgsMyA1MiwxNiIgZmlsbD0iI2UwNzAyMCIvPgogICAgICAgIDwhLS0gZ29nZ2xlcyAtLT4KICAgICAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzNyIgcng9IjgiIHJ5PSI3IiBmaWxsPSIjNDA0MDQwIiBvcGFjaXR5PSIwLjgiLz4KICAgICAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzNyIgcng9IjgiIHJ5PSI3IiBmaWxsPSIjNDA0MDQwIiBvcGFjaXR5PSIwLjgiLz4KICAgICAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzNyIgcng9IjYiIHJ5PSI1IiBmaWxsPSIjODBjMGUwIiBvcGFjaXR5PSIwLjciLz4KICAgICAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzNyIgcng9IjYiIHJ5PSI1IiBmaWxsPSIjODBjMGUwIiBvcGFjaXR5PSIwLjciLz4KICAgICAgICA8bGluZSB4MT0iMzgiIHkxPSIzNyIgeDI9IjQyIiB5Mj0iMzciIHN0cm9rZT0iIzQwNDA0MCIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgICAgICAgPHBhdGggZD0iTTE5IDI2IFEyNSAxNCA0MCAxMiBRNTUgMTQgNjEgMjYiIGZpbGw9IiNlMDcwMjAiLz4KICAKICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'M_INFJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2UwZjBlOCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjMzA2MDQwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzIwNDAzMCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiMxYTRhMjAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iIzFhNGEyMCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_INFJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2UwZjBlOCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjMzA2MDQwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI2IiByeD0iMjEiIHJ5PSIyMCIgZmlsbD0iIzIwYTA0MCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE1IiByeD0iMjEiIHJ5PSIxMyIgZmlsbD0iIzIwYTA0MCIvPgogICAgICAgIDxyZWN0IHg9IjE4IiB5PSIyOCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjM2IiByeD0iNSIgZmlsbD0iIzIwYTA0MCIvPgogICAgICAgIDxyZWN0IHg9IjUyIiB5PSIyOCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjM2IiByeD0iNSIgZmlsbD0iIzIwYTA0MCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSIyMCIgY3k9IjQ0IiByeD0iOCIgcnk9IjEwIiBmaWxsPSIjMjBhMDQwIi8+CiAgICAgICAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iNDQiIHJ4PSI4IiByeT0iMTAiIGZpbGw9IiMyMGEwNDAiLz4KICAgICAgICA8cGF0aCBkPSJNMTkgMjYgUTI1IDE2IDQwIDE0IFE1NSAxNiA2MSAyNiIgZmlsbD0iIzIwYTA0MCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNiIgcnk9IjYiIGZpbGw9IiMxYTFhMWEiLz4KICAgIDxlbGxpcHNlIGN4PSI1MCIgY3k9IjM4IiByeD0iNiIgcnk9IjYiIGZpbGw9IiMxYTFhMWEiLz4KICAgIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNC41IiByeT0iNC41IiBmaWxsPSIjM2EzYTZhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8cGF0aCBkPSJNMjMgMzIgUTMwIDI4IDM3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICAgIDxwYXRoIGQ9Ik00MyAzMiBRNTAgMjggNTcgMzIiIHN0cm9rZT0iIzJhMWEwZSIgc3Ryb2tlLXdpZHRoPSIxLjgiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxlbGxpcHNlIGN4PSIyMyIgY3k9IjQ2IiByeD0iNyIgcnk9IjQuNSIgZmlsbD0iI2YwODA5MCIgb3BhY2l0eT0iMC40MiIvPgogIDxlbGxpcHNlIGN4PSI1NyIgY3k9IjQ2IiByeD0iNyIgcnk9IjQuNSIgZmlsbD0iI2YwODA5MCIgb3BhY2l0eT0iMC40MiIvPgogIDxjaXJjbGUgY3g9IjQwIiBjeT0iNDQiIHI9IjEuMiIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC42Ii8+CiAgPHBhdGggZD0iTTMzIDUxIFE0MCA1NyA0NyA1MSIgc3Ryb2tlPSIjYzA2MDcwIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0zNSA1MiBRNDAgNTYgNDUgNTIiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjUiLz4KPC9zdmc+',
  'M_INFP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2U4ZjBlMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjNTA4MDQwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzMwNjAyMCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiM3MDQwMzAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iIzcwNDAzMCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_INFP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2U4ZjBlMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjNTA4MDQwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI2IiByeD0iMjEiIHJ5PSIyMCIgZmlsbD0iIzIwYjBhMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE1IiByeD0iMjEiIHJ5PSIxMyIgZmlsbD0iIzIwYjBhMCIvPgogICAgICAgIDxwYXRoIGQ9Ik0xOSAyNiBRMjUgMTYgNDAgMTQgUTU1IDE2IDYxIDI2IiBmaWxsPSIjMjBiMGEwIi8+CiAgICAgICAgPCEtLSBmbG93ZXIgY3Jvd24gLS0+CiAgICAgICAgPGNpcmNsZSBjeD0iMjgiIGN5PSIxNiIgcj0iNSIgZmlsbD0iI2YwNDA4MCIvPgogICAgICAgIDxjaXJjbGUgY3g9IjM2IiBjeT0iMTEiIHI9IjUiIGZpbGw9IiNmMGUwNDAiLz4KICAgICAgICA8Y2lyY2xlIGN4PSI0NCIgY3k9IjExIiByPSI1IiBmaWxsPSIjZjA0MDgwIi8+CiAgICAgICAgPGNpcmNsZSBjeD0iNTIiIGN5PSIxNiIgcj0iNSIgZmlsbD0iI2YwZTA0MCIvPgogICAgICAgIDxjaXJjbGUgY3g9IjI4IiBjeT0iMTYiIHI9IjIuNSIgZmlsbD0iI2ZmZjBhMCIvPgogICAgICAgIDxjaXJjbGUgY3g9IjM2IiBjeT0iMTEiIHI9IjIuNSIgZmlsbD0iI2ZmZjBhMCIvPgogICAgICAgIDxjaXJjbGUgY3g9IjQ0IiBjeT0iMTEiIHI9IjIuNSIgZmlsbD0iI2ZmZjBhMCIvPgogICAgICAgIDxjaXJjbGUgY3g9IjUyIiBjeT0iMTYiIHI9IjIuNSIgZmlsbD0iI2ZmZjBhMCIvPgogICAgICAgIDwhLS0gYnJhaWRzIGhhbmdpbmcgLS0+CiAgICAgICAgPHJlY3QgeD0iMjAiIHk9IjI4IiB3aWR0aD0iNyIgaGVpZ2h0PSIzMCIgcng9IjMuNSIgZmlsbD0iIzIwYjBhMCIvPgogICAgICAgIDxyZWN0IHg9IjUzIiB5PSIyOCIgd2lkdGg9IjciIGhlaWdodD0iMzAiIHJ4PSIzLjUiIGZpbGw9IiMyMGIwYTAiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxjaXJjbGUgY3g9IjMxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8Y2lyY2xlIGN4PSI1MS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPHBhdGggZD0iTTIzIDMyIFEzMCAyOCAzNyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNNDMgMzIgUTUwIDI4IDU3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'M_ENFJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2U4ZmZmMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjMjBhMDYwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzEwODA0MCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiNjMGEwMjAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iI2MwYTAyMCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_ENFJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2U4ZmZmMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjMjBhMDYwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI2IiByeD0iMjEiIHJ5PSIyMCIgZmlsbD0iI2UwYzAyMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE1IiByeD0iMjEiIHJ5PSIxMyIgZmlsbD0iI2UwYzAyMCIvPgogICAgICAgIDxwYXRoIGQ9Ik0xOSAyNiBRMjUgMTYgNDAgMTQgUTU1IDE2IDYxIDI2IiBmaWxsPSIjZTBjMDIwIi8+CiAgICAgICAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzAiIHJ4PSI4IiByeT0iMTgiIGZpbGw9IiNlMGMwMjAiIHRyYW5zZm9ybT0icm90YXRlKDIwIDYwIDMwKSIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNiIgcnk9IjYiIGZpbGw9IiMxYTFhMWEiLz4KICAgIDxlbGxpcHNlIGN4PSI1MCIgY3k9IjM4IiByeD0iNiIgcnk9IjYiIGZpbGw9IiMxYTFhMWEiLz4KICAgIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNC41IiByeT0iNC41IiBmaWxsPSIjM2EzYTZhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8cGF0aCBkPSJNMjMgMzIgUTMwIDI4IDM3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICAgIDxwYXRoIGQ9Ik00MyAzMiBRNTAgMjggNTcgMzIiIHN0cm9rZT0iIzJhMWEwZSIgc3Ryb2tlLXdpZHRoPSIxLjgiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxlbGxpcHNlIGN4PSIyMyIgY3k9IjQ2IiByeD0iNyIgcnk9IjQuNSIgZmlsbD0iI2YwODA5MCIgb3BhY2l0eT0iMC40MiIvPgogIDxlbGxpcHNlIGN4PSI1NyIgY3k9IjQ2IiByeD0iNyIgcnk9IjQuNSIgZmlsbD0iI2YwODA5MCIgb3BhY2l0eT0iMC40MiIvPgogIDxjaXJjbGUgY3g9IjQwIiBjeT0iNDQiIHI9IjEuMiIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC42Ii8+CiAgPHBhdGggZD0iTTMzIDUxIFE0MCA1NyA0NyA1MSIgc3Ryb2tlPSIjYzA2MDcwIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0zNSA1MiBRNDAgNTYgNDUgNTIiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjUiLz4KPC9zdmc+',
  'M_ENFP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZjhlMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjZTBhMDIwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iI2MwODAxMCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiNjMDQwMjAiLz4KICAgICAgICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIxNSIgcng9IjIwIiByeT0iMTMiIGZpbGw9IiNjMDQwMjAiLz4KICAgICAgICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzMCIgcng9IjgiIHJ5PSIxMCIgZmlsbD0iI2MwNDAyMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjMwIiByeD0iOCIgcnk9IjEwIiBmaWxsPSIjYzA0MDIwIi8+CiAgICAgICAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iNDIiIHJ4PSI3IiByeT0iOSIgZmlsbD0iI2MwNDAyMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjQyIiByeD0iNyIgcnk9IjkiIGZpbGw9IiNjMDQwMjAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iI2MwNDAyMCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_ENFP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZjhlMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjZTBhMDIwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI2IiByeD0iMjEiIHJ5PSIyMCIgZmlsbD0iI2UwNDBhMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE1IiByeD0iMjEiIHJ5PSIxMyIgZmlsbD0iI2UwNDBhMCIvPgogICAgICAgIDxyZWN0IHg9IjE4IiB5PSIyNiIgd2lkdGg9IjciIGhlaWdodD0iMTgiIHJ4PSIzLjUiIGZpbGw9IiNlMDQwYTAiLz4KICAgICAgICA8cmVjdCB4PSI1NSIgeT0iMjYiIHdpZHRoPSI3IiBoZWlnaHQ9IjE4IiByeD0iMy41IiBmaWxsPSIjZTA0MGEwIi8+CiAgICAgICAgPHBhdGggZD0iTTE5IDI2IFEyNSAxNiA0MCAxNCBRNTUgMTYgNjEgMjYiIGZpbGw9IiNlMDQwYTAiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxjaXJjbGUgY3g9IjMxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8Y2lyY2xlIGN4PSI1MS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPHBhdGggZD0iTTIzIDMyIFEzMCAyOCAzNyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNNDMgMzIgUTUwIDI4IDU3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'M_ISTJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2RkZWVmZiIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjNDA2MGEwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzIwMzA4MCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiMzMDMwNTAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iIzMwMzA1MCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_ISTJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2RkZWVmZiIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjNDA2MGEwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjMwIiByeD0iMjAiIHJ5PSIyMCIgZmlsbD0iIzQwNjBjMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE4IiByeD0iMjAiIHJ5PSIxMiIgZmlsbD0iIzQwNjBjMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjEwIiByeD0iMTAiIHJ5PSI4IiBmaWxsPSIjNDA2MGMwIi8+CiAgICAgICAgPHBhdGggZD0iTTIwIDMwIFEyNSAxOCA0MCAxNiBRNTUgMTggNjAgMzAiIGZpbGw9IiM0MDYwYzAiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxjaXJjbGUgY3g9IjMxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8Y2lyY2xlIGN4PSI1MS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPHBhdGggZD0iTTIzIDMyIFEzMCAyOCAzNyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNNDMgMzIgUTUwIDI4IDU3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'M_ISFJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2UwZjBmZiIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjNDA5MGMwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzIwNzBhMCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiMzYTMwNTAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iIzNhMzA1MCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_ISFJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2UwZjBmZiIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjNDA5MGMwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI4IiByeD0iMjAiIHJ5PSIyMCIgZmlsbD0iIzQwYjBjMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE2IiByeD0iMjAiIHJ5PSIxMiIgZmlsbD0iIzQwYjBjMCIvPgogICAgICAgIDxwYXRoIGQ9Ik0yMCAyOCBRMjUgMTYgNDAgMTQgUTU1IDE2IDYwIDI4IiBmaWxsPSIjNDBiMGMwIi8+CiAgICAgICAgPCEtLSBudXJzZSBjYXAgLS0+CiAgICAgICAgPHJlY3QgeD0iMjYiIHk9IjgiIHdpZHRoPSIyOCIgaGVpZ2h0PSIxMCIgcng9IjIiIGZpbGw9IndoaXRlIi8+CiAgICAgICAgPHJlY3QgeD0iMzYiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjEwIiBmaWxsPSIjMjBjMGQwIiBvcGFjaXR5PSIwLjgiLz4KICAgICAgICA8bGluZSB4MT0iMzYiIHkxPSIxMSIgeDI9IjQ0IiB5Mj0iMTEiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMS41Ii8+CiAgICAgICAgPGxpbmUgeDE9IjQwIiB5MT0iOCIgeDI9IjQwIiB5Mj0iMTgiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMS41Ii8+CiAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI2IiByeT0iNiIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI2IiByeT0iNiIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxlbGxpcHNlIGN4PSI1MCIgY3k9IjM4IiByeD0iNC41IiByeT0iNC41IiBmaWxsPSIjM2EzYTZhIi8+CiAgICA8Y2lyY2xlIGN4PSIzMS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPGNpcmNsZSBjeD0iNTEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxwYXRoIGQ9Ik0yMyAzMiBRMzAgMjggMzcgMzIiIHN0cm9rZT0iIzJhMWEwZSIgc3Ryb2tlLXdpZHRoPSIxLjgiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogICAgPHBhdGggZD0iTTQzIDMyIFE1MCAyOCA1NyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPGVsbGlwc2UgY3g9IjIzIiBjeT0iNDYiIHJ4PSI3IiByeT0iNC41IiBmaWxsPSIjZjA4MDkwIiBvcGFjaXR5PSIwLjQyIi8+CiAgPGVsbGlwc2UgY3g9IjU3IiBjeT0iNDYiIHJ4PSI3IiByeT0iNC41IiBmaWxsPSIjZjA4MDkwIiBvcGFjaXR5PSIwLjQyIi8+CiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS4yIiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjYiLz4KICA8cGF0aCBkPSJNMzMgNTEgUTQwIDU3IDQ3IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPHBhdGggZD0iTTM1IDUyIFE0MCA1NiA0NSA1MiIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuNSIvPgo8L3N2Zz4=',
  'M_ESTJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2UwZWVmZiIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjMzA2MDkwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzIwNDA3MCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiNjMGEwNDAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iI2MwYTA0MCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_ESTJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2UwZWVmZiIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjMzA2MDkwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjMwIiByeD0iMjAiIHJ5PSIyMCIgZmlsbD0iIzIwNDBhMCIvPgogICAgICAgIDwhLS0gcG9saWNlIGNhcCAtLT4KICAgICAgICA8cmVjdCB4PSIyMCIgeT0iMTIiIHdpZHRoPSI0MCIgaGVpZ2h0PSIxNCIgcng9IjIiIGZpbGw9IiMyMDQwYTAiLz4KICAgICAgICA8cmVjdCB4PSIxNiIgeT0iMjIiIHdpZHRoPSI0OCIgaGVpZ2h0PSI2IiByeD0iMSIgZmlsbD0iIzFhMmE1MCIvPgogICAgICAgIDxjaXJjbGUgY3g9IjQwIiBjeT0iMjAiIHI9IjUiIGZpbGw9IiNlMGMwNDAiLz4KICAgICAgICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjIwIiByPSIzIiBmaWxsPSIjYzBhMDIwIi8+CiAgICAgICAgPHBhdGggZD0iTTIwIDMwIFEyNSAyMCA0MCAxOCBRNTUgMjAgNjAgMzAiIGZpbGw9IiMyMDQwYTAiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxjaXJjbGUgY3g9IjMxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8Y2lyY2xlIGN4PSI1MS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPHBhdGggZD0iTTIzIDMyIFEzMCAyOCAzNyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNNDMgMzIgUTUwIDI4IDU3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'M_ESFJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZThmMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjZTA2MDkwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iI2MwNDA3MCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiNkMDYwODAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iI2QwNjA4MCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_ESFJ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZThmMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjZTA2MDkwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI2IiByeD0iMjEiIHJ5PSIyMCIgZmlsbD0iI2UwODBiMCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE1IiByeD0iMjEiIHJ5PSIxMyIgZmlsbD0iI2UwODBiMCIvPgogICAgICAgIDxyZWN0IHg9IjE3IiB5PSIyNiIgd2lkdGg9IjEwIiBoZWlnaHQ9IjQyIiByeD0iNSIgZmlsbD0iI2UwODBiMCIvPgogICAgICAgIDxyZWN0IHg9IjUzIiB5PSIyNiIgd2lkdGg9IjEwIiBoZWlnaHQ9IjQyIiByeD0iNSIgZmlsbD0iI2UwODBiMCIvPgogICAgICAgIDxwYXRoIGQ9Ik0xOSAyNiBRMjUgMTYgNDAgMTQgUTU1IDE2IDYxIDI2IiBmaWxsPSIjZTA4MGIwIi8+CiAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI2IiByeT0iNiIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI2IiByeT0iNiIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxlbGxpcHNlIGN4PSI1MCIgY3k9IjM4IiByeD0iNC41IiByeT0iNC41IiBmaWxsPSIjM2EzYTZhIi8+CiAgICA8Y2lyY2xlIGN4PSIzMS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPGNpcmNsZSBjeD0iNTEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxwYXRoIGQ9Ik0yMyAzMiBRMzAgMjggMzcgMzIiIHN0cm9rZT0iIzJhMWEwZSIgc3Ryb2tlLXdpZHRoPSIxLjgiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogICAgPHBhdGggZD0iTTQzIDMyIFE1MCAyOCA1NyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPGVsbGlwc2UgY3g9IjIzIiBjeT0iNDYiIHJ4PSI3IiByeT0iNC41IiBmaWxsPSIjZjA4MDkwIiBvcGFjaXR5PSIwLjQyIi8+CiAgPGVsbGlwc2UgY3g9IjU3IiBjeT0iNDYiIHJ4PSI3IiByeT0iNC41IiBmaWxsPSIjZjA4MDkwIiBvcGFjaXR5PSIwLjQyIi8+CiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS4yIiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjYiLz4KICA8cGF0aCBkPSJNMzMgNTEgUTQwIDU3IDQ3IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPHBhdGggZD0iTTM1IDUyIFE0MCA1NiA0NSA1MiIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuNSIvPgo8L3N2Zz4=',
  'M_ISTP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2U4ZThlOCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjNjA2MDYwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzQwNDA0MCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiMxYTFhMWEiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iIzFhMWExYSIvPgogICAgICAgIDxyZWN0IHg9IjIwIiB5PSIyNiIgd2lkdGg9IjgiIGhlaWdodD0iMTQiIHJ4PSI0IiBmaWxsPSIjMWExYTFhIiBvcGFjaXR5PSIwLjMiLz4KICAgICAgICA8cmVjdCB4PSI1MiIgeT0iMjYiIHdpZHRoPSI4IiBoZWlnaHQ9IjE0IiByeD0iNCIgZmlsbD0iIzFhMWExYSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI1LjUiIHJ5PSI1LjUiIGZpbGw9IiMxYTFhMWEiLz4KICAgIDxlbGxpcHNlIGN4PSI1MCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQiIHJ5PSI0IiBmaWxsPSIjM2EzYTZhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjQiIHJ5PSI0IiBmaWxsPSIjM2EzYTZhIi8+CiAgICA8Y2lyY2xlIGN4PSIzMS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPGNpcmNsZSBjeD0iNTEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAKICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNSIvPgogIDxwYXRoIGQ9Ik0zMiA1MSBRNDAgNTggNDggNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICAgIDxwYXRoIGQ9Ik0zNCA1MiBRNDAgNTYgNDYgNTIiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjUiLz4KPC9zdmc+',
  'F_ISTP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2U4ZThlOCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjNjA2MDYwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjMwIiByeD0iMjAiIHJ5PSIyMCIgZmlsbD0iIzgwNjA0MCIvPgogICAgICAgIDwhLS0gYmVhbmllIC0tPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE2IiByeD0iMjIiIHJ5PSIxMyIgZmlsbD0iIzgwNjA0MCIvPgogICAgICAgIDxwYXRoIGQ9Ik0xOCAyNCBRNDAgMTAgNjIgMjQiIHN0cm9rZT0iIzgwNjA0MCIgc3Ryb2tlLXdpZHRoPSI2IiBmaWxsPSJub25lIi8+CiAgICAgICAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMTQiIHJ4PSIxMCIgcnk9IjUiIGZpbGw9IiM4MDYwNDAiLz4KICAgICAgICA8IS0tIHNsaWdodGx5IGRhcmtlciBicmltIC0tPgogICAgICAgIDxwYXRoIGQ9Ik0xOCAyNiBRNDAgMTYgNjIgMjYiIHN0cm9rZT0iIzYwNDAyMCIgc3Ryb2tlLXdpZHRoPSIzIiBmaWxsPSJub25lIiBvcGFjaXR5PSIwLjQiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxjaXJjbGUgY3g9IjMxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8Y2lyY2xlIGN4PSI1MS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPHBhdGggZD0iTTIzIDMyIFEzMCAyOCAzNyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNNDMgMzIgUTUwIDI4IDU3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'M_ISFP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2YwZThkOCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjODBhMDQwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzYwODAyMCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiM4MDQwMjAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iIzgwNDAyMCIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_ISFP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2YwZThkOCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjODBhMDQwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI4IiByeD0iMjAiIHJ5PSIyMCIgZmlsbD0iI2EwODA2MCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE2IiByeD0iMjAiIHJ5PSIxMiIgZmlsbD0iI2EwODA2MCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjEwIiByeD0iMTIiIHJ5PSI5IiBmaWxsPSIjYTA4MDYwIi8+CiAgICAgICAgPHBhdGggZD0iTTIwIDI4IFEyNSAxNiA0MCAxNCBRNTUgMTYgNjAgMjgiIGZpbGw9IiNhMDgwNjAiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxjaXJjbGUgY3g9IjMxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8Y2lyY2xlIGN4PSI1MS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPHBhdGggZD0iTTIzIDMyIFEzMCAyOCAzNyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNNDMgMzIgUTUwIDI4IDU3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'M_ESTP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZjhkMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjNjA2MDYwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iIzQwNDA0MCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiNlMGMwNDAiLz4KICAgICAgICA8cG9seWdvbiBwb2ludHM9IjMwLDE1IDM1LDIgNDAsMTUiIGZpbGw9IiNlMGMwNDAiLz4KICAgICAgICA8cG9seWdvbiBwb2ludHM9IjM4LDEzIDQzLDAgNDgsMTMiIGZpbGw9IiNlMGMwNDAiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iI2UwYzA0MCIvPgogIAogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iOSIgcnk9IjYiIGZpbGw9IiMxYTFhMmEiIG9wYWNpdHk9IjAuOSIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI1MCIgY3k9IjM4IiByeD0iOSIgcnk9IjYiIGZpbGw9IiMxYTFhMmEiIG9wYWNpdHk9IjAuOSIvPgogICAgICAgIDxsaW5lIHgxPSIzOSIgeTE9IjM4IiB4Mj0iNDEiIHkyPSIzOCIgc3Ryb2tlPSIjNDA0MDQwIiBzdHJva2Utd2lkdGg9IjIiLz4KICAgICAgICA8bGluZSB4MT0iMjEiIHkxPSIzNyIgeDI9IjE3IiB5Mj0iMzYiIHN0cm9rZT0iIzQwNDA0MCIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgICAgICAgPGxpbmUgeDE9IjU5IiB5MT0iMzciIHgyPSI2MyIgeTI9IjM2IiBzdHJva2U9IiM0MDQwNDAiIHN0cm9rZS13aWR0aD0iMiIvPgogICAgICAgIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNyIgcnk9IjQuNSIgZmlsbD0iIzIwNDBjMCIgb3BhY2l0eT0iMC41Ii8+CiAgICAgICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI3IiByeT0iNC41IiBmaWxsPSIjMjA0MGMwIiBvcGFjaXR5PSIwLjUiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNSIvPgogIDxwYXRoIGQ9Ik0zMiA1MSBRNDAgNTggNDggNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICAgIDxwYXRoIGQ9Ik0zNCA1MiBRNDAgNTYgNDYgNTIiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjUiLz4KPC9zdmc+',
  'F_ESTP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZjhkMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjNjA2MDYwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI2IiByeD0iMjEiIHJ5PSIxOSIgZmlsbD0iI2UwYzA0MCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE1IiByeD0iMjEiIHJ5PSIxMiIgZmlsbD0iI2UwYzA0MCIvPgogICAgICAgIDxyZWN0IHg9IjE4IiB5PSIyNiIgd2lkdGg9IjciIGhlaWdodD0iMTgiIHJ4PSIzLjUiIGZpbGw9IiNlMGMwNDAiLz4KICAgICAgICA8cmVjdCB4PSI1NSIgeT0iMjYiIHdpZHRoPSI3IiBoZWlnaHQ9IjE4IiByeD0iMy41IiBmaWxsPSIjZTBjMDQwIi8+CiAgICAgICAgPHBhdGggZD0iTTE5IDI2IFEyNSAxNiA0MCAxNCBRNTUgMTYgNjEgMjYiIGZpbGw9IiNlMGMwNDAiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxjaXJjbGUgY3g9IjMxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8Y2lyY2xlIGN4PSI1MS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPHBhdGggZD0iTTIzIDMyIFEzMCAyOCAzNyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNNDMgMzIgUTUwIDI4IDU3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'M_ESFP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZTBmMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjkiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIyMCIgcnk9IjE2IiBmaWxsPSIjZTA0MGEwIi8+CiAgPHBhdGggZD0iTTI4IDY3IFE0MCA3NCA1MiA2NyBMNTAgNjIgUTQwIDY4IDMwIDYyIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSIzOCw2NSA0Miw2NSA0MSw3MyAzOSw3MyIgZmlsbD0iI2MwMjA4MCIgb3BhY2l0eT0iMC44Ii8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iMzYiIHJ4PSIyMCIgcnk9IjIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNS41IiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI2MCIgY3k9IjM4IiByeD0iMi41IiByeT0iMy41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjMiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIyNiIgcng9IjIwIiByeT0iMTgiIGZpbGw9IiMxYTFhMWEiLz4KICAgICAgICA8cGF0aCBkPSJNMjAgMjYgUTI1IDE0IDQwIDEyIFE1NSAxNCA2MCAyNiIgZmlsbD0iIzFhMWExYSIvPgogIDxlbGxpcHNlIGN4PSIzMCIgY3k9IjM4IiByeD0iNS41IiByeT0iNS41IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjUuNSIgcnk9IjUuNSIgZmlsbD0iIzFhMWExYSIvPgogICAgPGVsbGlwc2UgY3g9IjMwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0IiByeT0iNCIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGNpcmNsZSBjeD0iMzEuNSIgY3k9IjM2LjUiIHI9IjEuNCIgZmlsbD0id2hpdGUiLz4KICAgIDxjaXJjbGUgY3g9IjUxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgCiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0NCIgcj0iMS41IiBmaWxsPSIjZjViODhhIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMzIgNTEgUTQwIDU4IDQ4IDUxIiBzdHJva2U9IiNjMDYwNzAiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNMzQgNTIgUTQwIDU2IDQ2IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg==',
  'F_ESFP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iI2ZmZTBmMCIvPgogIDxyZWN0IHg9IjM0IiB5PSI1OCIgd2lkdGg9IjgiIGhlaWdodD0iMTAiIHJ4PSIyIiBmaWxsPSIjZmRkNWIxIi8+CiAgPGVsbGlwc2UgY3g9IjQwIiBjeT0iNzYiIHJ4PSIxOSIgcnk9IjE1IiBmaWxsPSIjZTA0MGEwIi8+CiAgPHBhdGggZD0iTTI5IDY4IFE0MCA3NCA1MSA2OCBMNDkgNjMgUTQwIDY5IDMxIDYzIFoiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8ZWxsaXBzZSBjeD0iNDAiIGN5PSIzNiIgcng9IjIwIiByeT0iMjIiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iNjAiIGN5PSIzOCIgcng9IjQiIHJ5PSI1LjUiIGZpbGw9IiNmZGQ1YjEiLz4KICA8ZWxsaXBzZSBjeD0iMjAiIGN5PSIzOCIgcng9IjIuNSIgcnk9IjMuNSIgZmlsbD0iI2Y1Yjg4YSIgb3BhY2l0eT0iMC4zIi8+CiAgPGVsbGlwc2UgY3g9IjYwIiBjeT0iMzgiIHJ4PSIyLjUiIHJ5PSIzLjUiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuMyIvPgogIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjI2IiByeD0iMjIiIHJ5PSIyMSIgZmlsbD0iI2UwZDA2MCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI0MCIgY3k9IjE0IiByeD0iMjIiIHJ5PSIxNCIgZmlsbD0iI2UwZDA2MCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSIxNyIgY3k9IjMyIiByeD0iOSIgcnk9IjE0IiBmaWxsPSIjZTBkMDYwIi8+CiAgICAgICAgPGVsbGlwc2UgY3g9IjYzIiBjeT0iMzIiIHJ4PSI5IiByeT0iMTQiIGZpbGw9IiNlMGQwNjAiLz4KICAgICAgICA8ZWxsaXBzZSBjeD0iMTciIGN5PSI0NiIgcng9IjgiIHJ5PSIxMSIgZmlsbD0iI2UwZDA2MCIvPgogICAgICAgIDxlbGxpcHNlIGN4PSI2MyIgY3k9IjQ2IiByeD0iOCIgcnk9IjExIiBmaWxsPSIjZTBkMDYwIi8+CiAgICAgICAgPHBhdGggZD0iTTE5IDI2IFEyNSAxNCA0MCAxMiBRNTUgMTQgNjEgMjYiIGZpbGw9IiNlMGQwNjAiLz4KICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTAiIGN5PSIzOCIgcng9IjYiIHJ5PSI2IiBmaWxsPSIjMWExYTFhIi8+CiAgICA8ZWxsaXBzZSBjeD0iMzAiIGN5PSIzOCIgcng9IjQuNSIgcnk9IjQuNSIgZmlsbD0iIzNhM2E2YSIvPgogICAgPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSI0LjUiIHJ5PSI0LjUiIGZpbGw9IiMzYTNhNmEiLz4KICAgIDxjaXJjbGUgY3g9IjMxLjUiIGN5PSIzNi41IiByPSIxLjQiIGZpbGw9IndoaXRlIi8+CiAgICA8Y2lyY2xlIGN4PSI1MS41IiBjeT0iMzYuNSIgcj0iMS40IiBmaWxsPSJ3aGl0ZSIvPgogICAgPHBhdGggZD0iTTIzIDMyIFEzMCAyOCAzNyAzMiIgc3Ryb2tlPSIjMmExYTBlIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8cGF0aCBkPSJNNDMgMzIgUTUwIDI4IDU3IDMyIiBzdHJva2U9IiMyYTFhMGUiIHN0cm9rZS13aWR0aD0iMS44IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMjMiIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8ZWxsaXBzZSBjeD0iNTciIGN5PSI0NiIgcng9IjciIHJ5PSI0LjUiIGZpbGw9IiNmMDgwOTAiIG9wYWNpdHk9IjAuNDIiLz4KICA8Y2lyY2xlIGN4PSI0MCIgY3k9IjQ0IiByPSIxLjIiIGZpbGw9IiNmNWI4OGEiIG9wYWNpdHk9IjAuNiIvPgogIDxwYXRoIGQ9Ik0zMyA1MSBRNDAgNTcgNDcgNTEiIHN0cm9rZT0iI2MwNjA3MCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNMzUgNTIgUTQwIDU2IDQ1IDUyIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC41Ii8+Cjwvc3ZnPg=='
}

export const MBTI_TYPES = [
  'INTJ','INTP','ENTJ','ENTP',
  'INFJ','INFP','ENFJ','ENFP',
  'ISTJ','ISFJ','ESTJ','ESFJ',
  'ISTP','ISFP','ESTP','ESFP',
] as const

export type MBTIType = typeof MBTI_TYPES[number]

export function getMBTIAvatar(mbti: string, gender: 'male' | 'female'): string {
  const prefix = gender === 'female' ? 'F' : 'M'
  const key = `${prefix}_${mbti.toUpperCase()}`
  return MBTI_AVATAR_LIBRARY[key] || generateSVGAvatar(mbti, gender)
}
