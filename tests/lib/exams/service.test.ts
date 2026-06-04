import { describe, expect, test } from "bun:test"
import {
  hashExamPasscode,
  isExamPasscodeValid,
  resolveExamPasscodeHash,
  resolvePasscodeCooldown,
  resolveExamAttemptAvailability,
  resolveStudentExamPageSelection,
  selectLatestCompletedAttemptWithExam,
  toStudentQuestionDto,
} from "@/lib/exams/service"

describe("selectLatestCompletedAttemptWithExam", () => {
  test("returns the newest completed attempt whose exam still exists", () => {
    const result = selectLatestCompletedAttemptWithExam(
      [
        {
          id: "attempt-missing",
          exam_id: "exam-missing",
          status: "graded",
          submitted_at: "2026-05-04T08:00:00Z",
          graded_at: "2026-05-04T08:10:00Z",
          results_released_at: "2026-05-04T08:15:00Z",
          updated_at: "2026-05-04T08:15:00Z",
        },
        {
          id: "attempt-valid",
          exam_id: "exam-valid",
          status: "graded",
          submitted_at: "2026-05-04T07:00:00Z",
          graded_at: "2026-05-04T07:10:00Z",
          results_released_at: "2026-05-04T07:15:00Z",
          updated_at: "2026-05-04T07:15:00Z",
        },
      ],
      [
        {
          id: "exam-valid",
          title: "Final",
        },
      ],
    )

    expect(result).toEqual({
      attempt: {
        id: "attempt-valid",
        exam_id: "exam-valid",
        status: "graded",
        submitted_at: "2026-05-04T07:00:00Z",
        graded_at: "2026-05-04T07:10:00Z",
        results_released_at: "2026-05-04T07:15:00Z",
        updated_at: "2026-05-04T07:15:00Z",
      },
      exam: {
        id: "exam-valid",
        title: "Final",
      },
    })
  })

  test("returns null when every completed attempt points to a missing exam", () => {
    expect(
      selectLatestCompletedAttemptWithExam(
        [
          {
            id: "attempt-missing",
            exam_id: "exam-missing",
            status: "graded",
            submitted_at: "2026-05-04T08:00:00Z",
            graded_at: "2026-05-04T08:10:00Z",
            results_released_at: "2026-05-04T08:15:00Z",
            updated_at: "2026-05-04T08:15:00Z",
          },
        ],
        [],
      ),
    ).toEqual(null)
  })
})

describe("isExamPasscodeValid", () => {
  test("rejects exams that do not have a configured passcode", () => {
    expect(isExamPasscodeValid(null, "anything")).toEqual(false)
  })

  test("rejects missing or wrong passcodes for protected exams", () => {
    const passcodeHash =
      "5d642faad6c6b9bfb9457d1eec508cc9a9201f3d4cf0a0b82f78220f1148b6a2"

    expect(isExamPasscodeValid(passcodeHash, "")).toEqual(false)
    expect(isExamPasscodeValid(passcodeHash, "wrong-code")).toEqual(false)
  })

  test("accepts the correct passcode for protected exams", () => {
    const passcodeHash =
      "5d642faad6c6b9bfb9457d1eec508cc9a9201f3d4cf0a0b82f78220f1148b6a2"

    expect(isExamPasscodeValid(passcodeHash, "teacher-code")).toEqual(true)
  })

  test("accepts alphanumeric passcodes hashed by the backend", () => {
    const passcodeHash = hashExamPasscode("A1b2C3")

    expect(isExamPasscodeValid(passcodeHash, "A1b2C3")).toEqual(true)
    expect(isExamPasscodeValid(passcodeHash, "a1b2c3")).toEqual(false)
  })
})

describe("resolveExamPasscodeHash", () => {
  test("keeps the existing stored passcode when edit input is blank", () => {
    const existingPasscodeHash = hashExamPasscode("teacher-code")

    expect(
      resolveExamPasscodeHash({
        existingPasscodeHash,
        nextPasscode: "",
      }),
    ).toEqual(existingPasscodeHash)

    expect(
      resolveExamPasscodeHash({
        existingPasscodeHash,
        nextPasscode: undefined,
      }),
    ).toEqual(existingPasscodeHash)
  })

  test("replaces the stored passcode when a new value is provided", () => {
    const existingPasscodeHash = hashExamPasscode("teacher-code")
    const nextPasscodeHash = resolveExamPasscodeHash({
      existingPasscodeHash,
      nextPasscode: "new-passcode",
    })

    expect(nextPasscodeHash === existingPasscodeHash).toEqual(false)
    expect(isExamPasscodeValid(nextPasscodeHash, "new-passcode")).toEqual(true)
  })

  test("reports a missing stored passcode only when the exam truly has none", () => {
    try {
      resolveExamPasscodeHash({
        existingPasscodeHash: null,
        nextPasscode: "",
      })
      throw new Error("Expected resolveExamPasscodeHash to throw.")
    } catch (error) {
      expect(
        error instanceof Error
          ? error.message
          : "Expected resolveExamPasscodeHash to throw.",
      ).toEqual("This exam is missing its required passcode.")
    }
  })
})

