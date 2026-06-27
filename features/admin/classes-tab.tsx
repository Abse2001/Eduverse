"use client"

import {
  Archive,
  Edit3,
  LoaderCircle,
  PlusCircle,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react"
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react"
import Link from "next/link"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { getFeatureDisplayLabel } from "@/lib/features/feature-registry"
import { useApp } from "@/lib/store"
import { groupClassesByTermAndStage } from "@/lib/education/classes"
import type { OrganizationClass } from "@/lib/supabase/classes"
import { createClient } from "@/lib/supabase/client"
import type {
  ClassExtensionSetting,
  FeatureDefinition,
  FeatureSetting,
  OrganizationExtension,
} from "@/lib/supabase/features"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

type ClassFormState = {
  name: string
  code: string
  teacherEmail: string
  color: string
  description: string
  room: string
  semester: string
  stage: string
  organizationVisible: boolean
  resultsVisibleToStudents: boolean
  teacherCanToggleResultsVisibility: boolean
}

type FeatureValueMap = Record<string, boolean>
type ExtensionValueMap = Record<string, boolean>
type EndClassesScope = "all" | "term" | "stage" | "term_stage"
type PendingEndAction =
  | {
      kind: "class"
      title: string
      description: string
      detail: string
      successMessage: string
      payload: { target_class_id: string }
    }
  | {
      kind: "bulk"
      title: string
      description: string
      detail: string
      successMessage: string
      payload: {
        target_org_id: string
        target_scope: EndClassesScope
        target_term?: string
        target_stage?: string
      }
    }

const NO_TEACHER_VALUE = "none"

const EMPTY_CLASS_FORM: ClassFormState = {
  name: "",
  code: "",
  teacherEmail: "",
  color: "indigo",
  description: "",
  room: "Online",
  semester: "",
  stage: "",
  organizationVisible: false,
  resultsVisibleToStudents: false,
  teacherCanToggleResultsVisibility: false,
}

function getActiveOrganizationRoles(member: {
  role: "org_admin" | "teacher" | "student"
  roles: Array<{ role: "org_admin" | "teacher" | "student"; status: string }>
}) {
  const activeRoles = member.roles
    .filter((roleRecord) => roleRecord.status === "active")
    .map((roleRecord) => roleRecord.role)

  return activeRoles.length > 0 ? activeRoles : [member.role]
}

export function ClassesTab() {
  const {
    activeOrganization,
    featureDefinitions,
    organizationClasses: classes,
    organizationClassesStatus,
    organizationClassesError,
    organizationMembers,
    refreshOrganizationClasses,
    refreshClassLiveSessions,
  } = useApp()
  const [classForm, setClassForm] = useState<ClassFormState>(EMPTY_CLASS_FORM)
  const [classFeatureValues, setClassFeatureValues] = useState<FeatureValueMap>(
    {},
  )
  const [classExtensionValues, setClassExtensionValues] =
    useState<ExtensionValueMap>({})
  const [editingClass, setEditingClass] = useState<OrganizationClass | null>(
    null,
  )
  const [inviteClass, setInviteClass] = useState<OrganizationClass | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [inviteRole, setInviteRole] = useState<"student" | "teacher">("student")
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [pendingEndAction, setPendingEndAction] =
    useState<PendingEndAction | null>(null)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const isLoading = organizationClassesStatus === "loading"
  const publicFeaturesEnabled =
    activeOrganization?.settings.public_features_enabled ?? false
  const classFeatureRows = useMemo(
    () =>
      buildClassFeatureRows(
        featureDefinitions,
        activeOrganization?.featureSettings ?? [],
        classFeatureValues,
      ),
    [
      activeOrganization?.featureSettings,
      classFeatureValues,
      featureDefinitions,
    ],
  )
  const classExtensionRows = useMemo(
    () =>
      buildClassExtensionRows(
        activeOrganization?.extensions ?? [],
        classExtensionValues,
      ),
    [activeOrganization?.extensions, classExtensionValues],
  )
  const teacherMembers = useMemo(
    () =>
      organizationMembers.filter((member) =>
        getActiveOrganizationRoles(member).includes("teacher"),
      ),
    [organizationMembers],
  )
  const groupedClasses = useMemo(
    () => groupClassesByTermAndStage(classes),
    [classes],
  )

  useEffect(() => {
    if (!organizationClassesError) return

    showClassError(organizationClassesError)
  }, [organizationClassesError])

  function showClassError(description: string) {
    toast({
      title: "Class action failed",
      description,
      variant: "destructive",
    })
  }

  async function loadClasses() {
    if (!activeOrganization) return

    try {
      await refreshOrganizationClasses({ force: true })
    } catch (error) {
      showClassError(
        error instanceof Error ? error.message : "Could not load classes",
      )
    }
  }

  function openCreateDialog() {
    setEditingClass(null)
    setClassForm(EMPTY_CLASS_FORM)
    setClassFeatureValues(
      getInitialClassFeatureValues(
        featureDefinitions,
        activeOrganization?.featureSettings ?? [],
        [],
      ),
    )
    setClassExtensionValues(
      getInitialClassExtensionValues(activeOrganization?.extensions ?? [], []),
    )
    setIsClassDialogOpen(true)
  }

  function openEditDialog(classItem: OrganizationClass) {
    setEditingClass(classItem)
    setClassForm({
      name: classItem.name,
      code: classItem.code,
      teacherEmail: classItem.teacher?.email ?? "",
      color: classItem.color ?? "indigo",
      description: classItem.description,
      room: classItem.room ?? "Online",
      semester: classItem.semester ?? "",
      stage: classItem.stage ?? "",
      organizationVisible: classItem.organization_visible,
      resultsVisibleToStudents: classItem.results_visible_to_students,
      teacherCanToggleResultsVisibility:
        classItem.teacher_can_toggle_results_visibility,
    })
    setClassFeatureValues(
      getInitialClassFeatureValues(
        featureDefinitions,
        activeOrganization?.featureSettings ?? [],
        classItem.featureSettings,
      ),
    )
    setClassExtensionValues(
      getInitialClassExtensionValues(
        activeOrganization?.extensions ?? [],
        classItem.extensionSettings,
      ),
    )
    setIsClassDialogOpen(true)
  }

  function openInviteDialog(classItem: OrganizationClass) {
    setInviteClass(classItem)
    setSelectedMemberId("")
    setInviteRole("student")
    setIsInviteDialogOpen(true)
  }

  function submitClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeOrganization) return

    startTransition(async () => {
      const supabase = createClient()
      const rpcName = editingClass ? "update_class" : "create_class"
      const payload = editingClass
        ? {
            target_class_id: editingClass.id,
            class_name: classForm.name,
            class_code: classForm.code,
            teacher_email: classForm.teacherEmail,
            class_color: classForm.color,
            class_description: classForm.description,
            class_room: classForm.room,
            class_semester: classForm.semester,
            class_stage: classForm.stage,
          }
        : {
            target_org_id: activeOrganization.id,
            class_name: classForm.name,
            class_code: classForm.code,
            teacher_email: classForm.teacherEmail,
            class_color: classForm.color,
            class_description: classForm.description,
            class_room: classForm.room,
            class_semester: classForm.semester,
            class_stage: classForm.stage,
          }

      const { data, error } = await supabase.rpc(rpcName, payload)

      if (error) {
        showClassError(error.message)
        return
      }

      const savedClassId =
        editingClass?.id ??
        (data as { class_id?: string } | null | undefined)?.class_id ??
        null

      if (savedClassId) {
        const visibilityError = await saveClassOrganizationVisibility(
          savedClassId,
          classForm.organizationVisible,
        )

        if (visibilityError) {
          showClassError(visibilityError)
          return
        }

        const resultsVisibilityError = await saveClassResultsVisibility({
          classId: savedClassId,
          resultsVisibleToStudents: classForm.resultsVisibleToStudents,
          teacherCanToggleResultsVisibility:
            classForm.teacherCanToggleResultsVisibility,
        })

        if (resultsVisibilityError) {
          showClassError(resultsVisibilityError)
          return
        }

        const featureError = await saveClassFeatureSettings(
          savedClassId,
          activeOrganization.id,
          classFeatureRows,
        )

        if (featureError) {
          showClassError(featureError)
          return
        }

        const extensionError = await saveClassExtensionSettings(
          savedClassId,
          activeOrganization.id,
          classExtensionRows,
        )

        if (extensionError) {
          showClassError(extensionError)
          return
        }
      }

      setIsClassDialogOpen(false)
      setEditingClass(null)
      setClassForm(EMPTY_CLASS_FORM)
      setClassFeatureValues({})
      setClassExtensionValues({})
      await loadClasses()
    })
  }

  function openEndClassDialog(classItem: OrganizationClass) {
    setPendingEndAction({
      kind: "class",
      title: `End ${classItem.name}?`,
      description:
        "This class will move to Past Terms, active sessions will close, and students will no longer use it as an active class.",
      detail:
        "Scores, submissions, exams, materials, and history stay preserved for admins and teachers.",
      successMessage: `${classItem.name} ended.`,
      payload: { target_class_id: classItem.id },
    })
  }

  function openEndBulkDialog({
    classes: targetClasses,
    scope,
    term,
    stage,
  }: {
    classes: OrganizationClass[]
    scope: EndClassesScope
    term?: string
    stage?: string
  }) {
    if (!activeOrganization || targetClasses.length === 0) return

    const classCountLabel = `${targetClasses.length} ${
      targetClasses.length === 1 ? "class" : "classes"
    }`
    const scopeLabel =
      scope === "all"
        ? "all active classes"
        : scope === "term"
          ? `term ${term}`
          : scope === "stage"
            ? `stage ${stage}`
            : `${term}, ${stage}`

    setPendingEndAction({
      kind: "bulk",
      title: `End ${classCountLabel}?`,
      description: `This will end ${scopeLabel} and move the matching active classes to Past Terms.`,
      detail:
        "Active sessions will close immediately. Scores, submissions, exams, materials, and history stay preserved.",
      successMessage: `${classCountLabel} ended.`,
      payload: {
        target_org_id: activeOrganization.id,
        target_scope: scope,
        ...(term ? { target_term: term } : {}),
        ...(stage ? { target_stage: stage } : {}),
      },
    })
  }

  function executePendingEndAction() {
    if (!pendingEndAction) return

    const action = pendingEndAction

    startTransition(async () => {
      const rpcName = action.kind === "class" ? "end_class" : "end_classes"
      const { error } = await createClient().rpc(rpcName, action.payload)

      if (error) {
        showClassError(error.message)
        return
      }

      setPendingEndAction(null)
      await loadClasses()
      await refreshClassLiveSessions({ force: true }).catch(() => {})
      toast({
        title: "Classes ended",
        description: action.successMessage,
      })
    })
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inviteClass) return
    const selectedMember = organizationMembers.find(
      (member) => member.id === selectedMemberId,
    )
    const selectedEmail = selectedMember?.profile?.email
    if (!selectedEmail) return

    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc("invite_class_member", {
        target_class_id: inviteClass.id,
        invited_email: selectedEmail,
        invited_class_role: inviteRole,
      })

      if (error) {
        showClassError(error.message)
        return
      }

      setIsInviteDialogOpen(false)
      setInviteClass(null)
      setSelectedMemberId("")
      await loadClasses()
      toast({
        title: "Member assigned",
        description: `${selectedEmail} added to ${inviteClass.name}.`,
      })
    })
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">All Classes</CardTitle>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {classes.length > 0 ? (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() =>
                    openEndBulkDialog({
                      classes,
                      scope: "all",
                    })
                  }
                >
                  <Archive className="h-3.5 w-3.5" />
                  End all
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-7"
                onClick={openCreateDialog}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Add Class
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading classes...
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groupedClasses.map((term) => (
                <section key={term.label}>
                  <div className="flex items-center justify-between gap-3 bg-muted/40 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {term.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {term.classes.length}{" "}
                        {term.classes.length === 1 ? "class" : "classes"}
                      </p>
                    </div>
                    {getTermValue(term.classes) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                        onClick={() =>
                          openEndBulkDialog({
                            classes: term.classes,
                            scope: "term",
                            term: getTermValue(term.classes) ?? undefined,
                          })
                        }
                      >
                        <Archive className="h-3.5 w-3.5" />
                        End term
                      </Button>
                    ) : null}
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
                          {getTermValue(stage.classes) &&
                          getStageValue(stage.classes) ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                              onClick={() =>
                                openEndBulkDialog({
                                  classes: stage.classes,
                                  scope: "term_stage",
                                  term:
                                    getTermValue(stage.classes) ?? undefined,
                                  stage:
                                    getStageValue(stage.classes) ?? undefined,
                                })
                              }
                            >
                              <Archive className="h-3.5 w-3.5" />
                              End stage
                            </Button>
                          ) : null}
                        </div>
                        <div className="divide-y divide-border">
                          {stage.classes.map((classItem) => (
                            <div
                              key={classItem.id}
                              className="flex flex-col gap-3 px-5 py-3 transition-colors hover:bg-muted/50 lg:flex-row lg:items-center"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <div
                                  className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white",
                                    CLASS_COLOR_MAP[
                                      classItem.color ?? "indigo"
                                    ] ?? "bg-primary",
                                  )}
                                >
                                  {classItem.code.slice(0, 2)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {classItem.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {classItem.code} &middot;{" "}
                                    {classItem.teacher?.display_name ??
                                      "No teacher"}
                                  </p>
                                </div>
                                <div className="hidden items-center gap-4 text-xs text-muted-foreground md:flex">
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {classItem.students.length} students
                                  </span>
                                  {classItem.room ? (
                                    <span>{classItem.room}</span>
                                  ) : null}
                                </div>
                                {classItem.organization_visible ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    Organization visible
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 pl-11 lg:pl-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() => openInviteDialog(classItem)}
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  Assign member
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() => openEditDialog(classItem)}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                                  onClick={() => openEndClassDialog(classItem)}
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                  End
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ))}

              {classes.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No classes yet.
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isClassDialogOpen} onOpenChange={setIsClassDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingClass ? "Edit class" : "Create class"}
            </DialogTitle>
            <DialogDescription>
              Assign an existing teacher or leave the class unassigned. Students
              can be added after the class is created.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitClass}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="class-name">Name</Label>
                <Input
                  id="class-name"
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
                <Label htmlFor="class-code">Code</Label>
                <Input
                  id="class-code"
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
              <div className="space-y-2">
                <Label htmlFor="class-room">Room</Label>
                <Input
                  id="class-room"
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
                <Label htmlFor="class-semester">Term</Label>
                <Input
                  id="class-semester"
                  value={classForm.semester}
                  placeholder="Current term"
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
                <Label htmlFor="class-stage">Stage</Label>
                <Input
                  id="class-stage"
                  value={classForm.stage}
                  placeholder="5th Semester"
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
              <Label htmlFor="class-description">Description</Label>
              <Textarea
                id="class-description"
                value={classForm.description}
                onChange={(event) =>
                  setClassForm((value) => ({
                    ...value,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-4">
              <Switch
                checked={classForm.organizationVisible}
                disabled={
                  !publicFeaturesEnabled && !classForm.organizationVisible
                }
                onCheckedChange={(checked) =>
                  setClassForm((value) => ({
                    ...value,
                    organizationVisible: checked,
                  }))
                }
                aria-label="Toggle organization visibility"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  Visible to students in the organization
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {publicFeaturesEnabled
                    ? "Students can see this class even if they are not assigned to it. Each student can hide it from their own dashboard."
                    : "Enable public organization features in Settings before making classes visible to the organization."}
                </span>
              </span>
            </label>
            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <Label>Results visibility</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Students see only their own results unless class-wide results
                  are shown.
                </p>
              </div>
              <label className="flex items-start gap-3">
                <Switch
                  checked={classForm.resultsVisibleToStudents}
                  onCheckedChange={(checked) =>
                    setClassForm((value) => ({
                      ...value,
                      resultsVisibleToStudents: checked,
                    }))
                  }
                  aria-label="Show all student results to students"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    Show class results to students
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Students can view the same student list that admins and
                    teachers see on the Results page.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <Switch
                  checked={classForm.teacherCanToggleResultsVisibility}
                  onCheckedChange={(checked) =>
                    setClassForm((value) => ({
                      ...value,
                      teacherCanToggleResultsVisibility: checked,
                    }))
                  }
                  aria-label="Allow teachers to change results visibility"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    Allow teachers to change this setting
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Disabled by default for new classes. Admins can always
                    change results visibility.
                  </span>
                </span>
              </label>
            </div>
            {classFeatureRows.length > 0 ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <Label>Class features</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Features disabled by the organization cannot be enabled for
                    this class.
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {classFeatureRows.map((feature) => (
                    <ClassFeatureSettingRow
                      key={feature.key}
                      feature={feature}
                      onToggle={(featureKey, enabled) =>
                        setClassFeatureValues((values) => ({
                          ...values,
                          [featureKey]: enabled,
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {classExtensionRows.length > 0 ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <Label>Custom extensions</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These organization extensions appear under Extensions in the
                    class sidebar.
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {classExtensionRows.map((extension) => (
                    <ClassExtensionSettingRow
                      key={extension.id}
                      extension={extension}
                      onToggle={(extensionId, enabled) =>
                        setClassExtensionValues((values) => ({
                          ...values,
                          [extensionId]: enabled,
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsClassDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Saving...
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

      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign class member</DialogTitle>
            <DialogDescription>
              Add an existing organization member to this class. Register new
              users separately so their invite and previous terms are captured.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitInvite}>
            <div className="space-y-2">
              <Label>Existing organization member</Label>
              <Select
                value={selectedMemberId}
                onValueChange={setSelectedMemberId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  {organizationMembers.map((member) => {
                    const name = member.profile?.display_name ?? "User"
                    const email = member.profile?.email ?? "No email"

                    return (
                      <SelectItem key={member.id} value={member.id}>
                        {name} ({email})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Class role</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) =>
                  setInviteRole(value as "student" | "teacher")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteClass ? (
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-muted-foreground">
                  New user for this class?
                </p>
                <Button asChild variant="link" className="h-auto p-0">
                  <Link
                    href={`/register?classId=${encodeURIComponent(inviteClass.id)}&role=${encodeURIComponent(inviteRole)}&returnTab=classes`}
                  >
                    Register a new member
                  </Link>
                </Button>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !selectedMemberId}>
                {isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  "Assign member"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingEndAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingEndAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 text-destructive">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <AlertDialogTitle>
                {pendingEndAction?.title ?? "End classes?"}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-2">
              <span className="block">{pendingEndAction?.description}</span>
              <span className="block font-medium text-foreground">
                {pendingEndAction?.detail}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault()
                executePendingEndAction()
              }}
            >
              {isPending ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Ending...
                </>
              ) : (
                "End"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function getTermValue(classes: OrganizationClass[]) {
  return classes
    .find((classItem) => classItem.semester?.trim())
    ?.semester?.trim()
}

function getStageValue(classes: OrganizationClass[]) {
  return classes.find((classItem) => classItem.stage?.trim())?.stage?.trim()
}

type ClassFeatureRow = FeatureDefinition & {
  checked: boolean
  orgEnabled: boolean
  parentClassEnabled: boolean
  children: ClassFeatureRow[]
}

function ClassFeatureSettingRow({
  feature,
  onToggle,
}: {
  feature: ClassFeatureRow
  onToggle: (featureKey: string, enabled: boolean) => void
}) {
  const isLocked = !feature.orgEnabled

  return (
    <div>
      <div className="flex items-start gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {feature.label}
            </p>
            {isLocked ? (
              <Badge variant="outline" className="text-[10px]">
                Disabled by organization
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {feature.description || "No description provided."}
          </p>
        </div>
        <Switch
          checked={feature.checked}
          disabled={isLocked}
          aria-label={`Toggle ${feature.label}`}
          onCheckedChange={(checked) => onToggle(feature.key, checked)}
        />
      </div>
      {feature.children.length > 0 ? (
        <div className="ml-4 border-l border-border pl-4">
          {feature.children.map((child) => (
            <ClassFeatureSettingRow
              key={child.key}
              feature={child}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

type ClassExtensionRow = OrganizationExtension & {
  checked: boolean
}

function ClassExtensionSettingRow({
  extension,
  onToggle,
}: {
  extension: ClassExtensionRow
  onToggle: (extensionId: string, enabled: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{extension.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {extension.description ||
            extension.launch_url ||
            "No description provided."}
        </p>
      </div>
      <Switch
        checked={extension.checked}
        aria-label={`Toggle ${extension.name}`}
        onCheckedChange={(checked) => onToggle(extension.id, checked)}
      />
    </div>
  )
}

async function saveClassFeatureSettings(
  classId: string,
  organizationId: string,
  featureRows: ClassFeatureRow[],
) {
  const rows = flattenClassFeatureRows(featureRows)
    .filter((feature) => feature.orgEnabled)
    .map((feature) => ({
      organization_id: organizationId,
      class_id: classId,
      feature_key: feature.key,
      enabled: feature.checked,
      config: {},
    }))

  if (rows.length === 0) return null

  const { error } = await createClient()
    .from("class_feature_settings")
    .upsert(rows, { onConflict: "class_id,feature_key" })

  return error?.message ?? null
}

async function saveClassOrganizationVisibility(
  classId: string,
  organizationVisible: boolean,
) {
  const { error } = await createClient().rpc(
    "set_class_organization_visibility",
    {
      target_class_id: classId,
      visible_to_organization: organizationVisible,
    },
  )

  return error?.message ?? null
}

async function saveClassResultsVisibility({
  classId,
  resultsVisibleToStudents,
  teacherCanToggleResultsVisibility,
}: {
  classId: string
  resultsVisibleToStudents: boolean
  teacherCanToggleResultsVisibility: boolean
}) {
  const { error } = await createClient().rpc("set_class_results_visibility", {
    target_class_id: classId,
    visible_to_students: resultsVisibleToStudents,
    teacher_can_toggle: teacherCanToggleResultsVisibility,
  })

  return error?.message ?? null
}

async function saveClassExtensionSettings(
  classId: string,
  organizationId: string,
  extensionRows: ClassExtensionRow[],
) {
  const rows = extensionRows.map((extension) => ({
    organization_id: organizationId,
    class_id: classId,
    extension_id: extension.id,
    enabled: extension.checked,
    config: {},
  }))

  if (rows.length === 0) return null

  const { error } = await createClient()
    .from("class_extension_settings")
    .upsert(rows, { onConflict: "class_id,extension_id" })

  return error?.message ?? null
}

function flattenClassFeatureRows(rows: ClassFeatureRow[]): ClassFeatureRow[] {
  return rows.flatMap((row) => [row, ...flattenClassFeatureRows(row.children)])
}

function getInitialClassFeatureValues(
  definitions: FeatureDefinition[],
  organizationSettings: FeatureSetting[],
  classSettings: FeatureSetting[],
) {
  const orgEnabledByKey = getOrganizationEffectiveMap(
    definitions,
    organizationSettings,
  )
  const classSettingsByKey = new Map(
    classSettings.map((setting) => [setting.feature_key, setting.enabled]),
  )
  const values: FeatureValueMap = {}

  for (const definition of definitions) {
    values[definition.key] =
      classSettingsByKey.get(definition.key) ??
      orgEnabledByKey.get(definition.key) ??
      definition.default_enabled
  }

  return values
}

function getInitialClassExtensionValues(
  extensions: OrganizationExtension[],
  classSettings: ClassExtensionSetting[],
) {
  const classSettingsById = new Map(
    classSettings.map((setting) => [setting.extension_id, setting.enabled]),
  )
  const values: ExtensionValueMap = {}

  for (const extension of extensions) {
    if (!extension.enabled) continue

    values[extension.id] = classSettingsById.get(extension.id) ?? true
  }

  return values
}

function buildClassExtensionRows(
  extensions: OrganizationExtension[],
  classExtensionValues: ExtensionValueMap,
) {
  return extensions
    .filter((extension) => extension.enabled)
    .map((extension) => ({
      ...extension,
      checked: classExtensionValues[extension.id] ?? true,
    }))
}

function buildClassFeatureRows(
  definitions: FeatureDefinition[],
  organizationSettings: FeatureSetting[],
  classFeatureValues: FeatureValueMap,
) {
  const orgEnabledByKey = getOrganizationEffectiveMap(
    definitions,
    organizationSettings,
  )
  const rowsByKey = new Map<string, ClassFeatureRow>()

  for (const definition of definitions) {
    const orgEnabled = orgEnabledByKey.get(definition.key) ?? false

    rowsByKey.set(definition.key, {
      ...definition,
      label: getFeatureDisplayLabel(definition),
      checked: orgEnabled
        ? (classFeatureValues[definition.key] ?? true)
        : false,
      orgEnabled,
      parentClassEnabled: true,
      children: [],
    })
  }

  const rows = Array.from(rowsByKey.values()).sort(
    (left, right) => left.sort_order - right.sort_order,
  )

  for (const row of rows) {
    if (!row.parent_key) continue

    rowsByKey.get(row.parent_key)?.children.push(row)
  }

  function applyParentClassState(
    row: ClassFeatureRow,
    parentClassEnabled: boolean,
  ) {
    row.parentClassEnabled = parentClassEnabled

    for (const child of row.children) {
      applyParentClassState(child, parentClassEnabled && row.checked)
    }
  }

  const topLevelRows = rows.filter((row) => !row.parent_key)

  for (const row of topLevelRows) {
    applyParentClassState(row, true)
  }

  return topLevelRows
}

function getOrganizationEffectiveMap(
  definitions: FeatureDefinition[],
  settings: FeatureSetting[],
) {
  const settingsByKey = new Map(
    settings.map((setting) => [setting.feature_key, setting.enabled]),
  )
  const definitionsByKey = new Map(
    definitions.map((definition) => [definition.key, definition]),
  )
  const enabledByKey = new Map<string, boolean>()

  function isEnabled(definition: FeatureDefinition): boolean {
    const existing = enabledByKey.get(definition.key)
    if (existing !== undefined) return existing

    const ownEnabled =
      settingsByKey.get(definition.key) ?? definition.default_enabled
    const parentEnabled = definition.parent_key
      ? isEnabled(definitionsByKey.get(definition.parent_key)!)
      : true
    const enabled = parentEnabled && ownEnabled
    enabledByKey.set(definition.key, enabled)
    return enabled
  }

  for (const definition of definitions) {
    isEnabled(definition)
  }

  return enabledByKey
}
