"use client"

import { format } from "date-fns"
import {
  CircleAlert,
  Calendar,
  DoorOpen,
  Edit3,
  LoaderCircle,
  PlusCircle,
  Radio,
  Trash2,
  Users,
  Video,
} from "lucide-react"
import Link from "next/link"
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react"
import { ClassPageHeader } from "@/components/shared/class-page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Progress } from "@/components/ui/progress"
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
  getAssignmentDerivedStatus,
  useClassAssignments,
} from "@/features/assignments/use-class-assignments"
import { useClassExam } from "@/features/exam/use-class-exam"
import { useClassMaterials } from "@/features/materials/use-class-materials"
import { hasClassAccessForRole } from "@/lib/education/classes"
import {
  getClassNavFeatures,
  type ResolvedClassFeature,
  resolveClassFeatures,
} from "@/lib/features/feature-registry"
import type { User } from "@/lib/mock-data"
import { useApp } from "@/lib/store"
import type { ClassProfile, OrganizationClass } from "@/lib/supabase/classes"
import { createClient } from "@/lib/supabase/client"
import type { OrganizationSettingsPayload } from "@/lib/supabase/organization-settings"
import { cn } from "@/lib/utils"
import { CLASS_HEADER_GRADIENT_MAP } from "@/lib/view-config"
import { toast } from "@/hooks/use-toast"

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

type ClassHomeNavFeature = ResolvedClassFeature & {
  routeSegment: string
}

type CourseProgressExam = {
  status: "upcoming" | "live" | "ended"
  startAt?: string | null
  endAt?: string | null
  title?: string
}

type UpcomingClassDeadline = {
  label: string
  title: string
  at: string
}

type ClassFormState = {
  name: string
  code: string
  color: string
  description: string
  room: string
  semester: string
}

const CLASS_COLOR_OPTIONS = [
  "indigo",
  "emerald",
  "violet",
  "amber",
  "rose",
  "sky",
]

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

function getCourseProgress({
  assignments,
  exams,
  materialsCount,
  canManage,
}: {
  assignments: ClassAssignment[]
  exams: CourseProgressExam[]
  materialsCount: number
  canManage: boolean
}) {
  const visibleAssignments = assignments.filter(
    (assignment) => canManage || assignment.status === "published",
  )
  const assignmentsCount = visibleAssignments.length
  const completedCount = canManage
    ? visibleAssignments.reduce(
        (total, assignment) =>
          total +
          assignment.submissions.filter((submission) => submission.gradedAt)
            .length,
        0,
      )
    : visibleAssignments.filter((assignment) =>
        ["submitted", "graded"].includes(
          getAssignmentDerivedStatus(assignment),
        ),
      ).length
  const assignmentsTotal = canManage
    ? visibleAssignments.reduce(
        (total, assignment) => total + assignment.submissions.length,
        0,
      )
    : assignmentsCount
  const examCount = exams.length
  const completedExamCount = exams.filter(
    (exam) => exam.status === "ended",
  ).length
  const weightedCompleted = completedCount + completedExamCount
  const weightedTotal = assignmentsTotal + examCount
  const percent =
    weightedTotal > 0
      ? Math.round((weightedCompleted / weightedTotal) * 100)
      : 0
  const description = canManage
    ? "Progress combines graded assignment submissions and ended exams."
    : "Progress combines completed assignments and ended exams."

  return {
    materialsCount,
    assignmentsCount,
    assignmentsTotal,
    completedCount,
    examCount,
    completedExamCount,
    percent,
    description,
  }
}

