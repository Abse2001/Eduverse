"use client"

import { BarChart3, BookOpen, GraduationCap, School } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"

interface AdminOverviewStatsProps {
  studentCount: number
  teacherCount: number
  classCount: number
  assignmentCount: number
}

export function AdminOverviewStats({
  studentCount,
  teacherCount,
  classCount,
  assignmentCount,
}: AdminOverviewStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        label="Total Students"
        value={String(studentCount)}
        icon={GraduationCap}
        color="indigo"
        sublabel="Active"
      />
      <StatCard
        label="Teachers"
        value={String(teacherCount)}
        icon={School}
        color="emerald"
        sublabel="Faculty"
      />
      <StatCard
        label="Classes"
        value={String(classCount)}
        icon={BookOpen}
        color="violet"
        sublabel="This semester"
      />
      <StatCard
        label="Assignments"
        value={String(assignmentCount)}
        icon={BarChart3}
        color="amber"
        sublabel="Total"
      />
    </div>
  )
}
