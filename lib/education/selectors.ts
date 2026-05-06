import { addDays, isPast, isWithinInterval } from "date-fns"
import type {
  ReleasedExamResultSummaryDto,
  StudentExamPageDto,
  StudentExamPageState,
} from "@/lib/exams/types"
import type {
  Assignment,
  Class,
  LeaderboardEntry,
  Message,
} from "@/lib/mock-data"

export type AssignmentWithClassInfo = Assignment & { classInfo: Class }

export function getAssignmentProgress(assignments: Assignment[]) {
  const completedCount = assignments.filter(
    (assignment) => assignment.status !== "pending",
  ).length

  return {
    completedCount,
    progress:
      assignments.length > 0
        ? Math.round((completedCount / assignments.length) * 100)
        : 0,
  }
}

export function getAverageAssignmentScore(assignments: Assignment[]) {
  const graded = assignments.filter(
    (assignment) =>
      assignment.status === "graded" && assignment.score !== undefined,
  )

  if (graded.length === 0) return 0

  return Math.round(
    graded.reduce((sum, assignment) => sum + (assignment.score ?? 0), 0) /
      graded.length,
  )
}

export function getAssignmentsWithClassInfo(
  classes: Class[],
  assignmentsByClass: (classId: string) => Assignment[],
) {
  return classes.flatMap((cls) =>
    assignmentsByClass(cls.id).map((assignment) => ({
      ...assignment,
      classInfo: cls,
    })),
  )
}

export function getUpcomingAssignments(
  assignments: AssignmentWithClassInfo[],
  days = 7,
) {
  const start = new Date()
  const end = addDays(start, days)

  return assignments
    .filter((assignment) => assignment.status === "pending")
    .filter((assignment) => {
      const due = new Date(assignment.dueDate)
      return !isPast(due) || isWithinInterval(due, { start, end })
    })
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    )
}

export function getStudentRankSummary(
  classes: Class[],
  studentId: string,
  leaderboardByClass: (classId: string) => LeaderboardEntry[],
) {
  return classes.map((cls) => {
    const leaderboard = leaderboardByClass(cls.id)
    const entry = leaderboard.find((item) => item.studentId === studentId)

    return {
      cls,
      rank: entry?.rank,
      total: leaderboard.length,
      score: entry?.totalScore,
    }
  })
}

export function getBestRank(
  ranks: Array<{
    rank: number | undefined
  }>,
) {
  return ranks.reduce<number | null>((best, current) => {
    if (!current.rank) return best
    return best === null || current.rank < best ? current.rank : best
  }, null)
}

export function mergeMessagesById(
  baseMessages: Message[],
  storedMessages: Message[],
) {
  return [...baseMessages, ...storedMessages]
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    .filter(
      (message, index, allMessages) =>
        allMessages.findIndex((candidate) => candidate.id === message.id) ===
        index,
    )
}

export function resolveStudentExamPageState(
  page: Pick<StudentExamPageDto, "activeExam" | "scheduledExam" | "state">,
): StudentExamPageState {
  if (page.activeExam) return "active"
  if (page.scheduledExam) return "scheduled"
  return "none"
}

export function getHistoricalExamResults(
  page: Pick<StudentExamPageDto, "history">,
) {
  return page.history
    .filter((result) => Boolean(result.releasedAt))
    .filter(
      (result, index, results) =>
        results.findIndex(
          (candidate) => candidate.attemptId === result.attemptId,
        ) === index,
    )
    .sort(compareReleasedExamResultsDesc)
}

function compareReleasedExamResultsDesc(
  left: ReleasedExamResultSummaryDto,
  right: ReleasedExamResultSummaryDto,
) {
  return Date.parse(right.releasedAt) - Date.parse(left.releasedAt)
}
