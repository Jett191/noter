import { Geist, Geist_Mono } from 'next/font/google'

import '@noter/ui/globals.css'
import { cn } from '@noter/ui/lib/utils'
import { TooltipProvider } from '@noter/ui/components/tooltip'

// 加入未登录的页面拦截

const fontSans = Geist({
  subsets: ['latin'],
  variable: '--font-sans'
})

const fontMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono'
})

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang='en'
      suppressHydrationWarning
      className={cn('antialiased', fontMono.variable, 'font-sans', fontSans.variable)}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
