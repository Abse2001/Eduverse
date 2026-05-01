"use client"

import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react"
import {
  BookOpen,
  Calendar,
  LoaderCircle,
  PlusCircle,
  Trash2,
  Users,
  Video,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import {
  type ClassProfile,
  type OrganizationClass,
} from "@/lib/supabase/classes"
import { createClient } from "@/lib/supabase/client"
import {
  getClassNavFeatures,
  resolveClassFeatures,
  type ResolvedClassFeature,
} from "@/lib/features/feature-registry"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { CLASS_HEADER_GRADIENT_MAP } from "@/lib/view-config"

function initials(profile: ClassProfile | null) {
  const name = profile?.display_name || profile?.email || "User"

  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  )
}

function inviteLinkFromToken(token: string) {
  if (typeof window === "undefined") return null

  return `${window.location.origin}/invite/${token}`
}

type ClassHomeNavFeature = ResolvedClassFeature & {
  routeSegment: string
}

function flattenClassHomeNavFeatures(
  features: ResolvedClassFeature[],
): ClassHomeNavFeature[] {
  return features.flatMap((feature) => {
    const childFeatures = flattenClassHomeNavFeatures(feature.children)

    if (feature.key !== "home" && feature.routeSegment) {
      return [feature as ClassHomeNavFeature, ...childFeatures]
    }

    return childFeatures
  })
}

function getClassHomeFeatureDescription(feature: ResolvedClassFeature) {
  return (
    feature.definition?.description ||
    feature.customExtension?.description ||
    "Open feature"
  )
}

