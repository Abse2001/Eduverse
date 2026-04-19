"use client"

import { LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { OrganizationDashboard } from "@/features/organization/organization-dashboard"
import { useApp } from "@/lib/store"

export default function OrganizationsPage() {
  const router = useRouter()
  const { isAuthLoading, isAuthenticated } = useApp()

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/auth")
    }
  }, [isAuthLoading, isAuthenticated, router])

  if (isAuthLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading organizations...
        </div>
      </main>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <OrganizationDashboard />
}
