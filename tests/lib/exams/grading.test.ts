import { describe, expect, test } from "bun:test"
import {
  canTeacherGradeQuestion,
  evaluateExamAnswer,
  getReleasedAnswerStatus,
  questionRequiresManualGrading,
  resolveAnswerScore,
} from "@/lib/exams/grading"

describe("evaluateExamAnswer", () => {
  test("auto-grades matching mcq answers", () => {
    expect(
      evaluateExamAnswer(
        {
          questionType: "mcq",
          points: 5,
          correctAnswer: 2,
        },
        2,
      ),
    ).toEqual({
      autoScore: 5,
      gradedAutomatically: true,
    })
  })

  test("auto-grades short answers when the teacher provides a model answer", () => {
    expect(
      evaluateExamAnswer(
        {
          questionType: "short",
          points: 4,
          correctAnswer: "Hyper Text Transfer Protocol",
        },
        "  hyper text   transfer protocol ",
      ),
    ).toEqual({
      autoScore: 4,
      gradedAutomatically: true,
    })
  })

  test("keeps short answers in manual review when no model answer exists", () => {
    expect(
      evaluateExamAnswer(
        {
          questionType: "short",
          points: 4,
          correctAnswer: null,
        },
        "A reflective response",
      ),
    ).toEqual({
      autoScore: null,
      gradedAutomatically: false,
    })
  })
})

describe("resolveAnswerScore", () => {
  test("prefers teacher scores over auto scores", () => {
    expect(
      resolveAnswerScore({
        teacherScore: 7,
        autoScore: 3,
      }),
    ).toEqual(7)
  })
})

describe("questionRequiresManualGrading", () => {
  test("only allows teacher grading for short answers without a model answer", () => {
    expect(
      questionRequiresManualGrading({
        questionType: "mcq",
        correctAnswer: 0,
      }),
    ).toEqual(false)

    expect(
      questionRequiresManualGrading({
        questionType: "short",
        correctAnswer: "Defined answer",
      }),
    ).toEqual(false)

    expect(
      questionRequiresManualGrading({
        questionType: "short",
        correctAnswer: "",
      }),
    ).toEqual(true)

    expect(
      canTeacherGradeQuestion({
        questionType: "short",
        correctAnswer: null,
      }),
    ).toEqual(true)
  })
})

describe("getReleasedAnswerStatus", () => {
  test("returns incorrect for released mcq mismatches", () => {
    expect(
      getReleasedAnswerStatus(
        {
          questionType: "mcq",
          correctAnswer: { choice: 1, meta: { label: "B" } },
        },
        { meta: { label: "C" }, choice: 2 },
      ),
    ).toEqual("incorrect")
  })

  test("returns reviewed for released non-mcq answers", () => {
    expect(
      getReleasedAnswerStatus(
        {
          questionType: "short",
          correctAnswer: null,
        },
        "A reflective response",
      ),
    ).toEqual("reviewed")
  })

  test("returns correct for released short answers that match the model answer", () => {
    expect(
      getReleasedAnswerStatus(
        {
          questionType: "short",
          correctAnswer: "Machine learning",
        },
        " machine   learning ",
      ),
    ).toEqual("correct")
  })
})
