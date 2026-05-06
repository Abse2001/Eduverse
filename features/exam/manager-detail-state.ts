import type {
  ManagerAttemptSummaryDto,
  ManagerExamSummaryDto,
} from "@/lib/exams/types"

export function getExamMonitorSummary(
  attempts: Pick<
    ManagerAttemptSummaryDto,
    | "studentUserId"
    | "status"
    | "integrityStatus"
    | "integrityEvents"
    | "resultsReleasedAt"
  >[],
) {
  const enteredStudents = new Set<string>()
  const suspiciousStudents = new Set<string>()
  const gradedStudents = new Set<string>()

  for (const attempt of attempts) {
    enteredStudents.add(attempt.studentUserId)

    if (attempt.status === "voided" || isAttemptSuspicious(attempt)) {
      suspiciousStudents.add(attempt.studentUserId)
    }

    if (attempt.resultsReleasedAt) {
      gradedStudents.add(attempt.studentUserId)
    }
  }

  return {
    suspiciousStudents: suspiciousStudents.size,
    gradedStudents: gradedStudents.size,
    enteredStudents: enteredStudents.size,
  }
}

export function getEndedExamApprovalStatus(
  exam: Pick<
    ManagerExamSummaryDto,
    "status" | "enteredStudentCount" | "releasedStudentCount"
  >,
) {
  if (exam.status !== "ended") {
    return null
  }

  const isConfirmed =
    exam.enteredStudentCount > 0 &&
    exam.releasedStudentCount >= exam.enteredStudentCount

  return isConfirmed
    ? {
        label: "Grades confirmed",
        tone: "confirmed" as const,
      }
    : {
        label: "Waiting for approval",
        tone: "pending" as const,
      }
}

export function resolveSelectedAttemptId(input: {
  attempts: ManagerAttemptSummaryDto[]
  currentSelectedAttemptId: string | null
}) {
  if (input.currentSelectedAttemptId === null) {
    return null
  }

  const existingSelection = input.currentSelectedAttemptId
    ? input.attempts.find(
        (attempt) => attempt.id === input.currentSelectedAttemptId,
      )
    : null

  return existingSelection?.id ?? input.attempts[0]?.id ?? null
}

export function buildGradeInputsForAttempt(
  attempt: ManagerAttemptSummaryDto | null | undefined,
) {
  if (!attempt) return {}

  return Object.fromEntries(
    attempt.answers.map((answer) => [
      answer.questionId,
      answer.teacherScore === null ? "" : String(answer.teacherScore),
    ]),
  )
}

export function isAttemptSuspicious(
  attempt: Pick<
    ManagerAttemptSummaryDto,
    "integrityStatus" | "integrityEvents"
  >,
) {
  return (
    attempt.integrityStatus !== "clear" || attempt.integrityEvents.length > 0
  )
}

export function getAttemptMonitorStatus(
  attempt: Pick<
    ManagerAttemptSummaryDto,
    "integrityStatus" | "integrityEvents"
  >,
) {
  return isAttemptSuspicious(attempt) ? "Suspicious" : "Normal"
}

export function getAttemptGradeIndicator(
  attempt: Pick<
    ManagerAttemptSummaryDto,
    "resultsReleasedAt" | "needsManualReview" | "status" | "totalScore"
  >,
) {
  if (attempt.status === "voided") {
    return "Voided"
  }

  if (attempt.resultsReleasedAt) {
    return "Released"
  }

  if (attempt.needsManualReview) {
    return "Needs grading"
  }

  if (attempt.totalScore === null) {
    return "Pending score"
  }

  return "Awaiting approval"
}
