"use client"

import { useApp } from "@/lib/store"
import { StudentDashboard } from "@/components/dashboards/student-dashboard"
import { TeacherDashboard } from "@/components/dashboards/teacher-dashboard"
import { AdminDashboard } from "@/components/dashboards/admin-dashboard"

export default function DashboardPage() {
  const { currentUser } = useApp()

  if (currentUser.role === "teacher") return <TeacherDashboard />
  if (currentUser.role === "admin") return <AdminDashboard />
  return <StudentDashboard />
}