function getUpcomingClassDeadline({
  assignments,
  exams,
  canManage,
}: {
  assignments: ClassAssignment[]
  exams: CourseProgressExam[]
  canManage: boolean
}): UpcomingClassDeadline | null {
  const now = Date.now()
  const assignmentDeadlines = assignments.flatMap((assignment) => {
    if (!canManage && assignment.status !== "published") return []
    if (Date.parse(assignment.dueAt) <= now) return []

    return [
      {
        label: "Assignment due",
        title: assignment.title,
        at: assignment.dueAt,
      },
    ]
  })
  const examDeadlines = exams.flatMap((exam) => {
    const startAt =
      exam.startAt && Date.parse(exam.startAt) > now
        ? [
            {
              label: "Exam opens",
              title: exam.title ?? "Exam",
              at: exam.startAt,
            },
          ]
        : []
    const endAt =
      exam.endAt && Date.parse(exam.endAt) > now
        ? [
            {
              label: "Exam closes",
              title: exam.title ?? "Exam",
              at: exam.endAt,
            },
          ]
        : []

    return [...startAt, ...endAt]
  })

  return (
    [...assignmentDeadlines, ...examDeadlines].sort(
      (left, right) => Date.parse(left.at) - Date.parse(right.at),
    )[0] ?? null
  )
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

export function ClassHomeScreen({ classId }: { classId: string }) {
  const {
    activeOrganization,
    activeOrganizationRole,
    classLiveSessions,
    currentUser,
    featureDefinitions,
    organizationClasses,
    organizationClassesStatus,
    organizationClassesError,
    organizationMembers,
    refreshOrganizationClasses,
    refreshOrganizationUsers,
  } = useApp()
  const cachedClass = organizationClasses.find(
    (classItem) => classItem.id === classId,
  )
  const accessibleCachedClass =
    cachedClass &&
    activeOrganization &&
    canOpenClass(
      cachedClass,
      activeOrganization.id,
      currentUser,
      activeOrganization.settings.public_features_enabled,
    )
      ? cachedClass
      : null
  const [classItem, setClassItem] = useState<OrganizationClass | null>(
    accessibleCachedClass,
  )
  const [classForm, setClassForm] = useState<ClassFormState>({
    name: "",
    code: "",
    color: "indigo",
    description: "",
    room: "Online",
    semester: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isClassSettingsDialogOpen, setIsClassSettingsDialogOpen] =
    useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [inviteRole, setInviteRole] = useState<"student" | "teacher">("student")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const currentClassMemberships = classItem?.memberships.filter(
    (membership) => membership.user_id === currentUser.id,
  )
  const isViewingAsStudent =
    activeOrganizationRole === "student" ||
    (!activeOrganizationRole && currentUser.role === "student")
  const hasClassManagerMembership = currentClassMemberships?.some(
    (membership) => membership.role === "teacher" || membership.role === "ta",
  )
  const canManageClass = Boolean(
    !isViewingAsStudent &&
      (activeOrganizationRole === "org_admin" ||
        activeOrganizationRole === "teacher" ||
        classItem?.teacher_user_id === currentUser.id ||
        hasClassManagerMembership),
  )
  const canManageRoster =
    activeOrganizationRole === "org_admin" || currentUser.role === "admin"
  const canEditClassDetails = Boolean(
    classItem &&
      !isViewingAsStudent &&
      (canManageRoster ||
        (canCurrentTeacherManageOwnClasses(
          activeOrganization?.settings,
          currentUser.id,
        ) &&
          (classItem.teacher_user_id === currentUser.id ||
            hasClassManagerMembership))),
  )
  const assignmentsApi = useClassAssignments({
    classId,
    currentUserId: currentUser.id,
    canManage: canManageClass,
  })
  const examApi = useClassExam(classId)
  const materialsApi = useClassMaterials({
    classId,
    uploaderUserId: currentUser.id,
  })
  const visibleExams =
    examApi.data?.canManage === true
      ? examApi.data.manager.exams
      : (examApi.data?.student.visibleExams ?? [])
  const courseProgress = getCourseProgress({
    assignments: assignmentsApi.assignments,
    exams: visibleExams,
    materialsCount: materialsApi.materials.length,
    canManage: canManageClass,
  })
  const upcomingDeadline = getUpcomingClassDeadline({
    assignments: assignmentsApi.assignments,
    exams: visibleExams,
    canManage: canManageClass,
  })
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
  const eligibleOrganizationMembers = useMemo(
    () =>
      organizationMembers.filter((member) =>
        getActiveOrganizationRoles(member).includes(inviteRole),
      ),
    [inviteRole, organizationMembers],
  )
  const sessionsFeature = classHomeNavFeatures.find(
    (feature) => feature.key === "sessions",
  )
  const SessionIcon = sessionsFeature?.icon ?? Video
  const sessionRouteSegment = sessionsFeature?.routeSegment ?? "session"
  const liveSession = classLiveSessions.find(
    (session) => session.class_id === classItem?.id,
  )
  const isLive = Boolean(liveSession)
  const resourceErrorMessage =
    assignmentsApi.errorMessage ?? materialsApi.errorMessage

  useEffect(() => {
    if (classItem || isLoading || organizationClassesStatus === "loading")
      return

    toast({
      title: "Class not found",
      description:
        errorMessage ?? "This class does not exist or you cannot view it.",
      variant: "destructive",
    })
  }, [classItem, errorMessage, isLoading, organizationClassesStatus])

  useEffect(() => {
    if (!classItem || !errorMessage) return

    toast({
      title: "Class action failed",
      description: errorMessage,
      variant: "destructive",
    })
  }, [classItem, errorMessage])

  useEffect(() => {
    if (!resourceErrorMessage) return

    toast({
      title: "Could not load class resources",
      description: resourceErrorMessage,
      variant: "destructive",
    })
  }, [resourceErrorMessage])

  useEffect(() => {
    if (!canManageRoster) return

    void refreshOrganizationUsers().catch(() => {})
  }, [canManageRoster, refreshOrganizationUsers])

  async function refreshClass(force = true) {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const classes = await refreshOrganizationClasses({ force })
      const nextClass = classes.find((classItem) => classItem.id === classId)
      if (!nextClass) {
        setClassItem(null)
        setErrorMessage("This class does not exist or you cannot view it.")
        return
      }

      if (
        !activeOrganization ||
        !canOpenClass(
          nextClass,
          activeOrganization.id,
          currentUser,
          activeOrganization.settings.public_features_enabled,
        )
      ) {
        setClassItem(null)
        setErrorMessage("This class is not available for your selected role.")
        return
      }

      setClassItem(nextClass)
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
      if (
        !activeOrganization ||
        !canOpenClass(
          cachedClass,
          activeOrganization.id,
          currentUser,
          activeOrganization.settings.public_features_enabled,
        )
      ) {
        setClassItem(null)
        setIsLoading(false)
        setErrorMessage("This class is not available for your selected role.")
        return
      }

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
    activeOrganization,
    currentUser,
    organizationClasses,
    organizationClassesError,
    organizationClassesStatus,
  ])

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!classItem || !canManageRoster) return
    const selectedMember = organizationMembers.find(
      (member) => member.id === selectedMemberId,
    )
    const selectedEmail = selectedMember?.profile?.email
    if (!selectedEmail) return

    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc("invite_class_member", {
        target_class_id: classItem.id,
        invited_email: selectedEmail,
        invited_class_role: inviteRole,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setIsDialogOpen(false)
      await refreshClass()

      if (data?.result === "membership") {
        setSuccessMessage(`${selectedEmail} added to this class.`)
        setSelectedMemberId("")
        setInviteRole("student")
        return
      }

      setSuccessMessage(`${selectedEmail} added to this class.`)
      setSelectedMemberId("")
      setInviteRole("student")
    })
  }

  function openClassSettingsDialog() {
    if (!classItem || !canEditClassDetails) return

    setClassForm({
      name: classItem.name,
      code: classItem.code,
      color: classItem.color ?? "indigo",
      description: classItem.description,
      room: classItem.room ?? "Online",
      semester: classItem.semester ?? "",
    })
    setIsClassSettingsDialogOpen(true)
  }

  function submitClassSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!classItem || !canEditClassDetails) return

    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const { error } = await createClient().rpc("update_class", {
        target_class_id: classItem.id,
        class_name: classForm.name,
        class_code: classForm.code,
        teacher_email: canManageRoster
          ? (classItem.teacher?.email ?? "")
          : currentUser.email,
        class_color: classForm.color,
        class_description: classForm.description,
        class_room: classForm.room,
        class_semester: classForm.semester,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setIsClassSettingsDialogOpen(false)
      await refreshClass()
      setSuccessMessage("Class details updated.")
    })
  }

  function removeStudent(student: ClassProfile) {
    if (!classItem || !canManageRoster) return

    const confirmed = window.confirm(`Remove ${student.display_name}?`)
    if (!confirmed) return

    setErrorMessage(null)
    setSuccessMessage(null)

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

  function removeTeacher(teacher: ClassProfile) {
    if (!classItem || !canManageRoster) return

    const confirmed = window.confirm(`Remove ${teacher.display_name}?`)
    if (!confirmed) return

    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const { error } = await createClient().rpc("remove_class_teacher", {
        target_class_id: classItem.id,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      await refreshClass()
      setSuccessMessage("Teacher removed from class.")
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
        <p className="text-sm text-muted-foreground">
          {errorMessage ?? "This class does not exist or you cannot view it."}
        </p>
      </div>
    )
  }

  const sessionActionLabel = isLive
    ? "Session in progress"
    : canManageClass
      ? "Start Session"
      : "Join Session"

  return (
    <>
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        {successMessage ? (
          <Alert>
            <AlertTitle>Updated</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
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
            <div className="min-w-0">
              <ClassPageHeader
                title={classItem.name}
                code={classItem.code}
                section="Home"
                inverse
                detail={
                  <p className="max-w-xl text-sm leading-relaxed text-white/80">
                    {classItem.description || "No description yet."}
                  </p>
                }
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canEditClassDetails ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 shrink-0 bg-white/20 hover:bg-white/30 text-white border-0"
                  onClick={openClassSettingsDialog}
                >
                  <Edit3 className="w-4 h-4" />
                  Edit class
                </Button>
              ) : null}
              {canManageRoster ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 shrink-0 bg-white/20 hover:bg-white/30 text-white border-0"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <PlusCircle className="w-4 h-4" />
                  Add member
                </Button>
              ) : null}
              {canManageClass || isLive ? (
                <Link href={`/classes/${classItem.id}/${sessionRouteSegment}`}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-44 justify-center gap-2 shrink-0 border-0 bg-white/20 hover:bg-white/30 text-white"
                  >
                    {isLive ? (
                      <Radio className="w-4 h-4 text-emerald-300" />
                    ) : (
                      <SessionIcon className="w-4 h-4" />
                    )}
                    {sessionActionLabel}
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-white/20">
            <Badge
              variant="outline"
              className="gap-1.5 border-white/40 bg-transparent text-white hover:bg-transparent"
            >
              <Users className="w-3.5 h-3.5 opacity-70" />
              {classItem.students.length} students
            </Badge>
            {canManageRoster && !classItem.teacher ? (
              <Badge
                variant="outline"
                className="gap-1.5 border-red-200 bg-red-50 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                <CircleAlert className="h-3.5 w-3.5" />
                No teacher assigned
              </Badge>
            ) : null}
            {classItem.semester ? (
              <Badge
                variant="outline"
                className="border-white/40 bg-transparent text-white hover:bg-transparent"
              >
                {classItem.semester}
              </Badge>
            ) : null}
            {classItem.room ? (
              <Badge
                variant="outline"
                className="gap-1.5 border-white/40 bg-transparent text-white hover:bg-transparent"
              >
                <DoorOpen className="w-3.5 h-3.5 opacity-70" />
                {classItem.room}
              </Badge>
            ) : null}
            {upcomingDeadline ? (
              <Badge
                variant="outline"
                className="gap-1.5 border-white/40 bg-transparent text-white hover:bg-transparent"
              >
                <Calendar className="h-3.5 w-3.5" />
                {upcomingDeadline.label}: {upcomingDeadline.title} ·{" "}
                {format(new Date(upcomingDeadline.at), "MMM d, h:mm a")}
              </Badge>
            ) : null}
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
                    <p className="text-base font-bold text-foreground">
                      {materialsApi.isLoading
                        ? "..."
                        : courseProgress.materialsCount}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Materials
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-base font-bold text-foreground">
                      {assignmentsApi.isLoading
                        ? "..."
                        : `${courseProgress.completedCount}/${courseProgress.assignmentsTotal}`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Assignments
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-base font-bold text-foreground">
                      {examApi.isLoading
                        ? "..."
                        : `${courseProgress.completedExamCount}/${courseProgress.examCount}`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Exams</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={courseProgress.percent} className="h-1.5" />
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {assignmentsApi.isLoading || examApi.isLoading
                      ? "..."
                      : `${courseProgress.percent}%`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {courseProgress.description}
                </p>
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {classItem.teacher.display_name}
                      </p>
                      {canManageRoster ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeTeacher(classItem.teacher!)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
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
                  {canManageRoster ? (
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
                    {canManageRoster ? (
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

      {canManageRoster ? (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add class member</DialogTitle>
              <DialogDescription>
                Add an existing organization member to this class, or register a
                new member with previous terms.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submitInvite}>
              <div className="space-y-2">
                <Label>Class role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) => {
                    setInviteRole(value as "student" | "teacher")
                    setSelectedMemberId("")
                  }}
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
              <div className="space-y-2">
                <Label>Existing organization member</Label>
                <Select
                  value={selectedMemberId}
                  onValueChange={setSelectedMemberId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={`Select a ${inviteRole}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleOrganizationMembers.map((member) => {
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
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-muted-foreground">
                  New user for this class?
                </p>
                <Button asChild variant="link" className="h-auto p-0">
                  <Link
                    href={`/register?classId=${encodeURIComponent(classItem.id)}&role=${encodeURIComponent(inviteRole)}&returnTab=classes`}
                  >
                    Register a new member
                  </Link>
                </Button>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending || !selectedMemberId}>
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
      ) : null}

      {canEditClassDetails ? (
        <Dialog
          open={isClassSettingsDialogOpen}
          onOpenChange={setIsClassSettingsDialogOpen}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit class</DialogTitle>
              <DialogDescription>
                Update class details for this workspace.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submitClassSettings}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="home-class-name">Name</Label>
                  <Input
                    id="home-class-name"
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
                  <Label htmlFor="home-class-code">Code</Label>
                  <Input
                    id="home-class-code"
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
                      {CLASS_COLOR_OPTIONS.map((color) => (
                        <SelectItem key={color} value={color}>
                          {color}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="home-class-room">Room</Label>
                  <Input
                    id="home-class-room"
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
                  <Label htmlFor="home-class-semester">Term</Label>
                  <Input
                    id="home-class-semester"
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
                <Label htmlFor="home-class-description">Description</Label>
                <Textarea
                  id="home-class-description"
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
                  onClick={() => setIsClassSettingsDialogOpen(false)}
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
      ) : null}
    </>
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

function canOpenClass(
  classItem: OrganizationClass,
  activeOrganizationId: string,
  currentUser: User,
  publicOrganizationFeaturesEnabled: boolean,
) {
  return (
    classItem.organization_id === activeOrganizationId &&
    hasClassAccessForRole(classItem, currentUser, {
      publicOrganizationFeaturesEnabled,
    })
  )
}
