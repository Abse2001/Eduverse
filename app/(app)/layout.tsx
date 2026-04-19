"use client"

import { LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { TopBar } from "@/components/top-bar"
import { useApp } from "@/lib/store"

function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const router = useRouter()
  const { activeOrganization, isAuthLoading, isAuthenticated } = useApp()

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/auth")
    }
    if (!isAuthLoading && isAuthenticated && !activeOrganization) {
      router.replace("/organizations")
    }
  }, [activeOrganization, isAuthLoading, isAuthenticated, router])

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading workspace...
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">
          Redirecting to sign in...
        </div>
      </div>
    )
  }

  if (!activeOrganization) {
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
