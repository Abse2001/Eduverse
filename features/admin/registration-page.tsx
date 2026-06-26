"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import {
  Archive,
  ArrowLeft,
  LoaderCircle,
  PlusCircle,
  Trash2,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  groupArchivedClassesByTerm,
  useArchivedClasses,
} from "@/features/classes/use-archived-classes"
import { useToast } from "@/hooks/use-toast"
import { type OrganizationUserRole, useApp } from "@/lib/store"

type RegistrationResponse = {
  result?: "membership" | "invite"
  inviteUrl?: string
  emailStatus?: "sent" | "not_configured" | "not_required" | "failed"
  emailError?: string | null
  previousTermsCount?: number
  error?: string
}

type RegistrationDetailsResponse = {
  previousTerms?: Array<{
    sourceClassId: string | null
    term: string
    className: string
    grade: number | string | null
  }>
  error?: string
}

type PreviousTermForm = {
  id: string
  sourceClassId: string | null
  term: string
  className: string
  grade: string
}

type ExistingPreviousTerm = {
  sourceClassId: string
  term: string
  className: string
  grade: string
}

export function RegistrationPage() {
  const searchParams = useSearchParams()
  const {
    activeOrganization,
    organizationClasses,
    refreshOrganizationClasses,
    refreshOrganizationUsers,
  } = useApp()
  const initialClassId = searchParams.get("classId") ?? ""
  const initialRole = normalizeRole(searchParams.get("role"))
  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [role, setRole] = useState<OrganizationUserRole>(initialRole)
  const [classId, setClassId] = useState(initialClassId)
  const [existingPreviousTerms, setExistingPreviousTerms] = useState<
    ExistingPreviousTerm[]
  >([])
  const [previousTerms, setPreviousTerms] = useState<PreviousTermForm[]>([])
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const isEditMode = searchParams.get("mode") === "edit"
  const effectiveRole: OrganizationUserRole = isEditMode ? "student" : role
  const dashboardHref = getDashboardHref(searchParams.get("returnTab"))
  const loadedEditKeyRef = useRef<string | null>(null)
  const initialExistingGradeByClassIdRef = useRef<Map<string, string>>(
    new Map(),
  )
  const {
    archivedClasses,
    archivedClassesStatus,
    archivedClassesError,
    refreshArchivedClasses,
  } = useArchivedClasses()

  const selectedClass = useMemo(
    () => organizationClasses.find((classItem) => classItem.id === classId),
    [classId, organizationClasses],
  )
  const archivedTerms = useMemo(
    () => groupArchivedClassesByTerm(archivedClasses),
    [archivedClasses],
  )
  const existingPreviousTermClassIds = useMemo(
    () => new Set(existingPreviousTerms.map((term) => term.sourceClassId)),
    [existingPreviousTerms],
  )
  const addableArchivedTerms = useMemo(
    () =>
      archivedTerms
        .map((term) => ({
          ...term,
          classes: term.classes.filter(
            (classItem) => !existingPreviousTermClassIds.has(classItem.id),
          ),
        }))
        .filter((term) => term.classes.length > 0),
    [archivedTerms, existingPreviousTermClassIds],
  )

  async function loadRegistrationDetails(
    organizationId: string,
    normalizedEmail: string,
  ) {
    const response = await fetch(
      `/api/organizations/${encodeURIComponent(
        organizationId,
      )}/registrations?email=${encodeURIComponent(normalizedEmail)}`,
    )
    const payload = (await response
      .json()
      .catch(() => ({}))) as RegistrationDetailsResponse

    if (!response.ok) {
      toast({
        title: "Could not load previous terms",
        description:
          payload.error ?? "Existing previous terms could not be loaded.",
        variant: "destructive",
      })
      return false
    }

    const loadedExistingTerms = (payload.previousTerms ?? [])
      .filter((term) => typeof term.sourceClassId === "string")
      .map((term) => ({
        sourceClassId: term.sourceClassId as string,
        term: term.term,
        className: term.className,
        grade: String(term.grade ?? ""),
      }))

    initialExistingGradeByClassIdRef.current = new Map(
      loadedExistingTerms.map((term) => [term.sourceClassId, term.grade]),
    )
    setExistingPreviousTerms(loadedExistingTerms)
    setPreviousTerms((terms) =>
      terms.filter(
        (term) =>
          !term.sourceClassId ||
          !loadedExistingTerms.some(
            (existingTerm) => existingTerm.sourceClassId === term.sourceClassId,
          ),
      ),
    )
    return true
  }

  useEffect(() => {
    if (!activeOrganization || !isEditMode || !email.trim()) return

    const organizationId = activeOrganization.id
    const normalizedEmail = email.trim().toLowerCase()
    const editKey = `${organizationId}:${normalizedEmail}`
    if (loadedEditKeyRef.current === editKey) return

    loadedEditKeyRef.current = editKey
    void loadRegistrationDetails(organizationId, normalizedEmail)
  }, [activeOrganization, email, isEditMode])

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeOrganization) return

    setResultMessage(null)
    setInviteLink(null)
    const previousTermsPayload =
      effectiveRole === "student"
        ? [
            ...getChangedExistingPreviousTerms(
              existingPreviousTerms,
              initialExistingGradeByClassIdRef.current,
            ).map((term) => ({
              sourceClassId: term.sourceClassId,
              term: term.term,
              className: term.className,
              grade: term.grade,
            })),
            ...previousTerms.map((term) => ({
              sourceClassId: term.sourceClassId,
              term: term.term,
              className: term.className,
              grade: term.grade,
            })),
          ]
        : []

    startTransition(async () => {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(activeOrganization.id)}/registrations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: isEditMode ? "edit" : "register",
            email,
            role: effectiveRole,
            classId: classId || null,
            classRole: effectiveRole === "teacher" ? "teacher" : "student",
            previousTerms: previousTermsPayload,
          }),
        },
      )
      const payload = (await response
        .json()
        .catch(() => ({}))) as RegistrationResponse

      if (!response.ok) {
        toast({
          title: isEditMode ? "Update failed" : "Registration failed",
          description:
            payload.error ??
            (isEditMode
              ? "Could not update this user."
              : "Could not register this user."),
          variant: "destructive",
        })
        return
      }

      await Promise.all([
        refreshOrganizationUsers({ force: true }).catch(() => null),
        refreshOrganizationClasses({ force: true }).catch(() => null),
      ])

      if (isEditMode) {
        setPreviousTerms([])
        await loadRegistrationDetails(
          activeOrganization.id,
          email.trim().toLowerCase(),
        )
      }

      setInviteLink(payload.inviteUrl ?? null)
      setResultMessage(getResultMessage(payload, Boolean(classId), isEditMode))
    })
  }

  function togglePreviousClass(
    classItem: (typeof archivedClasses)[number],
    checked: boolean,
  ) {
    setPreviousTerms((terms) => {
      if (!checked) {
        return terms.filter((term) => term.sourceClassId !== classItem.id)
      }

      if (terms.some((term) => term.sourceClassId === classItem.id)) {
        return terms
      }

      return [
        ...terms,
        {
          id: crypto.randomUUID(),
          sourceClassId: classItem.id,
          term: classItem.semester?.trim() || "Unassigned Term",
          className: classItem.name,
          grade: "",
        },
      ]
    })
  }

  function updatePreviousTerm(id: string, updates: Partial<PreviousTermForm>) {
    setPreviousTerms((terms) =>
      terms.map((term) => (term.id === id ? { ...term, ...updates } : term)),
    )
  }

  function updateExistingPreviousTerm(
    sourceClassId: string,
    updates: Partial<ExistingPreviousTerm>,
  ) {
    setExistingPreviousTerms((terms) =>
      terms.map((term) =>
        term.sourceClassId === sourceClassId ? { ...term, ...updates } : term,
      ),
    )
  }

  function addCustomPreviousTerm() {
    setPreviousTerms((terms) => [
      {
        id: crypto.randomUUID(),
        sourceClassId: null,
        term: "",
        className: "",
        grade: "",
      },
      ...terms,
    ])
  }

  function removePreviousTerm(id: string) {
    setPreviousTerms((terms) => terms.filter((term) => term.id !== id))
  }

  function getPreviousTermForClass(classId: string) {
    return previousTerms.find((term) => term.sourceClassId === classId)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <Button asChild variant="ghost" size="sm" className="gap-1 px-0">
        <Link href={dashboardHref}>
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {isEditMode ? "Edit user" : "Register user"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEditMode
            ? "Update an existing organization member and attach archived or custom previous terms for student history."
            : "Invite a new organization member and attach existing archived terms when a student has prior history in this workspace."}
        </p>
      </div>

      {resultMessage ? (
        <Alert>
          <AlertTitle>
            {isEditMode ? "User updated" : "Registration updated"}
          </AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <p>{resultMessage}</p>
              {inviteLink ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={inviteLink} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(inviteLink)
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

      <form className="space-y-5" onSubmit={submitRegistration}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="registration-email">Email</Label>
              <Input
                id="registration-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                readOnly={isEditMode}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Organization role</Label>
              {isEditMode ? (
                <>
                  <Input readOnly value="Student" />
                  <p className="text-xs text-muted-foreground">
                    Use Add role from Users to change organization roles.
                  </p>
                </>
              ) : (
                <Select
                  value={role}
                  onValueChange={(value) =>
                    setRole(value as OrganizationUserRole)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                    {!classId ? (
                      <SelectItem value="org_admin">Admin</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Class to join</Label>
              <Select
                value={classId || "none"}
                onValueChange={(value) => {
                  const nextClassId = value === "none" ? "" : value
                  setClassId(nextClassId)
                  if (nextClassId && role === "org_admin") {
                    setRole("student")
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No class yet</SelectItem>
                  {organizationClasses.map((classItem) => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name} ({classItem.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedClass ? (
                <p className="text-xs text-muted-foreground">
                  {isEditMode
                    ? `This user will be added to ${selectedClass.name}.`
                    : `The invite will place this user in ${selectedClass.name} after acceptance.`}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Previous terms</CardTitle>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomPreviousTerm}
                disabled={effectiveRole !== "student"}
              >
                <PlusCircle className="h-4 w-4" />
                Custom term
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refreshArchivedClasses()}
                disabled={archivedClassesStatus === "loading"}
              >
                {archivedClassesStatus === "loading" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {effectiveRole !== "student" ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                Previous terms can be attached to students.
              </p>
            ) : null}
            {effectiveRole === "student" && archivedClassesError ? (
              <Alert variant="destructive">
                <AlertTitle>Could not load past terms</AlertTitle>
                <AlertDescription>{archivedClassesError}</AlertDescription>
              </Alert>
            ) : null}
            {effectiveRole === "student" &&
            archivedClassesStatus === "ready" &&
            archivedClasses.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                No archived terms are available yet.
              </p>
            ) : null}
            {effectiveRole === "student" && isEditMode ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Current previous terms
                </p>
                {existingPreviousTerms.length > 0 ? (
                  <div className="divide-y rounded-lg border">
                    {existingPreviousTerms.map((term) => (
                      <div
                        key={term.sourceClassId}
                        className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_10rem]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {term.className}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {term.term}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Grade</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={term.grade}
                            onChange={(event) =>
                              updateExistingPreviousTerm(term.sourceClassId, {
                                grade: event.target.value,
                              })
                            }
                            placeholder="0-100"
                            required
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                    No previous terms are attached to this student yet.
                  </p>
                )}
              </div>
            ) : null}
            {effectiveRole === "student" ? (
              <div className="pt-2">
                <p className="text-sm font-medium text-foreground">
                  Add previous terms
                </p>
              </div>
            ) : null}
            {effectiveRole === "student"
              ? previousTerms
                  .filter((term) => !term.sourceClassId)
                  .map((term) => (
                    <div
                      key={term.id}
                      className="space-y-3 rounded-lg border p-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Term</Label>
                          <Input
                            value={term.term}
                            onChange={(event) =>
                              updatePreviousTerm(term.id, {
                                term: event.target.value,
                              })
                            }
                            placeholder="Fall 2025"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Class</Label>
                          <Input
                            value={term.className}
                            onChange={(event) =>
                              updatePreviousTerm(term.id, {
                                className: event.target.value,
                              })
                            }
                            placeholder="Algebra II"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Grade</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={term.grade}
                            onChange={(event) =>
                              updatePreviousTerm(term.id, {
                                grade: event.target.value,
                              })
                            }
                            placeholder="0-100"
                            required
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removePreviousTerm(term.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))
              : null}
            {effectiveRole === "student"
              ? addableArchivedTerms.map((term) => (
                  <div key={term.label} className="rounded-lg border">
                    <div className="border-b bg-muted/40 px-4 py-3">
                      <p className="text-sm font-medium text-foreground">
                        {term.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {term.classes.length} archived{" "}
                        {term.classes.length === 1 ? "class" : "classes"}
                      </p>
                    </div>
                    <div className="divide-y">
                      {term.stages.map((stage) => (
                        <section key={`${term.label}-${stage.label}`}>
                          <div className="bg-muted/20 px-4 py-2">
                            <p className="truncate text-xs font-medium uppercase tracking-normal text-muted-foreground">
                              {stage.label}
                            </p>
                          </div>
                          <div className="divide-y">
                            {stage.classes.map((classItem) => {
                              const previousTerm = getPreviousTermForClass(
                                classItem.id,
                              )

                              return (
                                <div key={classItem.id} className="px-4 py-3">
                                  <label className="flex items-start gap-3">
                                    <Checkbox
                                      checked={Boolean(previousTerm)}
                                      onCheckedChange={(checked) =>
                                        togglePreviousClass(
                                          classItem,
                                          checked === true,
                                        )
                                      }
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium text-foreground">
                                        {classItem.name}
                                      </span>
                                      <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {classItem.code} &middot;{" "}
                                        {classItem.teacher?.display_name ??
                                          "No teacher"}
                                      </span>
                                    </span>
                                  </label>
                                  {previousTerm ? (
                                    <div className="mt-3 max-w-xs pl-7">
                                      <Label className="text-xs">Grade</Label>
                                      <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={previousTerm.grade}
                                        onChange={(event) =>
                                          updatePreviousTerm(previousTerm.id, {
                                            grade: event.target.value,
                                          })
                                        }
                                        placeholder="0-100"
                                        required
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                ))
              : null}
            {effectiveRole === "student" &&
            archivedClassesStatus === "ready" &&
            addableArchivedTerms.length === 0 &&
            previousTerms.filter((term) => !term.sourceClassId).length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                No additional archived classes are available to add.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              New archived classes and custom terms are saved as archived
              classes with imported grade records, so they use Past Terms
              history.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending || !activeOrganization}>
            {isPending ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {isEditMode ? "Saving..." : "Registering..."}
              </>
            ) : isEditMode ? (
              "Save changes"
            ) : (
              "Register"
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

function normalizeRole(value: string | null): OrganizationUserRole {
  if (value === "org_admin" || value === "teacher" || value === "student") {
    return value
  }

  return "student"
}

function getDashboardHref(returnTab: string | null) {
  if (!isDashboardTab(returnTab)) return "/dashboard"

  return `/dashboard?tab=${encodeURIComponent(returnTab)}`
}

function isDashboardTab(value: string | null) {
  return (
    value === "classes" ||
    value === "history" ||
    value === "users" ||
    value === "features" ||
    value === "public-link"
  )
}

function getChangedExistingPreviousTerms(
  terms: ExistingPreviousTerm[],
  initialGrades: Map<string, string>,
) {
  return terms.filter(
    (term) => term.grade !== (initialGrades.get(term.sourceClassId) ?? ""),
  )
}

function getResultMessage(
  payload: RegistrationResponse,
  hasClass: boolean,
  isEditMode: boolean,
) {
  const termMessage =
    payload.previousTermsCount && payload.previousTermsCount > 0
      ? ` ${payload.previousTermsCount} previous term ${payload.previousTermsCount === 1 ? "class" : "classes"} attached.`
      : ""

  if (payload.result === "membership") {
    return `${isEditMode ? "User updated" : "Member updated"}${hasClass ? " and added to the class" : ""}.${termMessage}`
  }

  if (payload.emailStatus === "sent") {
    return `${isEditMode ? "Confirmation invite email sent" : "Invite email sent"}.${termMessage}`
  }

  return `${isEditMode ? "Confirmation invite created" : "Invite created"}.${termMessage}`
}