export function ClassHomeScreen({ classId }: { classId: string }) {
  const {
    activeOrganization,
    currentUser,
    featureDefinitions,
    organizationClasses,
    organizationClassesStatus,
    organizationClassesError,
    refreshOrganizationClasses,
  } = useApp()
  const cachedClass = organizationClasses.find(
    (classItem) => classItem.id === classId,
  )
  const [classItem, setClassItem] = useState<OrganizationClass | null>(
    cachedClass ?? null,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"student" | "teacher">("student")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canManageClass =
    currentUser.role === "admin" ||
    classItem?.memberships.some(
      (membership) =>
        membership.user_id === currentUser.id &&
        (membership.role === "teacher" || membership.role === "ta"),
    )
  const classNavFeatures = useMemo(() => {
    if (!classItem || !activeOrganization) return []

    return getClassNavFeatures(
      resolveClassFeatures({
        definitions: featureDefinitions,
        organizationSettings: activeOrganization.featureSettings,
        classSettings: classItem.featureSettings,
        organizationExtensions: activeOrganization.extensions,
        classExtensionSettings: classItem.extensionSettings,
      }),
    )
  }, [activeOrganization, classItem, featureDefinitions])
  const classHomeNavFeatures = flattenClassHomeNavFeatures(classNavFeatures)
  const sessionsFeature = classHomeNavFeatures.find(
    (feature) => feature.key === "sessions",
  )
  const SessionIcon = sessionsFeature?.icon ?? Video

  async function refreshClass(force = true) {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const classes = await refreshOrganizationClasses({ force })
      const nextClass = classes.find((classItem) => classItem.id === classId)
      setClassItem(nextClass ?? null)
      if (!nextClass) {
        setErrorMessage("This class does not exist or you cannot view it.")
      }
    } catch (error) {
      setClassItem(null)
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load class",
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const cachedClass = organizationClasses.find(
      (classItem) => classItem.id === classId,
    )

    if (cachedClass) {
      setClassItem(cachedClass)
      setIsLoading(false)
      setErrorMessage(null)
      return
    }

    if (organizationClassesStatus === "loading") {
      setIsLoading(true)
      setErrorMessage(null)
      return
    }

    if (organizationClassesStatus === "error") {
      setClassItem(null)
      setIsLoading(false)
      setErrorMessage(
        organizationClassesError ?? "Could not load class information",
      )
      return
    }

    void refreshClass(false)
  }, [
    classId,
    organizationClasses,
    organizationClassesError,
    organizationClassesStatus,
  ])

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!classItem) return

    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)

    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc("invite_class_member", {
        target_class_id: classItem.id,
        invited_email: inviteEmail,
        invited_class_role: inviteRole,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setIsDialogOpen(false)
      await refreshClass()

      if (data?.result === "membership") {
        setSuccessMessage(`${inviteEmail} added to this class.`)
        setInviteEmail("")
        setInviteRole("student")
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
          ? "Class invite created. Send this link to the user."
          : "Class invite created.",
      )
      setInviteEmail("")
      setInviteRole("student")
    })
  }

  function removeStudent(student: ClassProfile) {
    if (!classItem) return

    const confirmed = window.confirm(`Remove ${student.display_name}?`)
    if (!confirmed) return

    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)

    startTransition(async () => {
      const { error } = await createClient().rpc("remove_class_student", {
        target_class_id: classItem.id,
        target_user_id: student.id,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      await refreshClass()
      setSuccessMessage("Student removed from class.")
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Loading class...
      </div>
    )
  }

  if (!classItem) {
    return (
      <div className="p-6">
        <Alert variant={errorMessage ? "destructive" : "default"}>
          <AlertTitle>Class not found</AlertTitle>
          <AlertDescription>
            {errorMessage ?? "This class does not exist or you cannot view it."}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Class action failed</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {successMessage ? (
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
        ) : null}

        <div
          className={cn(
            "rounded-2xl p-6 text-white bg-gradient-to-br",
            CLASS_HEADER_GRADIENT_MAP[classItem.color ?? "indigo"] ??
              "from-primary to-primary/70",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-white/70 text-sm font-medium">
                {classItem.code} &middot; {classItem.subject}
              </p>
              <h1 className="text-2xl font-bold mt-1 text-balance">
                {classItem.name}
              </h1>
              <p className="text-white/80 text-sm mt-2 leading-relaxed max-w-xl">
                {classItem.description || "No description yet."}
              </p>
            </div>
            {canManageClass ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 shrink-0 bg-white/20 hover:bg-white/30 text-white border-0"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <PlusCircle className="w-4 h-4" />
                  Add member
                </Button>
                {sessionsFeature?.routeSegment ? (
                  <Link
                    href={`/classes/${classItem.id}/${sessionsFeature.routeSegment}`}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-2 shrink-0 bg-white/20 hover:bg-white/30 text-white border-0"
                    >
                      <SessionIcon className="w-4 h-4" />
                      Start Session
                    </Button>
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-6 mt-4 pt-4 border-t border-white/20">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 opacity-70" />
              <span className="text-sm">
                {classItem.schedule_text ?? "No schedule"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 opacity-70" />
              <span className="text-sm">
                {classItem.students.length} students
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 opacity-70" />
              <span className="text-sm">{classItem.room ?? "No room"}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {classHomeNavFeatures.map((section) => (
            <Link
              key={section.key}
              href={`/classes/${classItem.id}/${section.routeSegment}`}
            >
              <Card className="hover:shadow-md hover:border-primary/40 transition-all cursor-pointer group h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <section.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {section.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {getClassHomeFeatureDescription(section)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Course Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-base font-bold text-foreground">0</p>
                    <p className="text-[11px] text-muted-foreground">
                      Materials
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-base font-bold text-foreground">0</p>
                    <p className="text-[11px] text-muted-foreground">
                      Assignments
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-base font-bold text-foreground">0</p>
                    <p className="text-[11px] text-muted-foreground">
                      Completed
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {classItem.teacher ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Instructor
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="font-semibold bg-primary/10 text-primary">
                      {initials(classItem.teacher)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {classItem.teacher.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {classItem.teacher.email}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">
                    Students ({classItem.students.length})
                  </CardTitle>
                  {canManageClass ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setIsDialogOpen(true)}
                    >
                      Add
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {classItem.students.map((student) => (
                  <div key={student.id} className="flex items-center gap-2">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                        {initials(student)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground truncate flex-1">
                      {student.display_name}
                    </span>
                    {canManageClass ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeStudent(student)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ))}
                {classItem.students.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No students yet.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add class member</DialogTitle>
            <DialogDescription>
              Add an existing user immediately, or create an invite link if they
              have not signed up yet.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitInvite}>
            <div className="space-y-2">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
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
                  {currentUser.role === "admin" ? (
                    <SelectItem value="teacher">Teacher</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
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
