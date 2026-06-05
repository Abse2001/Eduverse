import { createHash, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { writeExamAuditLog } from "@/lib/exams/audit"
import {
  canTeacherGradeQuestion,
  evaluateExamAnswer,
  getReleasedAnswerStatus,
  questionRequiresManualGrading,
  resolveAnswerScore,
} from "@/lib/exams/grading"
import { shouldMarkIntegrityReported } from "@/lib/exams/integrity"
import type {
  ClassExamApiDto,
  ExamAttemptStatus,
  ExamIntegrityStatus,
  GradeAttemptInput,
  IntegrityActionInput,
  IntegrityEventInput,
  ExamQuestionKind,
  ExamStatus,
  JsonValue,
  ManagerAttemptSummaryDto,
  ManagerExamDetailDto,
  ManagerIntegrityEventDto,
  ManagerExamSummaryDto,
  ManagerQuestionDto,
  ReleasedExamResultDto,
  ReleasedExamResultSummaryDto,
  SaveAnswerInput,
  StartAttemptInput,
  StudentActiveExamDto,
  StudentAttemptDto,
  StudentExamPageDto,
  StudentQuestionDto,
  UpsertExamInput,
} from "@/lib/exams/types"
import { createServerClient } from "@/lib/supabase/server"

type AppRole = "org_owner" | "org_admin" | "teacher" | "student"

type ClassContext = {
  id: string
  organizationId: string
  code: string
  name: string
  semester: string | null
  canManage: boolean
  selectedRole: AppRole | null
  isStudentMember: boolean
  isFeatureEnabled: boolean
}

type ExamRow = {
  id: string
  organization_id: string
  class_id: string
  title: string
  duration_minutes: number
  total_points: number
  start_at: string | null
  end_at: string | null
  status: ExamStatus
  created_by_user_id: string | null
  published_at: string | null
  passcode_hash: string | null
  rules_override_json: Record<string, JsonValue>
  created_at: string
  updated_at: string
}

type ExamQuestionRow = {
  id: string
  organization_id: string
  exam_id: string
  position: number
  question_type: ExamQuestionKind
  prompt: string
  options_json: JsonValue[] | null
  correct_answer_json: JsonValue | null
  points: number
  language: string | null
  starter_code: string | null
  visible_tests_json: JsonValue[] | null
  hidden_tests_json: JsonValue[] | null
  evaluator_key: string | null
  created_at: string
  updated_at: string
}

type ExamAttemptRow = {
  id: string
  organization_id: string
  class_id: string
  exam_id: string
  student_user_id: string
  status: ExamAttemptStatus
  started_at: string | null
  submitted_at: string | null
  total_score: number | null
  attempt_number: number
  deadline_at: string | null
  rules_snapshot_json: Record<string, JsonValue>
  needs_manual_review: boolean
  auto_submitted_at: string | null
  integrity_status: ExamIntegrityStatus
  flagged_at: string | null
  flagged_by_user_id: string | null
  flag_reason: string | null
  voided_at: string | null
  voided_by_user_id: string | null
  void_reason: string | null
  graded_at: string | null
  graded_by_user_id: string | null
  results_released_at: string | null
  results_released_by_user_id: string | null
  created_at: string
  updated_at: string
}

type ExamAnswerRow = {
  id: string
  organization_id: string
  exam_attempt_id: string
  exam_question_id: string
  answer_json: JsonValue | null
  auto_score: number | null
  teacher_score: number | null
  created_at: string
  updated_at: string
}

type ProfileRow = {
  id: string
  display_name: string
  email: string
}

type SchemaMode = "unknown" | "extended" | "base"
type SchemaTarget = "exams" | "questions" | "attempts"
type RawRow = Record<string, unknown>

const schemaModes: Record<SchemaTarget, SchemaMode> = {
  exams: "unknown",
  questions: "unknown",
  attempts: "unknown",
}

const EXAM_SELECT_BASE =
  "id, organization_id, class_id, title, duration_minutes, total_points, start_at, end_at, status, created_by_user_id, created_at, updated_at"
const EXAM_SELECT_EXTENDED = `${EXAM_SELECT_BASE}, published_at, passcode_hash, rules_override_json`
const EXAM_SELECT_WITH_SETTINGS = `${EXAM_SELECT_BASE}, passcode_hash, rules_override_json`

const QUESTION_SELECT_BASE =
  "id, organization_id, exam_id, position, question_type, prompt, options_json, correct_answer_json, points, language, starter_code, created_at, updated_at"
const QUESTION_SELECT_EXTENDED = `${QUESTION_SELECT_BASE}, visible_tests_json, hidden_tests_json, evaluator_key`

const ATTEMPT_SELECT_BASE =
  "id, organization_id, class_id, exam_id, student_user_id, status, started_at, submitted_at, total_score, created_at, updated_at"
const ATTEMPT_SELECT_EXTENDED = `${ATTEMPT_SELECT_BASE}, attempt_number, deadline_at, rules_snapshot_json, needs_manual_review, auto_submitted_at, integrity_status, flagged_at, flagged_by_user_id, flag_reason, voided_at, voided_by_user_id, void_reason, graded_at, graded_by_user_id, results_released_at, results_released_by_user_id`

const compatibilityColumns: Record<SchemaTarget, string[]> = {
  exams: ["published_at", "passcode_hash", "rules_override_json"],
  questions: ["visible_tests_json", "hidden_tests_json", "evaluator_key"],
  attempts: [
    "attempt_number",
    "deadline_at",
    "rules_snapshot_json",
    "needs_manual_review",
    "auto_submitted_at",
    "integrity_status",
    "flagged_at",
    "flagged_by_user_id",
    "flag_reason",
    "voided_at",
    "voided_by_user_id",
    "void_reason",
    "graded_at",
    "graded_by_user_id",
    "results_released_at",
    "results_released_by_user_id",
  ],
}

type ExamSelectMode = "unknown" | "extended" | "settings" | "base"

const examSelectCandidates = [
  { mode: "extended", select: EXAM_SELECT_EXTENDED },
  { mode: "settings", select: EXAM_SELECT_WITH_SETTINGS },
  { mode: "base", select: EXAM_SELECT_BASE },
] as const satisfies ReadonlyArray<{
  mode: Exclude<ExamSelectMode, "unknown">
  select: string
}>

let examSelectMode: ExamSelectMode = "unknown"
const EXAM_PASSCODE_MIN_LENGTH = 4
const EXAM_PASSCODE_MAX_FAILURES = 3
const EXAM_PASSCODE_COOLDOWN_MS = 60_000
const EXAM_PASSCODE_REQUIRED_MESSAGE = "Exam passcode is required."
const EXAM_PASSCODE_MISSING_MESSAGE =
  "This exam is missing its required passcode."
const EXAM_FEATURE_KEY = "exam"
const EXAM_PASSCODE_HASHES_CONFIG_KEY = "passcodeHashesByExamId"

const examQuestionInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    type: z.enum(["mcq", "short"]),
    prompt: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).default([]),
    correctAnswer: z.any().nullable().default(null),
    points: z.number().int().positive(),
  })
  .superRefine((question, ctx) => {
    if (question.type === "mcq") {
      if (question.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ questions require options.",
          path: ["options"],
        })
      }
      if (
        typeof question.correctAnswer !== "number" ||
        question.correctAnswer < 0 ||
        question.correctAnswer >= question.options.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ questions require a valid correct answer index.",
          path: ["correctAnswer"],
        })
      }
    }

    if (
      question.type === "short" &&
      question.correctAnswer !== null &&
      (typeof question.correctAnswer !== "string" ||
        question.correctAnswer.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Short-answer auto grading requires a non-empty model answer.",
        path: ["correctAnswer"],
      })
    }
  })

const examInputSchema = z.object({
  title: z.string().trim().min(1),
  durationMinutes: z.number().int().positive(),
  startAt: z.string().datetime(),
  passcode: z.string().trim().optional(),
  questions: z.array(examQuestionInputSchema).min(1),
})

const startAttemptInputSchema = z.object({
  passcode: z.string().trim().min(1, EXAM_PASSCODE_REQUIRED_MESSAGE),
})

const saveAnswerInputSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.any().nullable(),
})

const gradeAttemptInputSchema = z.object({
  answers: z
    .array(
      z.object({
        answerId: z.string().uuid().optional(),
        questionId: z.string().uuid().optional(),
        teacherScore: z.number().min(0).nullable(),
      }),
    )
    .default([]),
})

const integrityInputSchema = z.object({
  action: z.enum(["flag", "void", "clear"]),
  reason: z.string().trim().optional(),
})

const eventInputSchema = z.object({
  eventType: z.string().trim().min(1),
  payload: z.record(z.any()).default({}),
})

export function parseUpsertExamInput(body: unknown) {
  return examInputSchema.parse(body) as UpsertExamInput
}

export function parseStartAttemptInput(body: unknown) {
  return startAttemptInputSchema.parse(body ?? {}) as StartAttemptInput
}

export function parseSaveAnswerInput(body: unknown) {
  return saveAnswerInputSchema.parse(body) as SaveAnswerInput
}

export function parseGradeAttemptInput(body: unknown) {
  return gradeAttemptInputSchema.parse(body) as GradeAttemptInput
}

export function parseIntegrityActionInput(body: unknown) {
  return integrityInputSchema.parse(body) as IntegrityActionInput
}

export function parseIntegrityEventInput(body: unknown) {
  return eventInputSchema.parse(body) as IntegrityEventInput
}

export async function loadClassExamApiData(input: {
  authSupabase: SupabaseClient
  classId: string
  userId: string
}) {
  const context = await loadClassContext(input)

  if (context.canManage) {
    return {
      canManage: true,
      manager: {
        exams: await loadManagerExamSummaries(context.classId),
      },
      student: null,
    } satisfies ClassExamApiDto
  }

  return {
    canManage: false,
    manager: null,
    student: await loadStudentExamPage({
      authSupabase: input.authSupabase,
      classId: context.classId,
      organizationId: context.organizationId,
      userId: input.userId,
      selectedRole: context.selectedRole,
      isStudentMember: context.isStudentMember,
    }),
  } satisfies ClassExamApiDto
}

export async function loadManagerExamDetail(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  userId: string
}) {
  await assertManagerContext(input)
  const admin = createServerClient()
  const exam = await loadExamById(admin, input.examId, input.classId)

  return buildManagerExamDetailResponse(admin, exam)
}

export async function createExam(input: {
  authSupabase: SupabaseClient
  classId: string
  userId: string
  body: UpsertExamInput
}) {
  const context = await assertManagerContext(input)
  const admin = createServerClient()
  const totalPoints = input.body.questions.reduce(
    (sum, question) => sum + question.points,
    0,
  )
  const passcodeHash = hashExamPasscode(input.body.passcode)
  const examWindow = resolveExamWindow(
    input.body.startAt,
    input.body.durationMinutes,
  )
  const examId = await runSchemaCompatible(
    "exams",
    async () => {
      const { data, error } = await admin
        .from("exams")
        .insert({
          organization_id: context.organizationId,
          class_id: context.classId,
          title: input.body.title,
          duration_minutes: input.body.durationMinutes,
          total_points: totalPoints,
          start_at: examWindow.startAt,
          end_at: examWindow.endAt,
          created_by_user_id: input.userId,
          passcode_hash: passcodeHash,
        })
        .select("id")
        .single()

      if (error || !data) {
        throw new Error(error?.message ?? "Could not create exam.")
      }

      return data.id as string
    },
    async () => {
      const { data, error } = await admin
        .from("exams")
        .insert({
          organization_id: context.organizationId,
          class_id: context.classId,
          title: input.body.title,
          duration_minutes: input.body.durationMinutes,
          total_points: totalPoints,
          start_at: examWindow.startAt,
          end_at: examWindow.endAt,
          created_by_user_id: input.userId,
        })
        .select("id")
        .single()

      if (error || !data) {
        throw new Error(error?.message ?? "Could not create exam.")
      }

      return data.id as string
    },
  )

  try {
    await syncExamPasscodeHashStorage({
      admin,
      organizationId: context.organizationId,
      classId: context.classId,
      examId,
      passcodeHash,
    })
    await replaceExamQuestions({
      admin,
      examId,
      organizationId: context.organizationId,
      questions: input.body.questions,
    })
  } catch (error) {
    await admin.from("exams").delete().eq("id", examId)
    throw error
  }

  await writeExamAuditLog({
    organizationId: context.organizationId,
    actorUserId: input.userId,
    action: "exam.created",
    entityType: "exam",
    entityId: examId,
    payload: {
      classId: context.classId,
      title: input.body.title,
      questionCount: input.body.questions.length,
    },
  })

  return loadManagerExamDetail({
    authSupabase: input.authSupabase,
    classId: input.classId,
    examId,
    userId: input.userId,
  })
}

