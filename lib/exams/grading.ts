import type { ExamQuestionKind, JsonValue } from "@/lib/exams/types"

export function questionRequiresManualGrading(question: {
  questionType: ExamQuestionKind
  correctAnswer: JsonValue | null
}) {
  return (
    question.questionType === "short" &&
    (typeof question.correctAnswer !== "string" ||
      normalizeTextAnswer(question.correctAnswer).length === 0)
  )
}

export function canTeacherGradeQuestion(question: {
  questionType: ExamQuestionKind
  correctAnswer: JsonValue | null
}) {
  return questionRequiresManualGrading(question)
}

export function evaluateExamAnswer(
  question: {
    questionType: ExamQuestionKind
    points: number
    correctAnswer: JsonValue | null
  },
  answer: JsonValue | null,
) {
  if (question.questionType === "mcq") {
    const isCorrect = deepEqual(answer, question.correctAnswer ?? null)
    return {
      autoScore: isCorrect ? Number(question.points) : 0,
      gradedAutomatically: true,
    }
  }

  if (!questionRequiresManualGrading(question)) {
    const isCorrect =
      typeof answer === "string" &&
      normalizeTextAnswer(answer) ===
        normalizeTextAnswer(String(question.correctAnswer))

    return {
      autoScore: isCorrect ? Number(question.points) : 0,
      gradedAutomatically: true,
    }
  }

  return {
    autoScore: null,
    gradedAutomatically: false,
  }
}

export function resolveAnswerScore(input: {
  teacherScore: number | null | undefined
  autoScore: number | null | undefined
}) {
  return Number(input.teacherScore ?? input.autoScore ?? 0)
}

export function getReleasedAnswerStatus(
  question: {
    questionType: ExamQuestionKind
    correctAnswer: JsonValue | null
  },
  answer: JsonValue | null,
) {
  if (answer === null || answer === undefined) return "unanswered"

  if (question.questionType === "mcq") {
    return deepEqual(answer, question.correctAnswer ?? null)
      ? "correct"
      : "incorrect"
  }

  if (
    question.questionType === "short" &&
    !questionRequiresManualGrading(question) &&
    typeof answer === "string"
  ) {
    return normalizeTextAnswer(answer) ===
      normalizeTextAnswer(String(question.correctAnswer))
      ? "correct"
      : "incorrect"
  }

  return "reviewed"
}

function deepEqual(left: JsonValue | null, right: JsonValue | null): boolean {
  return JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right))
}

function sortJson(value: JsonValue | null): JsonValue | null {
  if (Array.isArray(value)) return value.map(sortJson)
  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, JsonValue>>((next, key) => {
        next[key] = sortJson(value[key] as JsonValue) as JsonValue
        return next
      }, {})
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeTextAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}
