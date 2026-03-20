import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '衢州 · 清明踏青攻略',
  description: '新中式极简主义风格的衢州清明旅游攻略',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