export async function updateExam(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  userId: string
  body: UpsertExamInput
}) {
  const context = await assertManagerContext(input)
  const admin = createServerClient()
  const exam = await loadExamById(admin, input.examId, input.classId)
  const attempts = await loadExamAttempts(admin, [input.examId])

  if (attempts.length > 0) {
    throw new Error("Exams with attempts can no longer be edited.")
  }

  const totalPoints = input.body.questions.reduce(
    (sum, question) => sum + question.points,
    0,
  )
  const nextPasscodeHash = resolveExamPasscodeHash({
    existingPasscodeHash: exam.passcode_hash,
    nextPasscode: input.body.passcode,
  })
  const examWindow = resolveExamWindow(
    input.body.startAt,
    input.body.durationMinutes,
  )
  const nextStatus = normalizeExamStatus({
    ...exam,
    start_at: examWindow.startAt,
    end_at: examWindow.endAt,
  })

  await runSchemaCompatible(
    "exams",
    async () => {
      const { error } = await admin
        .from("exams")
        .update({
          title: input.body.title,
          duration_minutes: input.body.durationMinutes,
          total_points: totalPoints,
          start_at: examWindow.startAt,
          end_at: examWindow.endAt,
          passcode_hash: nextPasscodeHash,
          status: nextStatus,
        })
        .eq("id", input.examId)

      if (error) throw new Error(error.message)
    },
    async () => {
      const { error } = await admin
        .from("exams")
        .update({
          title: input.body.title,
          duration_minutes: input.body.durationMinutes,
          total_points: totalPoints,
          start_at: examWindow.startAt,
          end_at: examWindow.endAt,
          status: nextStatus,
        })
        .eq("id", input.examId)

      if (error) throw new Error(error.message)
    },
  )

  await syncExamPasscodeHashStorage({
    admin,
    organizationId: context.organizationId,
    classId: context.classId,
    examId: input.examId,
    passcodeHash: nextPasscodeHash,
  })

  await replaceExamQuestions({
    admin,
    examId: input.examId,
    organizationId: context.organizationId,
    questions: input.body.questions,
  })

  await writeExamAuditLog({
    organizationId: context.organizationId,
    actorUserId: input.userId,
    action: "exam.updated",
    entityType: "exam",
    entityId: input.examId,
    payload: {
      title: input.body.title,
      questionCount: input.body.questions.length,
    },
  })

  return loadManagerExamDetail({
    authSupabase: input.authSupabase,
    classId: input.classId,
    examId: input.examId,
    userId: input.userId,
  })
}

export async function publishExam(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  userId: string
}) {
  const context = await assertManagerContext(input)
  const admin = createServerClient()
  const exam = await loadExamById(admin, input.examId, input.classId)
  const questions = await loadExamQuestions(admin, input.examId)

  if (questions.length === 0) {
    throw new Error("Add at least one question before publishing an exam.")
  }

  const now = new Date().toISOString()
  const nextStatus = normalizeExamStatus({
    ...exam,
    published_at: exam.published_at ?? now,
  })
  await runSchemaCompatible(
    "exams",
    async () => {
      const { error } = await admin
        .from("exams")
        .update({
          published_at: exam.published_at ?? now,
          status: nextStatus,
        })
        .eq("id", input.examId)

      if (error) throw new Error(error.message)
    },
    async () => {
      const { error } = await admin
        .from("exams")
        .update({
          status: nextStatus,
        })
        .eq("id", input.examId)

      if (error) throw new Error(error.message)
    },
  )

  await writeExamAuditLog({
    organizationId: context.organizationId,
    actorUserId: input.userId,
    action: "exam.published",
    entityType: "exam",
    entityId: input.examId,
    payload: {
      publishedAt: exam.published_at ?? now,
    },
  })

  return loadManagerExamDetail({
    authSupabase: input.authSupabase,
    classId: input.classId,
    examId: input.examId,
    userId: input.userId,
  })
}

export async function deleteExam(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  userId: string
}) {
  const context = await assertManagerContext(input)
  const admin = createServerClient()
  const exam = await loadExamById(admin, input.examId, input.classId)
  const attempts = await loadExamAttempts(admin, [input.examId])

  const attemptIds = attempts.map((attempt) => attempt.id)
  if (attemptIds.length > 0) {
    const { error: answerDeleteError } = await admin
      .from("exam_answers")
      .delete()
      .in("exam_attempt_id", attemptIds)

    if (answerDeleteError) throw new Error(answerDeleteError.message)
  }

  const { error: attemptDeleteError } = await admin
    .from("exam_attempts")
    .delete()
    .eq("exam_id", input.examId)

  if (attemptDeleteError) throw new Error(attemptDeleteError.message)

  const { error: questionDeleteError } = await admin
    .from("exam_questions")
    .delete()
    .eq("exam_id", input.examId)

  if (questionDeleteError) throw new Error(questionDeleteError.message)

  const { error: examDeleteError } = await admin
    .from("exams")
    .delete()
    .eq("id", input.examId)
    .eq("class_id", input.classId)

  if (examDeleteError) throw new Error(examDeleteError.message)

  await removeExamPasscodeHashFallback({
    admin,
    organizationId: context.organizationId,
    classId: input.classId,
    examId: input.examId,
  })

  await writeExamAuditLog({
    organizationId: context.organizationId,
    actorUserId: input.userId,
    action: "exam.deleted",
    entityType: "exam",
    entityId: input.examId,
    payload: {
      classId: input.classId,
      title: exam.title,
      deletedAttemptCount: attempts.length,
    },
  })

  return {
    id: input.examId,
  }
}

export async function startExamAttempt(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  userId: string
  body: StartAttemptInput
}) {
  const context = await assertStudentContext(input)
  const admin = createServerClient()
  const exam = await loadExamById(admin, input.examId, input.classId)
  ensurePublishedExam(exam)
  await ensureExamCanStart(exam)
  let attempts = await loadExamAttemptsForStudent(
    admin,
    input.examId,
    input.userId,
  )
  const activeAttempt = attempts.find(
    (attempt) => attempt.status === "in_progress",
  )

  if (activeAttempt) {
    if (attemptExpired(activeAttempt, exam)) {
      await submitAttemptInternal({
        admin,
        attempt: activeAttempt,
        userId: input.userId,
        organizationId: context.organizationId,
        autoSubmitted: true,
      })
      attempts = await loadExamAttemptsForStudent(
        admin,
        input.examId,
        input.userId,
      )
    } else {
      return buildStudentActiveExamDto({
        admin,
        exam,
        attempt: activeAttempt,
        examModeEnabled: true,
      })
    }
  }

  await validateStartAttemptPasscode({
    admin,
    organizationId: context.organizationId,
    classId: input.classId,
    examId: input.examId,
    studentUserId: input.userId,
    passcodeHash: exam.passcode_hash,
    passcode: input.body.passcode,
  })

  const availableRetakeCount = await loadAvailableRetakeCount(
    admin,
    input.examId,
    input.userId,
  )
  const attemptAvailability = resolveExamAttemptAvailability({
    attempts,
    availableRetakeCount,
  })

  if (
    !attemptAvailability.canStart ||
    attemptAvailability.nextAttemptNumber === null
  ) {
    throw new Error(attemptAvailability.reason ?? RETAKE_REQUIRED_MESSAGE)
  }

  const attemptNumber = attemptAvailability.nextAttemptNumber
  const startedAt = new Date()
  const deadlineAt = computeAttemptDeadline(exam, startedAt)
  const attempt = await runSchemaCompatible(
    "attempts",
    async () => {
      const { data, error } = await admin
        .from("exam_attempts")
        .insert({
          organization_id: context.organizationId,
          class_id: input.classId,
          exam_id: input.examId,
          student_user_id: input.userId,
          status: "in_progress",
          started_at: startedAt.toISOString(),
          attempt_number: attemptNumber,
          deadline_at: deadlineAt,
          rules_snapshot_json: {},
          integrity_status: "clear",
        })
        .select(ATTEMPT_SELECT_BASE)
        .single()

      if (error || !data) {
        throw new Error(error?.message ?? "Could not start exam attempt.")
      }

      return normalizeAttemptRow(data as RawRow, attemptNumber)
    },
    async () => {
      const { data, error } = await admin
        .from("exam_attempts")
        .insert({
          organization_id: context.organizationId,
          class_id: input.classId,
          exam_id: input.examId,
          student_user_id: input.userId,
          status: "in_progress",
          started_at: startedAt.toISOString(),
        })
        .select(ATTEMPT_SELECT_BASE)
        .single()

      if (error || !data) {
        throw new Error(error?.message ?? "Could not start exam attempt.")
      }

      return normalizeAttemptRow(
        {
          ...(data as RawRow),
          deadline_at: deadlineAt,
          rules_snapshot_json: {},
          integrity_status: "clear",
        },
        attemptNumber,
      )
    },
  )

  if (attemptNumber > 1 && availableRetakeCount > 0) {
    await writeExamAuditLog({
      organizationId: context.organizationId,
      actorUserId: input.userId,
      action: "exam.retake_consumed",
      entityType: "exam",
      entityId: input.examId,
      payload: {
        attemptId: attempt.id,
        attemptNumber,
        studentUserId: input.userId,
      },
    })
  }

  await writeExamAuditLog({
    organizationId: context.organizationId,
    actorUserId: input.userId,
    action: "exam.attempt_started",
    entityType: "exam_attempt",
    entityId: attempt.id,
    payload: {
      examId: input.examId,
      attemptNumber,
      deadlineAt,
    },
  })

  return buildStudentActiveExamDto({
    admin,
    exam,
    attempt,
    examModeEnabled: true,
  })
}

export async function saveExamAnswer(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  attemptId: string
  userId: string
  body: SaveAnswerInput
}) {
  const context = await assertStudentContext(input)
  const admin = createServerClient()
  const attempt = await loadAttemptById(admin, input.attemptId)

  if (
    attempt.class_id !== input.classId ||
    attempt.exam_id !== input.examId ||
    attempt.student_user_id !== input.userId
  ) {
    throw new Error("Attempt not found.")
  }

  if (attempt.status !== "in_progress") {
    throw new Error("Submitted attempts can no longer be edited.")
  }

  const exam = await loadExamById(admin, input.examId, input.classId)

  if (attemptExpired(attempt, exam)) {
    await submitAttemptInternal({
      admin,
      attempt,
      userId: input.userId,
      organizationId: context.organizationId,
      autoSubmitted: true,
    })
    throw new Error("This attempt has expired and was submitted automatically.")
  }

  const question = await loadQuestionById(admin, input.body.questionId)
  if (question.exam_id !== input.examId) {
    throw new Error("Question not found.")
  }

  const { error } = await admin.from("exam_answers").upsert(
    {
      organization_id: context.organizationId,
      exam_attempt_id: input.attemptId,
      exam_question_id: input.body.questionId,
      answer_json: input.body.answer,
    },
    { onConflict: "exam_attempt_id,exam_question_id" },
  )

  if (error) throw new Error(error.message)

  return { ok: true }
}

export async function submitExamAttempt(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  attemptId: string
  userId: string
}) {
  await assertStudentContext(input)
  const admin = createServerClient()
  const attempt = await loadAttemptById(admin, input.attemptId)

  if (
    attempt.class_id !== input.classId ||
    attempt.exam_id !== input.examId ||
    attempt.student_user_id !== input.userId
  ) {
    throw new Error("Attempt not found.")
  }

  const nextAttempt = await submitAttemptInternal({
    admin,
    attempt,
    userId: input.userId,
    organizationId: attempt.organization_id,
    autoSubmitted: false,
  })
  const exam = await loadExamById(admin, input.examId, input.classId)
  return buildStudentReleasedResultDto({
    admin,
    exam,
    attempt: nextAttempt,
  })
}

