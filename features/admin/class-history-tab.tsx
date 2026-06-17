"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Archive,
  BookOpen,
  CalendarDays,
  GraduationCap,
  LoaderCircle,
  RotateCcw,
  Users,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  type ClassAssignment,
  loadClassAssignments,
} from "@/features/assignments/use-class-assignments"
import {
  formatScore,
  getAverageScore,
  getClassGradedScores,
} from "@/features/classes/grade-metrics"
import {
  groupArchivedClassesByTerm,
  useArchivedClasses,
} from "@/features/classes/use-archived-classes"
import type { OrganizationClass } from "@/lib/supabase/classes"

export function ClassHistoryTab() {
  const {
    archivedClasses: classes,
    archivedClassesStatus: status,
    archivedClassesError: errorMessage,
    refreshArchivedClasses,
  } = useArchivedClasses()
  const [assignmentsByClass, setAssignmentsByClass] = useState<
    Record<string, ClassAssignment[]>
  >({})
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null)

  const terms = useMemo(() => groupArchivedClassesByTerm(classes), [classes])
  const classIds = classes.map((classItem) => classItem.id)
  const classIdKey = classIds.join("|")
  const allScores = getClassGradedScores(
    classIds.flatMap((classId) => assignmentsByClass[classId] ?? []),
  )
  const studentIds = useMemo(
    () =>
      new Set(
        classes.flatMap((classItem) =>
          classItem.students.map((student) => student.id),
        ),
      ),
    [classes],
  )
  const teacherIds = useMemo(
    () =>
      new Set(
        classes.flatMap((classItem) =>
          [
            classItem.teacher_user_id,
            ...classItem.memberships
              .filter((membership) => membership.role === "teacher")
              .map((membership) => membership.user_id),
          ].filter((userId): userId is string => Boolean(userId)),
        ),
      ),
    [classes],
  )

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
          currentUserId: null,
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
            : "Could not load archived gradebooks.",
        )
      })

    return () => {
      cancelled = true
    }
  }, [classIdKey])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Past Terms</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void refreshArchivedClasses()}
            disabled={status === "loading"}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {status === "loading" ? (
          <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading past terms...
          </div>
        ) : null}

        {status === "error" ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertTitle>Could not load history</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {assignmentsError ? (
          <div className="px-5 pb-4">
            <Alert variant="destructive">
              <AlertTitle>Could not load grade history</AlertTitle>
              <AlertDescription>{assignmentsError}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {status === "ready" && classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                No past terms yet
              </p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Archive completed classes from the Classes tab to keep a term
                history without showing old classes in active dashboards.
              </p>
            </div>
          </div>
        ) : null}

        {status === "ready" && classes.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 border-b border-border px-5 py-4 sm:grid-cols-4">
              <SummaryItem
                icon={CalendarDays}
                label="Past Terms"
                value={String(terms.length)}
              />
              <SummaryItem
                icon={BookOpen}
                label="Classes"
                value={String(classes.length)}
              />
              <SummaryItem
                icon={GraduationCap}
                label="Students"
                value={String(studentIds.size)}
              />
              <SummaryItem
                icon={Users}
                label="Avg Score"
                value={formatScore(getAverageScore(allScores))}
              />
            </div>

            <div className="divide-y divide-border">
              {terms.map((term) => (
                <section key={term.label}>
                  <div className="flex items-center justify-between gap-3 bg-muted/40 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {term.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {term.classes.length}{" "}
                        {term.classes.length === 1 ? "class" : "classes"}{" "}
                        &middot; Score:{" "}
                        {formatScore(
                          getAverageScore(
                            getClassGradedScores(
                              term.classes.flatMap(
                                (classItem) =>
                                  assignmentsByClass[classItem.id] ?? [],
                              ),
                            ),
                          ),
                        )}
                      </p>
                    </div>
                    <Badge variant="secondary" className="border-0 text-[10px]">
                      Archived
                    </Badge>
                  </div>

                  <div className="divide-y divide-border">
                    {term.classes.map((classItem) => {
                      const assignments = assignmentsByClass[classItem.id] ?? []
                      const scores = getClassGradedScores(assignments)

                      return (
                        <div
                          key={classItem.id}
                          className="px-5 py-4 transition-colors hover:bg-muted/50"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                                <BookOpen className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {classItem.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {classItem.code} &middot;{" "}
                                  {classItem.teacher?.display_name ??
                                    "No teacher"}
                                </p>
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
                              <Metric label="Assignments">
                                {assignments.length}
                              </Metric>
                              <Metric label="Room">
                                {classItem.room ?? "No room"}
                              </Metric>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground">{value}</p>
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
