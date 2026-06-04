import { describe, expect, test } from "bun:test"
import { isPathAllowedUnderExamLock } from "@/features/exam/exam-lock"
import { requestExamModeFullscreen } from "@/features/exam/use-exam-session"

const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
)

function restoreDocument() {
  if (originalDocumentDescriptor) {
    Object.defineProperty(globalThis, "document", originalDocumentDescriptor)
    return
  }

  Reflect.deleteProperty(globalThis, "document")
}

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

describe("requestExamModeFullscreen", () => {
  test("requests fullscreen on the existing document element", async () => {
    const mockDocument = {
      fullscreenElement: null as object | null,
      documentElement: {
        requestFullscreen: async () => {
          mockDocument.fullscreenElement = {}
        },
      },
    }

    try {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        writable: true,
        value: mockDocument,
      })

      expect(await requestExamModeFullscreen()).toEqual(true)
      expect(mockDocument.fullscreenElement === null).toEqual(false)
    } finally {
      restoreDocument()
    }
  })

  test("returns false when fullscreen is rejected", async () => {
    try {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        writable: true,
        value: {
          fullscreenElement: null,
          documentElement: {
            requestFullscreen: async () => {
              throw new Error("blocked")
            },
          },
        },
      })

      expect(await requestExamModeFullscreen()).toEqual(false)
    } finally {
      restoreDocument()
    }
  })
})
