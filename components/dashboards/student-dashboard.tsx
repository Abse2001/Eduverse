"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { format, isPast } from "date-fns"
import {
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Star,
  TrendingUp,
} from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  type ClassAssignment,
  getAssignmentDerivedStatus,
  loadClassAssignments,
} from "@/features/assignments/use-class-assignments"
import { getClassesForUser } from "@/lib/education/classes"
import { toLegacyClass } from "@/lib/supabase/classes"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

type AcademicPeriodStats = {
  label: string
  timeframe: string
  classes: number
  avgScore: number
  gradedAssignments: number
  progress: number
  gpa: number | null
}

export function StudentDashboard() {
  const { authUser, currentUser, organizationClasses } = useApp()
  const classRows = getClassesForUser(organizationClasses, currentUser)
  const classIds = classRows.map((classItem) => classItem.id)
  const classIdKey = classIds.join("|")
  const [assignmentsByClass, setAssignmentsByClass] = useState<
    Record<string, ClassAssignment[]>
  >({})
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null)
  const myClasses = classRows.map(toLegacyClass)
  const allAssignments = classIds.flatMap(
    (classId) => assignmentsByClass[classId] ?? [],
  )
  const pendingAssignments = allAssignments.filter((assignment) =>
    ["pending", "overdue"].includes(getAssignmentDerivedStatus(assignment)),
  )
  const gradedSubmissions = allAssignments.flatMap((assignment) =>
    assignment.mySubmission?.gradedAt && assignment.mySubmission.score !== null
      ? [{ assignment, score: assignment.mySubmission.score }]
      : [],
  )
  const avgScore =
    gradedSubmissions.length > 0
      ? Math.round(
          gradedSubmissions.reduce(
            (sum, submission) =>
              sum + (submission.score / submission.assignment.maxScore) * 100,
            0,
          ) / gradedSubmissions.length,
        )
      : 0
  const upcomingAssignments = allAssignments
    .filter(
      (assignment) => getAssignmentDerivedStatus(assignment) === "pending",
    )
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))
    .slice(0, 4)
  const overallProgress = getStudentAssignmentProgress(allAssignments)
  const currentUserId = authUser?.id ?? currentUser.id ?? null
  const classById = new Map(myClasses.map((cls) => [cls.id, cls]))
  const currentAcademicPeriods = Array.from(
    myClasses.reduce((periods, cls) => {
      const label = cls.semester || "Spring 2026"
      const existing = periods.get(label) ?? []

      periods.set(label, [...existing, cls])
      return periods
    }, new Map<string, typeof myClasses>()),
  ).map(([label, classes]) => {
    const periodAssignments = classes.flatMap(
      (cls) => assignmentsByClass[cls.id] ?? [],
    )
    const periodProgress = getStudentAssignmentProgress(periodAssignments)
    const periodGradedSubmissions = periodAssignments.flatMap((assignment) =>
      assignment.mySubmission?.gradedAt &&
      assignment.mySubmission.score !== null
        ? [{ assignment, score: assignment.mySubmission.score }]
        : [],
    )
    const periodAvgScore =
      periodGradedSubmissions.length > 0
        ? Math.round(
            periodGradedSubmissions.reduce(
              (sum, submission) =>
                sum + (submission.score / submission.assignment.maxScore) * 100,
              0,
            ) / periodGradedSubmissions.length,
          )
        : 0

    return {
      label,
      timeframe: "Current period",
      classes: classes.length,
      avgScore: periodAvgScore,
      gradedAssignments: periodGradedSubmissions.length,
      progress: periodProgress,
      gpa: currentUser.gpa ?? null,
    } satisfies AcademicPeriodStats
  })

  useEffect(() => {
    let cancelled = false

    if (classIds.length === 0) {
      setAssignmentsByClass({})
      setAssignmentsError(null)
      return
    }

    Promise.all(
      classIds.map(async (classId) => {
        const assignments = await loadClassAssignments({
          classId,
          currentUserId,
          canManage: false,
        })

        return [classId, assignments] as const
      }),
    )
      .then((entries) => {
        if (cancelled) return

        setAssignmentsByClass(Object.fromEntries(entries))
        setAssignmentsError(null)
      })
      .catch((error) => {
        if (cancelled) return

        setAssignmentsByClass({})
        setAssignmentsError(
          error instanceof Error
            ? error.message
            : "Could not load assignment metrics.",
        )
      })

    return () => {
      cancelled = true
    }
  }, [classIdKey, currentUserId])

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground text-balance">
          Good morning, {currentUser.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {currentUser.institution} &middot; Spring 2026
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Enrolled Classes"
          value={String(myClasses.length)}
          icon={BookOpen}
          color="indigo"
        />
        <StatCard
          label="Pending Tasks"
          value={String(pendingAssignments.length)}
          icon={Clock}
          color="amber"
        />
        <StatCard
          label="Average Score"
          value={`${avgScore}%`}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          label="Completion"
          value={`${overallProgress}%`}
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          label="Current GPA"
          value={String(currentUser.gpa ?? "—")}
          icon={Star}
          color="violet"
        />
        <StatCard
          label="Periods"
          value={String(currentAcademicPeriods.length)}
          icon={Calendar}
          color="indigo"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          <h2 className="font-semibold text-foreground">My Classes</h2>
          {assignmentsError ? (
            <p className="text-xs text-destructive">{assignmentsError}</p>
          ) : null}

          {myClasses.map((cls) => {
            const assignments = assignmentsByClass[cls.id] ?? []
            const progress = getStudentAssignmentProgress(assignments)

            return (
              <Card key={cls.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                        CLASS_COLOR_MAP[cls.color] ?? "bg-primary",
                      )}
                    >
                      {cls.code.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {cls.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cls.code} &middot; {cls.schedule}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {progress}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
                    <Link href={`/classes/${cls.id}/home`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs gap-1.5"
                      >
                        <BookOpen className="w-3 h-3" /> Class Home
                      </Button>
                    </Link>
                    <Link href={`/classes/${cls.id}/chat`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs gap-1.5"
                      >
                        <MessageSquare className="w-3 h-3" /> Chat
                      </Button>
                    </Link>
                    <Link href={`/classes/${cls.id}/assignments`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs gap-1.5"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Assignments
                      </Button>
                    </Link>
                    <Link href={`/classes/${cls.id}/materials`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs gap-1.5"
                      >
                        <FileText className="w-3 h-3" /> Materials
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold text-foreground">Upcoming Deadlines</h2>
          {upcomingAssignments.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">All caught up!</p>
              </CardContent>
            </Card>
          ) : (
            upcomingAssignments.map((assignment) => {
              const dueDate = new Date(assignment.dueAt)
              const overdue = isPast(dueDate)
              const classInfo = classById.get(assignment.classId)

              return (
                <Link
                  key={assignment.id}
                  href={`/classes/${assignment.classId}/assignments`}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-3 flex items-start gap-3">
                      <div
                        className={cn(
                          "w-1.5 rounded-full self-stretch mt-1 shrink-0",
                          CLASS_COLOR_MAP[classInfo?.color ?? ""] ?? "bg-muted",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {assignment.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {classInfo?.code ?? "Class"}
                        </p>
                        <p
                          className={cn(
                            "text-xs font-medium mt-1",
                            overdue
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          Due {format(dueDate, "MMM d, h:mm a")}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0"
                      >
                        assignment
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              )
            })
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">Academic Periods</h2>
        <div className="grid gap-3">
          {currentAcademicPeriods.map((period) => (
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:min-w-[420px]">
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
    </div>
  )
}

function getStudentAssignmentProgress(assignments: ClassAssignment[]) {
  if (assignments.length === 0) return 0

  const completed = assignments.filter((assignment) =>
    Boolean(assignment.mySubmission),
  ).length

  return Math.round((completed / assignments.length) * 100)
}
