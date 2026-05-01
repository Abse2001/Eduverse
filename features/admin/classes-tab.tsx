"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import {
  Edit3,
  LoaderCircle,
  PlusCircle,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Switch } from "@/components/ui/switch"
import { type OrganizationClass } from "@/lib/supabase/classes"
import { createClient } from "@/lib/supabase/client"
import type { FeatureDefinition, FeatureSetting } from "@/lib/supabase/features"
import type {
  ClassExtensionSetting,
  OrganizationExtension,
} from "@/lib/supabase/features"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

type ClassFormState = {
  name: string
  code: string
  subject: string
  teacherEmail: string
  color: string
  description: string
  scheduleText: string
  room: string
  semester: string
}

type FeatureValueMap = Record<string, boolean>
type ExtensionValueMap = Record<string, boolean>

const EMPTY_CLASS_FORM: ClassFormState = {
  name: "",
  code: "",
  subject: "",
  teacherEmail: "",
  color: "indigo",
  description: "",
  scheduleText: "",
  room: "",
  semester: "Spring 2026",
}

function inviteLinkFromToken(token: string) {
  if (typeof window === "undefined") return null

  return `${window.location.origin}/invite/${token}`
}

export function ClassesTab() {
  const {
    activeOrganization,
    featureDefinitions,
    organizationClasses: classes,
    organizationClassesStatus,
    organizationClassesError,
    refreshOrganizationClasses,
  } = useApp()
  const [classForm, setClassForm] = useState<ClassFormState>(EMPTY_CLASS_FORM)
  const [classFeatureValues, setClassFeatureValues] =
    useState<FeatureValueMap>({})
  const [classExtensionValues, setClassExtensionValues] =
    useState<ExtensionValueMap>({})
  const [editingClass, setEditingClass] = useState<OrganizationClass | null>(
    null,
  )
  const [inviteClass, setInviteClass] = useState<OrganizationClass | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"student" | "teacher">("student")
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isLoading = organizationClassesStatus === "loading"
  const displayedErrorMessage = errorMessage ?? organizationClassesError
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

  async function loadClasses() {
    if (!activeOrganization) return

    setErrorMessage(null)

    try {
      await refreshOrganizationClasses({ force: true })
    } catch (error) {
      setErrorMessage(
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
    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)
    setIsClassDialogOpen(true)
  }

  function openEditDialog(classItem: OrganizationClass) {
    setEditingClass(classItem)
    setClassForm({
      name: classItem.name,
      code: classItem.code,
      subject: classItem.subject,
      teacherEmail: classItem.teacher?.email ?? "",
      color: classItem.color ?? "indigo",
      description: classItem.description,
      scheduleText: classItem.schedule_text ?? "",
      room: classItem.room ?? "",
      semester: classItem.semester ?? "",
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
    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)
    setIsClassDialogOpen(true)
  }

  function openInviteDialog(classItem: OrganizationClass) {
    setInviteClass(classItem)
    setInviteEmail("")
    setInviteRole("student")
    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)
    setIsInviteDialogOpen(true)
  }

  function submitClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeOrganization) return

    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)

    startTransition(async () => {
      const supabase = createClient()
      const rpcName = editingClass ? "update_class" : "create_class"
      const payload = editingClass
        ? {
            target_class_id: editingClass.id,
            class_name: classForm.name,
            class_code: classForm.code,
            class_subject: classForm.subject,
            teacher_email: classForm.teacherEmail,
            class_color: classForm.color,
            class_description: classForm.description,
            class_schedule_text: classForm.scheduleText,
            class_room: classForm.room,
            class_semester: classForm.semester,
          }
        : {
            target_org_id: activeOrganization.id,
            class_name: classForm.name,
            class_code: classForm.code,
            class_subject: classForm.subject,
            teacher_email: classForm.teacherEmail,
            class_color: classForm.color,
            class_description: classForm.description,
            class_schedule_text: classForm.scheduleText,
            class_room: classForm.room,
            class_semester: classForm.semester,
          }

      const { data, error } = await supabase.rpc(rpcName, payload)

      if (error) {
        setErrorMessage(error.message)
        return
      }

      const savedClassId =
        editingClass?.id ??
        ((data as { class_id?: string } | null | undefined)?.class_id ?? null)

      if (savedClassId) {
        const featureError = await saveClassFeatureSettings(
          savedClassId,
          activeOrganization.id,
          classFeatureRows,
        )

        if (featureError) {
          setErrorMessage(featureError)
          return
        }

        const extensionError = await saveClassExtensionSettings(
          savedClassId,
          activeOrganization.id,
          classExtensionRows,
        )

        if (extensionError) {
          setErrorMessage(extensionError)
          return
        }
      }

      setIsClassDialogOpen(false)
      setEditingClass(null)
      setClassForm(EMPTY_CLASS_FORM)
      setClassFeatureValues({})
      setClassExtensionValues({})
      await loadClasses()
      setSuccessMessage(editingClass ? "Class updated." : "Class created.")
    })
  }

  function deleteClass(classItem: OrganizationClass) {
    const confirmed = window.confirm(
      `Delete ${classItem.name}? This removes the class and its memberships.`,
    )

    if (!confirmed) return

    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)

    startTransition(async () => {
      const { error } = await createClient().rpc("delete_class", {
        target_class_id: classItem.id,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      await loadClasses()
      setSuccessMessage("Class deleted.")
    })
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inviteClass) return

    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)

    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc("invite_class_member", {
        target_class_id: inviteClass.id,
        invited_email: inviteEmail,
        invited_class_role: inviteRole,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setIsInviteDialogOpen(false)
      setInviteClass(null)
      setInviteEmail("")
      await loadClasses()

      if (data?.result === "membership") {
        setSuccessMessage(`${inviteEmail} added to ${inviteClass.name}.`)
        return
      }

      const { data: inviteData } = await supabase
        .from("organization_invites")
        .select("token")
        .eq("id", data?.invite_id)
        .single()

      const link = inviteData?.token
        ? inviteLinkFromToken(inviteData.token)
        : null

      setLastInviteLink(link)
      setSuccessMessage(
        link
          ? `Invite created for ${inviteClass.name}. Send this link.`
          : `Invite created for ${inviteClass.name}.`,
      )
    })
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">All Classes</CardTitle>
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
        </CardHeader>
        <CardContent className="p-0">
          {displayedErrorMessage ? (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertTitle>Class action failed</AlertTitle>
                <AlertDescription>{displayedErrorMessage}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {successMessage ? (
            <div className="p-4">
              <Alert>
                <AlertTitle>Updated</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2">
                    <p>{successMessage}</p>
                    {lastInviteLink ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input readOnly value={lastInviteLink} />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            void navigator.clipboard.writeText(lastInviteLink)
                          }
                        >
                          Copy link
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading classes...
            </div>
          ) : (
            <div className="divide-y divide-border">
              {classes.map((classItem) => (
                <div
                  key={classItem.id}
                  className="flex flex-col gap-3 px-5 py-3 hover:bg-muted/50 transition-colors lg:flex-row lg:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0",
                        CLASS_COLOR_MAP[classItem.color ?? "indigo"] ??
                          "bg-primary",
                      )}
                    >
                      {classItem.code.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {classItem.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {classItem.code} &middot;{" "}
                        {classItem.teacher?.display_name ?? "No teacher"}
                      </p>
                    </div>
                    <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {classItem.students.length} students
                      </span>
                      {classItem.room ? <span>{classItem.room}</span> : null}
                    </div>
                    {classItem.semester ? (
                      <Badge variant="secondary" className="text-[10px] ml-2">
                        {classItem.semester}
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
                      Add member
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
                      onClick={() => deleteClass(classItem)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
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
              Assign an existing signed-up teacher by email. Students can be
              added after the class is created.
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
                <Label htmlFor="class-subject">Subject</Label>
                <Input
                  id="class-subject"
                  value={classForm.subject}
                  onChange={(event) =>
                    setClassForm((value) => ({
                      ...value,
                      subject: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher-email">Teacher email</Label>
                <Input
                  id="teacher-email"
                  type="email"
                  value={classForm.teacherEmail}
                  onChange={(event) =>
                    setClassForm((value) => ({
                      ...value,
                      teacherEmail: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
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
                <Label htmlFor="class-semester">Semester</Label>
                <Input
                  id="class-semester"
                  value={classForm.semester}
                  onChange={(event) =>
                    setClassForm((value) => ({
                      ...value,
                      semester: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="class-schedule">Schedule</Label>
              <Input
                id="class-schedule"
                value={classForm.scheduleText}
                onChange={(event) =>
                  setClassForm((value) => ({
                    ...value,
                    scheduleText: event.target.value,
                  }))
                }
              />
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
                    These organization extensions appear under Extensions in
                    the class sidebar.
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
            <DialogTitle>Add class member</DialogTitle>
            <DialogDescription>
              Add an existing user immediately, or generate an invite link if
              the email has not signed up yet.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitInvite}>
            <div className="space-y-2">
              <Label htmlFor="class-invite-email">Email</Label>
              <Input
                id="class-invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                required
              />
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add member"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
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
  const isBlockedByClassParent = !feature.parentClassEnabled

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
            {isBlockedByClassParent ? (
              <Badge variant="outline" className="text-[10px]">
                Blocked by class parent
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
          {extension.description || extension.launch_url || "No description provided."}
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
      checked: orgEnabled ? (classFeatureValues[definition.key] ?? true) : false,
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
