"use client"

import { AdminDashboard } from "@/components/dashboards/admin-dashboard"
import { StudentDashboard } from "@/components/dashboards/student-dashboard"
import { TeacherDashboard } from "@/components/dashboards/teacher-dashboard"
import { OrganizationDashboard } from "@/features/organization/organization-dashboard"
import { useApp } from "@/lib/store"

export default function DashboardPage() {
  const { activeOrganization, currentUser } = useApp()

  if (!activeOrganization) {
    return <OrganizationDashboard />
  }

  if (currentUser.role === "teacher") return <TeacherDashboard />
  if (currentUser.role === "admin") return <AdminDashboard />
  return <StudentDashboard />
}
