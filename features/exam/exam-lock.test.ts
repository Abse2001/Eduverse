import { describe, expect, test } from "bun:test"
import { isPathAllowedUnderExamLock } from "@/features/exam/exam-lock"

describe("isPathAllowedUnderExamLock", () => {
  test("allows staying on the exam route during a locked attempt", () => {
    expect(
      isPathAllowedUnderExamLock("/classes/class-1/exam", {
        examRoute: "/classes/class-1/exam",
      }),
    ).toEqual(true)
  })

  test("blocks navigation to other class sections during a locked attempt", () => {
    expect(
      isPathAllowedUnderExamLock("/classes/class-1/assignments", {
        examRoute: "/classes/class-1/exam",
      }),
    ).toEqual(false)
  })
})
