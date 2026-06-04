import { describe, expect, test } from "bun:test"
import {
  getHistoricalExamResults,
  getAssignmentProgress,
  mergeMessagesById,
  resolveStudentExamPageState,
} from "@/lib/education/selectors"
import type { Assignment, Message } from "@/lib/mock-data"

describe("getAssignmentProgress", () => {
  test("returns completed count and rounded percentage", () => {
    const assignments: Assignment[] = [
      {
        id: "a1",
        classId: "c1",
        title: "One",
        description: "",
        dueDate: "2026-04-01T00:00:00Z",
        maxScore: 100,
        type: "assignment",
        status: "graded",
      },
      {
        id: "a2",
        classId: "c1",
        title: "Two",
        description: "",
        dueDate: "2026-04-02T00:00:00Z",
        maxScore: 100,
        type: "assignment",
        status: "pending",
      },
      {
        id: "a3",
        classId: "c1",
        title: "Three",
        description: "",
        dueDate: "2026-04-03T00:00:00Z",
        maxScore: 100,
        type: "assignment",
        status: "submitted",
      },
    ]

    expect(getAssignmentProgress(assignments)).toEqual({
      completedCount: 2,
      progress: 67,
    })
  })
})

describe("mergeMessagesById", () => {
  test("sorts chronologically and removes duplicate ids", () => {
    const baseMessages: Message[] = [
      {
        id: "m2",
        classId: "c1",
        senderId: "u1",
        content: "Later",
        timestamp: "2026-04-02T10:00:00Z",
        type: "text",
      },
    ]
    const storedMessages: Message[] = [
      {
        id: "m1",
        classId: "c1",
        senderId: "u1",
        content: "Earlier",
        timestamp: "2026-04-01T10:00:00Z",
        type: "text",
      },
      {
        id: "m2",
        classId: "c1",
        senderId: "u1",
        content: "Duplicate",
        timestamp: "2026-04-02T10:00:00Z",
        type: "text",
      },
    ]

    expect(
      mergeMessagesById(baseMessages, storedMessages).map(
        (message) => message.id,
      ),
    ).toEqual(["m1", "m2"])
  })
})

describe("resolveStudentExamPageState", () => {
  test("prefers active exam state over other populated payloads", () => {
    expect(
      resolveStudentExamPageState({
        state: "none",
        activeExam: {
          id: "exam-1",
          title: "Midterm",
          classId: "class-1",
          durationMinutes: 60,
          totalPoints: 100,
          questionCount: 10,
          startAt: null,
          endAt: null,
          status: "live",
          requiresPasscode: false,
          examModeEnabled: false,
          canStartAttempt: true,
          startBlockedReason: null,
          attempt: null,
          questions: [],
        },
        scheduledExam: {
          id: "exam-2",
          title: "Final",
          durationMinutes: 90,
          totalPoints: 120,
          startAt: "2026-05-05T10:00:00Z",
          endAt: "2026-05-05T11:30:00Z",
          status: "upcoming",
        },
      }),
    ).toEqual("active")
  })

  test("falls back to none when no state payload is populated", () => {
    expect(
      resolveStudentExamPageState({
        state: "none",
        activeExam: null,
        scheduledExam: null,
      }),
    ).toEqual("none")
  })
})

describe("getHistoricalExamResults", () => {
  test("sorts released exam history newest first and removes duplicates", () => {
    expect(
      getHistoricalExamResults({
        history: [
          {
            attemptId: "attempt-1",
            examId: "exam-1",
            title: "Quiz 1",
            totalScore: 18,
            totalPoints: 20,
            releasedAt: "2026-04-01T10:00:00Z",
            submittedAt: "2026-04-01T09:30:00Z",
            integrityStatus: "clear",
          },
          {
            attemptId: "attempt-2",
            examId: "exam-2",
            title: "Quiz 2",
            totalScore: 22,
            totalPoints: 25,
            releasedAt: "2026-04-10T10:00:00Z",
            submittedAt: "2026-04-10T09:30:00Z",
            integrityStatus: "reported",
          },
          {
            attemptId: "attempt-2",
            examId: "exam-2",
            title: "Quiz 2 duplicate",
            totalScore: 22,
            totalPoints: 25,
            releasedAt: "2026-04-10T10:00:00Z",
            submittedAt: "2026-04-10T09:30:00Z",
            integrityStatus: "reported",
          },
        ],
      }).map((result) => result.attemptId),
    ).toEqual(["attempt-2", "attempt-1"])
  })
})
