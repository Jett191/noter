import { Geist, Geist_Mono } from 'next/font/google'

import '@noter/ui/globals.css'
import { cn } from '@noter/ui/lib/utils'

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
      <body>{children}</body>
    </html>
  )
}
