import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Dot App',
  description: 'Place dots and reveal the canvas',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}



