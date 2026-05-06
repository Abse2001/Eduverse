import { NextResponse } from "next/server"
import { ZodError } from "zod"

const FORBIDDEN_MESSAGES = [
  "Only class teachers",
  "Switch to the student role",
  "Invalid passcode",
  "The exam feature is disabled",
  "A teacher must grant a retake",
  "You have reached the maximum number of attempts",
  "This exam has not started yet.",
  "This exam is no longer active.",
  "This exam is missing its required passcode.",
]

const RATE_LIMIT_MESSAGES = ["Too many invalid passcode attempts."]
const SERVICE_UNAVAILABLE_MESSAGES = ["fetch failed"]

const NOT_FOUND_MESSAGES = [
  "Class not found.",
  "Exam not found.",
  "Attempt not found.",
  "Question not found.",
]

export function toExamErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: error.issues[0]?.message ?? "Invalid exam request.",
      },
      { status: 400 },
    )
  }

  const message =
    error instanceof Error ? error.message : "Exam request failed."

  if (message === "Authentication required") {
    return NextResponse.json({ error: message }, { status: 401 })
  }

  if (NOT_FOUND_MESSAGES.includes(message)) {
    return NextResponse.json({ error: message }, { status: 404 })
  }

  if (RATE_LIMIT_MESSAGES.some((candidate) => message.startsWith(candidate))) {
    return NextResponse.json({ error: message }, { status: 429 })
  }

  if (
    SERVICE_UNAVAILABLE_MESSAGES.some((candidate) =>
      message.toLowerCase().includes(candidate),
    )
  ) {
    return NextResponse.json(
      {
        error: "Exam service is temporarily unavailable. Please try again.",
      },
      { status: 503 },
    )
  }

  if (FORBIDDEN_MESSAGES.some((candidate) => message.startsWith(candidate))) {
    return NextResponse.json({ error: message }, { status: 403 })
  }

  return NextResponse.json({ error: message }, { status: 400 })
}
