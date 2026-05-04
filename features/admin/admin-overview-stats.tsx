"use client"

import type { ElementType } from "react"
import { BookOpen, GraduationCap, School } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"

interface AdminOverviewStatsProps {
  studentCount: number
  teacherCount: number
  classCount: number
  pendingAccessCount: number
  pendingAccessSublabel: string
  pendingAccessIcon: ElementType
}

export function AdminOverviewStats({
  studentCount,
  teacherCount,
  classCount,
  pendingAccessCount,
  pendingAccessSublabel,
  pendingAccessIcon,
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
        label="Pending Requests"
        value={String(pendingAccessCount)}
        icon={pendingAccessIcon}
        color="amber"
        sublabel={pendingAccessSublabel}
      />
    </div>
  )
}
