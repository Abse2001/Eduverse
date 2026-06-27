import { NextResponse } from "next/server"
import { sendOrganizationInviteEmail } from "@/lib/email/gmail"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { loadEnabledOrganizationFeatureSummaries } from "@/lib/features/organization-feature-summary"
import { createServerClient as createPrivilegedSupabaseClient } from "@/lib/supabase/server"

type RouteContext = {
  params: Promise<{ organizationId: string }>
}

type RegistrationRequestBody = {
  mode?: "register" | "edit"
  email?: string
  role?: "org_admin" | "teacher" | "student"
  classId?: string | null
  classRole?: "teacher" | "student"
  previousClassIds?: string[]
  previousTerms?: PreviousTermInput[]
}

type PreviousTermInput = {
  sourceClassId?: string | null
  term?: string
  className?: string
  grade?: number | string
}

type NormalizedPreviousTerm = {
  sourceClassId: string | null
  term: string
  className: string
  grade: number
}

type OrganizationRole = "org_admin" | "teacher" | "student"

const ROLE_LABELS = {
  org_admin: "an admin",
  teacher: "a teacher",
  student: "a student",
}

export async function GET(request: Request, context: RouteContext) {
  const { organizationId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const requestUrl = new URL(request.url)
  const email = requestUrl.searchParams.get("email")?.trim().toLowerCase()

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 })
  }

  const canManageOrg = await canManageOrganizationUsers(
    supabase,
    organizationId,
    user.id,
  )

  if (canManageOrg.error || !canManageOrg.allowed) {
    return NextResponse.json(
      { error: canManageOrg.error ?? "Only admins can manage users" },
      { status: 403 },
    )
  }

  const lookupClient = getPrivilegedSupabaseClient() ?? supabase
  const { data: profile, error: profileError } = await lookupClient
    .from("profiles")
    .select("id")
    .ilike("email", escapeIlikePattern(email))
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  if (!profile) {
    return NextResponse.json({ previousTerms: [] })
  }

  const { data: membership, error: membershipError } = await lookupClient
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle()

  if (membershipError) {
    return NextResponse.json(
      { error: membershipError.message },
      { status: 400 },
    )
  }

  if (!membership) {
    return NextResponse.json({ previousTerms: [] })
  }

  const { data: classMemberships, error: classMembershipError } =
    await lookupClient
      .from("class_memberships")
      .select("class_id")
      .eq("organization_id", organizationId)
      .eq("user_id", profile.id)
      .eq("role", "student")

  if (classMembershipError) {
    return NextResponse.json(
      { error: classMembershipError.message },
      { status: 400 },
    )
  }

  const memberClassIds = Array.from(
    new Set((classMemberships ?? []).map((row) => row.class_id)),
  )

  if (memberClassIds.length === 0) {
    return NextResponse.json({ previousTerms: [] })
  }

  const { data: classes, error: classesError } = await lookupClient
    .from("classes")
    .select("id, name, semester")
    .eq("organization_id", organizationId)
    .eq("is_archived", true)
    .in("id", memberClassIds)

  if (classesError) {
    return NextResponse.json({ error: classesError.message }, { status: 400 })
  }

  const archivedClassIds = (classes ?? []).map((classRow) => classRow.id)

  if (archivedClassIds.length === 0) {
    return NextResponse.json({ previousTerms: [] })
  }

  const { data: assignments, error: assignmentsError } = await lookupClient
    .from("class_assignments")
    .select("id, class_id, title, description, max_score")
    .eq("organization_id", organizationId)
    .in("class_id", archivedClassIds)
    .is("deleted_at", null)

  if (assignmentsError) {
    return NextResponse.json(
      { error: assignmentsError.message },
      { status: 400 },
    )
  }

  const assignmentIds = (assignments ?? []).map((assignment) => assignment.id)
  const assignmentClassMap = new Map(
    (assignments ?? []).map((assignment) => [
      assignment.id,
      assignment.class_id,
    ]),
  )

  const assignmentMap = new Map(
    (assignments ?? []).map((assignment) => [assignment.id, assignment]),
  )

  const { data: submissions, error: submissionsError } =
    assignmentIds.length > 0
      ? await lookupClient
          .from("class_assignment_submissions")
          .select("assignment_id, score, graded_at, submitted_at")
          .eq("organization_id", organizationId)
          .eq("student_user_id", profile.id)
          .in("assignment_id", assignmentIds)
          .order("graded_at", { ascending: false, nullsFirst: false })
          .order("submitted_at", { ascending: false, nullsFirst: false })
      : { data: [], error: null }

  if (submissionsError) {
    return NextResponse.json(
      { error: submissionsError.message },
      { status: 400 },
    )
  }

  const importedGradeByClassId = new Map<string, number>()
  const scoreGroupsByClassId = new Map<
    string,
    Array<{ score: number; maxScore: number }>
  >()

  for (const submission of submissions ?? []) {
    const assignment = assignmentMap.get(submission.assignment_id)
    const classId = assignmentClassMap.get(submission.assignment_id)
    const score = Number.parseFloat(String(submission.score ?? ""))
    const maxScore = Number.parseFloat(String(assignment?.max_score ?? ""))

    if (!assignment || !classId || !Number.isFinite(score)) {
      continue
    }

    if (
      assignment.title === "Imported previous term grade" &&
      assignment.description ===
        "Grade imported during student registration." &&
      !importedGradeByClassId.has(classId)
    ) {
      importedGradeByClassId.set(classId, score)
    }

    if (Number.isFinite(maxScore) && maxScore > 0) {
      const scores = scoreGroupsByClassId.get(classId) ?? []
      scores.push({ score, maxScore })
      scoreGroupsByClassId.set(classId, scores)
    }
  }

  const previousTerms = (classes ?? []).map((classRow) => ({
    sourceClassId: classRow.id,
    term: classRow.semester?.trim() || "Unassigned Term",
    className: classRow.name,
    grade:
      importedGradeByClassId.get(classRow.id) ??
      getAverageScore(scoreGroupsByClassId.get(classRow.id) ?? []) ??
      null,
  }))

  return NextResponse.json({ previousTerms })
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const body = (await request
    .json()
    .catch(() => ({}))) as RegistrationRequestBody
  const mode = body.mode === "edit" ? "edit" : "register"
  const email = body.email?.trim().toLowerCase()
  const role = body.role
  const classId = body.classId?.trim() || null
  const classRole =
    body.classRole ?? (role === "teacher" ? "teacher" : "student")

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 })
  }

  if (!role || !(role in ROLE_LABELS)) {
    return NextResponse.json({ error: "Role is required" }, { status: 400 })
  }

  if (classId && classRole !== "teacher" && classRole !== "student") {
    return NextResponse.json(
      { error: "Class role is required" },
      { status: 400 },
    )
  }

  if (classId && role === "org_admin") {
    return NextResponse.json(
      { error: "Admins can be saved without a class assignment" },
      { status: 400 },
    )
  }

  if (mode === "register" && classId && classRole !== role) {
    return NextResponse.json(
      { error: "Class role must match the organization role" },
      { status: 400 },
    )
  }

  const canManageOrg = await canManageOrganizationUsers(
    supabase,
    organizationId,
    user.id,
  )

  if (canManageOrg.error || !canManageOrg.allowed) {
    return NextResponse.json(
      { error: canManageOrg.error ?? "Only admins can manage users" },
      { status: 403 },
    )
  }

  const existingMember = await findOrganizationMemberByEmail(
    supabase,
    organizationId,
    email,
  )

  if (existingMember.error) {
    return NextResponse.json({ error: existingMember.error }, { status: 400 })
  }

  if (mode === "register" && existingMember.membership) {
    return NextResponse.json(
      {
        error:
          "This user already exists in the organization. Use Edit user to update roles, classes, or previous terms.",
      },
      { status: 409 },
    )
  }

  if (mode === "edit" && !existingMember.membership) {
    return NextResponse.json(
      {
        error:
          "Only existing organization members can be edited. Use Register for new members.",
      },
      { status: 404 },
    )
  }

  const previousTermsResult = normalizePreviousTerms(body.previousTerms ?? [])

  if (previousTermsResult.error) {
    return NextResponse.json(
      { error: previousTermsResult.error },
      { status: 400 },
    )
  }

  const previousTerms = previousTermsResult.terms
  const previousClassIds = Array.from(
    new Set(
      previousTerms
        .map((term) => term.sourceClassId)
        .filter((id): id is string => Boolean(id) && id !== classId),
    ),
  )

  const existingRoles: OrganizationRole[] = existingMember.roles ?? []

  if (mode === "edit" && !existingRoles.includes("student")) {
    return NextResponse.json(
      { error: "Only students can be edited from this page" },
      { status: 400 },
    )
  }

  if (mode === "edit" && classId && classRole !== "student") {
    return NextResponse.json(
      { error: "Student edits can only add student class memberships" },
      { status: 400 },
    )
  }

  const canAttachPreviousTerms =
    mode === "register" ? role === "student" : existingRoles.includes("student")

  if (previousTerms.length > 0 && !canAttachPreviousTerms) {
    return NextResponse.json(
      { error: "Previous terms can only be attached to students" },
      { status: 400 },
    )
  }

  const validationClassIds = Array.from(
    new Set([...(classId ? [classId] : []), ...previousClassIds]),
  )

  if (validationClassIds.length > 0) {
    const { data: classRows, error: classError } = await supabase
      .from("classes")
      .select("id, organization_id")
      .in("id", validationClassIds)

    const validClassIds = new Set(
      (classRows ?? [])
        .filter((classRow) => classRow.organization_id === organizationId)
        .map((classRow) => classRow.id),
    )

    if (
      classError ||
      validClassIds.size !== validationClassIds.length ||
      validationClassIds.some((id) => !validClassIds.has(id))
    ) {
      return NextResponse.json(
        { error: "Class is not in this organization" },
        { status: 400 },
      )
    }
  }

  let resultData: {
    result?: "membership" | "invite"
    invite_id?: string
    email?: string
    role?: OrganizationRole
  } | null = null

  if (mode === "register") {
    const rpcPreviousTerms = previousTerms.map((previousTerm) => ({
      source_class_id: previousTerm.sourceClassId,
      term_label: previousTerm.term,
      previous_class_name: previousTerm.className,
      grade_value: previousTerm.grade,
    }))

    const { data, error } = await supabase.rpc("register_member_with_invites", {
      target_org_id: organizationId,
      invited_email: email,
      invited_role: role,
      target_class_id: classId,
      invited_class_role: classId ? classRole : null,
      previous_terms: rpcPreviousTerms,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    resultData = data
  }

  if (mode === "edit") {
    if (classId) {
      const { data, error } = await supabase.rpc("invite_class_member", {
        target_class_id: classId,
        invited_email: email,
        invited_class_role: classRole,
      })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      resultData = data
    }

    for (const previousTerm of previousTerms) {
      const { data, error } = await supabase.rpc(
        "register_previous_term_grade",
        {
          target_org_id: organizationId,
          invited_email: email,
          term_label: previousTerm.term,
          previous_class_name: previousTerm.className,
          grade_value: previousTerm.grade,
          source_class_id: previousTerm.sourceClassId,
        },
      )

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      resultData = data
    }

    resultData ??= {
      result: "membership",
      email,
      role: existingRoles[0] ?? role,
    }
  }

  if (resultData?.result === "membership") {
    return NextResponse.json({
      result: "membership",
      email: resultData.email,
      role: resultData.role,
      previousTermsCount: previousTerms.length,
      emailStatus: "not_required",
    })
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single()

  const { data: invite } = await supabase
    .from("organization_invites")
    .select("token")
    .eq("id", resultData?.invite_id)
    .single()
  const features = await loadEnabledOrganizationFeatureSummaries(
    supabase,
    organizationId,
  ).catch(() => [])

  const inviteUrl = invite?.token ? getInviteUrl(request, invite.token) : null

  if (!inviteUrl) {
    return NextResponse.json({
      result: "invite",
      inviteId: resultData?.invite_id,
      email: resultData?.email,
      role: resultData?.role,
      previousTermsCount: previousTerms.length,
      emailStatus: "failed",
      emailError: "Invite token was not available",
    })
  }

  const emailResult = await sendOrganizationInviteEmail({
    to: resultData?.email ?? email,
    organizationName: organization?.name ?? "Eduverse",
    roleLabel: ROLE_LABELS[role],
    inviteUrl,
    features,
  })

  return NextResponse.json({
    result: "invite",
    inviteId: resultData?.invite_id,
    email: resultData?.email,
    role: resultData?.role,
    inviteUrl,
    previousTermsCount: previousTerms.length,
    emailStatus: emailResult.status,
    emailError: emailResult.status === "failed" ? emailResult.error : null,
  })
}

function normalizePreviousTerms(records: PreviousTermInput[]): {
  terms: NormalizedPreviousTerm[]
  error: string | null
} {
  const terms: NormalizedPreviousTerm[] = []

  for (const [index, record] of records.entries()) {
    const normalized = {
      sourceClassId: record.sourceClassId?.trim() || null,
      term: record.term?.trim() ?? "",
      className: record.className?.trim() ?? "",
      grade:
        typeof record.grade === "number"
          ? record.grade
          : Number.parseFloat(String(record.grade ?? "").trim()),
    }

    if (!normalized.term) {
      return {
        terms: [],
        error: `Previous term ${index + 1} is missing a term label.`,
      }
    }

    if (!normalized.className) {
      return {
        terms: [],
        error: `Previous term ${index + 1} is missing a class name.`,
      }
    }

    if (!Number.isFinite(normalized.grade)) {
      return {
        terms: [],
        error: `Previous term ${index + 1} is missing a valid grade.`,
      }
    }

    if (normalized.grade < 0 || normalized.grade > 100) {
      return {
        terms: [],
        error: `Previous term ${index + 1} grade must be between 0 and 100.`,
      }
    }

    terms.push(normalized)
  }

  return { terms, error: null }
}

async function findOrganizationMemberByEmail(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireRouteUser>>["supabase"]
  >,
  organizationId: string,
  email: string,
) {
  const lookupClient = getPrivilegedSupabaseClient() ?? supabase
  const { data: profile, error: profileError } = await lookupClient
    .from("profiles")
    .select("id")
    .ilike("email", escapeIlikePattern(email))
    .maybeSingle()

  if (profileError) {
    return { error: profileError.message, membership: null, roles: [] }
  }

  if (!profile) {
    return { error: null, membership: null, roles: [] }
  }

  const { data: membership, error: membershipError } = await lookupClient
    .from("organization_memberships")
    .select("id, status, role")
    .eq("organization_id", organizationId)
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle()

  if (membershipError) {
    return { error: membershipError.message, membership: null, roles: [] }
  }

  if (!membership) {
    return { error: null, membership: null, roles: [] }
  }

  const { data: roleRows, error: rolesError } = await lookupClient
    .from("organization_membership_roles")
    .select("role")
    .eq("organization_membership_id", membership.id)
    .eq("status", "active")

  if (rolesError) {
    return { error: rolesError.message, membership: null, roles: [] }
  }

  const roles = (roleRows ?? []).map(
    (roleRow) => roleRow.role as OrganizationRole,
  )

  return {
    error: null,
    membership,
    roles: roles.length > 0 ? roles : [membership.role],
  }
}

async function canManageOrganizationUsers(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireRouteUser>>["supabase"]
  >,
  organizationId: string,
  userId: string,
) {
  const lookupClient = getPrivilegedSupabaseClient() ?? supabase
  const { data: membership, error: membershipError } = await lookupClient
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()

  if (membershipError) {
    return { allowed: false, error: membershipError.message }
  }

  if (!membership) {
    return { allowed: false, error: null }
  }

  const { data: roleRows, error: roleError } = await lookupClient
    .from("organization_membership_roles")
    .select("id")
    .eq("organization_membership_id", membership.id)
    .eq("status", "active")
    .eq("role", "org_admin")
    .limit(1)

  if (roleError) {
    return { allowed: false, error: roleError.message }
  }

  return { allowed: (roleRows ?? []).length > 0, error: null }
}

function getPrivilegedSupabaseClient() {
  try {
    return createPrivilegedSupabaseClient()
  } catch {
    return null
  }
}

function getAverageScore(scores: Array<{ score: number; maxScore: number }>) {
  if (scores.length === 0) return null

  return Math.round(
    scores.reduce((sum, item) => sum + (item.score / item.maxScore) * 100, 0) /
      scores.length,
  )
}

function escapeIlikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function getInviteUrl(request: Request, token: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")

  if (configuredUrl) return `${configuredUrl}/invite/${token}`

  const requestUrl = new URL(request.url)
  return `${requestUrl.origin}/invite/${token}`
}
