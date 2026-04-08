import { describe, expect, test } from "bun:test"
import {
  mergeMessagesById,
  getAssignmentProgress,
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