export async function gradeExamAttempt(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  attemptId: string
  userId: string
  body: GradeAttemptInput
}) {
  const context = await assertManagerContext(input)
  const admin = createServerClient()
  const attempt = await loadAttemptById(admin, input.attemptId)

  if (attempt.class_id !== input.classId || attempt.exam_id !== input.examId) {
    throw new Error("Attempt not found.")
  }

  if (attempt.status === "in_progress") {
    throw new Error("Submit the attempt before saving grades.")
  }

  if (attempt.status === "voided") {
    throw new Error("Voided attempts cannot be graded.")
  }

  if (attempt.results_released_at) {
    throw new Error("This result has already been approved.")
  }

  const questions = await loadExamQuestions(admin, input.examId)
  const answers = await loadExamAnswers(admin, [input.attemptId])
  const answersById = new Map(answers.map((answer) => [answer.id, answer]))
  const answersByQuestionId = new Map(
    answers.map((answer) => [answer.exam_question_id, answer]),
  )
  const updatedTeacherScores = new Map<string, number | null>()

  for (const update of input.body.answers) {
    const answer =
      (update.answerId ? answersById.get(update.answerId) : undefined) ??
      (update.questionId
        ? answersByQuestionId.get(update.questionId)
        : undefined)
    const questionId = answer?.exam_question_id ?? update.questionId

    if (!questionId) {
      throw new Error("Each grade update must reference an answer or question.")
    }

    const question = questions.find((candidate) => candidate.id === questionId)
    if (!question) throw new Error("Question not found.")

    const canTeacherGrade = canTeacherGradeQuestion({
      questionType: question.question_type,
      correctAnswer: question.correct_answer_json ?? null,
    })

    if (update.teacherScore !== null && !canTeacherGrade) {
      throw new Error(
        "Only short-answer questions without a model answer can be graded manually.",
      )
    }

    updatedTeacherScores.set(questionId, update.teacherScore)

    if (!canTeacherGrade) {
      if (
        answer?.teacher_score !== null &&
        answer?.teacher_score !== undefined
      ) {
        const { error } = await admin
          .from("exam_answers")
          .update({ teacher_score: null })
          .eq("id", answer.id)

        if (error) throw new Error(error.message)
      }
      continue
    }

    if (
      update.teacherScore !== null &&
      update.teacherScore > Number(question.points)
    ) {
      throw new Error("Teacher score cannot exceed question points.")
    }

    if (answer) {
      const { error } = await admin
        .from("exam_answers")
        .update({ teacher_score: update.teacherScore })
        .eq("id", answer.id)

      if (error) throw new Error(error.message)
    } else {
      const { error } = await admin.from("exam_answers").insert({
        organization_id: attempt.organization_id,
        exam_attempt_id: attempt.id,
        exam_question_id: questionId,
        answer_json: null,
        teacher_score: update.teacherScore,
      })

      if (error) throw new Error(error.message)
    }
  }

  const missingManualGrades = questions.filter((question) => {
    if (
      !questionRequiresManualGrading({
        questionType: question.question_type,
        correctAnswer: question.correct_answer_json ?? null,
      })
    ) {
      return false
    }

    const savedAnswer = answersByQuestionId.get(question.id)
    const teacherScore = updatedTeacherScores.has(question.id)
      ? updatedTeacherScores.get(question.id)
      : (savedAnswer?.teacher_score ?? null)

    return teacherScore === null || teacherScore === undefined
  })

  if (missingManualGrades.length > 0) {
    throw new Error(
      "Score every manual-review short answer before saving the grade.",
    )
  }

  const refreshedAttempt = await finalizeAttemptScores({
    admin,
    attemptId: input.attemptId,
    gradedByUserId: input.userId,
    status: "graded",
    needsManualReview: false,
    maybeReleaseImmediately: true,
    releaseByUserId: input.userId,
  })

  await writeExamAuditLog({
    organizationId: context.organizationId,
    actorUserId: input.userId,
    action: "exam.graded",
    entityType: "exam_attempt",
    entityId: input.attemptId,
    payload: {
      examId: input.examId,
      totalScore: refreshedAttempt.total_score ?? 0,
    },
  })

  await writeExamAuditLog({
    organizationId: context.organizationId,
    actorUserId: input.userId,
    action: "exam.results_released",
    entityType: "exam_attempt",
    entityId: input.attemptId,
    payload: {
      examId: input.examId,
      releasedAt:
        refreshedAttempt.results_released_at ?? new Date().toISOString(),
    },
  })

  const exam = await loadExamById(admin, input.examId, input.classId)
  return buildManagerExamDetailResponse(admin, exam)
}

export async function releaseExamAttempt(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  attemptId: string
  userId: string
}) {
  const context = await assertManagerContext(input)
  const admin = createServerClient()
  const attempt = await loadAttemptById(admin, input.attemptId)

  if (attempt.class_id !== input.classId || attempt.exam_id !== input.examId) {
    throw new Error("Attempt not found.")
  }

  const releasedAt = new Date().toISOString()
  await runSchemaCompatible(
    "attempts",
    async () => {
      const { error } = await admin
        .from("exam_attempts")
        .update({
          results_released_at: releasedAt,
          results_released_by_user_id: input.userId,
        })
        .eq("id", input.attemptId)

      if (error) throw new Error(error.message)
    },
    async () => undefined,
  )

  await writeExamAuditLog({
    organizationId: context.organizationId,
    actorUserId: input.userId,
    action: "exam.results_released",
    entityType: "exam_attempt",
    entityId: input.attemptId,
    payload: {
      examId: input.examId,
      releasedAt,
    },
  })

  return buildManagerExamDetailResponse(
    admin,
    await loadExamById(admin, input.examId, input.classId),
  )
}

export async function applyExamIntegrityAction(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  attemptId: string
  userId: string
  body: IntegrityActionInput
}) {
  const context = await assertManagerContext(input)
  const admin = createServerClient()
  const attempt = await loadAttemptById(admin, input.attemptId)

  if (attempt.class_id !== input.classId || attempt.exam_id !== input.examId) {
    throw new Error("Attempt not found.")
  }

  const timestamp = new Date().toISOString()
  await runSchemaCompatible(
    "attempts",
    async () => {
      if (input.body.action === "flag") {
        const { error } = await admin
          .from("exam_attempts")
          .update({
            integrity_status: "flagged",
            flagged_at: timestamp,
            flagged_by_user_id: input.userId,
            flag_reason: input.body.reason ?? null,
          })
          .eq("id", input.attemptId)

        if (error) throw new Error(error.message)
        return
      }

      if (input.body.action === "void") {
        const { error } = await admin
          .from("exam_attempts")
          .update({
            integrity_status: "voided",
            status: "voided",
            voided_at: timestamp,
            voided_by_user_id: input.userId,
            void_reason: input.body.reason ?? null,
          })
          .eq("id", input.attemptId)

        if (error) throw new Error(error.message)
        return
      }

      const { error } = await admin
        .from("exam_attempts")
        .update({
          integrity_status: "clear",
          flagged_at: null,
          flagged_by_user_id: null,
          flag_reason: null,
        })
        .eq("id", input.attemptId)

      if (error) throw new Error(error.message)
    },
    async () => {
      if (input.body.action !== "void") return

      const { error } = await admin
        .from("exam_attempts")
        .update({
          status: "voided",
          submitted_at: attempt.submitted_at ?? timestamp,
        })
        .eq("id", input.attemptId)

      if (error) throw new Error(error.message)
    },
  )

  await writeExamAuditLog({
    organizationId: context.organizationId,
    actorUserId: input.userId,
    action: input.body.action === "void" ? "exam.voided" : "exam.flagged",
    entityType: "exam_attempt",
    entityId: input.attemptId,
    payload: {
      examId: input.examId,
      action: input.body.action,
      reason: input.body.reason ?? null,
    },
  })

  return buildManagerExamDetailResponse(
    admin,
    await loadExamById(admin, input.examId, input.classId),
  )
}

export async function grantExamRetake(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  attemptId: string
  userId: string
}) {
  const context = await assertManagerContext(input)
  const admin = createServerClient()
  const attempt = await loadAttemptById(admin, input.attemptId)

  if (attempt.class_id !== input.classId || attempt.exam_id !== input.examId) {
    throw new Error("Attempt not found.")
  }

  if (attempt.status === "in_progress") {
    throw new Error(
      "Finish or void the active attempt before granting a retake.",
    )
  }

  const availableRetakeCount = await loadAvailableRetakeCount(
    admin,
    input.examId,
    attempt.student_user_id,
  )

  if (availableRetakeCount > 0) {
    throw new Error("This student already has an unused retake.")
  }

  await writeExamAuditLog({
    organizationId: context.organizationId,
    actorUserId: input.userId,
    action: "exam.retake_granted",
    entityType: "exam",
    entityId: input.examId,
    payload: {
      attemptId: attempt.id,
      studentUserId: attempt.student_user_id,
    },
  })

  return buildManagerExamDetailResponse(
    admin,
    await loadExamById(admin, input.examId, input.classId),
  )
}

export async function recordExamIntegrityEvent(input: {
  authSupabase: SupabaseClient
  classId: string
  examId: string
  attemptId: string
  userId: string
  body: IntegrityEventInput
}) {
  await assertStudentContext(input)
  const admin = createServerClient()
  const attempt = await loadAttemptById(admin, input.attemptId)

  if (
    attempt.class_id !== input.classId ||
    attempt.exam_id !== input.examId ||
    attempt.student_user_id !== input.userId
  ) {
    throw new Error("Attempt not found.")
  }

  const shouldMarkReported = shouldMarkIntegrityReported({
    currentStatus: attempt.integrity_status,
    eventType: input.body.eventType,
  })

  if (shouldMarkReported) {
    await runSchemaCompatible(
      "attempts",
      async () => {
        const { error } = await admin
          .from("exam_attempts")
          .update({ integrity_status: "reported" })
          .eq("id", input.attemptId)

        if (error) throw new Error(error.message)
      },
      async () => undefined,
    )
  }

  await writeExamAuditLog({
    organizationId: attempt.organization_id,
    actorUserId: input.userId,
    action: "exam.attempt_event",
    entityType: "exam_attempt",
    entityId: input.attemptId,
    payload: {
      examId: input.examId,
      eventType: input.body.eventType,
      payload: sanitizePayload(input.body.payload),
    },
  })

  return { ok: true }
}

export async function loadReleasedExamResultsForClass(input: {
  authSupabase: SupabaseClient
  classId: string
  userId: string
}) {
  const context = await loadClassContext(input)

  if (context.canManage) {
    return {
      exams: await loadManagerExamSummaries(context.classId),
      results: [] as ReleasedExamResultSummaryDto[],
    }
  }

  const student = await loadStudentExamPage({
    authSupabase: input.authSupabase,
    classId: context.classId,
    organizationId: context.organizationId,
    userId: input.userId,
    selectedRole: context.selectedRole,
    isStudentMember: context.isStudentMember,
  })

  return {
    exams: [] as ManagerExamSummaryDto[],
    results:
      student.releasedResults.length > 0
        ? student.releasedResults.map(toReleasedExamSummary)
        : student.history,
  }
}

async function assertManagerContext(input: {
  authSupabase: SupabaseClient
  classId: string
  userId: string
}) {
  const context = await loadClassContext(input)
  if (!context.canManage || !isManagerRole(context.selectedRole)) {
    throw new Error(
      "Only class teachers and organization admins can manage exams.",
    )
  }

  return context
}

async function assertStudentContext(input: {
  authSupabase: SupabaseClient
  classId: string
  userId: string
}) {
  const context = await loadClassContext(input)
  if (context.selectedRole !== "student" || !context.isStudentMember) {
    throw new Error("Switch to the student role to access exam attempts.")
  }

  return context
}

async function loadClassContext(input: {
  authSupabase: SupabaseClient
  classId: string
  userId: string
}) {
  const { data: classRow, error: classError } = await input.authSupabase
    .from("classes")
    .select("id, organization_id, code, name, semester")
    .eq("id", input.classId)
    .eq("is_archived", false)
    .maybeSingle()

  if (classError) throw new Error(classError.message)
  if (!classRow) throw new Error("Class not found.")

  const [canManageResult, selectedRole, membership, featureEnabled] =
    await Promise.all([
      input.authSupabase.rpc("can_manage_class", {
        target_org_id: classRow.organization_id,
        target_class_id: input.classId,
      }),
      loadSelectedOrganizationRole(
        input.authSupabase,
        classRow.organization_id,
        input.userId,
      ),
      input.authSupabase
        .from("class_memberships")
        .select("id, role")
        .eq("organization_id", classRow.organization_id)
        .eq("class_id", input.classId)
        .eq("user_id", input.userId)
        .eq("role", "student")
        .maybeSingle(),
      input.authSupabase.rpc("is_class_feature_enabled", {
        target_class_id: input.classId,
        target_feature_key: "exam",
      }),
    ])

  if (canManageResult.error) throw new Error(canManageResult.error.message)
  if (membership.error) throw new Error(membership.error.message)
  if (featureEnabled.error) throw new Error(featureEnabled.error.message)
  if (!featureEnabled.data) {
    throw new Error("The exam feature is disabled for this class.")
  }

  return {
    id: classRow.id,
    classId: classRow.id,
    organizationId: classRow.organization_id,
    code: classRow.code,
    name: classRow.name,
    semester: classRow.semester,
    canManage: Boolean(canManageResult.data),
    selectedRole,
    isStudentMember: Boolean(membership.data),
    isFeatureEnabled: Boolean(featureEnabled.data),
  } satisfies ClassContext & { classId: string }
}

