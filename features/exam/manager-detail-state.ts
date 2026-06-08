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

    if (attempt.status === "graded") {
      gradedStudents.add(attempt.studentUserId)
    }
  }

  return {
    suspiciousStudents: suspiciousStudents.size,
    gradedStudents: gradedStudents.size,
    enteredStudents: enteredStudents.size,
  }
}

export function getCurrentAttemptsByStudent(
  attempts: ManagerAttemptSummaryDto[],
) {
  const attemptsByStudent = new Map<string, ManagerAttemptSummaryDto>()

  for (const attempt of attempts) {
    const current = attemptsByStudent.get(attempt.studentUserId)
    if (!current || compareAttemptsByRecency(attempt, current) > 0) {
      attemptsByStudent.set(attempt.studentUserId, attempt)
    }
  }

  return [...attemptsByStudent.values()].sort(compareAttemptsByDisplayName)
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

function compareAttemptsByRecency(
  left: Pick<
    ManagerAttemptSummaryDto,
    "attemptNumber" | "startedAt" | "submittedAt" | "id"
  >,
  right: Pick<
    ManagerAttemptSummaryDto,
    "attemptNumber" | "startedAt" | "submittedAt" | "id"
  >,
) {
  if (left.attemptNumber !== right.attemptNumber) {
    return left.attemptNumber - right.attemptNumber
  }

  const leftTime = Date.parse(left.submittedAt ?? left.startedAt ?? "")
  const rightTime = Date.parse(right.submittedAt ?? right.startedAt ?? "")
  const normalizedLeftTime = Number.isNaN(leftTime) ? 0 : leftTime
  const normalizedRightTime = Number.isNaN(rightTime) ? 0 : rightTime

  if (normalizedLeftTime !== normalizedRightTime) {
    return normalizedLeftTime - normalizedRightTime
  }

  return left.id.localeCompare(right.id)
}

function compareAttemptsByDisplayName(
  left: Pick<ManagerAttemptSummaryDto, "studentDisplayName" | "studentEmail">,
  right: Pick<ManagerAttemptSummaryDto, "studentDisplayName" | "studentEmail">,
) {
  const nameComparison = left.studentDisplayName.localeCompare(
    right.studentDisplayName,
  )

  return nameComparison === 0
    ? left.studentEmail.localeCompare(right.studentEmail)
    : nameComparison
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

  if (attempt.status === "in_progress") {
    return "In progress"
  }

  if (attempt.resultsReleasedAt) {
    return "Results released"
  }

  if (attempt.needsManualReview) {
    return "Needs grading"
  }

  if (attempt.totalScore === null) {
    return "Pending score"
  }

  return "Ready to release"
}
