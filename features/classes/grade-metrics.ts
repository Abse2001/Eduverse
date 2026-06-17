import type { ClassAssignment } from "@/features/assignments/use-class-assignments"

export type GradedScore = {
  score: number
  maxScore: number
}

export function getStudentGradedScores(
  assignments: ClassAssignment[],
): GradedScore[] {
  return assignments.flatMap((assignment) =>
    assignment.mySubmission?.gradedAt && assignment.mySubmission.score !== null
      ? [
          {
            score: assignment.mySubmission.score,
            maxScore: assignment.maxScore,
          },
        ]
      : [],
  )
}

export function getClassGradedScores(
  assignments: ClassAssignment[],
): GradedScore[] {
  return assignments.flatMap((assignment) =>
    assignment.submissions.flatMap((submission) =>
      submission.gradedAt && submission.score !== null
        ? [{ score: submission.score, maxScore: assignment.maxScore }]
        : [],
    ),
  )
}

export function getAverageScore(scores: GradedScore[]) {
  if (scores.length === 0) return null

  return Math.round(
    scores.reduce((sum, item) => sum + (item.score / item.maxScore) * 100, 0) /
      scores.length,
  )
}

export function formatScore(score: number | null) {
  return score === null ? "-" : `${score}%`
}
