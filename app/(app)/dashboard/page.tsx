"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AdminDashboard } from "@/components/dashboards/admin-dashboard"
import { StudentDashboard } from "@/components/dashboards/student-dashboard"
import { TeacherDashboard } from "@/components/dashboards/teacher-dashboard"
import { useApp } from "@/lib/store"

export default function DashboardPage() {
  const router = useRouter()
  const { activeOrganization, currentUser } = useApp()

  useEffect(() => {
    if (!activeOrganization) {
      router.replace("/organizations")
    }
  }, [activeOrganization, router])

  if (!activeOrganization) {
    return null
  }

  if (currentUser.role === "teacher") return <TeacherDashboard />
  if (currentUser.role === "admin") return <AdminDashboard />
  return <StudentDashboard />
}