async function loadSelectedOrganizationRole(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
) {
  const { data: membership, error } = await supabase
    .from("organization_memberships")
    .select("id, role, selected_role_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!membership) return null

  if (membership.selected_role_id) {
    const { data: selectedRole, error: selectedRoleError } = await supabase
      .from("organization_membership_roles")
      .select("role")
      .eq("id", membership.selected_role_id)
      .eq("organization_membership_id", membership.id)
      .eq("status", "active")
      .maybeSingle()

    if (selectedRoleError) throw new Error(selectedRoleError.message)
    if (selectedRole?.role) return selectedRole.role as AppRole
  }

  return membership.role as AppRole
}

async function loadManagerExamSummaries(classId: string) {
  const admin = createServerClient()
  const exams = await loadExamsByClass(admin, classId)
  const attempts = await loadExamAttempts(
    admin,
    exams.map((exam) => exam.id),
  )

  return exams.map((exam) => toManagerExamSummary(exam, attempts))
}

async function loadStudentExamPage(input: {
  authSupabase: SupabaseClient
  classId: string
  organizationId: string
  userId: string
  selectedRole: AppRole | null
  isStudentMember: boolean
}) {
  const admin = createServerClient()

  if (input.selectedRole !== "student" || !input.isStudentMember) {
    return {
      state: "none",
      scheduledExam: null,
      activeExam: null,
      releasedResults: [],
      history: [],
    } satisfies StudentExamPageDto
  }

  const allExams = await loadExamsByClass(admin, input.classId)
  const publishedExams = allExams.filter(isExamPublished)
  const examsById = new Map(allExams.map((exam) => [exam.id, exam]))
  const attempts = await loadAttemptsForStudentByClass(
    admin,
    input.classId,
    input.userId,
  )
  const openAttempt = attempts.find(
    (attempt) => attempt.status === "in_progress",
  )
  const openAttemptExam = openAttempt
    ? (examsById.get(openAttempt.exam_id) ?? null)
    : null

  if (openAttempt && attemptExpired(openAttempt, openAttemptExam)) {
    await submitAttemptInternal({
      admin,
      attempt: openAttempt,
      userId: input.userId,
      organizationId: input.organizationId,
      autoSubmitted: true,
    })

    return loadStudentExamPage(input)
  }

  const releasedResults = await buildReleasedResults({
    admin,
    attempts,
    exams: allExams,
  })
  const history = releasedResults.map(toReleasedExamSummary)

  const selection = resolveStudentExamPageSelection({
    allExams,
    publishedExams,
    attempts,
  })
  const activeAttempt = selection.activeAttempt
  const activeExam = selection.activeExam

  if (activeExam) {
    const availableRetakeCount = activeAttempt
      ? 0
      : await loadAvailableRetakeCount(admin, activeExam.id, input.userId)
    const attemptAvailability = activeAttempt
      ? null
      : resolveExamAttemptAvailability({
          attempts: attempts.filter(
            (attempt) => attempt.exam_id === activeExam.id,
          ),
          availableRetakeCount,
        })

    return {
      state: "active",
      scheduledExam: null,
      activeExam: await buildStudentActiveExamDto({
        admin,
        exam: activeExam,
        attempt: activeAttempt ?? null,
        examModeEnabled: true,
        canStartAttempt: attemptAvailability?.canStart ?? true,
        startBlockedReason: attemptAvailability?.reason ?? null,
      }),
      releasedResults,
      history,
    } satisfies StudentExamPageDto
  }

  const scheduledExam = selection.scheduledExam
  if (scheduledExam) {
    return {
      state: "scheduled",
      scheduledExam: toScheduledExam(scheduledExam),
      activeExam: null,
      releasedResults,
      history,
    } satisfies StudentExamPageDto
  }

  return {
    state: "none",
    scheduledExam: null,
    activeExam: null,
    releasedResults,
    history,
  } satisfies StudentExamPageDto
}

async function buildStudentActiveExamDto(input: {
  admin: SupabaseClient
  exam: ExamRow
  attempt: ExamAttemptRow | null
  examModeEnabled: boolean
  canStartAttempt?: boolean
  startBlockedReason?: string | null
}) {
  const questions = await loadExamQuestions(input.admin, input.exam.id)
  const answers = input.attempt
    ? await loadExamAnswers(input.admin, [input.attempt.id])
    : []
  const answersByQuestionId = new Map(
    answers.map((answer) => [answer.exam_question_id, answer]),
  )

  return {
    id: input.exam.id,
    title: input.exam.title,
    classId: input.exam.class_id,
    durationMinutes: Number(input.exam.duration_minutes),
    totalPoints: Number(input.exam.total_points),
    questionCount: questions.length,
    startAt: input.exam.start_at,
    endAt: input.exam.end_at,
    status: normalizeExamStatus(input.exam),
    requiresPasscode: true,
    examModeEnabled: input.examModeEnabled,
    canStartAttempt: input.attempt
      ? true
      : Boolean(input.exam.passcode_hash) && (input.canStartAttempt ?? true),
    startBlockedReason: input.attempt
      ? null
      : input.exam.passcode_hash
        ? (input.startBlockedReason ?? null)
        : EXAM_PASSCODE_MISSING_MESSAGE,
    attempt: input.attempt
      ? toStudentAttemptDto(input.attempt, input.exam)
      : null,
    questions: input.attempt
      ? questions.map((question) =>
          toStudentQuestionDto(
            question,
            answersByQuestionId.get(question.id)?.answer_json ?? null,
          ),
        )
      : [],
  } satisfies StudentActiveExamDto
}

async function buildStudentReleasedResultDto(input: {
  admin: SupabaseClient
  exam: ExamRow
  attempt: ExamAttemptRow
}) {
  const questions = await loadExamQuestions(input.admin, input.exam.id)
  const answers = await loadExamAnswers(input.admin, [input.attempt.id])
  const answersByQuestionId = new Map(
    answers.map((answer) => [answer.exam_question_id, answer]),
  )

  return {
    attemptId: input.attempt.id,
    examId: input.exam.id,
    title: input.exam.title,
    status: input.attempt.status,
    totalScore: input.attempt.results_released_at
      ? Number(input.attempt.total_score ?? 0)
      : null,
    totalPoints: Number(input.exam.total_points),
    submittedAt: input.attempt.submitted_at,
    releasedAt: input.attempt.results_released_at,
    gradedAt: input.attempt.graded_at,
    isReleased: Boolean(input.attempt.results_released_at),
    needsManualReview: input.attempt.needs_manual_review,
    integrityStatus: input.attempt.integrity_status,
    questions: questions.map((question) => {
      const answer = answersByQuestionId.get(question.id)
      const isReleased = Boolean(input.attempt.results_released_at)
      const selectedOptionIndex =
        typeof answer?.answer_json === "number" ? answer.answer_json : null
      const selectedTextAnswer =
        typeof answer?.answer_json === "string" ? answer.answer_json : null
      const correctOptionIndex =
        isReleased &&
        question.question_type === "mcq" &&
        typeof question.correct_answer_json === "number"
          ? question.correct_answer_json
          : null
      const correctTextAnswer =
        isReleased &&
        question.question_type === "short" &&
        typeof question.correct_answer_json === "string" &&
        question.correct_answer_json.trim().length > 0
          ? question.correct_answer_json
          : null

      return {
        id: question.id,
        position: question.position,
        prompt: question.prompt,
        type: question.question_type,
        points: question.points,
        score: isReleased
          ? resolveAnswerScore({
              teacherScore: canTeacherGradeQuestion({
                questionType: question.question_type,
                correctAnswer: question.correct_answer_json ?? null,
              })
                ? answer?.teacher_score
                : null,
              autoScore: answer?.auto_score,
            })
          : null,
        status: isReleased
          ? getReleasedAnswerStatus(
              {
                questionType: question.question_type,
                correctAnswer: question.correct_answer_json ?? null,
              },
              answer?.answer_json ?? null,
            )
          : answer?.answer_json === null || answer?.answer_json === undefined
            ? "unanswered"
            : "reviewed",
        selectedOptionIndex,
        selectedTextAnswer,
        correctOptionIndex,
        correctTextAnswer,
      }
    }),
  } satisfies ReleasedExamResultDto
}

async function buildReleasedResults(input: {
  admin: SupabaseClient
  attempts: ExamAttemptRow[]
  exams: ExamRow[]
}) {
  const examsById = new Map(input.exams.map((exam) => [exam.id, exam]))
  const results = await Promise.all(
    input.attempts
      .filter((attempt) => Boolean(attempt.results_released_at))
      .sort(compareReleasedAttemptsDesc)
      .map(async (attempt) => {
        const exam = examsById.get(attempt.exam_id)
        if (!exam) return null

        return buildStudentReleasedResultDto({
          admin: input.admin,
          exam,
          attempt,
        })
      }),
  )

  return results.filter(
    (result): result is ReleasedExamResultDto => result !== null,
  )
}

async function submitAttemptInternal(input: {
  admin: SupabaseClient
  attempt: ExamAttemptRow
  userId: string
  organizationId: string
  autoSubmitted: boolean
}) {
  const exam = await loadExamById(
    input.admin,
    input.attempt.exam_id,
    input.attempt.class_id,
  )
  const questions = await loadExamQuestions(input.admin, input.attempt.exam_id)
  const answers = await loadExamAnswers(input.admin, [input.attempt.id])
  const answersByQuestionId = new Map(
    answers.map((answer) => [answer.exam_question_id, answer]),
  )

  let needsManualReview = false

  for (const question of questions) {
    const answer = answersByQuestionId.get(question.id)
    const evaluation = evaluateExamAnswer(
      {
        questionType: question.question_type,
        points: Number(question.points),
        correctAnswer: question.correct_answer_json ?? null,
      },
      answer?.answer_json ?? null,
    )

    if (!evaluation.gradedAutomatically) {
      needsManualReview = needsManualReview || question.question_type !== "mcq"
    }

    if (answer) {
      const { error } = await input.admin
        .from("exam_answers")
        .update({ auto_score: evaluation.autoScore })
        .eq("id", answer.id)

      if (error) throw new Error(error.message)
    } else if (evaluation.autoScore !== null) {
      const { error } = await input.admin.from("exam_answers").insert({
        organization_id: input.attempt.organization_id,
        exam_attempt_id: input.attempt.id,
        exam_question_id: question.id,
        answer_json: null,
        auto_score: evaluation.autoScore,
      })

      if (error) throw new Error(error.message)
    }
  }

  const refreshedAttempt = await finalizeAttemptScores({
    admin: input.admin,
    attemptId: input.attempt.id,
    gradedByUserId: needsManualReview ? null : input.userId,
    status: needsManualReview ? "submitted" : "graded",
    submittedAt: new Date().toISOString(),
    autoSubmittedAt: input.autoSubmitted ? new Date().toISOString() : null,
    needsManualReview,
  })

  await writeExamAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: "exam.attempt_submitted",
    entityType: "exam_attempt",
    entityId: input.attempt.id,
    payload: {
      examId: input.attempt.exam_id,
      autoSubmitted: input.autoSubmitted,
      totalScore: Number(refreshedAttempt.total_score ?? 0),
      needsManualReview,
    },
  })

  return refreshedAttempt
}

async function finalizeAttemptScores(input: {
  admin: SupabaseClient
  attemptId: string
  gradedByUserId?: string | null
  status?: ExamAttemptStatus
  submittedAt?: string
  autoSubmittedAt?: string | null
  needsManualReview?: boolean
  maybeReleaseImmediately?: boolean
  releaseByUserId?: string
}) {
  const attempt = await loadAttemptById(input.admin, input.attemptId)
  const exam = await loadExamById(
    input.admin,
    attempt.exam_id,
    attempt.class_id,
  )
  const questions = await loadExamQuestions(input.admin, attempt.exam_id)
  const answers = await loadExamAnswers(input.admin, [attempt.id])
  const answersByQuestionId = new Map(
    answers.map((answer) => [answer.exam_question_id, answer]),
  )

  const totalScore = questions.reduce((sum, question) => {
    const answer = answersByQuestionId.get(question.id)
    const nextScore = resolveAnswerScore({
      teacherScore: canTeacherGradeQuestion({
        questionType: question.question_type,
        correctAnswer: question.correct_answer_json ?? null,
      })
        ? answer?.teacher_score
        : null,
      autoScore: answer?.auto_score,
    })
    return sum + nextScore
  }, 0)

  const nextStatus =
    input.status ??
    (input.needsManualReview
      ? "submitted"
      : totalScore >= Number(exam.total_points)
        ? "graded"
        : "graded")
  const releasedAt = input.maybeReleaseImmediately
    ? new Date().toISOString()
    : null

  return runSchemaCompatible(
    "attempts",
    async () => {
      const { data, error } = await input.admin
        .from("exam_attempts")
        .update({
          total_score: totalScore,
          status: nextStatus,
          submitted_at: input.submittedAt ?? attempt.submitted_at,
          auto_submitted_at: input.autoSubmittedAt ?? attempt.auto_submitted_at,
          needs_manual_review:
            input.needsManualReview ?? attempt.needs_manual_review,
          graded_at:
            input.gradedByUserId === undefined
              ? attempt.graded_at
              : nextStatus === "graded"
                ? new Date().toISOString()
                : null,
          graded_by_user_id:
            input.gradedByUserId === undefined
              ? attempt.graded_by_user_id
              : nextStatus === "graded"
                ? input.gradedByUserId
                : null,
          results_released_at: releasedAt ?? attempt.results_released_at,
          results_released_by_user_id:
            releasedAt && input.releaseByUserId
              ? input.releaseByUserId
              : attempt.results_released_by_user_id,
        })
        .eq("id", attempt.id)
        .select(ATTEMPT_SELECT_EXTENDED)
        .single()

      if (error || !data) {
        throw new Error(error?.message ?? "Could not finalize attempt.")
      }

      return normalizeAttemptRow(
        {
          ...(data as RawRow),
          attempt_number: attempt.attempt_number,
        },
        attempt.attempt_number,
      )
    },
    async () => {
      const { data, error } = await input.admin
        .from("exam_attempts")
        .update({
          total_score: totalScore,
          status: nextStatus,
          submitted_at: input.submittedAt ?? attempt.submitted_at,
        })
        .eq("id", attempt.id)
        .select(ATTEMPT_SELECT_BASE)
        .single()

      if (error || !data) {
        throw new Error(error?.message ?? "Could not finalize attempt.")
      }

      return normalizeAttemptRow(
        {
          ...(data as RawRow),
          attempt_number: attempt.attempt_number,
          deadline_at: attempt.deadline_at,
          rules_snapshot_json: attempt.rules_snapshot_json,
          needs_manual_review:
            input.needsManualReview ?? attempt.needs_manual_review,
          auto_submitted_at: input.autoSubmittedAt ?? attempt.auto_submitted_at,
          integrity_status: attempt.integrity_status,
          graded_at:
            input.gradedByUserId && nextStatus === "graded"
              ? new Date().toISOString()
              : attempt.graded_at,
          graded_by_user_id:
            input.gradedByUserId && nextStatus === "graded"
              ? input.gradedByUserId
              : attempt.graded_by_user_id,
          results_released_at: releasedAt ?? attempt.results_released_at,
          results_released_by_user_id:
            releasedAt && input.releaseByUserId
              ? input.releaseByUserId
              : attempt.results_released_by_user_id,
        },
        attempt.attempt_number,
      )
    },
  )
}

