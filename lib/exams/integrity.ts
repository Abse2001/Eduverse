import type { ExamIntegrityStatus, JsonValue } from "@/lib/exams/types"

export const SUSPICIOUS_INTEGRITY_EVENTS = [
  "fullscreen_exit",
  "route_leave_attempt",
  "visibility_hidden",
  "window_blur",
] as const

export function shouldMarkIntegrityReported(input: {
  currentStatus: ExamIntegrityStatus
  eventType: string
}) {
  return (
    input.currentStatus === "clear" &&
    SUSPICIOUS_INTEGRITY_EVENTS.includes(
      input.eventType as (typeof SUSPICIOUS_INTEGRITY_EVENTS)[number],
    )
  )
}

export function formatIntegrityEvent(input: {
  eventType: string
  payload: Record<string, JsonValue>
}) {
  if (input.eventType === "visibility_hidden") {
    return {
      title: "Student hid the exam tab or app",
      detail: `Browser visibility changed to ${readString(input.payload.visibilityState) ?? "hidden"}.`,
    }
  }

  if (input.eventType === "window_blur") {
    return {
      title: "Student switched window focus",
      detail: "The browser window lost focus during the attempt.",
    }
  }

  if (input.eventType === "fullscreen_exit") {
    return {
      title: "Student exited fullscreen",
      detail: "Fullscreen exam mode was exited during the attempt.",
    }
  }

  if (input.eventType === "route_leave_attempt") {
    return {
      title: "Student attempted to leave the exam",
      detail:
        readString(input.payload.destination) !== null
          ? `Navigation was blocked before leaving for ${String(input.payload.destination)}.`
          : "Navigation away from the exam route was blocked.",
    }
  }

  return {
    title: input.eventType,
    detail: "Integrity event recorded.",
  }
}

function readString(value: JsonValue | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null
}
