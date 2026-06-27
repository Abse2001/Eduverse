import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { createServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

type ClassProfileRow = {
  id: string
  display_name: string
  email: string
}

type ClassMembershipRow = {
  user_id: string
}

type AssignmentRow = {
  id: string
  max_score: number
}

type AssignmentSubmissionRow = {
  assignment_id: string
  student_user_id: string
  score: number | null
  graded_at: string | null
}

type ExamRow = {
  id: string
  total_points: number
}

type ExamAttemptRow = {
  exam_id: string
  student_user_id: string
  total_score: number | null
  results_released_at: string | null
}

export async function GET(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json(
      { error: authError ?? "Authentication required" },
      { status: 401 },
    )
  }

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, organization_id, results_visible_to_students")
    .eq("id", classId)
    .eq("is_archived", false)
    .maybeSingle()

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 })
  }

  if (!classRow) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 })
  }

  const [{ data: canManage, error: permissionError }, studentMembership] =
    await Promise.all([
      supabase.rpc("can_manage_class", {
        target_org_id: classRow.organization_id,
        target_class_id: classRow.id,
      }),
      supabase
        .from("class_memberships")
        .select("id")
        .eq("organization_id", classRow.organization_id)
        .eq("class_id", classRow.id)
        .eq("user_id", user.id)
        .eq("role", "student")
        .maybeSingle(),
    ])

  if (permissionError) {
    return NextResponse.json(
      { error: permissionError.message },
      { status: 500 },
    )
  }

  if (studentMembership.error) {
    return NextResponse.json(
      { error: studentMembership.error.message },
      { status: 500 },
    )
  }

  const canViewSummary =
    Boolean(canManage) ||
    (Boolean(classRow.results_visible_to_students) &&
      Boolean(studentMembership.data))

  if (!canViewSummary) {
    return NextResponse.json(
      { error: "Class results are not visible to this student." },
      { status: 403 },
    )
  }

  const admin = createServerClient()

  const { data: membershipData, error: membershipError } = await admin
    .from("class_memberships")
    .select("user_id")
    .eq("organization_id", classRow.organization_id)
    .eq("class_id", classRow.id)
    .eq("role", "student")
    .order("created_at", { ascending: true })

  if (membershipError) {
    return NextResponse.json(
      { error: membershipError.message },
      { status: 500 },
    )
  }

  const memberships = (membershipData ?? []) as ClassMembershipRow[]
  const studentIds = memberships.map((membership) => membership.user_id)

  if (studentIds.length === 0) {
    return NextResponse.json({ students: [] })
  }

  const [
    { data: profileData, error: profileError },
    assignmentResult,
    examResult,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", studentIds),
    loadAssignmentSummaryInputs(admin, classRow.id, Boolean(canManage)),
    loadExamSummaryInputs(admin, classRow.id),
  ])

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  if ("error" in assignmentResult) return assignmentResult.error
  if ("error" in examResult) return examResult.error

  const profilesById = new Map(
    ((profileData ?? []) as ClassProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  )
  const assignmentsById = new Map(
    assignmentResult.assignments.map((assignment) => [
      assignment.id,
      assignment,
    ]),
  )
  const examsById = new Map(examResult.exams.map((exam) => [exam.id, exam]))

  const visibleStudentIds = Boolean(canManage)
    ? studentIds
    : studentIds.filter((studentId) => studentId !== user.id)

  const students = visibleStudentIds
    .map((studentId) => {
      const profile = profilesById.get(studentId)
      const assignmentScores = assignmentResult.submissions
        .filter(
          (submission) =>
            submission.student_user_id === studentId &&
            submission.graded_at &&
            submission.score !== null,
        )
        .map((submission) =>
          percentage(
            submission.score ?? 0,
            assignmentsById.get(submission.assignment_id)?.max_score ?? 0,
          ),
        )
      const examScores = examResult.attempts
        .filter(
          (attempt) =>
            attempt.student_user_id === studentId &&
            attempt.results_released_at &&
            attempt.total_score !== null,
        )
        .map((attempt) =>
          percentage(
            attempt.total_score ?? 0,
            examsById.get(attempt.exam_id)?.total_points ?? 0,
          ),
        )
      const scores = [...assignmentScores, ...examScores]

      return {
        id: studentId,
        displayName: profile?.display_name ?? "Unknown student",
        email: canManage ? (profile?.email ?? "") : "",
        assignmentCount: assignmentScores.length,
        examCount: examScores.length,
        resultCount: scores.length,
        average:
          scores.length === 0
            ? null
            : Math.round(
                scores.reduce((total, score) => total + score, 0) /
                  scores.length,
              ),
      }
    })
    .sort((left, right) =>
      (left.displayName || left.email).localeCompare(
        right.displayName || right.email,
      ),
    )

  return NextResponse.json({ students })
}

async function loadAssignmentSummaryInputs(
  supabase: SupabaseClient,
  classId: string,
  canManage: boolean,
) {
  let assignmentQuery = supabase
    .from("class_assignments")
    .select("id, max_score")
    .eq("class_id", classId)
    .is("deleted_at", null)

  if (!canManage) {
    assignmentQuery = assignmentQuery.eq("status", "published")
  }

  const { data: assignmentData, error: assignmentError } = await assignmentQuery

  if (assignmentError) {
    return {
      error: NextResponse.json(
        { error: assignmentError.message },
        { status: 500 },
      ),
    }
  }

  const assignments = (assignmentData ?? []) as AssignmentRow[]
  const assignmentIds = assignments.map((assignment) => assignment.id)

  if (assignmentIds.length === 0) return { assignments, submissions: [] }

  const { data: submissionData, error: submissionError } = await supabase
    .from("class_assignment_submissions")
    .select("assignment_id, student_user_id, score, graded_at")
    .in("assignment_id", assignmentIds)
    .not("graded_at", "is", null)
    .not("score", "is", null)

  if (submissionError) {
    return {
      error: NextResponse.json(
        { error: submissionError.message },
        { status: 500 },
      ),
    }
  }

  return {
    assignments,
    submissions: (submissionData ?? []) as AssignmentSubmissionRow[],
  }
}

async function loadExamSummaryInputs(
  supabase: SupabaseClient,
  classId: string,
) {
  const { data: examData, error: examError } = await supabase
    .from("exams")
    .select("id, total_points")
    .eq("class_id", classId)

  if (examError) {
    return {
      error: NextResponse.json({ error: examError.message }, { status: 500 }),
    }
  }

  const exams = (examData ?? []) as ExamRow[]
  const examIds = exams.map((exam) => exam.id)

  if (examIds.length === 0) return { exams, attempts: [] }

  const { data: attemptData, error: attemptError } = await supabase
    .from("exam_attempts")
    .select("exam_id, student_user_id, total_score, results_released_at")
    .in("exam_id", examIds)
    .not("results_released_at", "is", null)
    .not("total_score", "is", null)

  if (attemptError) {
    return {
      error: NextResponse.json(
        { error: attemptError.message },
        { status: 500 },
      ),
    }
  }

  return {
    exams,
    attempts: (attemptData ?? []) as ExamAttemptRow[],
  }
}

function percentage(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0
  }

  return Math.round((value / total) * 100)
}
