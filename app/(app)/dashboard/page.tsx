"use client"

import { Building2 } from "lucide-react"
import { AdminDashboard } from "@/components/dashboards/admin-dashboard"
import { StudentDashboard } from "@/components/dashboards/student-dashboard"
import { TeacherDashboard } from "@/components/dashboards/teacher-dashboard"
import { useApp } from "@/lib/store"

export default function DashboardPage() {
  const { activeOrganization, currentUser } = useApp()

  if (!activeOrganization) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            No organization selected
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use the organization menu in the top-right navigation bar to select
            an organization or create a new one.
          </p>
        </div>
      </div>
    )
  }

  if (currentUser.role === "teacher") return <TeacherDashboard />
  if (currentUser.role === "admin") return <AdminDashboard />
  return <StudentDashboard />
}
