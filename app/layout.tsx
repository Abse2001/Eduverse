import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { AppProvider } from "@/lib/store"
import "./globals.css"

export const metadata: Metadata = {
  title: "EduFlow — Learning Management System",
  description:
    "A modern LMS for schools, bootcamps, and private institutions. Featuring live sessions, class chat, exams, an IDE, and student dashboards.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppProvider>{children}</AppProvider>
        <Analytics />
      </body>
    </html>
  )
}
