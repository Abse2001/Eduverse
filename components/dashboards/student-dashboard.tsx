"use client"

import { format, isPast } from "date-fns"
import {
  Archive,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  MessageSquare,
  Radio,
  TrendingUp,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
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
import {
  groupArchivedClassesByTerm,
  useArchivedClasses,
} from "@/features/classes/use-archived-classes"
import {
  formatScore,
  getAverageScore,
  getStudentGradedScores,
} from "@/features/classes/grade-metrics"
import {
  getClassesForUser,
  getHiddenClassesForUser,
} from "@/lib/education/classes"
import type { ClassExamApiDto } from "@/lib/exams/types"
import { useToast } from "@/hooks/use-toast"
import { useApp } from "@/lib/store"
import { toLegacyClass } from "@/lib/supabase/classes"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

type DashboardDeadline = {
  id: string
  classId: string
  title: string
  dueAt: string
  label: "Due" | "Opens" | "Closes"
  type: "assignment" | "exam"
  href: string
}

export function StudentDashboard() {
  const {
    authUser,
    classLiveSessions,
    currentUser,
    organizationClasses,
    refreshOrganizationClasses,
  } = useApp()
  const { archivedClasses, archivedClassesStatus, archivedClassesError } =
    useArchivedClasses()
  const { toast } = useToast()
  const classRows = getClassesForUser(organizationClasses, currentUser)
  const archivedClassRows = getClassesForUser(archivedClasses, currentUser)
  const archivedTerms = groupArchivedClassesByTerm(archivedClassRows)
  const hiddenClassRows = getHiddenClassesForUser(
    organizationClasses,
    currentUser,
  )
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
  const [examsByClass, setExamsByClass] = useState<
    Record<string, ClassExamApiDto["student"] | null>
  >({})
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null)
  const [archivedAssignmentsError, setArchivedAssignmentsError] = useState<
    string | null
  >(null)
  const [examsError, setExamsError] = useState<string | null>(null)
  const myClasses = classRows.map(toLegacyClass)
  const allAssignments = classIds.flatMap(
    (classId) => assignmentsByClass[classId] ?? [],
  )
  const pendingAssignments = allAssignments.filter((assignment) =>
    ["pending", "overdue"].includes(getAssignmentDerivedStatus(assignment)),
  )
  const allArchivedAssignments = archivedClassIds.flatMap(
    (classId) => archivedAssignmentsByClass[classId] ?? [],
  )
  const gradedSubmissions = getStudentGradedScores(allAssignments)
  const archivedGradedSubmissions = getStudentGradedScores(
    allArchivedAssignments,
  )
  const currentTermScore = getAverageScore(gradedSubmissions)
  const allTermsScore = getAverageScore([
    ...gradedSubmissions,
    ...archivedGradedSubmissions,
  ])
  const upcomingAssignments = allAssignments
    .filter(
      (assignment) => getAssignmentDerivedStatus(assignment) === "pending",
    )
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))
  const upcomingExamDeadlines = classIds.flatMap((classId) =>
    getStudentExamDeadlines(examsByClass[classId], classId),
  )
  const pendingTaskCount =
    pendingAssignments.length + upcomingExamDeadlines.length
  const upcomingDeadlines: DashboardDeadline[] = [
    ...upcomingAssignments.map(
      (assignment): DashboardDeadline => ({
        id: assignment.id,
        classId: assignment.classId,
        title: assignment.title,
        dueAt: assignment.dueAt,
        label: "Due",
        type: "assignment",
        href: `/classes/${assignment.classId}/assignments`,
      }),
    ),
    ...upcomingExamDeadlines,
  ].sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))
  const overallProgress = getStudentAssignmentProgress(allAssignments)
  const currentUserId = authUser?.id ?? currentUser.id ?? null
  const classById = new Map(myClasses.map((cls) => [cls.id, cls]))
  const classRowById = new Map(
    classRows.map((classItem) => [classItem.id, classItem]),
  )
  const liveClassIds = new Set(
    classLiveSessions.map((session) => session.class_id),
  )
  const getTermScore = (
    classes: ReturnType<typeof groupArchivedClassesByTerm>[number]["classes"],
  ) =>
    getAverageScore(
      getStudentGradedScores(
        classes.flatMap(
          (classItem) => archivedAssignmentsByClass[classItem.id] ?? [],
        ),
      ),
    )

  async function setClassHidden(classId: string, hidden: boolean) {
    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/visibility`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hidden }),
        },
      )
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update class visibility.")
      }

      await refreshOrganizationClasses({ force: true })
      toast({
        title: hidden ? "Class hidden" : "Class shown",
        description: hidden
          ? "You can restore it from Hidden classes."
          : "The class is back on your dashboard.",
      })
    } catch (error) {
      toast({
        title: "Could not update class visibility",
        description:
          error instanceof Error ? error.message : "Try again later.",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    let cancelled = false

    if (classIds.length === 0) {
      setAssignmentsByClass({})
      setExamsByClass({})
      setAssignmentsError(null)
      setExamsError(null)
      return
    }

    Promise.all(
      classIds.map(async (classId) => {
        const [assignments, examPage] = await Promise.all([
          loadClassAssignments({
            classId,
            currentUserId,
            canManage: false,
          }),
          loadClassExamDashboardData(classId),
        ])

        return [classId, assignments, examPage] as const
      }),
    )
      .then((entries) => {
        if (cancelled) return

        setAssignmentsByClass(
          Object.fromEntries(
            entries.map(([classId, assignments]) => [classId, assignments]),
          ),
        )
        setExamsByClass(
          Object.fromEntries(
            entries.map(([classId, , examPage]) => [classId, examPage]),
          ),
        )
        setAssignmentsError(null)
        setExamsError(null)
      })
      .catch((error) => {
        if (cancelled) return

        setAssignmentsByClass({})
        setExamsByClass({})
        setAssignmentsError(
          error instanceof Error
            ? error.message
            : "Could not load student dashboard metrics.",
        )
        setExamsError(null)
      })

    return () => {
      cancelled = true
    }
  }, [classIdKey, currentUserId])

  useEffect(() => {
    let cancelled = false

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
          canManage: false,
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
            : "Could not load past term scores.",
        )
      })

    return () => {
      cancelled = true
    }
  }, [archivedClassIdKey, currentUserId])

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">
            Good morning, {currentUser.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {currentUser.institution} &middot; Current term
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 dark:border-indigo-800 dark:bg-indigo-900/20">
          <GraduationCap className="h-4 w-4 text-indigo-500" />
          <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            Student
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Visible Classes"
          value={String(myClasses.length)}
          icon={BookOpen}
          color="indigo"
        />
        <StatCard
          label="Pending Tasks"
          value={String(pendingTaskCount)}
          icon={Clock}
          color="amber"
        />
        <StatCard
          label="This Term Score"
          value={formatScore(currentTermScore)}
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
          label="All Terms Score"
          value={formatScore(allTermsScore)}
          icon={FileText}
          color="violet"
        />
        <StatCard
          label="Past Terms"
          value={String(archivedTerms.length)}
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
          {examsError ? (
            <p className="text-xs text-destructive">{examsError}</p>
          ) : null}

          {myClasses.map((cls) => {
            const classRow = classRowById.get(cls.id)
            const assignments = assignmentsByClass[cls.id] ?? []
            const progress = getStudentAssignmentProgress(assignments)
            const isLive = liveClassIds.has(cls.id)

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
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {cls.name}
                        </p>
                        {classRow?.organization_visible ? (
                          <Badge variant="outline" className="text-[10px]">
                            Organization visible
                          </Badge>
                        ) : null}
                        {isLive ? (
                          <Badge className="shrink-0 border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Live now
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {cls.code}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {progress}%
                        </span>
                      </div>
                    </div>
                    {classRow?.organization_visible ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 text-xs text-muted-foreground"
                        onClick={() => void setClassHidden(cls.id, true)}
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        Hide
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
                    <Link href={`/classes/${cls.id}/session`}>
                      <Button
                        size="sm"
                        variant={isLive ? "default" : "outline"}
                        className="w-full text-xs gap-1.5"
                      >
                        <Radio className="w-3 h-3" />{" "}
                        {isLive ? "Join Live" : "Session"}
                      </Button>
                    </Link>
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

          {hiddenClassRows.length > 0 ? (
            <div className="pt-2">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Hidden classes
              </h3>
              <div className="grid gap-2">
                {hiddenClassRows.map((classItem) => (
                  <Card key={classItem.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white",
                          CLASS_COLOR_MAP[classItem.color ?? "indigo"] ??
                            "bg-primary",
                        )}
                      >
                        {classItem.code.slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {classItem.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {classItem.code}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => void setClassHidden(classItem.id, false)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Show
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold text-foreground">Upcoming Deadlines</h2>
          {upcomingDeadlines.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">All caught up!</p>
              </CardContent>
            </Card>
          ) : (
            upcomingDeadlines.map((deadline) => {
              const dueDate = new Date(deadline.dueAt)
              const overdue = isPast(dueDate)
              const classInfo = classById.get(deadline.classId)

              return (
                <Link
                  key={`${deadline.type}:${deadline.id}`}
                  href={deadline.href}
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
                          {deadline.title}
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
                          {deadline.label} {format(dueDate, "MMM d, h:mm a")}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0"
                      >
                        {deadline.type}
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
        <h2 className="font-semibold text-foreground">Past Terms</h2>
        {archivedClassesError ? (
          <p className="text-xs text-destructive">{archivedClassesError}</p>
        ) : null}
        {archivedAssignmentsError ? (
          <p className="text-xs text-destructive">{archivedAssignmentsError}</p>
        ) : null}
        <div className="grid gap-3">
          {archivedTerms.map((term) => (
            <Card key={term.label}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Archive className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {term.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Archived term
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:min-w-[420px]">
                    <Metric label="Classes">{term.classes.length}</Metric>
                    <Metric label="Score">
                      {formatScore(getTermScore(term.classes))}
                    </Metric>
                    <Metric label="Teachers">
                      {countTeachers(term.classes)}
                    </Metric>
                    <Metric label="Students">
                      {countStudents(term.classes)}
                    </Metric>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                  {term.classes.map((classItem) => (
                    <ArchivedStudentClassRow
                      key={classItem.id}
                      classItem={classItem}
                      assignments={
                        archivedAssignmentsByClass[classItem.id] ?? []
                      }
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {archivedClassesStatus === "loading" ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Loading past terms...
              </CardContent>
            </Card>
          ) : null}

          {archivedClassesStatus === "ready" && archivedTerms.length === 0 ? (
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

function ArchivedStudentClassRow({
  classItem,
  assignments,
}: {
  classItem: ReturnType<
    typeof groupArchivedClassesByTerm
  >[number]["classes"][number]
  assignments: ClassAssignment[]
}) {
  const scores = getStudentGradedScores(assignments)

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white",
            CLASS_COLOR_MAP[classItem.color ?? "indigo"] ?? "bg-primary",
          )}
        >
          {classItem.code.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">
            {classItem.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {classItem.code} &middot;{" "}
            {classItem.teacher?.display_name ?? "No teacher"}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 pl-9 sm:w-44 sm:shrink-0 sm:pl-0">
        <Metric label="Score">{formatScore(getAverageScore(scores))}</Metric>
        <Metric label="Graded">{scores.length}</Metric>
      </div>
    </div>
  )
}

function countStudents(
  classes: ReturnType<typeof groupArchivedClassesByTerm>[number]["classes"],
) {
  return new Set(
    classes.flatMap((classItem) =>
      classItem.students.map((student) => student.id),
    ),
  ).size
}

function countTeachers(
  classes: ReturnType<typeof groupArchivedClassesByTerm>[number]["classes"],
) {
  return new Set(
    classes.flatMap((classItem) =>
      [
        classItem.teacher_user_id,
        ...classItem.memberships
          .filter((membership) => membership.role === "teacher")
          .map((membership) => membership.user_id),
      ].filter((userId): userId is string => Boolean(userId)),
    ),
  ).size
}

function getStudentAssignmentProgress(assignments: ClassAssignment[]) {
  if (assignments.length === 0) return 0

  const completed = assignments.filter((assignment) =>
    Boolean(assignment.mySubmission),
  ).length

  return Math.round((completed / assignments.length) * 100)
}

async function loadClassExamDashboardData(classId: string) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/exams`,
    { cache: "no-store" },
  )
  const payload = (await response.json().catch(() => null)) as
    | (ClassExamApiDto & { error?: string })
    | { error?: string }
    | null

  if (!response.ok || !payload || ("error" in payload && payload.error)) {
    if (
      response.status === 403 &&
      payload?.error?.toLowerCase().includes("exam feature is disabled")
    ) {
      return null
    }

    throw new Error(payload?.error ?? "Could not load exams.")
  }

  return (payload as ClassExamApiDto).student
}