async function replaceExamQuestions(input: {
  admin: SupabaseClient
  examId: string
  organizationId: string
  questions: UpsertExamInput["questions"]
}) {
  const { error: deleteError } = await input.admin
    .from("exam_questions")
    .delete()
    .eq("exam_id", input.examId)

  if (deleteError) throw new Error(deleteError.message)

  const rows = input.questions.map((question, index) => ({
    organization_id: input.organizationId,
    exam_id: input.examId,
    position: index + 1,
    question_type: question.type,
    prompt: question.prompt,
    options_json: question.type === "mcq" ? question.options : null,
    correct_answer_json: question.correctAnswer,
    points: question.points,
    language: null,
    starter_code: null,
    visible_tests_json: [],
    hidden_tests_json: [],
    evaluator_key: null,
  }))
  await runSchemaCompatible(
    "questions",
    async () => {
      const { error } = await input.admin.from("exam_questions").insert(rows)
      if (error) throw new Error(error.message)
    },
    async () => {
      const { error } = await input.admin.from("exam_questions").insert(
        rows.map((row) => ({
          organization_id: row.organization_id,
          exam_id: row.exam_id,
          position: row.position,
          question_type: row.question_type,
          prompt: row.prompt,
          options_json: row.options_json,
          correct_answer_json: row.correct_answer_json,
          points: row.points,
          language: row.language,
          starter_code: row.starter_code,
        })),
      )

      if (error) throw new Error(error.message)
    },
  )
}

async function buildManagerExamDetailResponse(
  admin: SupabaseClient,
  exam: ExamRow,
) {
  const questions = await loadExamQuestions(admin, exam.id)
  const attempts = await loadExamAttempts(admin, [exam.id])
  const answers = await loadExamAnswers(
    admin,
    attempts.map((attempt) => attempt.id),
  )
  const integrityEventsByAttemptId = await loadAttemptIntegrityEvents(
    admin,
    attempts.map((attempt) => attempt.id),
  )
  const profiles = await loadProfiles(
    admin,
    attempts.map((attempt) => attempt.student_user_id),
  )
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))
  const availableRetakeCounts = await loadAvailableRetakeCounts(
    admin,
    exam.id,
    attempts.map((attempt) => attempt.student_user_id),
  )

  return {
    exam: {
      ...toManagerExamSummary(exam, attempts),
      classId: exam.class_id,
      organizationId: exam.organization_id,
      createdByUserId: exam.created_by_user_id,
      passcodeProtected: Boolean(exam.passcode_hash),
    },
    questions: questions.map(toManagerQuestionDto),
    attempts: attempts.map((attempt) =>
      toManagerAttemptSummary(
        attempt,
        profilesById.get(attempt.student_user_id) ?? null,
        answers.filter((answer) => answer.exam_attempt_id === attempt.id),
        integrityEventsByAttemptId.get(attempt.id) ?? [],
        availableRetakeCounts.get(attempt.student_user_id) ?? 0,
      ),
    ),
  } satisfies ManagerExamDetailDto
}

async function runSchemaCompatible<T>(
  target: SchemaTarget,
  runExtended: () => Promise<T>,
  runBase: () => Promise<T>,
) {
  if (schemaModes[target] === "base") {
    return runBase()
  }

  try {
    const result = await runExtended()
    schemaModes[target] = "extended"
    return result
  } catch (error) {
    if (!isMissingSchemaColumnError(error, target)) {
      throw error
    }

    schemaModes[target] = "base"
    return runBase()
  }
}

function isMissingSchemaColumnError(
  error: unknown,
  target: SchemaTarget,
): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase()

  return (
    (message.includes("does not exist") || message.includes("schema cache")) &&
    compatibilityColumns[target].some((column) =>
      message.includes(column.toLowerCase()),
    )
  )
}

function normalizeExamRows(
  rows: RawRow[],
  publishedAtByExamId = new Map<string, string | null>(),
  passcodeHashesByExamId = new Map<string, string | null>(),
) {
  return rows.map((row) =>
    normalizeExamRow(
      row,
      publishedAtByExamId.get(readRequiredString(row.id, "Exam id")) ?? null,
      passcodeHashesByExamId.get(readRequiredString(row.id, "Exam id")) ?? null,
    ),
  )
}

function normalizeExamRow(
  row: RawRow,
  publishedAtOverride: string | null = null,
  passcodeHashOverride: string | null = null,
): ExamRow {
  const createdAt = readString(row.created_at) ?? new Date(0).toISOString()
  const startAt = readString(row.start_at)
  const status = readExamStatus(row.status)

  return {
    id: readRequiredString(row.id, "Exam id"),
    organization_id: readRequiredString(
      row.organization_id,
      "Exam organization_id",
    ),
    class_id: readRequiredString(row.class_id, "Exam class_id"),
    title: readRequiredString(row.title, "Exam title"),
    duration_minutes: readNumber(row.duration_minutes),
    total_points: readNumber(row.total_points),
    start_at: startAt,
    end_at: readString(row.end_at),
    status,
    created_by_user_id: readString(row.created_by_user_id),
    published_at:
      readString(row.published_at) ??
      publishedAtOverride ??
      deriveLegacyPublishedAt({
        status,
        startAt,
        createdAt,
      }),
    passcode_hash: readString(row.passcode_hash) ?? passcodeHashOverride,
    rules_override_json: readJsonRecord(row.rules_override_json),
    created_at: createdAt,
    updated_at: readString(row.updated_at) ?? createdAt,
  }
}

function normalizeQuestionRows(rows: RawRow[]) {
  return rows.map(normalizeQuestionRow)
}

function normalizeQuestionRow(row: RawRow): ExamQuestionRow {
  const createdAt = readString(row.created_at) ?? new Date(0).toISOString()

  return {
    id: readRequiredString(row.id, "Question id"),
    organization_id: readRequiredString(
      row.organization_id,
      "Question organization_id",
    ),
    exam_id: readRequiredString(row.exam_id, "Question exam_id"),
    position: readNumber(row.position),
    question_type: readQuestionKind(row.question_type),
    prompt: readRequiredString(row.prompt, "Question prompt"),
    options_json: readJsonArray(row.options_json),
    correct_answer_json: readJsonValue(row.correct_answer_json),
    points: readNumber(row.points),
    language: readString(row.language),
    starter_code: readString(row.starter_code),
    visible_tests_json: readJsonArray(row.visible_tests_json),
    hidden_tests_json: readJsonArray(row.hidden_tests_json),
    evaluator_key: readString(row.evaluator_key),
    created_at: createdAt,
    updated_at: readString(row.updated_at) ?? createdAt,
  }
}

function normalizeAttemptRows(
  rows: RawRow[],
  releasedAtByAttemptId = new Map<string, string | null>(),
) {
  const attemptNumbers = new Map<string, number>()
  const sequences = new Map<string, number>()

  for (const row of [...rows].sort(compareRawAttemptsByCreatedAsc)) {
    const id = readRequiredString(row.id, "Attempt id")
    const explicitAttemptNumber = readOptionalNumber(row.attempt_number)
    if (explicitAttemptNumber !== null) {
      attemptNumbers.set(id, explicitAttemptNumber)
      continue
    }

    const key = `${readRequiredString(row.exam_id, "Attempt exam_id")}::${readRequiredString(row.student_user_id, "Attempt student_user_id")}`
    const nextAttemptNumber = (sequences.get(key) ?? 0) + 1
    sequences.set(key, nextAttemptNumber)
    attemptNumbers.set(id, nextAttemptNumber)
  }

  return rows.map((row) =>
    normalizeAttemptRow(
      row,
      attemptNumbers.get(readRequiredString(row.id, "Attempt id")) ?? 1,
      releasedAtByAttemptId.get(readRequiredString(row.id, "Attempt id")) ??
        null,
    ),
  )
}

