"use client"

import { LoaderCircle } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { TopBar } from "@/components/top-bar"
import {
  LiveSessionMiniBar,
  LiveSessionProvider,
} from "@/features/session/live-session-provider"
import { useApp } from "@/lib/store"

function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { activeOrganization, isAuthLoading, isAuthenticated } = useApp()

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/auth")
    }
  }, [isAuthLoading, isAuthenticated, router])

  useEffect(() => {
    const canRenderWithoutOrganization =
      pathname === "/dashboard" ||
      pathname === "/help" ||
      pathname === "/organizations/create"

    if (
      !isAuthLoading &&
      isAuthenticated &&
      !activeOrganization &&
      !canRenderWithoutOrganization
    ) {
      router.replace("/dashboard")
    }
  }, [activeOrganization, isAuthLoading, isAuthenticated, pathname, router])

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

  const canRenderWithoutOrganization =
    pathname === "/dashboard" ||
    pathname === "/help" ||
    pathname === "/organizations/create"

  if (!activeOrganization && !canRenderWithoutOrganization) {
    return null
  }

  return (
    <LiveSessionProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <LiveSessionMiniBar />
      </div>
    </LiveSessionProvider>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
