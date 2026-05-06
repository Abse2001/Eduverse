import { describe, expect, test } from "bun:test"
import {
  buildGradeInputsForAttempt,
  getEndedExamApprovalStatus,
  getAttemptGradeIndicator,
  getAttemptMonitorStatus,
  getExamMonitorSummary,
  isAttemptSuspicious,
  resolveSelectedAttemptId,
} from "@/features/exam/manager-detail-state"

const attempt = {
  id: "attempt-1",
  studentUserId: "student-1",
  studentDisplayName: "Student One",
  studentEmail: "student@example.com",
  status: "submitted" as const,
  startedAt: "2026-05-04T08:00:00Z",
  submittedAt: "2026-05-04T08:20:00Z",
  totalScore: null,
  attemptNumber: 1,
  needsManualReview: true,
  integrityStatus: "clear" as const,
  resultsReleasedAt: null,
  availableRetakeCount: 0,
  answers: [
    {
      id: "answer-1",
      questionId: "question-1",
      answer: "draft",
      autoScore: 2,
      teacherScore: null,
    },
    {
      id: "answer-2",
      questionId: "question-2",
      answer: 1,
      autoScore: 5,
      teacherScore: 4,
    },
  ],
  integrityEvents: [],
}

describe("resolveSelectedAttemptId", () => {
  test("keeps the detail panel closed until a student card is selected", () => {
    expect(
      resolveSelectedAttemptId({
        attempts: [attempt],
        currentSelectedAttemptId: null,
      }),
    ).toEqual(null)
  })

  test("keeps the current selected attempt during a background refresh", () => {
    expect(
      resolveSelectedAttemptId({
        attempts: [attempt],
        currentSelectedAttemptId: "attempt-1",
      }),
    ).toEqual("attempt-1")
  })

  test("falls back to the first attempt when the previous selection disappears", () => {
    expect(
      resolveSelectedAttemptId({
        attempts: [attempt],
        currentSelectedAttemptId: "missing-attempt",
      }),
    ).toEqual("attempt-1")
  })
})

describe("buildGradeInputsForAttempt", () => {
  test("keeps existing teacher grades stable across detail refreshes", () => {
    expect(buildGradeInputsForAttempt(attempt)).toEqual({
      "question-1": "",
      "question-2": "4",
    })
  })
})

describe("monitor card helpers", () => {
  test("marks attempts with integrity events as suspicious", () => {
    expect(
      isAttemptSuspicious({
        integrityStatus: "clear",
        integrityEvents: [
          {
            key: "event-1",
            eventType: "fullscreen_exit",
            createdAt: "2026-05-04T08:05:00Z",
            payload: {},
          },
        ],
      }),
    ).toEqual(true)
  })

  test("returns normal status for clean attempts", () => {
    expect(
      getAttemptMonitorStatus({
        integrityStatus: "clear",
        integrityEvents: [],
      }),
    ).toEqual("Normal")
  })

  test("prioritizes released indicator over grading states", () => {
    expect(
      getAttemptGradeIndicator({
        resultsReleasedAt: "2026-05-04T08:25:00Z",
        needsManualReview: false,
        status: "graded",
        totalScore: 19,
      }),
    ).toEqual("Released")
  })

  test("shows needs grading for manual-review attempts", () => {
    expect(
      getAttemptGradeIndicator({
        resultsReleasedAt: null,
        needsManualReview: true,
        status: "submitted",
        totalScore: null,
      }),
    ).toEqual("Needs grading")
  })

  test("shows voided when the attempt was voided", () => {
    expect(
      getAttemptGradeIndicator({
        resultsReleasedAt: null,
        needsManualReview: false,
        status: "voided",
        totalScore: null,
      }),
    ).toEqual("Voided")
  })

  test("summarizes suspicious, graded, and entered students without double-counting retakes", () => {
    expect(
      getExamMonitorSummary([
        attempt,
        {
          ...attempt,
          status: "graded",
          resultsReleasedAt: "2026-05-04T08:30:00Z",
          integrityStatus: "flagged",
          integrityEvents: [
            {
              key: "event-2",
              eventType: "visibility_hidden",
              createdAt: "2026-05-04T08:10:00Z",
              payload: {},
            },
          ],
        },
        {
          ...attempt,
          studentUserId: "student-2",
          integrityStatus: "clear",
          integrityEvents: [],
          resultsReleasedAt: null,
        },
      ] as any),
    ).toEqual({
      suspiciousStudents: 1,
      gradedStudents: 1,
      enteredStudents: 2,
    })
  })

  test("shows grades confirmed when all entered students have approved results", () => {
    expect(
      getEndedExamApprovalStatus({
        status: "ended",
        enteredStudentCount: 2,
        releasedStudentCount: 2,
      }),
    ).toEqual({
      label: "Grades confirmed",
      tone: "confirmed",
    })
  })

  test("shows waiting for approval when an ended exam still has pending grades", () => {
    expect(
      getEndedExamApprovalStatus({
        status: "ended",
        enteredStudentCount: 3,
        releasedStudentCount: 1,
      }),
    ).toEqual({
      label: "Waiting for approval",
      tone: "pending",
    })
  })
})