describe("resolvePasscodeCooldown", () => {
  test("allows another try when failures stay below the limit", () => {
    expect(
      resolvePasscodeCooldown({
        failedAttempts: [
          {
            created_at: "2026-05-05T10:00:00Z",
          },
          {
            created_at: "2026-05-05T09:59:30Z",
          },
        ],
        now: Date.parse("2026-05-05T10:00:10Z"),
      }),
    ).toEqual({
      failureCount: 2,
      attemptsRemaining: 1,
      retryAfterSeconds: 0,
      isBlocked: false,
    })
  })

  test("blocks passcode retries after three recent failures", () => {
    const result = resolvePasscodeCooldown({
      failedAttempts: [
        {
          created_at: "2026-05-05T10:00:00Z",
        },
        {
          created_at: "2026-05-05T09:59:50Z",
        },
        {
          created_at: "2026-05-05T09:59:40Z",
        },
      ],
      now: Date.parse("2026-05-05T10:00:15Z"),
    })

    expect(result.failureCount).toEqual(3)
    expect(result.attemptsRemaining).toEqual(0)
    expect(result.isBlocked).toEqual(true)
    expect(result.retryAfterSeconds > 0).toEqual(true)
  })

  test("clears the cooldown window after it expires", () => {
    expect(
      resolvePasscodeCooldown({
        failedAttempts: [
          {
            created_at: "2026-05-05T10:00:00Z",
          },
          {
            created_at: "2026-05-05T09:59:40Z",
          },
          {
            created_at: "2026-05-05T09:59:20Z",
          },
        ],
        now: Date.parse("2026-05-05T10:01:10Z"),
      }),
    ).toEqual({
      failureCount: 0,
      attemptsRemaining: 3,
      retryAfterSeconds: 0,
      isBlocked: false,
    })
  })
})

describe("resolveStudentExamPageSelection", () => {
  const baseExam = {
    published_at: "2026-05-04T08:00:00Z",
    end_at: "2026-05-04T10:00:00Z",
    created_at: "2026-05-01T08:00:00Z",
  }

  test("prefers an active in-progress attempt over other exam states", () => {
    const selection = resolveStudentExamPageSelection({
      allExams: [
        {
          id: "live-exam",
          ...baseExam,
          start_at: "2026-05-04T08:30:00Z",
        },
      ],
      publishedExams: [
        {
          id: "live-exam",
          ...baseExam,
          start_at: "2026-05-04T08:30:00Z",
        },
      ],
      attempts: [
        {
          id: "attempt-1",
          exam_id: "live-exam",
          status: "in_progress",
          submitted_at: null,
          graded_at: null,
          results_released_at: null,
          updated_at: "2026-05-04T08:40:00Z",
        },
      ],
      now: Date.parse("2026-05-04T08:45:00Z"),
    })

    expect(selection.state).toEqual("active")
    expect(selection.activeAttempt?.id).toEqual("attempt-1")
    expect(selection.activeExam?.id).toEqual("live-exam")
  })

  test("shows the current published exam before any scheduled or historical result", () => {
    const selection = resolveStudentExamPageSelection({
      allExams: [
        {
          id: "live-exam",
          ...baseExam,
          start_at: "2026-05-04T08:30:00Z",
        },
        {
          id: "scheduled-exam",
          ...baseExam,
          start_at: "2026-05-05T08:30:00Z",
          end_at: "2026-05-05T09:30:00Z",
        },
      ],
      publishedExams: [
        {
          id: "live-exam",
          ...baseExam,
          start_at: "2026-05-04T08:30:00Z",
        },
        {
          id: "scheduled-exam",
          ...baseExam,
          start_at: "2026-05-05T08:30:00Z",
          end_at: "2026-05-05T09:30:00Z",
        },
      ],
      attempts: [
        {
          id: "released-attempt",
          exam_id: "old-exam",
          status: "graded",
          submitted_at: "2026-05-01T09:00:00Z",
          graded_at: "2026-05-01T09:10:00Z",
          results_released_at: "2026-05-01T09:20:00Z",
          updated_at: "2026-05-01T09:20:00Z",
        },
      ],
      now: Date.parse("2026-05-04T08:45:00Z"),
    })

    expect(selection.state).toEqual("active")
    expect(selection.activeExam?.id).toEqual("live-exam")
  })

  test("shows the next scheduled published exam when nothing is live", () => {
    const selection = resolveStudentExamPageSelection({
      allExams: [
        {
          id: "scheduled-exam",
          ...baseExam,
          start_at: "2026-05-05T08:30:00Z",
          end_at: "2026-05-05T09:30:00Z",
        },
      ],
      publishedExams: [
        {
          id: "scheduled-exam",
          ...baseExam,
          start_at: "2026-05-05T08:30:00Z",
          end_at: "2026-05-05T09:30:00Z",
        },
      ],
      attempts: [],
      now: Date.parse("2026-05-04T08:45:00Z"),
    })

    expect(selection.state).toEqual("scheduled")
    expect(selection.scheduledExam?.id).toEqual("scheduled-exam")
  })

  test("returns none when there is no live or scheduled published exam", () => {
    const selection = resolveStudentExamPageSelection({
      allExams: [
        {
          id: "old-exam",
          ...baseExam,
          start_at: "2026-05-01T08:30:00Z",
          end_at: "2026-05-01T09:30:00Z",
        },
      ],
      publishedExams: [],
      attempts: [
        {
          id: "released-attempt",
          exam_id: "old-exam",
          status: "graded",
          submitted_at: "2026-05-01T09:00:00Z",
          graded_at: "2026-05-01T09:10:00Z",
          results_released_at: "2026-05-01T09:20:00Z",
          updated_at: "2026-05-01T09:20:00Z",
        },
      ],
      now: Date.parse("2026-05-04T08:45:00Z"),
    })

    expect(selection.state).toEqual("none")
    expect(selection.activeExam).toEqual(null)
    expect(selection.scheduledExam).toEqual(null)
  })
})

