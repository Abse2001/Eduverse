"use client"

import { FormEvent, useEffect, useState, useTransition } from "react"
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
import {
  loadOrganizationClasses,
  type OrganizationClass,
} from "@/lib/supabase/classes"
import { createClient } from "@/lib/supabase/client"
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
  const { activeOrganization } = useApp()
  const [classes, setClasses] = useState<OrganizationClass[]>([])
  const [classForm, setClassForm] = useState<ClassFormState>(EMPTY_CLASS_FORM)
  const [editingClass, setEditingClass] = useState<OrganizationClass | null>(
    null,
  )
  const [inviteClass, setInviteClass] = useState<OrganizationClass | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"student" | "teacher">("student")
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function loadClasses() {
    if (!activeOrganization) return

    setIsLoading(true)
    setErrorMessage(null)

    try {
      setClasses(await loadOrganizationClasses(activeOrganization.id))
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load classes",
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadClasses()
  }, [activeOrganization?.id])

  function openCreateDialog() {
    setEditingClass(null)
    setClassForm(EMPTY_CLASS_FORM)
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

      const { error } = await supabase.rpc(rpcName, payload)

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setIsClassDialogOpen(false)
      setEditingClass(null)
      setClassForm(EMPTY_CLASS_FORM)
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
          {errorMessage ? (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertTitle>Class action failed</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
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