function normalizeAttemptRow(
  row: RawRow,
  fallbackAttemptNumber = 1,
  releasedAtOverride: string | null = null,
): ExamAttemptRow {
  const createdAt = readString(row.created_at) ?? new Date(0).toISOString()
  const updatedAt = readString(row.updated_at) ?? createdAt
  const status = readAttemptStatus(row.status)
  const submittedAt = readString(row.submitted_at)
  const gradedAt =
    readString(row.graded_at) ??
    (status === "graded" ? (submittedAt ?? updatedAt) : null)
  const releasedAt = readString(row.results_released_at) ?? releasedAtOverride

  return {
    id: readRequiredString(row.id, "Attempt id"),
    organization_id: readRequiredString(
      row.organization_id,
      "Attempt organization_id",
    ),
    class_id: readRequiredString(row.class_id, "Attempt class_id"),
    exam_id: readRequiredString(row.exam_id, "Attempt exam_id"),
    student_user_id: readRequiredString(
      row.student_user_id,
      "Attempt student_user_id",
    ),
    status,
    started_at: readString(row.started_at),
    submitted_at: submittedAt,
    total_score: readOptionalNumber(row.total_score),
    attempt_number:
      readOptionalNumber(row.attempt_number) ?? fallbackAttemptNumber,
    deadline_at: readString(row.deadline_at),
    rules_snapshot_json: readJsonRecord(row.rules_snapshot_json),
    needs_manual_review:
      readBoolean(row.needs_manual_review) ?? status === "submitted",
    auto_submitted_at: readString(row.auto_submitted_at),
    integrity_status: readIntegrityStatus(row.integrity_status, status),
    flagged_at: readString(row.flagged_at),
    flagged_by_user_id: readString(row.flagged_by_user_id),
    flag_reason: readString(row.flag_reason),
    voided_at:
      readString(row.voided_at) ??
      (status === "voided" ? (submittedAt ?? updatedAt) : null),
    voided_by_user_id: readString(row.voided_by_user_id),
    void_reason: readString(row.void_reason),
    graded_at: gradedAt,
    graded_by_user_id: readString(row.graded_by_user_id),
    results_released_at: releasedAt,
    results_released_by_user_id: readString(row.results_released_by_user_id),
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

async function loadExamsByClass(admin: SupabaseClient, classId: string) {
  const rows = await loadExamRowsWithCompatibility(admin, (select) =>
    admin
      .from("exams")
      .select(select)
      .eq("class_id", classId)
      .order("start_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  )
  const publishedAtByExamId = await loadExamPublishedAtById(admin, rows)
  const passcodeHashesByExamId = await loadExamPasscodeHashesByExamId(
    admin,
    rows,
  )

  return normalizeExamRows(rows, publishedAtByExamId, passcodeHashesByExamId)
}

async function loadExamById(
  admin: SupabaseClient,
  examId: string,
  classId: string,
) {
  const rows = await loadExamRowsWithCompatibility(
    admin,
    (select) =>
      admin
        .from("exams")
        .select(select)
        .eq("id", examId)
        .eq("class_id", classId),
    {
      single: true,
    },
  )
  const [row] = rows
  if (!row) throw new Error("Exam not found.")

  const publishedAtByExamId = await loadExamPublishedAtById(admin, rows)
  const passcodeHashesByExamId = await loadExamPasscodeHashesByExamId(
    admin,
    rows,
  )
  return normalizeExamRow(
    row,
    publishedAtByExamId.get(examId) ?? null,
    passcodeHashesByExamId.get(examId) ?? null,
  )
}

async function loadExamRowsWithCompatibility(
  admin: SupabaseClient,
  buildQuery: (select: string) => any,
  options?: {
    single?: boolean
  },
) {
  const candidates = getExamSelectCandidates()
  let lastError: Error | null = null

  for (const candidate of candidates) {
    try {
      const query = buildQuery(candidate.select)
      const response = (
        options?.single ? await query.maybeSingle() : await query
      ) as {
        data: unknown
        error: { message?: string } | null
      }

      if (response.error) {
        throw new Error(response.error.message ?? "Could not load exams.")
      }

      const rawData = response.data
      examSelectMode = candidate.mode
      if (options?.single) {
        return rawData ? [rawData as RawRow] : []
      }

      return (rawData ?? []) as RawRow[]
    } catch (error) {
      if (!isMissingSchemaColumnError(error, "exams")) {
        throw error
      }

      lastError =
        error instanceof Error ? error : new Error("Could not load exams.")
    }
  }

  if (lastError) throw lastError
  return [] as RawRow[]
}

function getExamSelectCandidates() {
  if (examSelectMode === "extended") {
    return examSelectCandidates
  }

  if (examSelectMode === "settings") {
    return [
      examSelectCandidates[1],
      examSelectCandidates[2],
      examSelectCandidates[0],
    ]
  }

  if (examSelectMode === "base") {
    return [
      examSelectCandidates[2],
      examSelectCandidates[1],
      examSelectCandidates[0],
    ]
  }

  return examSelectCandidates
}

async function loadExamPublishedAtById(admin: SupabaseClient, rows: RawRow[]) {
  const needsFallback = rows.some(
    (row) => readString(row.published_at) === null,
  )
  if (!needsFallback) {
    return new Map<string, string | null>()
  }

  const examIds = rows
    .map((row) => readString(row.id))
    .filter((value): value is string => Boolean(value))

  if (examIds.length === 0) {
    return new Map<string, string | null>()
  }

  const { data, error } = await admin
    .from("audit_logs")
    .select("entity_id, created_at, payload")
    .eq("entity_type", "exam")
    .eq("action", "exam.published")
    .in("entity_id", examIds)
    .order("created_at", { ascending: false })

  if (error) {
    const errorMessage =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : "Could not load exam publish records."
    throw new Error(errorMessage)
  }

  const publishedAtByExamId = new Map<string, string | null>()

  for (const row of (data ?? []) as RawRow[]) {
    const entityId = readString(row.entity_id)
    if (!entityId || publishedAtByExamId.has(entityId)) continue

    const payload = readJsonRecord(row.payload)
    publishedAtByExamId.set(
      entityId,
      readString(payload.publishedAt) ?? readString(row.created_at),
    )
  }

  const missingExamIds = examIds.filter(
    (examId) => !publishedAtByExamId.has(examId),
  )
  if (missingExamIds.length === 0) {
    return publishedAtByExamId
  }

  const { data: attemptRows, error: attemptError } = await admin
    .from("exam_attempts")
    .select("exam_id, created_at")
    .in("exam_id", missingExamIds)
    .order("created_at", { ascending: true })

  if (attemptError) {
    throw new Error(attemptError.message)
  }

  const examRowsById = new Map(
    rows
      .map((row) => {
        const examId = readString(row.id)
        return examId ? ([examId, row] as const) : null
      })
      .filter((entry): entry is readonly [string, RawRow] => entry !== null),
  )

  for (const row of (attemptRows ?? []) as RawRow[]) {
    const examId = readString(row.exam_id)
    if (!examId || publishedAtByExamId.has(examId)) continue

    const examRow = examRowsById.get(examId)
    publishedAtByExamId.set(
      examId,
      readString(examRow?.start_at) ??
        readString(row.created_at) ??
        readString(examRow?.created_at),
    )
  }

  return publishedAtByExamId
}

async function loadExamPasscodeHashesByExamId(
  admin: SupabaseClient,
  rows: RawRow[],
) {
  const needsFallback = rows.some(
    (row) => readString(row.passcode_hash) === null,
  )
  if (!needsFallback) {
    return new Map<string, string | null>()
  }

  const examIds = rows
    .map((row) => readString(row.id))
    .filter((value): value is string => Boolean(value))
  const classIds = Array.from(
    new Set(
      rows
        .map((row) => readString(row.class_id))
        .filter((value): value is string => Boolean(value)),
    ),
  )

  if (examIds.length === 0 || classIds.length === 0) {
    return new Map<string, string | null>()
  }

  const { data, error } = await admin
    .from("class_feature_settings")
    .select("class_id, config")
    .eq("feature_key", EXAM_FEATURE_KEY)
    .in("class_id", classIds)

  if (error) {
    throw new Error(error.message)
  }

  const passcodeHashesByExamId = new Map<string, string | null>()

  for (const row of (data ?? []) as RawRow[]) {
    const config = readJsonRecord(row.config)
    const passcodeHashes = readExamPasscodeHashesFromConfig(config)

    for (const examId of examIds) {
      const passcodeHash = passcodeHashes[examId]
      if (typeof passcodeHash === "string" && passcodeHash.length > 0) {
        passcodeHashesByExamId.set(examId, passcodeHash)
      }
    }
  }

  return passcodeHashesByExamId
}

async function loadExamQuestions(admin: SupabaseClient, examId: string) {
  return runSchemaCompatible(
    "questions",
    async () => {
      const { data, error } = await admin
        .from("exam_questions")
        .select(QUESTION_SELECT_EXTENDED)
        .eq("exam_id", examId)
        .order("position", { ascending: true })

      if (error) throw new Error(error.message)
      return normalizeQuestionRows((data ?? []) as RawRow[])
    },
    async () => {
      const { data, error } = await admin
        .from("exam_questions")
        .select(QUESTION_SELECT_BASE)
        .eq("exam_id", examId)
        .order("position", { ascending: true })

      if (error) throw new Error(error.message)
      return normalizeQuestionRows((data ?? []) as RawRow[])
    },
  )
}

async function loadQuestionById(admin: SupabaseClient, questionId: string) {
  return runSchemaCompatible(
    "questions",
    async () => {
      const { data, error } = await admin
        .from("exam_questions")
        .select(QUESTION_SELECT_EXTENDED)
        .eq("id", questionId)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) throw new Error("Question not found.")
      return normalizeQuestionRow(data as RawRow)
    },
    async () => {
      const { data, error } = await admin
        .from("exam_questions")
        .select(QUESTION_SELECT_BASE)
        .eq("id", questionId)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) throw new Error("Question not found.")
      return normalizeQuestionRow(data as RawRow)
    },
  )
}

async function loadExamAttempts(admin: SupabaseClient, examIds: string[]) {
  if (examIds.length === 0) return [] as ExamAttemptRow[]

  return runSchemaCompatible(
    "attempts",
    async () => {
      const { data, error } = await admin
        .from("exam_attempts")
        .select(ATTEMPT_SELECT_EXTENDED)
        .in("exam_id", examIds)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)
      const rows = (data ?? []) as RawRow[]
      const releasedAtByAttemptId = await loadAttemptReleasedAtById(admin, rows)
      return normalizeAttemptRows(rows, releasedAtByAttemptId)
    },
    async () => {
      const { data, error } = await admin
        .from("exam_attempts")
        .select(ATTEMPT_SELECT_BASE)
        .in("exam_id", examIds)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)
      const rows = (data ?? []) as RawRow[]
      const releasedAtByAttemptId = await loadAttemptReleasedAtById(admin, rows)
      return normalizeAttemptRows(rows, releasedAtByAttemptId)
    },
  )
}

async function loadExamAttemptsForStudent(
  admin: SupabaseClient,
  examId: string,
  userId: string,
) {
  return runSchemaCompatible(
    "attempts",
    async () => {
      const { data, error } = await admin
        .from("exam_attempts")
        .select(ATTEMPT_SELECT_EXTENDED)
        .eq("exam_id", examId)
        .eq("student_user_id", userId)
        .order("attempt_number", { ascending: false })

      if (error) throw new Error(error.message)
      const rows = (data ?? []) as RawRow[]
      const releasedAtByAttemptId = await loadAttemptReleasedAtById(admin, rows)
      return normalizeAttemptRows(rows, releasedAtByAttemptId)
    },
    async () => {
      const { data, error } = await admin
        .from("exam_attempts")
        .select(ATTEMPT_SELECT_BASE)
        .eq("exam_id", examId)
        .eq("student_user_id", userId)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)
      const rows = (data ?? []) as RawRow[]
      const releasedAtByAttemptId = await loadAttemptReleasedAtById(admin, rows)
      return normalizeAttemptRows(rows, releasedAtByAttemptId)
    },
  )
}

async function loadAttemptsForStudentByClass(
  admin: SupabaseClient,
  classId: string,
  userId: string,
) {
  return runSchemaCompatible(
    "attempts",
    async () => {
      const { data, error } = await admin
        .from("exam_attempts")
        .select(ATTEMPT_SELECT_EXTENDED)
        .eq("class_id", classId)
        .eq("student_user_id", userId)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)
      const rows = (data ?? []) as RawRow[]
      const releasedAtByAttemptId = await loadAttemptReleasedAtById(admin, rows)
      return normalizeAttemptRows(rows, releasedAtByAttemptId)
    },
    async () => {
      const { data, error } = await admin
        .from("exam_attempts")
        .select(ATTEMPT_SELECT_BASE)
        .eq("class_id", classId)
        .eq("student_user_id", userId)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)
      const rows = (data ?? []) as RawRow[]
      const releasedAtByAttemptId = await loadAttemptReleasedAtById(admin, rows)
      return normalizeAttemptRows(rows, releasedAtByAttemptId)
    },
  )
}

async function loadAttemptById(admin: SupabaseClient, attemptId: string) {
  return runSchemaCompatible(
    "attempts",
    async () => {
      const { data, error } = await admin
        .from("exam_attempts")
        .select(ATTEMPT_SELECT_EXTENDED)
        .eq("id", attemptId)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) throw new Error("Attempt not found.")
      const releasedAtByAttemptId = await loadAttemptReleasedAtById(admin, [
        data as RawRow,
      ])
      return normalizeAttemptRow(
        data as RawRow,
        1,
        releasedAtByAttemptId.get(attemptId) ?? null,
      )
    },
    async () => {
      const { data, error } = await admin
        .from("exam_attempts")
        .select(ATTEMPT_SELECT_BASE)
        .eq("id", attemptId)
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) throw new Error("Attempt not found.")
      const releasedAtByAttemptId = await loadAttemptReleasedAtById(admin, [
        data as RawRow,
      ])
      return normalizeAttemptRow(
        data as RawRow,
        1,
        releasedAtByAttemptId.get(attemptId) ?? null,
      )
    },
  )
}

async function loadExamAnswers(admin: SupabaseClient, attemptIds: string[]) {
  if (attemptIds.length === 0) return [] as ExamAnswerRow[]

  const { data, error } = await admin
    .from("exam_answers")
    .select(
      "id, organization_id, exam_attempt_id, exam_question_id, answer_json, auto_score, teacher_score, created_at, updated_at",
    )
    .in("exam_attempt_id", attemptIds)

  if (error) throw new Error(error.message)
  return (data ?? []) as ExamAnswerRow[]
}

async function loadProfiles(admin: SupabaseClient, userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds))
  if (uniqueUserIds.length === 0) return [] as ProfileRow[]

  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name, email")
    .in("id", uniqueUserIds)

  if (error) throw new Error(error.message)
  return (data ?? []) as ProfileRow[]
}

async function loadAttemptIntegrityEvents(
  admin: SupabaseClient,
  attemptIds: string[],
) {
  const uniqueAttemptIds = Array.from(new Set(attemptIds.filter(Boolean)))
  if (uniqueAttemptIds.length === 0) {
    return new Map<string, ManagerIntegrityEventDto[]>()
  }

  const { data, error } = await admin
    .from("audit_logs")
    .select("entity_id, created_at, payload")
    .eq("entity_type", "exam_attempt")
    .eq("action", "exam.attempt_event")
    .in("entity_id", uniqueAttemptIds)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  const eventsByAttemptId = new Map<string, ManagerIntegrityEventDto[]>()

  for (const row of (data ?? []) as RawRow[]) {
    const attemptId = readString(row.entity_id)
    if (!attemptId) continue

    const payload = readJsonRecord(row.payload)
    const events = eventsByAttemptId.get(attemptId) ?? []
    events.push({
      key: `${attemptId}:${readString(row.created_at) ?? new Date(0).toISOString()}:${readString(payload.eventType) ?? "event"}`,
      eventType: readString(payload.eventType) ?? "event",
      createdAt: readString(row.created_at) ?? new Date(0).toISOString(),
      payload: readJsonRecord(payload.payload),
    })
    eventsByAttemptId.set(attemptId, events)
  }

  return eventsByAttemptId
}

