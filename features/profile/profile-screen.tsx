"use client"

import { useState } from "react"
import {
  BarChart3,
  Building,
  Calendar,
  Mail,
  PlusCircle,
  Settings,
  Star,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { StatCard } from "@/components/shared/stat-card"
import {
  ORGANIZATION_ROLE_BADGES,
  organizationRoleLabel,
} from "@/components/top-bar/organization-menu-helpers"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { getClassesForUser } from "@/lib/education/classes"
import {
  getAssignmentProgress,
  getAverageAssignmentScore,
  getBestRank,
  getStudentRankSummary,
} from "@/lib/education/selectors"
import { getAssignmentsByClass, getLeaderboardByClass } from "@/lib/mock-data"
import { type OrganizationUserRole, useApp } from "@/lib/store"
import { toLegacyClass } from "@/lib/supabase/classes"
import { cn } from "@/lib/utils"
import {
  CLASS_BADGE_COLOR_MAP,
  CLASS_COLOR_MAP,
  ROLE_BADGE_COLOR_MAP,
} from "@/lib/view-config"

type AcademicPeriodStats = {
  label: string
  timeframe: string
  classes: number
  avgScore: number
  gradedAssignments: number
  bestRank: number | null
  progress: number
  gpa: number | null
}

const ORGANIZATION_ROLE_PRIORITY: OrganizationUserRole[] = [
  "org_owner",
  "org_admin",
  "teacher",
  "student",
]

const MOCK_PREVIOUS_ACADEMIC_PERIODS: AcademicPeriodStats[] = [
  {
    label: "Fall 2025",
    timeframe: "Previous period",
    classes: 4,
    avgScore: 89,
    gradedAssignments: 18,
    bestRank: 2,
    progress: 100,
    gpa: 3.8,
  },
  {
    label: "2024-2025 Academic Year",
    timeframe: "Completed year",
    classes: 8,
    avgScore: 86,
    gradedAssignments: 42,
    bestRank: 3,
    progress: 100,
    gpa: 3.6,
  },
]

function getAverageScorePercentage(
  assignments: ReturnType<typeof getAssignmentsByClass>,
) {
  const graded = assignments.filter(
    (assignment) =>
      assignment.status === "graded" && assignment.score !== undefined,
  )

  if (graded.length === 0) return 0

  return Math.round(
    graded.reduce(
      (sum, assignment) =>
        sum + ((assignment.score ?? 0) / assignment.maxScore) * 100,
      0,
    ) / graded.length,
  )
}

export function ProfileScreen() {
  const router = useRouter()
  const {
    activeOrganization,
    activeOrganizationRole,
    currentUser,
    organizationClasses,
    setActiveOrganizationRole,
  } = useApp()
  const [switchingRole, setSwitchingRole] =
    useState<OrganizationUserRole | null>(null)
  const [roleErrorMessage, setRoleErrorMessage] = useState<string | null>(null)
  const isStudent = currentUser.role === "student"
  const isTeacher = currentUser.role === "teacher"
  const organizationRoles = [...(activeOrganization?.roles ?? [])].sort(
    (left, right) =>
      ORGANIZATION_ROLE_PRIORITY.indexOf(left) -
      ORGANIZATION_ROLE_PRIORITY.indexOf(right),
  )
  const myClasses = getClassesForUser(organizationClasses, currentUser).map(
    toLegacyClass,
  )
  const allAssignments = myClasses.flatMap((cls) =>
    getAssignmentsByClass(cls.id),
  )
  const gradedAssignments = allAssignments.filter(
    (assignment) =>
      assignment.status === "graded" && assignment.score !== undefined,
  )
  const avgScore = getAverageAssignmentScore(allAssignments)
  const classRanks = getStudentRankSummary(
    myClasses,
    currentUser.id,
    getLeaderboardByClass,
  )
  const bestRank = getBestRank(classRanks)
  const currentAcademicPeriods = Array.from(
    myClasses
      .reduce((periods, cls) => {
        const label = cls.semester || currentUser.semester || "Current Period"
        const existing = periods.get(label) ?? []

        periods.set(label, [...existing, cls])
        return periods
      }, new Map<string, typeof myClasses>())
      .entries(),
  ).map(([label, classes]) => {
    const classIds = new Set(classes.map((cls) => cls.id))
    const assignments = allAssignments.filter((assignment) =>
      classIds.has(assignment.classId),
    )
    const progress = getAssignmentProgress(assignments)
    const ranks = classRanks.filter((rank) => classIds.has(rank.cls.id))

    return {
      label,
      timeframe: "Current period",
      classes: classes.length,
      avgScore: getAverageScorePercentage(assignments),
      gradedAssignments: assignments.filter(
        (assignment) =>
          assignment.status === "graded" && assignment.score !== undefined,
      ).length,
      bestRank: getBestRank(ranks),
      progress: progress.progress,
      gpa: currentUser.gpa ?? null,
    } satisfies AcademicPeriodStats
  })
  const academicPeriods = [
    ...currentAcademicPeriods,
    ...MOCK_PREVIOUS_ACADEMIC_PERIODS,
  ]

  async function selectRole(role: OrganizationUserRole) {
    if (!activeOrganization || role === activeOrganizationRole) return

    setRoleErrorMessage(null)
    setSwitchingRole(role)

    try {
      await setActiveOrganizationRole(role)
      router.refresh()
    } catch (error) {
      setRoleErrorMessage(
        error instanceof Error ? error.message : "Could not switch role",
      )
    } finally {
      setSwitchingRole(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Card>
        <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center gap-5">
          <Avatar className="w-20 h-20 shrink-0">
            <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
              {currentUser.avatar}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">
                {currentUser.name}
              </h1>
              {organizationRoles.length > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {organizationRoles.map((role) => {
                    const isActive = role === activeOrganizationRole

                    return (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={isActive}
                        disabled={switchingRole !== null}
                        onClick={() => void selectRole(role)}
                        className={cn(
                          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70",
                          ORGANIZATION_ROLE_BADGES[role],
                          isActive &&
                            "ring-2 ring-primary ring-offset-2 ring-offset-background",
                        )}
                      >
                        {organizationRoleLabel(role)}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <span
                  className={cn(
                    "mt-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-2 ring-primary ring-offset-2 ring-offset-background",
                    ROLE_BADGE_COLOR_MAP[currentUser.role],
                  )}
                >
                  {currentUser.role}
                </span>
              )}
            </div>
            {roleErrorMessage ? (
              <p className="mt-2 text-xs text-destructive">
                {roleErrorMessage}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {currentUser.email}
              </span>
              <span className="flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5" />
                {currentUser.institution}
              </span>
              {currentUser.semester ? (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {currentUser.semester}
                </span>
              ) : null}
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
            <Settings className="w-3.5 h-3.5" />
            Edit Profile
          </Button>
        </CardContent>
      </Card>

      {isStudent ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="GPA"
            value={String(currentUser.gpa ?? "—")}
            icon={Star}
            color="amber"
          />
          <StatCard
            label="Avg Score"
            value={`${avgScore}%`}
            icon={TrendingUp}
            color="emerald"
          />
          <StatCard
            label="Periods"
            value={String(academicPeriods.length)}
            icon={Calendar}
            color="indigo"
          />
          <StatCard
            label="Best Rank"
            value={bestRank ? `#${bestRank}` : "—"}
            icon={Trophy}
            color="violet"
          />
        </div>
      ) : null}

      {isStudent ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Academic Periods</h2>
          </div>
          <div className="grid gap-3">
            {academicPeriods.map((period) => (
              <Card key={period.label}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center justify-center shrink-0">
                          <BarChart3 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {period.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {period.timeframe}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 md:min-w-[520px]">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Classes
                        </p>
                        <p className="text-sm font-bold text-foreground">
                          {period.classes}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Avg Score
                        </p>
                        <p className="text-sm font-bold text-foreground">
                          {period.avgScore}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Graded
                        </p>
                        <p className="text-sm font-bold text-foreground">
                          {period.gradedAssignments}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          Best Rank
                        </p>
                        <p className="text-sm font-bold text-foreground">
                          {period.bestRank ? `#${period.bestRank}` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          GPA
                        </p>
                        <p className="text-sm font-bold text-foreground">
                          {period.gpa ?? "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Progress value={period.progress} className="h-1.5" />
                    <span className="text-xs text-muted-foreground shrink-0">
                      {period.progress}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {isTeacher ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Teaching</h2>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <PlusCircle className="w-3.5 h-3.5" />
              New Class
            </Button>
          </div>
          {myClasses.map((cls) => {
            return (
              <Link key={cls.id} href={`/classes/${cls.id}/home`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                        CLASS_COLOR_MAP[cls.color] ?? "bg-primary",
                      )}
                    >
                      {cls.code.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                        {cls.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cls.code} &middot; {cls.schedule}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] border-0",
                          CLASS_BADGE_COLOR_MAP[cls.color],
                        )}
                      >
                        {cls.subject}
                      </Badge>
                      <div className="text-center">
                        <div className="flex items-center gap-0.5">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm font-bold text-foreground">
                            {cls.studentIds.length}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          students
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : null}

      {isStudent && gradedAssignments.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-semibold text-foreground">Recent Grades</h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {gradedAssignments.slice(0, 5).map((assignment) => {
                const cls = myClasses.find((candidate) =>
                  getAssignmentsByClass(candidate.id).some(
                    (current) => current.id === assignment.id,
                  ),
                )
                const percentage = Math.round(
                  ((assignment.score ?? 0) / assignment.maxScore) * 100,
                )

                return (
                  <div
                    key={assignment.id}
                    className="flex items-center gap-4 px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {assignment.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cls?.name ?? ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Progress
                        value={percentage}
                        className="w-20 h-1.5 hidden md:block"
                      />
                      <span
                        className={cn(
                          "text-sm font-bold",
                          percentage >= 90
                            ? "text-emerald-600 dark:text-emerald-400"
                            : percentage >= 70
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-destructive",
                        )}
                      >
                        {assignment.score}/{assignment.maxScore}
                      </span>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
