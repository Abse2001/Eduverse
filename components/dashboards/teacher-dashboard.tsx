"use client"

import {
  Archive,
  BookOpen,
  FileText,
  LoaderCircle,
  MessageSquare,
  PlusCircle,
  Edit3,
  School,
  TrendingUp,
  Upload,
  Users,
  Video,
} from "lucide-react"
import Link from "next/link"
import { type FormEvent, useEffect, useState, useTransition } from "react"
import { StatCard } from "@/components/shared/stat-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  readCachedClassAssignments,
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
import { getClassesForUser } from "@/lib/education/classes"
import { useApp } from "@/lib/store"
import { createClient } from "@/lib/supabase/client"
import { type OrganizationClass, toLegacyClass } from "@/lib/supabase/classes"
import type { OrganizationSettingsPayload } from "@/lib/supabase/organization-settings"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

type ClassFormState = {
  name: string
  code: string
  color: string
  description: string
  room: string
  semester: string
  stage: string
}

const EMPTY_CLASS_FORM: ClassFormState = {
  name: "",
  code: "",
  color: "indigo",
  description: "",
  room: "Online",
  semester: "Current term",
  stage: "",
}

const CLASS_COLOR_OPTIONS = [
  "indigo",
  "emerald",
  "violet",
  "amber",
  "rose",
  "sky",
]