async function loadPasscodeFailureAuditRows(input: {
  admin: SupabaseClient
  examId: string
  studentUserId: string
}) {
  const since = new Date(Date.now() - EXAM_PASSCODE_COOLDOWN_MS).toISOString()
  const { data, error } = await input.admin
    .from("audit_logs")
    .select("created_at")
    .eq("entity_type", "exam")
    .eq("entity_id", input.examId)
    .eq("actor_user_id", input.studentUserId)
    .eq("action", "exam.passcode_failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []) as Array<{
    created_at: string
  }>
}

async function loadAttemptReleasedAtById(
  admin: SupabaseClient,
  rows: RawRow[],
) {
  const attemptIds = Array.from(
    new Set(
      rows
        .map((row) => readString(row.id))
        .filter((attemptId): attemptId is string => Boolean(attemptId)),
    ),
  )

  const releasedAtByAttemptId = new Map<string, string | null>()

  if (attemptIds.length === 0) {
    return releasedAtByAttemptId
  }

  const { data, error } = await admin
    .from("audit_logs")
    .select("entity_id, created_at, payload")
    .eq("entity_type", "exam_attempt")
    .eq("action", "exam.results_released")
    .in("entity_id", attemptIds)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  for (const row of (data ?? []) as RawRow[]) {
    const attemptId = readString(row.entity_id)
    if (!attemptId || releasedAtByAttemptId.has(attemptId)) continue

    const payload = readJsonRecord(row.payload)
    releasedAtByAttemptId.set(
      attemptId,
      readString(payload.releasedAt) ?? readString(row.created_at),
    )
  }

  return releasedAtByAttemptId
}

async function loadAvailableRetakeCount(
  admin: SupabaseClient,
  examId: string,
  studentUserId: string,
) {
  return (
    (await loadAvailableRetakeCounts(admin, examId, [studentUserId])).get(
      studentUserId,
    ) ?? 0
  )
}

async function loadAvailableRetakeCounts(
  admin: SupabaseClient,
  examId: string,
  studentUserIds: string[],
) {
  const uniqueStudentUserIds = Array.from(
    new Set(studentUserIds.filter(Boolean)),
  )
  const counts = new Map(uniqueStudentUserIds.map((userId) => [userId, 0]))

  if (uniqueStudentUserIds.length === 0) {
    return counts
  }

  const { data, error } = await admin
    .from("audit_logs")
    .select("action, payload, created_at")
    .eq("entity_type", "exam")
    .eq("entity_id", examId)
    .in("action", ["exam.retake_granted", "exam.retake_consumed"])
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  for (const row of (data ?? []) as RawRow[]) {
    const payload = readJsonRecord(row.payload)
    const studentUserId = readString(payload.studentUserId)
    if (!studentUserId || !counts.has(studentUserId)) continue

    const action = readString((row as RawRow).action)
    const currentCount = counts.get(studentUserId) ?? 0
    counts.set(
      studentUserId,
      action === "exam.retake_consumed"
        ? Math.max(0, currentCount - 1)
        : currentCount + 1,
    )
  }

  return counts
}

function readRequiredString(value: unknown, label: string) {
  if (typeof value === "string" && value.length > 0) return value
  throw new Error(`${label} is missing.`)
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null
}

function readNumber(value: unknown) {
  const numericValue = readOptionalNumber(value)
  return numericValue ?? 0
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : null
  }

  return null
}

function readJsonArray(value: unknown) {
  return Array.isArray(value) ? (value as JsonValue[]) : null
}

function readJsonValue(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    Array.isArray(value) ||
    isRecord(value)
  ) {
    return value as JsonValue
  }

  return null
}

function readJsonRecord(value: unknown) {
  return isRecord(value) ? (value as Record<string, JsonValue>) : {}
}

function readExamStatus(value: unknown): ExamStatus {
  return value === "live" || value === "ended" ? value : "upcoming"
}

function readQuestionKind(value: unknown): ExamQuestionKind {
  return value === "short" ? "short" : "mcq"
}

function readAttemptStatus(value: unknown): ExamAttemptStatus {
  if (value === "submitted" || value === "graded" || value === "voided") {
    return value
  }

  return "in_progress"
}

function readIntegrityStatus(
  value: unknown,
  status: ExamAttemptStatus,
): ExamIntegrityStatus {
  if (
    value === "clear" ||
    value === "reported" ||
    value === "flagged" ||
    value === "voided"
  ) {
    return value
  }

  if (status === "voided") return "voided"
  return "clear"
}

function deriveLegacyPublishedAt(input: {
  status: ExamStatus
  startAt: string | null
  createdAt: string
}) {
  if (input.status === "live" || input.status === "ended") {
    return input.startAt ?? input.createdAt
  }

  return null
}

function isExamPublished<TExam extends Pick<ExamRow, "published_at">>(
  exam: TExam,
) {
  return Boolean(exam.published_at)
}

function compareRawAttemptsByCreatedAsc(left: RawRow, right: RawRow) {
  return (
    Date.parse(readString(left.created_at) ?? new Date(0).toISOString()) -
    Date.parse(readString(right.created_at) ?? new Date(0).toISOString())
  )
}

function toManagerExamSummary(
  exam: ExamRow,
  attempts: ExamAttemptRow[],
): ManagerExamSummaryDto {
  const examAttempts = attempts.filter((attempt) => attempt.exam_id === exam.id)
  const enteredStudentIds = new Set(
    examAttempts.map((attempt) => attempt.student_user_id),
  )
  const releasedStudentIds = new Set(
    examAttempts
      .filter((attempt) => Boolean(attempt.results_released_at))
      .map((attempt) => attempt.student_user_id),
  )

  return {
    id: exam.id,
    title: exam.title,
    durationMinutes: Number(exam.duration_minutes),
    totalPoints: Number(exam.total_points),
    startAt: exam.start_at,
    endAt: exam.end_at,
    status: normalizeExamStatus(exam),
    publishedAt: exam.published_at,
    createdAt: exam.created_at,
    updatedAt: exam.updated_at,
    attemptCounts: {
      inProgress: examAttempts.filter(
        (attempt) => attempt.status === "in_progress",
      ).length,
      submitted: examAttempts.filter(
        (attempt) => attempt.status === "submitted",
      ).length,
      graded: examAttempts.filter((attempt) => attempt.status === "graded")
        .length,
      released: examAttempts.filter((attempt) => attempt.results_released_at)
        .length,
    },
    enteredStudentCount: enteredStudentIds.size,
    releasedStudentCount: releasedStudentIds.size,
  }
}

function toManagerQuestionDto(question: ExamQuestionRow): ManagerQuestionDto {
  return {
    id: question.id,
    position: question.position,
    type: question.question_type,
    prompt: question.prompt,
    options: toStringArray(question.options_json),
    points: Number(question.points),
    correctAnswer: question.correct_answer_json ?? null,
  }
}

export function toStudentQuestionDto(
  question: ExamQuestionRow,
  savedAnswer: JsonValue | null,
): StudentQuestionDto {
  return {
    id: question.id,
    position: question.position,
    type: question.question_type,
    prompt: question.prompt,
    options: toStringArray(question.options_json),
    points: Number(question.points),
    savedAnswer,
  }
}

function toStudentAttemptDto(
  attempt: ExamAttemptRow,
  exam: Pick<ExamRow, "duration_minutes" | "end_at">,
): StudentAttemptDto {
  const deadlineAt = getAttemptDeadline(attempt, exam)
  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.started_at ?? attempt.created_at,
    submittedAt: attempt.submitted_at,
    deadlineAt,
    timeLeftSeconds: Math.max(
      0,
      Math.floor((Date.parse(deadlineAt) - Date.now()) / 1000),
    ),
    attemptNumber: attempt.attempt_number,
    needsManualReview: attempt.needs_manual_review,
    integrityStatus: attempt.integrity_status,
  }
}

function toManagerAttemptSummary(
  attempt: ExamAttemptRow,
  profile: ProfileRow | null,
  answers: ExamAnswerRow[],
  integrityEvents: ManagerIntegrityEventDto[],
  availableRetakeCount: number,
): ManagerAttemptSummaryDto {
  return {
    id: attempt.id,
    studentUserId: attempt.student_user_id,
    studentDisplayName: profile?.display_name ?? "Unknown student",
    studentEmail: profile?.email ?? "",
    status: attempt.status,
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at,
    totalScore:
      attempt.total_score === null ? null : Number(attempt.total_score),
    attemptNumber: attempt.attempt_number,
    needsManualReview: attempt.needs_manual_review,
    integrityStatus: attempt.integrity_status,
    resultsReleasedAt: attempt.results_released_at,
    availableRetakeCount,
    answers: answers.map((answer) => ({
      id: answer.id,
      questionId: answer.exam_question_id,
      answer: answer.answer_json,
      autoScore: answer.auto_score === null ? null : Number(answer.auto_score),
      teacherScore:
        answer.teacher_score === null ? null : Number(answer.teacher_score),
    })),
    integrityEvents,
  }
}

const RETAKE_REQUIRED_MESSAGE =
  "A teacher must grant a retake before you can start this exam again."

export function normalizeExamStatus<
  TExam extends Pick<ExamRow, "published_at" | "start_at" | "end_at">,
>(exam: TExam, now = Date.now()): ExamStatus {
  if (!exam.published_at) return "upcoming"

  if (exam.end_at && Date.parse(exam.end_at) <= now) return "ended"
  if (!exam.start_at || Date.parse(exam.start_at) <= now) return "live"
  return "upcoming"
}

function ensurePublishedExam(exam: ExamRow) {
  if (!isExamPublished(exam)) {
    throw new Error("Exam not found.")
  }
}

async function ensureExamCanStart(exam: ExamRow) {
  const status = normalizeExamStatus(exam)
  if (status === "upcoming") {
    throw new Error("This exam has not started yet.")
  }
  if (status === "ended") {
    throw new Error("This exam is no longer active.")
  }
}

export function isExamPasscodeValid(
  passcodeHash: string | null,
  passcode: string,
) {
  if (!passcodeHash) return false
  const inputPasscodeHash = hashPasscode(passcode)

  if (!inputPasscodeHash) {
    return false
  }

  return safeCompareHex(passcodeHash, inputPasscodeHash)
}

export function hashExamPasscode(passcode: string | undefined): string {
  return hashPasscode(requireExamPasscode(passcode))!
}

export function resolveExamPasscodeHash(input: {
  existingPasscodeHash: string | null
  nextPasscode: string | undefined | null
}): string {
  const nextPasscode = input.nextPasscode?.trim() ?? ""

  if (nextPasscode.length > 0) {
    return hashExamPasscode(nextPasscode)
  }

  if (input.existingPasscodeHash) {
    return input.existingPasscodeHash
  }

  throw new Error(EXAM_PASSCODE_MISSING_MESSAGE)
}

export function resolvePasscodeCooldown(input: {
  failedAttempts: Array<{
    created_at: string
  }>
  now?: number
}) {
  const now = input.now ?? Date.now()
  const recentFailures = input.failedAttempts.filter((attempt) => {
    const createdAt = Date.parse(attempt.created_at)
    return (
      Number.isFinite(createdAt) && now - createdAt < EXAM_PASSCODE_COOLDOWN_MS
    )
  })
  const mostRecentFailure = recentFailures[0]
  const retryAfterSeconds =
    recentFailures.length >= EXAM_PASSCODE_MAX_FAILURES && mostRecentFailure
      ? Math.max(
          1,
          Math.ceil(
            (Date.parse(mostRecentFailure.created_at) +
              EXAM_PASSCODE_COOLDOWN_MS -
              now) /
              1000,
          ),
        )
      : 0

  return {
    failureCount: recentFailures.length,
    attemptsRemaining:
      retryAfterSeconds > 0
        ? 0
        : Math.max(0, EXAM_PASSCODE_MAX_FAILURES - recentFailures.length),
    retryAfterSeconds,
    isBlocked: retryAfterSeconds > 0,
  }
}

async function validateStartAttemptPasscode(input: {
  admin: SupabaseClient
  organizationId: string
  classId: string
  examId: string
  studentUserId: string
  passcodeHash: string | null
  passcode: string
}) {
  if (!input.passcodeHash) {
    throw new Error(EXAM_PASSCODE_MISSING_MESSAGE)
  }

  const failedAttempts = await loadPasscodeFailureAuditRows({
    admin: input.admin,
    examId: input.examId,
    studentUserId: input.studentUserId,
  })
  const cooldown = resolvePasscodeCooldown({
    failedAttempts,
  })

  if (cooldown.isBlocked) {
    throw new Error(
      `Too many invalid passcode attempts. Try again in ${cooldown.retryAfterSeconds} seconds.`,
    )
  }

  if (isExamPasscodeValid(input.passcodeHash, input.passcode)) {
    return
  }

  const failedAt = new Date().toISOString()
  await writeExamAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.studentUserId,
    action: "exam.passcode_failed",
    entityType: "exam",
    entityId: input.examId,
    payload: {
      classId: input.classId,
      failedAt,
    },
  })

  const nextCooldown = resolvePasscodeCooldown({
    failedAttempts: [{ created_at: failedAt }, ...failedAttempts],
  })

  if (nextCooldown.isBlocked) {
    throw new Error(
      `Too many invalid passcode attempts. Try again in ${nextCooldown.retryAfterSeconds} seconds.`,
    )
  }

  throw new Error("Invalid passcode.")
}

