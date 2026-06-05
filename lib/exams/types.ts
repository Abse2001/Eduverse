export type ExamQuestionKind = "mcq" | "short"

export type ExamStatus = "upcoming" | "live" | "ended"

export type ExamAttemptStatus =
  | "in_progress"
  | "submitted"
  | "graded"
  | "voided"

export type ExamIntegrityStatus = "clear" | "reported" | "flagged" | "voided"

export type ExamTestCase = {
  id: string
  input: string
  expectedOutput: string
  label?: string
}

export type UpsertExamQuestionInput = {
  id?: string
  type: "mcq" | "short"
  prompt: string
  options: string[]
  correctAnswer: JsonValue | null
  points: number
}

export type UpsertExamInput = {
  title: string
  durationMinutes: number
  startAt: string
  passcode?: string
  questions: UpsertExamQuestionInput[]
}

export type StartAttemptInput = {
  passcode: string
}

export type SaveAnswerInput = {
  questionId: string
  answer: JsonValue | null
}

export type GradeAttemptInput = {
  answers: Array<{
    answerId?: string
    questionId?: string
    teacherScore: number | null
  }>
}

export type IntegrityActionInput = {
  action: "flag" | "void" | "clear"
  reason?: string
}

export type IntegrityEventInput = {
  eventType: string
  payload: Record<string, unknown>
}

export type JsonPrimitive = string | number | boolean | null

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type StudentQuestionDto = {
  id: string
  position: number
  type: ExamQuestionKind
  prompt: string
  options: string[]
  points: number
  savedAnswer: JsonValue | null
}

export type StudentAttemptDto = {
  id: string
  status: ExamAttemptStatus
  startedAt: string
  submittedAt: string | null
  deadlineAt: string
  timeLeftSeconds: number
  attemptNumber: number
  needsManualReview: boolean
  integrityStatus: ExamIntegrityStatus
}

export type StudentActiveExamDto = {
  id: string
  title: string
  classId: string
  durationMinutes: number
  totalPoints: number
  questionCount: number
  startAt: string | null
  endAt: string | null
  status: ExamStatus
  requiresPasscode: boolean
  examModeEnabled: boolean
  canStartAttempt: boolean
  startBlockedReason: string | null
  attempt: StudentAttemptDto | null
  questions: StudentQuestionDto[]
}

export type ReleasedExamQuestionResultDto = {
  id: string
  position: number
  prompt: string
  type: ExamQuestionKind
  points: number
  score: number | null
  status: "correct" | "incorrect" | "reviewed" | "unanswered"
  selectedOptionIndex: number | null
  selectedTextAnswer: string | null
  correctOptionIndex: number | null
  correctTextAnswer: string | null
}

export type ReleasedExamResultDto = {
  attemptId: string
  examId: string
  title: string
  status: ExamAttemptStatus
  totalScore: number | null
  totalPoints: number
  submittedAt: string | null
  releasedAt: string | null
  gradedAt: string | null
  isReleased: boolean
  needsManualReview: boolean
  integrityStatus: ExamIntegrityStatus
  questions: ReleasedExamQuestionResultDto[]
}

export type ReleasedExamResultSummaryDto = {
  attemptId: string
  examId: string
  title: string
  totalScore: number
  totalPoints: number
  releasedAt: string
  submittedAt: string | null
  integrityStatus: ExamIntegrityStatus
}

export type ScheduledExamDto = {
  id: string
  title: string
  durationMinutes: number
  totalPoints: number
  startAt: string | null
  endAt: string | null
  status: ExamStatus
}

export type StudentExamPageState = "none" | "scheduled" | "active"

export type StudentExamPageDto = {
  state: StudentExamPageState
  scheduledExam: ScheduledExamDto | null
  activeExam: StudentActiveExamDto | null
  releasedResults: ReleasedExamResultDto[]
  history: ReleasedExamResultSummaryDto[]
}

export type ManagerExamSummaryDto = {
  id: string
  title: string
  durationMinutes: number
  totalPoints: number
  startAt: string | null
  endAt: string | null
  status: ExamStatus
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  attemptCounts: {
    inProgress: number
    submitted: number
    graded: number
    released: number
  }
  enteredStudentCount: number
  releasedStudentCount: number
}

export type ManagerQuestionDto = {
  id: string
  position: number
  type: ExamQuestionKind
  prompt: string
  options: string[]
  points: number
  correctAnswer: JsonValue | null
}

export type ManagerAnswerDto = {
  id: string
  questionId: string
  answer: JsonValue | null
  autoScore: number | null
  teacherScore: number | null
}

export type ManagerIntegrityEventDto = {
  key: string
  eventType: string
  createdAt: string
  payload: Record<string, JsonValue>
}

export type ManagerAttemptSummaryDto = {
  id: string
  studentUserId: string
  studentDisplayName: string
  studentEmail: string
  status: ExamAttemptStatus
  startedAt: string | null
  submittedAt: string | null
  totalScore: number | null
  attemptNumber: number
  needsManualReview: boolean
  integrityStatus: ExamIntegrityStatus
  resultsReleasedAt: string | null
  availableRetakeCount: number
  answers: ManagerAnswerDto[]
  integrityEvents: ManagerIntegrityEventDto[]
}

export type ManagerExamDetailDto = {
  exam: ManagerExamSummaryDto & {
    classId: string
    organizationId: string
    createdByUserId: string | null
    passcodeProtected: boolean
  }
  questions: ManagerQuestionDto[]
  attempts: ManagerAttemptSummaryDto[]
}

export type ClassExamApiDto =
  | {
      canManage: true
      manager: {
        exams: ManagerExamSummaryDto[]
      }
      student: null
    }
  | {
      canManage: false
      manager: null
      student: StudentExamPageDto
    }
