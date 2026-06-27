"use client"

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react"
import {
  Archive,
  BookOpen,
  CalendarDays,
  Edit3,
  GraduationCap,
  LoaderCircle,
  RotateCcw,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
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
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import type { OrganizationClass } from "@/lib/supabase/classes"
import { useApp } from "@/lib/store"

type ArchivedClassFormState = {
  name: string
  code: string
  teacherEmail: string
  color: string
  description: string
  room: string
  semester: string
  stage: string
}

const NO_TEACHER_VALUE = "none"

export function ClassHistoryTab() {
  const { organizationMembers } = useApp()
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
  const [editingClass, setEditingClass] = useState<OrganizationClass | null>(
    null,
  )
  const [classForm, setClassForm] = useState<ArchivedClassFormState>({
    name: "",
    code: "",
    teacherEmail: "",
    color: "indigo",
    description: "",
    room: "",
    semester: "",
    stage: "General",
  })
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const terms = useMemo(() => groupArchivedClassesByTerm(classes), [classes])
  const teacherMembers = useMemo(
    () =>
      organizationMembers.filter(
        (member) =>
          member.role === "teacher" ||
          member.roles.some(
            (roleRecord) =>
              roleRecord.status === "active" && roleRecord.role === "teacher",
          ),
      ),
    [organizationMembers],
  )
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
    if (status !== "error" || !errorMessage) return

    toast({
      title: "Could not load history",
      description: errorMessage,
      variant: "destructive",
    })
  }, [errorMessage, status, toast])

  useEffect(() => {
    if (!assignmentsError) return

    toast({
      title: "Could not load grade history",
      description: assignmentsError,
      variant: "destructive",
    })
  }, [assignmentsError, toast])

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

  function openEditDialog(classItem: OrganizationClass) {
    setEditingClass(classItem)
    setClassForm({
      name: classItem.name,
      code: classItem.code,
      teacherEmail: classItem.teacher?.email ?? "",
      color: classItem.color ?? "indigo",
      description: classItem.description,
      room: classItem.room ?? "",
      semester: classItem.semester ?? "",
      stage: classItem.stage ?? "",
    })
  }

  function submitArchivedClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingClass) return

    startTransition(async () => {
      const { error } = await createClient().rpc("update_class", {
        target_class_id: editingClass.id,
        class_name: classForm.name,
        class_code: classForm.code,
        teacher_email: classForm.teacherEmail,
        class_color: classForm.color,
        class_description: classForm.description,
        class_room: classForm.room,
        class_semester: classForm.semester,
        class_stage: classForm.stage,
      })

      if (error) {
        toast({
          title: "Could not update archived class",
          description: error.message,
          variant: "destructive",
        })
        return
      }

      setEditingClass(null)
      await refreshArchivedClasses()
      toast({
        title: "Archived class updated",
        description: "This edit is marked in Past Terms.",
      })
    })
  }

  return (
    <>
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
                  End completed classes from the Classes tab to keep a term
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
                      <Badge
                        variant="secondary"
                        className="border-0 text-[10px]"
                      >
                        Archived
                      </Badge>
                    </div>

                    <div className="divide-y divide-border">
                      {term.stages.map((stage) => (
                        <section key={`${term.label}-${stage.label}`}>
                          <div className="flex items-center justify-between gap-3 px-5 py-2">
                            <p className="truncate text-xs font-medium uppercase tracking-normal text-muted-foreground">
                              {stage.label}
                            </p>
                            <Badge variant="outline" className="text-[10px]">
                              {stage.classes.length}{" "}
                              {stage.classes.length === 1 ? "class" : "classes"}
                            </Badge>
                          </div>
                          <div className="divide-y divide-border">
                            {stage.classes.map((classItem) => {
                              const assignments =
                                assignmentsByClass[classItem.id] ?? []
                              const scores = getClassGradedScores(assignments)

                              return (
                                <div
                                  key={classItem.id}
                                  className="px-5 py-4 transition-colors hover:bg-muted/50"
                                >
                                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,520px)] md:items-center">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                                        <BookOpen className="h-4 w-4" />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                          <p className="truncate text-sm font-semibold text-foreground">
                                            {classItem.name}
                                          </p>
                                          {classItem.archived_edited_at ? (
                                            <Badge
                                              variant="outline"
                                              className="text-[10px]"
                                            >
                                              Edited after end
                                            </Badge>
                                          ) : null}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {classItem.code} &middot;{" "}
                                          {classItem.teacher?.display_name ??
                                            "No teacher"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          Ended{" "}
                                          {formatDateTime(classItem.ended_at)}
                                          {classItem.archived_edited_at
                                            ? ` · Edited ${formatDateTime(classItem.archived_edited_at)}`
                                            : ""}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-6">
                                      <Metric label="Score">
                                        {formatScore(getAverageScore(scores))}
                                      </Metric>
                                      <Metric label="Graded">
                                        {scores.length}
                                      </Metric>
                                      <Metric label="Students">
                                        {classItem.students.length}
                                      </Metric>
                                      <Metric label="Assignments">
                                        {assignments.length}
                                      </Metric>
                                      <Metric label="Room">
                                        <span
                                          title={classItem.room ?? "No room"}
                                        >
                                          {classItem.room ?? "No room"}
                                        </span>
                                      </Metric>
                                      <div className="flex items-end justify-start">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 gap-1 text-xs"
                                          onClick={() =>
                                            openEditDialog(classItem)
                                          }
                                        >
                                          <Edit3 className="h-3.5 w-3.5" />
                                          Edit
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={editingClass !== null}
        onOpenChange={(open) => {
          if (!open) setEditingClass(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit archived class</DialogTitle>
            <DialogDescription>
              Update historical metadata. The class stays ended and inactive.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitArchivedClass}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="archived-class-name">Name</Label>
                <Input
                  id="archived-class-name"
                  value={classForm.name}
                  onChange={(event) =>
                    setClassForm((value) => ({
                      ...value,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="archived-class-code">Code</Label>
                <Input
                  id="archived-class-code"
                  value={classForm.code}
                  onChange={(event) =>
                    setClassForm((value) => ({
                      ...value,
                      code: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Teacher</Label>
                <Select
                  value={classForm.teacherEmail || NO_TEACHER_VALUE}
                  onValueChange={(teacherEmail) =>
                    setClassForm((value) => ({
                      ...value,
                      teacherEmail:
                        teacherEmail === NO_TEACHER_VALUE ? "" : teacherEmail,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEACHER_VALUE}>
                      No teacher assigned
                    </SelectItem>
                    {teacherMembers.map((member) => {
                      const name = member.profile?.display_name ?? "Teacher"
                      const email = member.profile?.email ?? ""
                      if (!email) return null

                      return (
                        <SelectItem key={member.id} value={email}>
                          {name} ({email})
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Select
                  value={classForm.color}
                  onValueChange={(color) =>
                    setClassForm((value) => ({ ...value, color }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "indigo",
                      "emerald",
                      "violet",
                      "amber",
                      "rose",
                      "sky",
                    ].map((color) => (
                      <SelectItem key={color} value={color}>
                        {color}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="archived-class-room">Room</Label>
                <Input
                  id="archived-class-room"
                  value={classForm.room}
                  onChange={(event) =>
                    setClassForm((value) => ({
                      ...value,
                      room: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="archived-class-term">Term</Label>
                <Input
                  id="archived-class-term"
                  value={classForm.semester}
                  onChange={(event) =>
                    setClassForm((value) => ({
                      ...value,
                      semester: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="archived-class-stage">Stage</Label>
                <Input
                  id="archived-class-stage"
                  value={classForm.stage}
                  onChange={(event) =>
                    setClassForm((value) => ({
                      ...value,
                      stage: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="archived-class-description">Description</Label>
              <Textarea
                id="archived-class-description"
                value={classForm.description}
                onChange={(event) =>
                  setClassForm((value) => ({
                    ...value,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingClass(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
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

function formatDateTime(value: string | null) {
  if (!value) return "before lifecycle tracking"

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
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