function resolveExamWindow(startAt: string, durationMinutes: number) {
  const parsedStartAt = new Date(startAt)

  if (Number.isNaN(parsedStartAt.getTime())) {
    throw new Error("Select a valid exam start date and time.")
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Exam duration must be greater than zero.")
  }

  return {
    startAt: parsedStartAt.toISOString(),
    endAt: new Date(
      parsedStartAt.getTime() + Number(durationMinutes) * 60_000,
    ).toISOString(),
  }
}

function computeAttemptDeadline(exam: ExamRow, startedAt: Date) {
  const timedDeadline = new Date(
    startedAt.getTime() + Number(exam.duration_minutes) * 60_000,
  )
  const endAt = exam.end_at ? new Date(exam.end_at) : null
  const deadline = endAt && endAt < timedDeadline ? endAt : timedDeadline
  return deadline.toISOString()
}

function getAttemptDeadline(
  attempt: ExamAttemptRow,
  exam: Pick<ExamRow, "duration_minutes" | "end_at"> | null,
) {
  if (attempt.deadline_at) return attempt.deadline_at
  if (!attempt.started_at || !exam) return attempt.updated_at
  return computeAttemptDeadline(exam as ExamRow, new Date(attempt.started_at))
}

function attemptExpired(
  attempt: ExamAttemptRow,
  exam: Pick<ExamRow, "duration_minutes" | "end_at"> | null = null,
) {
  return Date.parse(getAttemptDeadline(attempt, exam)) <= Date.now()
}

export function selectCurrentLiveExam<
  TExam extends Pick<
    ExamRow,
    "published_at" | "start_at" | "end_at" | "created_at"
  >,
>(exams: TExam[], now = Date.now()) {
  return [...exams]
    .filter((exam) => normalizeExamStatus(exam, now) === "live")
    .sort(compareExamsByStartDesc)[0]
}

export function selectScheduledExam<
  TExam extends Pick<ExamRow, "published_at" | "start_at" | "created_at">,
>(exams: TExam[], now = Date.now()) {
  return [...exams]
    .filter(
      (exam) =>
        isExamPublished(exam) &&
        exam.start_at &&
        Date.parse(exam.start_at) > now,
    )
    .sort(
      (left, right) => Date.parse(left.start_at!) - Date.parse(right.start_at!),
    )[0]
}

function compareExamsByStartDesc<
  TExam extends Pick<ExamRow, "start_at" | "created_at">,
>(left: TExam, right: TExam) {
  return (
    Date.parse(right.start_at ?? right.created_at) -
    Date.parse(left.start_at ?? left.created_at)
  )
}

function compareReleasedAttemptsDesc(
  left: ExamAttemptRow,
  right: ExamAttemptRow,
) {
  return (
    Date.parse(right.results_released_at ?? right.updated_at) -
    Date.parse(left.results_released_at ?? left.updated_at)
  )
}

function getAttemptCompletionTimestamp(input: {
  submitted_at: string | null
  graded_at: string | null
  results_released_at: string | null
  updated_at: string
}) {
  return Date.parse(
    input.submitted_at ??
      input.graded_at ??
      input.results_released_at ??
      input.updated_at,
  )
}

export function selectLatestCompletedAttemptWithExam<
  TAttempt extends {
    id: string
    exam_id: string
    status: string
    submitted_at: string | null
    graded_at: string | null
    results_released_at: string | null
    updated_at: string
  },
  TExam extends {
    id: string
  },
>(attempts: TAttempt[], exams: TExam[]) {
  const examsById = new Map(exams.map((exam) => [exam.id, exam]))
  const completedAttempts = [...attempts]
    .filter((attempt) => attempt.status !== "in_progress")
    .sort(
      (left, right) =>
        getAttemptCompletionTimestamp(right) -
        getAttemptCompletionTimestamp(left),
    )

  for (const attempt of completedAttempts) {
    const exam = examsById.get(attempt.exam_id)
    if (exam) {
      return { attempt, exam }
    }
  }

  return null
}

export function resolveStudentExamPageSelection<
  TExam extends Pick<
    ExamRow,
    "id" | "published_at" | "start_at" | "end_at" | "created_at"
  >,
  TAttempt extends Pick<
    ExamAttemptRow,
    | "id"
    | "exam_id"
    | "status"
    | "submitted_at"
    | "graded_at"
    | "results_released_at"
    | "updated_at"
  >,
>(input: {
  allExams: TExam[]
  publishedExams: TExam[]
  attempts: TAttempt[]
  now?: number
}) {
  const now = input.now ?? Date.now()
  const examsById = new Map(input.allExams.map((exam) => [exam.id, exam]))
  const activeAttempt =
    input.attempts.find((attempt) => attempt.status === "in_progress") ?? null
  const activeExam = activeAttempt
    ? (examsById.get(activeAttempt.exam_id) ?? null)
    : (selectCurrentLiveExam(input.publishedExams, now) ?? null)

  if (activeExam) {
    return {
      state: "active" as const,
      activeAttempt,
      activeExam,
      scheduledExam: null,
      latestCompleted: null,
    }
  }

  const scheduledExam = selectScheduledExam(input.publishedExams, now) ?? null
  if (scheduledExam) {
    return {
      state: "scheduled" as const,
      activeAttempt: null,
      activeExam: null,
      scheduledExam,
      latestCompleted: null,
    }
  }

  return {
    state: "none" as const,
    activeAttempt: null,
    activeExam: null,
    scheduledExam: null,
    latestCompleted: null,
  }
}

export function resolveExamAttemptAvailability<
  TAttempt extends Pick<
    ExamAttemptRow,
    "status" | "attempt_number" | "integrity_status"
  >,
>(input: { attempts: TAttempt[]; availableRetakeCount: number }) {
  const hasActiveAttempt = input.attempts.some(
    (attempt) => attempt.status === "in_progress",
  )
  const nextAttemptNumber =
    input.attempts.reduce(
      (highest, attempt) => Math.max(highest, attempt.attempt_number),
      0,
    ) + 1

  if (hasActiveAttempt) {
    return {
      canStart: false,
      reason:
        "Return to your current in-progress attempt to continue the exam.",
      nextAttemptNumber: null,
    }
  }

  if (input.attempts.length > 0 && input.availableRetakeCount <= 0) {
    return {
      canStart: false,
      reason: RETAKE_REQUIRED_MESSAGE,
      nextAttemptNumber: null,
    }
  }

  return {
    canStart: true,
    reason: null,
    nextAttemptNumber,
  }
}

function compareCompletedAttemptsDesc(
  left: ExamAttemptRow,
  right: ExamAttemptRow,
) {
  return (
    getAttemptCompletionTimestamp(right) - getAttemptCompletionTimestamp(left)
  )
}

function hashPasscode(passcode: string) {
  const normalized = passcode.trim()
  if (!normalized) return null
  return createHash("sha256").update(normalized).digest("hex")
}

function requireExamPasscode(passcode: string | undefined) {
  const normalized = passcode?.trim() ?? ""

  if (!normalized) {
    throw new Error(EXAM_PASSCODE_REQUIRED_MESSAGE)
  }

  if (normalized.length < EXAM_PASSCODE_MIN_LENGTH) {
    throw new Error(
      `Exam passcode must be at least ${EXAM_PASSCODE_MIN_LENGTH} characters.`,
    )
  }

  return normalized
}

function safeCompareHex(expectedHex: string, actualHex: string) {
  try {
    const expected = Buffer.from(expectedHex, "hex")
    const actual = Buffer.from(actualHex, "hex")

    if (
      expected.length === 0 ||
      actual.length === 0 ||
      expected.length !== actual.length
    ) {
      return false
    }

    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

async function syncExamPasscodeHashStorage(input: {
  admin: SupabaseClient
  organizationId: string
  classId: string
  examId: string
  passcodeHash: string
}) {
  if (schemaModes.exams === "base") {
    await upsertExamPasscodeHashFallback(input)
    return
  }

  await removeExamPasscodeHashFallback(input)
}

async function upsertExamPasscodeHashFallback(input: {
  admin: SupabaseClient
  organizationId: string
  classId: string
  examId: string
  passcodeHash: string
}) {
  const existing = await loadExamClassFeatureSetting(
    input.admin,
    input.organizationId,
    input.classId,
  )
  const nextConfig = {
    ...existing.config,
    [EXAM_PASSCODE_HASHES_CONFIG_KEY]: {
      ...readExamPasscodeHashesFromConfig(existing.config),
      [input.examId]: input.passcodeHash,
    },
  } satisfies Record<string, JsonValue>

  const { error } = await input.admin.from("class_feature_settings").upsert(
    {
      organization_id: input.organizationId,
      class_id: input.classId,
      feature_key: EXAM_FEATURE_KEY,
      enabled: existing.enabled,
      config: nextConfig,
    },
    {
      onConflict: "class_id,feature_key",
    },
  )

  if (error) {
    throw new Error(error.message)
  }
}

async function removeExamPasscodeHashFallback(input: {
  admin: SupabaseClient
  organizationId: string
  classId: string
  examId: string
}) {
  const existing = await loadExamClassFeatureSetting(
    input.admin,
    input.organizationId,
    input.classId,
  )
  const currentHashes = readExamPasscodeHashesFromConfig(existing.config)

  if (!currentHashes[input.examId]) {
    return
  }

  const nextHashes = { ...currentHashes }
  delete nextHashes[input.examId]

  const nextConfig = { ...existing.config } satisfies Record<string, JsonValue>
  if (Object.keys(nextHashes).length > 0) {
    nextConfig[EXAM_PASSCODE_HASHES_CONFIG_KEY] = nextHashes
  } else {
    delete nextConfig[EXAM_PASSCODE_HASHES_CONFIG_KEY]
  }

  const { error } = await input.admin.from("class_feature_settings").upsert(
    {
      organization_id: input.organizationId,
      class_id: input.classId,
      feature_key: EXAM_FEATURE_KEY,
      enabled: existing.enabled,
      config: nextConfig,
    },
    {
      onConflict: "class_id,feature_key",
    },
  )

  if (error) {
    throw new Error(error.message)
  }
}

async function loadExamClassFeatureSetting(
  admin: SupabaseClient,
  organizationId: string,
  classId: string,
) {
  const { data, error } = await admin
    .from("class_feature_settings")
    .select("enabled, config")
    .eq("organization_id", organizationId)
    .eq("class_id", classId)
    .eq("feature_key", EXAM_FEATURE_KEY)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return {
    enabled: typeof data?.enabled === "boolean" ? data.enabled : true,
    config: readJsonRecord(data?.config),
  }
}

function readExamPasscodeHashesFromConfig(config: Record<string, JsonValue>) {
  const value = config[EXAM_PASSCODE_HASHES_CONFIG_KEY]
  if (!isRecord(value)) {
    return {} as Record<string, string>
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
}

function toStringArray(value: JsonValue[] | null) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function isManagerRole(
  role: AppRole | null,
): role is Exclude<AppRole, "student"> {
  return role === "org_owner" || role === "org_admin" || role === "teacher"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sanitizePayload(value: Record<string, unknown>) {
  return Object.entries(value).reduce<Record<string, JsonValue>>(
    (next, entry) => {
      const [key, candidate] = entry
      if (typeof candidate === "string") next[key] = candidate
      else if (typeof candidate === "number") next[key] = candidate
      else if (typeof candidate === "boolean") next[key] = candidate
      else if (candidate === null) next[key] = null
      else next[key] = JSON.stringify(candidate)
      return next
    },
    {},
  )
}

function toScheduledExam(exam: ExamRow) {
  return {
    id: exam.id,
    title: exam.title,
    durationMinutes: Number(exam.duration_minutes),
    totalPoints: Number(exam.total_points),
    startAt: exam.start_at,
    endAt: exam.end_at,
    status: normalizeExamStatus(exam),
  }
}

function toReleasedExamSummary(result: ReleasedExamResultDto) {
  return {
    attemptId: result.attemptId,
    examId: result.examId,
    title: result.title,
    totalScore: result.totalScore ?? 0,
    totalPoints: result.totalPoints,
    releasedAt:
      result.releasedAt ?? result.submittedAt ?? new Date(0).toISOString(),
    submittedAt: result.submittedAt,
    integrityStatus: result.integrityStatus,
  } satisfies ReleasedExamResultSummaryDto
}
