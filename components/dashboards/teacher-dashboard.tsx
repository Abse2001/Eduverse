"use client"

import {
  Archive,
  BookOpen,
  FileText,
  MessageSquare,
  PlusCircle,
  School,
  TrendingUp,
  Upload,
  Users,
  Video,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { StatCard } from "@/components/shared/stat-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  type ClassAssignment,
  loadClassAssignments,
} from "@/features/assignments/use-class-assignments"
import {
  formatScore,
  getAverageScore,
  getClassGradedScores,
} from "@/features/classes/grade-metrics"
import { useArchivedClasses } from "@/features/classes/use-archived-classes"
import { getClassesForUser } from "@/lib/education/classes"
import { useApp } from "@/lib/store"
import { toLegacyClass } from "@/lib/supabase/classes"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

export function TeacherDashboard() {
  const { authUser, currentUser, organizationClasses } = useApp()
  const { archivedClasses, archivedClassesStatus, archivedClassesError } =
    useArchivedClasses()
  const classRows = getClassesForUser(organizationClasses, currentUser)
  const archivedClassRows = getClassesForUser(archivedClasses, currentUser)
  const classIds = classRows.map((classItem) => classItem.id)
  const classIdKey = classIds.join("|")
  const archivedClassIds = archivedClassRows.map((classItem) => classItem.id)
  const archivedClassIdKey = archivedClassIds.join("|")
  const [assignmentsByClass, setAssignmentsByClass] = useState<
    Record<string, ClassAssignment[]>
  >({})
  const [archivedAssignmentsByClass, setArchivedAssignmentsByClass] = useState<
    Record<string, ClassAssignment[]>
  >({})
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null)
  const [archivedAssignmentsError, setArchivedAssignmentsError] = useState<
    string | null
  >(null)
  const classRowById = new Map(
    classRows.map((classItem) => [classItem.id, classItem]),
  )
  const myClasses = classRows.map(toLegacyClass)
  const totalStudents = new Set(myClasses.flatMap((cls) => cls.studentIds)).size
  const totalAssignments = classIds.reduce(
    (sum, classId) => sum + (assignmentsByClass[classId]?.length ?? 0),
    0,
  )
  const pendingGrades = classIds.reduce(
    (sum, classId) =>
      sum +
      (assignmentsByClass[classId] ?? []).reduce(
        (assignmentSum, assignment) =>
          assignmentSum +
          assignment.submissions.filter((submission) => !submission.gradedAt)
            .length,
        0,
      ),
    0,
  )

  useEffect(() => {
    let cancelled = false
    const currentUserId = authUser?.id ?? currentUser.id ?? null

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
          canManage: true,
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
  }, [authUser?.id, classIdKey, currentUser.id])

  useEffect(() => {
    let cancelled = false
    const currentUserId = authUser?.id ?? currentUser.id ?? null

    if (archivedClassIds.length === 0) {
      setArchivedAssignmentsByClass({})
      setArchivedAssignmentsError(null)
      return
    }

    Promise.all(
      archivedClassIds.map(async (classId) => {
        const assignments = await loadClassAssignments({
          classId,
          currentUserId,
          canManage: true,
        })

        return [classId, assignments] as const
      }),
    )
      .then((entries) => {
        if (cancelled) return

        setArchivedAssignmentsByClass(Object.fromEntries(entries))
        setArchivedAssignmentsError(null)
      })
      .catch((error) => {
        if (cancelled) return

        setArchivedAssignmentsByClass({})
        setArchivedAssignmentsError(
          error instanceof Error
            ? error.message
            : "Could not load past term gradebook.",
        )
      })

    return () => {
      cancelled = true
    }
  }, [archivedClassIdKey, authUser?.id, currentUser.id])

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">
            Welcome back, {currentUser.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {currentUser.institution} &middot; Current term
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 dark:border-emerald-800 dark:bg-emerald-900/20">
          <School className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Teacher
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Classes"
          value={String(myClasses.length)}
          icon={BookOpen}
          color="indigo"
        />
        <StatCard
          label="Total Students"
          value={String(totalStudents)}
          icon={Users}
          color="emerald"
        />
        <StatCard
          label="Assignments"
          value={String(totalAssignments)}
          icon={FileText}
          color="violet"
        />
        <StatCard
          label="Pending Grades"
          value={String(pendingGrades)}
          icon={TrendingUp}
          color="amber"
        />
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">Your Classes</h2>
        {assignmentsError ? (
          <p className="text-xs text-destructive">{assignmentsError}</p>
        ) : null}

        {myClasses.map((cls) => {
          const students = classRowById.get(cls.id)?.students ?? []
          const assignments = assignmentsByClass[cls.id] ?? []
          const submittedAssignments = assignments.reduce(
            (sum, assignment) =>
              sum +
              assignment.submissions.filter(
                (submission) => !submission.gradedAt,
              ).length,
            0,
          )
          const progress = getTeacherGradingProgress(assignments)

          return (
            <Card key={cls.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                      CLASS_COLOR_MAP[cls.color] ?? "bg-primary",
                    )}
                  >
                    {cls.code.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {cls.name}
                        </p>
                        {classRowById.get(cls.id)?.organization_visible ? (
                          <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                            Organization visible
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cls.code} &middot; {cls.room}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        Completion
                      </span>
                      <div className="flex-1">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {progress}%
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex -space-x-1.5">
                        {students.slice(0, 4).map((student) => (
                          <Avatar
                            key={student.id}
                            className="w-6 h-6 ring-2 ring-card"
                          >
                            <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                              {getInitials(student.display_name)}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {students.length > 4 ? (
                          <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-card flex items-center justify-center text-[9px] text-muted-foreground font-medium">
                            +{students.length - 4}
                          </div>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {students.length} students
                      </span>
                      {submittedAssignments > 0 ? (
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                          {submittedAssignments} to grade
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
                  <Link href={`/classes/${cls.id}/chat`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1.5"
                    >
                      <MessageSquare className="w-3 h-3" /> Chat
                    </Button>
                  </Link>
                  <Link href={`/classes/${cls.id}/session`}>
                    <Button size="sm" className="w-full text-xs gap-1.5">
                      <Video className="w-3 h-3" /> Start Session
                    </Button>
                  </Link>
                  <Link href={`/classes/${cls.id}/assignments`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1.5"
                    >
                      <PlusCircle className="w-3 h-3" /> Create Assignment
                    </Button>
                  </Link>
                  <Link href={`/classes/${cls.id}/materials`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1.5"
                    >
                      <Upload className="w-3 h-3" /> Upload Material
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">Past Terms</h2>
        {archivedClassesError ? (
          <p className="text-xs text-destructive">{archivedClassesError}</p>
        ) : null}
        {archivedAssignmentsError ? (
          <p className="text-xs text-destructive">{archivedAssignmentsError}</p>
        ) : null}
        <div className="grid gap-3">
          {archivedClassRows.map((classItem) => {
            const assignments = archivedAssignmentsByClass[classItem.id] ?? []
            const scores = getClassGradedScores(assignments)

            return (
              <Card key={classItem.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                          <Archive className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {classItem.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {classItem.code} &middot;{" "}
                            {classItem.semester ?? "Unassigned Term"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 md:min-w-[520px]">
                      <Metric label="Score">
                        {formatScore(getAverageScore(scores))}
                      </Metric>
                      <Metric label="Graded">{scores.length}</Metric>
                      <Metric label="Students">
                        {classItem.students.length}
                      </Metric>
                      <Metric label="Assignments">{assignments.length}</Metric>
                      <Metric label="Room">
                        {classItem.room ?? "No room"}
                      </Metric>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {archivedClassesStatus === "loading" ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Loading past terms...
              </CardContent>
            </Card>
          ) : null}

          {archivedClassesStatus === "ready" &&
          archivedClassRows.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                No archived classes yet.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Metric({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-bold text-foreground">{children}</p>
    </div>
  )
}

function getTeacherGradingProgress(assignments: ClassAssignment[]) {
  const submissions = assignments.flatMap(
    (assignment) => assignment.submissions,
  )

  if (submissions.length === 0) return 0

  const graded = submissions.filter((submission) => submission.gradedAt).length

  return Math.round((graded / submissions.length) * 100)
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("")
}