function getStudentExamDeadlines(
  page: ClassExamApiDto["student"] | null | undefined,
  classId: string,
): DashboardDeadline[] {
  if (!page) return []

  const activeAttemptExamId = page.activeExam?.attempt
    ? page.activeExam.id
    : null
  const visibleExamDeadlines = page.visibleExams.flatMap(
    (exam): DashboardDeadline[] => {
      if (exam.id === activeAttemptExamId) return []

      const dueAt =
        exam.status === "live"
          ? (exam.endAt ?? exam.startAt)
          : (exam.startAt ?? exam.endAt)
      if (!isFutureDate(dueAt)) return []

      return [
        {
          id: exam.id,
          classId,
          title: exam.title,
          dueAt,
          label: exam.status === "live" ? "Closes" : "Opens",
          type: "exam",
          href: `/classes/${classId}/exam`,
        },
      ]
    },
  )

  const activeAttempt = page.activeExam?.attempt ?? null
  if (page.activeExam && activeAttempt) {
    const activeExam = page.activeExam
    const dueAt = activeAttempt.deadlineAt
    if (!isFutureDate(dueAt)) return visibleExamDeadlines

    return [
      ...visibleExamDeadlines,
      {
        id: activeExam.id,
        classId: activeExam.classId,
        title: activeExam.title,
        dueAt,
        label: "Due",
        type: "exam",
        href: `/classes/${activeExam.classId}/exam`,
      },
    ]
  }

  if (visibleExamDeadlines.length > 0) {
    return visibleExamDeadlines
  }

  if (page.state === "scheduled" && page.scheduledExam) {
    const dueAt = page.scheduledExam.startAt ?? page.scheduledExam.endAt
    if (!isFutureDate(dueAt)) return []

    return [
      {
        id: page.scheduledExam.id,
        classId,
        title: page.scheduledExam.title,
        dueAt,
        label: "Opens",
        type: "exam",
        href: `/classes/${classId}/exam`,
      },
    ]
  }

  if (page.state === "active" && page.activeExam) {
    const activeExam = page.activeExam
    if (!activeExam.attempt && !activeExam.canStartAttempt) return []

    const dueAt =
      activeExam.attempt?.deadlineAt ?? activeExam.endAt ?? activeExam.startAt
    if (!isFutureDate(dueAt)) return []

    return [
      {
        id: activeExam.id,
        classId: activeExam.classId,
        title: activeExam.title,
        dueAt,
        label: activeExam.attempt ? "Due" : "Closes",
        type: "exam",
        href: `/classes/${activeExam.classId}/exam`,
      },
    ]
  }

  return []
}

function isFutureDate(value: string | null | undefined): value is string {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > Date.now()
}