describe("resolveExamAttemptAvailability", () => {
  test("blocks another attempt after submission until a retake is granted", () => {
    expect(
      resolveExamAttemptAvailability({
        attempts: [
          {
            status: "submitted",
            attempt_number: 1,
            integrity_status: "clear",
          },
        ],
        availableRetakeCount: 0,
      }),
    ).toEqual({
      canStart: false,
      reason:
        "A teacher must grant a retake before you can start this exam again.",
      nextAttemptNumber: null,
    })
  })

  test("blocks flagged or voided integrity attempts until a retake exists", () => {
    expect(
      resolveExamAttemptAvailability({
        attempts: [
          {
            status: "voided",
            attempt_number: 1,
            integrity_status: "voided",
          },
        ],
        availableRetakeCount: 0,
      }).canStart,
    ).toEqual(false)
  })

  test("allows exactly one extra attempt after a retake grant", () => {
    expect(
      resolveExamAttemptAvailability({
        attempts: [
          {
            status: "voided",
            attempt_number: 1,
            integrity_status: "voided",
          },
        ],
        availableRetakeCount: 1,
      }),
    ).toEqual({
      canStart: true,
      reason: null,
      nextAttemptNumber: 2,
    })
  })

  test("prevents duplicate active attempts", () => {
    expect(
      resolveExamAttemptAvailability({
        attempts: [
          {
            status: "in_progress",
            attempt_number: 1,
            integrity_status: "clear",
          },
        ],
        availableRetakeCount: 1,
      }),
    ).toEqual({
      canStart: false,
      reason:
        "Return to your current in-progress attempt to continue the exam.",
      nextAttemptNumber: null,
    })
  })

  test("consumes a retake after the extra attempt exists", () => {
    expect(
      resolveExamAttemptAvailability({
        attempts: [
          {
            status: "submitted",
            attempt_number: 1,
            integrity_status: "clear",
          },
          {
            status: "submitted",
            attempt_number: 2,
            integrity_status: "clear",
          },
        ],
        availableRetakeCount: 0,
      }),
    ).toEqual({
      canStart: false,
      reason:
        "A teacher must grant a retake before you can start this exam again.",
      nextAttemptNumber: null,
    })
  })

  test("allows a new attempt after a later teacher-granted retake", () => {
    expect(
      resolveExamAttemptAvailability({
        attempts: [
          {
            status: "submitted",
            attempt_number: 1,
            integrity_status: "clear",
          },
          {
            status: "voided",
            attempt_number: 2,
            integrity_status: "voided",
          },
        ],
        availableRetakeCount: 1,
      }),
    ).toEqual({
      canStart: true,
      reason: null,
      nextAttemptNumber: 3,
    })
  })
})

describe("toStudentQuestionDto", () => {
  test("does not expose grading internals to student payloads", () => {
    const dto = toStudentQuestionDto(
      {
        id: "question-1",
        organization_id: "org-1",
        exam_id: "exam-1",
        position: 1,
        question_type: "short",
        prompt: "Name the protocol",
        options_json: null,
        correct_answer_json: "hyper text transfer protocol",
        points: 5,
        language: null,
        starter_code: null,
        visible_tests_json: null,
        hidden_tests_json: [{ input: "secret", expectedOutput: "hidden" }],
        evaluator_key: "internal",
        created_at: "2026-05-04T08:00:00Z",
        updated_at: "2026-05-04T08:00:00Z",
      },
      "http",
    )

    expect(dto).toEqual({
      id: "question-1",
      position: 1,
      type: "short",
      prompt: "Name the protocol",
      options: [],
      points: 5,
      savedAnswer: "http",
    })
    expect("correctAnswer" in dto).toEqual(false)
  })
})
