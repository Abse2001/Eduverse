"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  BarChart3,
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
import { StatCard } from "@/components/shared/stat-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  type ClassAssignment,
  loadClassAssignments,
} from "@/features/assignments/use-class-assignments"
import { getClassesForUser } from "@/lib/education/classes"
import { TEACHER_PREVIOUS_CLASSES } from "@/lib/mock-data"
import { useApp } from "@/lib/store"
import { toLegacyClass } from "@/lib/supabase/classes"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

export function TeacherDashboard() {
  const { authUser, currentUser, organizationClasses } = useApp()
  const classRows = getClassesForUser(organizationClasses, currentUser)
  const classIds = classRows.map((classItem) => classItem.id)
  const classIdKey = classIds.join("|")
  const [assignmentsByClass, setAssignmentsByClass] = useState<
    Record<string, ClassAssignment[]>
  >({})
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null)
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

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">
            Welcome back, {currentUser.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {currentUser.institution} &middot; Spring 2026
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

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
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
                        <p className="font-semibold text-sm text-foreground">
                          {cls.name}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {cls.schedule}
                        </span>
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

        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-semibold text-foreground">
              Today&apos;s Schedule
            </h2>
            {myClasses.slice(0, 3).map((cls) => (
              <Card key={cls.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div
                    className={cn(
                      "w-2 h-10 rounded-full shrink-0",
                      CLASS_COLOR_MAP[cls.color] ?? "bg-primary",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {cls.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cls.schedule}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">Previous Classes</h2>
        <div className="grid gap-3">
          {TEACHER_PREVIOUS_CLASSES.map((classItem) => (
            <Card key={classItem.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                        <BarChart3 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {classItem.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {classItem.code} &middot; {classItem.semester}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:min-w-[420px]">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Students
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        {classItem.students}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Avg Score
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        {classItem.avgScore}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Graded
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        {classItem.gradedAssignments}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Subject
                      </p>
                      <p className="truncate text-sm font-bold text-foreground">
                        {classItem.subject}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Progress value={classItem.completion} className="h-1.5" />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {classItem.completion}%
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