export function TeacherDashboard() {
  const {
    authUser,
    activeOrganization,
    currentUser,
    organizationClasses,
    refreshOrganizationClasses,
  } = useApp()
  const { archivedClasses, archivedClassesStatus, archivedClassesError } =
    useArchivedClasses()
  const [classForm, setClassForm] = useState<ClassFormState>(EMPTY_CLASS_FORM)
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<OrganizationClass | null>(
    null,
  )
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const classRows = getClassesForUser(organizationClasses, currentUser)
  const archivedClassRows = getClassesForUser(archivedClasses, currentUser)
  const archivedTerms = groupArchivedClassesByTerm(archivedClassRows)
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
  const canCreateClasses = canCurrentTeacherCreateClasses(
    activeOrganization?.settings,
    authUser?.id ?? currentUser.id,
  )
  const canManageOwnClasses = canCurrentTeacherManageOwnClasses(
    activeOrganization?.settings,
    authUser?.id ?? currentUser.id,
  )

  useEffect(() => {
    let cancelled = false
    const currentUserId = authUser?.id ?? currentUser.id ?? null

    if (classIds.length === 0) {
      setAssignmentsByClass({})
      setAssignmentsError(null)
      return
    }

    setAssignmentsByClass(
      Object.fromEntries(
        classIds.flatMap((classId) => {
          const assignments = readCachedClassAssignments({
            classId,
            currentUserId,
            canManage: true,
          })
          return assignments ? [[classId, assignments] as const] : []
        }),
      ),
    )

    Promise.all(
      classIds.map(async (classId) => {
        const assignments = await loadClassAssignments({
          classId,
          currentUserId,
          canManage: true,
          force: true,
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

    setArchivedAssignmentsByClass(
      Object.fromEntries(
        archivedClassIds.flatMap((classId) => {
          const assignments = readCachedClassAssignments({
            classId,
            currentUserId,
            canManage: true,
          })
          return assignments ? [[classId, assignments] as const] : []
        }),
      ),
    )

    Promise.all(
      archivedClassIds.map(async (classId) => {
        const assignments = await loadClassAssignments({
          classId,
          currentUserId,
          canManage: true,
          force: true,
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

  function openCreateClassDialog() {
    setEditingClass(null)
    setClassForm(EMPTY_CLASS_FORM)
    setIsCreateClassOpen(true)
  }

  function openEditClassDialog(classItem: OrganizationClass) {
    setEditingClass(classItem)
    setClassForm({
      name: classItem.name,
      code: classItem.code,
      color: classItem.color ?? "indigo",
      description: classItem.description,
      room: classItem.room ?? "Online",
      semester: classItem.semester ?? "",
      stage: classItem.stage ?? "",
    })
    setIsCreateClassOpen(true)
  }

  function submitClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeOrganization) return

    startTransition(async () => {
      const supabase = createClient()
      const { error } = editingClass
        ? await supabase.rpc("update_class", {
            target_class_id: editingClass.id,
            class_name: classForm.name,
            class_code: classForm.code,
            teacher_email: currentUser.email,
            class_color: classForm.color,
            class_description: classForm.description,
            class_room: classForm.room,
            class_semester: classForm.semester,
            class_stage: classForm.stage,
          })
        : await supabase.rpc("create_class", {
            target_org_id: activeOrganization.id,
            class_name: classForm.name,
            class_code: classForm.code,
            teacher_email: currentUser.email,
            class_color: classForm.color,
            class_description: classForm.description,
            class_room: classForm.room,
            class_semester: classForm.semester,
            class_stage: classForm.stage,
          })

      if (error) {
        toast({
          title: editingClass ? "Class update failed" : "Class creation failed",
          description: error.message,
          variant: "destructive",
        })
        return
      }

      setClassForm(EMPTY_CLASS_FORM)
      setEditingClass(null)
      setIsCreateClassOpen(false)
      await refreshOrganizationClasses({ force: true })
      toast({ title: editingClass ? "Class updated" : "Class created" })
    })
  }

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
        <div className="flex items-center gap-2">
          {canCreateClasses ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={openCreateClassDialog}
            >
              <PlusCircle className="h-4 w-4" />
              Create Class
            </Button>
          ) : null}
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 dark:border-emerald-800 dark:bg-emerald-900/20">
            <School className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Teacher
            </span>
          </div>
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
          const classItem = classRowById.get(cls.id)
          const students = classItem?.students ?? []
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
                        {classItem?.organization_visible ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px]"
                          >
                            Organization visible
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cls.code} &middot; {cls.room}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {classItem?.semester ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {classItem.semester}
                        </Badge>
                      ) : null}
                      {classItem?.stage ? (
                        <Badge variant="outline" className="text-[10px]">
                          {classItem.stage}
                        </Badge>
                      ) : null}
                    </div>
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
                  {canManageOwnClasses && classItem ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1.5"
                      onClick={() => openEditClassDialog(classItem)}
                    >
                      <Edit3 className="w-3 h-3" /> Edit Class
                    </Button>
                  ) : null}
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
          {archivedTerms.map((term) => (
            <Card key={term.label}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                        <Archive className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {term.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {term.classes.length} archived{" "}
                          {term.classes.length === 1 ? "class" : "classes"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:min-w-[420px]">
                    <Metric label="Classes">{term.classes.length}</Metric>
                    <Metric label="Score">
                      {formatScore(
                        getAverageScore(
                          getClassGradedScores(
                            term.classes.flatMap(
                              (classItem) =>
                                archivedAssignmentsByClass[classItem.id] ?? [],
                            ),
                          ),
                        ),
                      )}
                    </Metric>
                    <Metric label="Students">
                      {countStudents(term.classes)}
                    </Metric>
                    <Metric label="Teachers">
                      {countTeachers(term.classes)}
                    </Metric>
                  </div>
                </div>
                <div className="mt-4 space-y-3 border-t border-border pt-3">
                  {term.stages.map((stage) => (
                    <section key={`${term.label}-${stage.label}`}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-medium uppercase tracking-normal text-muted-foreground">
                          {stage.label}
                        </p>
                        <Badge variant="outline" className="text-[10px]">
                          {stage.classes.length}{" "}
                          {stage.classes.length === 1 ? "class" : "classes"}
                        </Badge>
                      </div>
                      <div className="grid gap-2">
                        {stage.classes.map((classItem) => (
                          <ArchivedTeacherClassRow
                            key={classItem.id}
                            classItem={classItem}
                            assignments={
                              archivedAssignmentsByClass[classItem.id] ?? []
                            }
                          />
                        ))}
                      </div>
                    </section>
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

      <Dialog open={isCreateClassOpen} onOpenChange={setIsCreateClassOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingClass ? "Edit class" : "Create class"}
            </DialogTitle>
            <DialogDescription>
              {editingClass
                ? "Update the class details your organization allows teachers to manage."
                : "This class will be assigned to you."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitClass}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="teacher-class-name">Name</Label>
                <Input
                  id="teacher-class-name"
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
                <Label htmlFor="teacher-class-code">Code</Label>
                <Input
                  id="teacher-class-code"
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
            <div className="grid gap-4 sm:grid-cols-4">
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
                    {CLASS_COLOR_OPTIONS.map((color) => (
                      <SelectItem key={color} value={color}>
                        {color}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher-class-room">Room</Label>
                <Input
                  id="teacher-class-room"
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
                <Label htmlFor="teacher-class-semester">Term</Label>
                <Input
                  id="teacher-class-semester"
                  value={classForm.semester}
                  onChange={(event) =>
                    setClassForm((value) => ({
                      ...value,
                      semester: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher-class-stage">Stage</Label>
                <Input
                  id="teacher-class-stage"
                  value={classForm.stage}
                  placeholder="5th Semester"
                  onChange={(event) =>
                    setClassForm((value) => ({
                      ...value,
                      stage: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacher-class-description">Description</Label>
              <Textarea
                id="teacher-class-description"
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
                onClick={() => setIsCreateClassOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : editingClass ? (
                  "Save changes"
                ) : (
                  "Create class"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function canCurrentTeacherCreateClasses(
  settings: OrganizationSettingsPayload | null | undefined,
  userId: string,
) {
  if (!settings) return false
  if (settings.all_teachers_can_create_classes) return true

  return settings.teacherClassPermissions.some(
    (permission) =>
      permission.teacher_user_id === userId && permission.can_create_classes,
  )
}

function canCurrentTeacherManageOwnClasses(
  settings: OrganizationSettingsPayload | null | undefined,
  userId: string,
) {
  if (!settings) return false
  if (settings.all_teachers_can_manage_own_classes) return true

  return settings.teacherClassPermissions.some(
    (permission) =>
      permission.teacher_user_id === userId &&
      permission.can_manage_own_classes,
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

function ArchivedTeacherClassRow({
  classItem,
  assignments,
}: {
  classItem: ReturnType<
    typeof groupArchivedClassesByTerm
  >[number]["classes"][number]
  assignments: ClassAssignment[]
}) {
  const scores = getClassGradedScores(assignments)

  return (
    <div className="grid gap-3 rounded-md bg-muted/40 px-3 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">
          {classItem.name}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {classItem.code} &middot;{" "}
          {classItem.teacher?.display_name ?? "No teacher"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Score">{formatScore(getAverageScore(scores))}</Metric>
        <Metric label="Graded">{scores.length}</Metric>
        <Metric label="Students">{classItem.students.length}</Metric>
        <Metric label="Room">{classItem.room ?? "No room"}</Metric>
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
