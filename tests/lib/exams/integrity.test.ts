import { describe, expect, test } from "bun:test"
import {
  formatIntegrityEvent,
  shouldMarkIntegrityReported,
} from "@/lib/exams/integrity"

describe("shouldMarkIntegrityReported", () => {
  test("marks suspicious client events when the attempt is still clear", () => {
    expect(
      shouldMarkIntegrityReported({
        currentStatus: "clear",
        eventType: "visibility_hidden",
      }),
    ).toEqual(true)

    expect(
      shouldMarkIntegrityReported({
        currentStatus: "clear",
        eventType: "route_leave_attempt",
      }),
    ).toEqual(true)
  })

  test("ignores benign events and already escalated attempts", () => {
    expect(
      shouldMarkIntegrityReported({
        currentStatus: "reported",
        eventType: "window_blur",
      }),
    ).toEqual(false)

    expect(
      shouldMarkIntegrityReported({
        currentStatus: "clear",
        eventType: "heartbeat",
      }),
    ).toEqual(false)
  })
})

describe("formatIntegrityEvent", () => {
  test("formats visibility payloads without exposing raw JSON inline", () => {
    expect(
      formatIntegrityEvent({
        eventType: "visibility_hidden",
        payload: {
          visibilityState: "hidden",
        },
      }),
    ).toEqual({
      title: "Student hid the exam tab or app",
      detail: "Browser visibility changed to hidden.",
    })
  })

  test("formats route leave events with a readable detail", () => {
    expect(
      formatIntegrityEvent({
        eventType: "route_leave_attempt",
        payload: {
          destination: "/classes/demo/materials",
        },
      }),
    ).toEqual({
      title: "Student attempted to leave the exam",
      detail:
        "Navigation was blocked before leaving for /classes/demo/materials.",
    })
  })
})
