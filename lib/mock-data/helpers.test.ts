import { describe, expect, test } from "bun:test"
import {
  getAssignmentsByClass,
  isAssignmentVisibleToUserInClass,
  USERS,
  type Assignment,
} from "@/lib/mock-data"

const sharedAssignment: Assignment = {
  id: "shared-a1",
  classId: "c1",
  classIds: ["c1", "c3"],
  teacherId: "t1",
  title: "Shared assignment",
  description: "",
  dueDate: "2026-04-30T23:59:00Z",
  maxScore: 100,
  type: "assignment",
  status: "pending",
}

describe("isAssignmentVisibleToUserInClass", () => {
  test("scopes teacher visibility to the assignment creator", () => {
    const creator = USERS.find((user) => user.id === "t1")
    const otherTeacher = USERS.find((user) => user.id === "t2")

    expect(
      isAssignmentVisibleToUserInClass(sharedAssignment, "c1", creator),
    ).toEqual(true)
    expect(
      isAssignmentVisibleToUserInClass(sharedAssignment, "c1", otherTeacher),
    ).toEqual(false)
  })

  test("scopes student visibility to enrolled assignment classes", () => {
    const enrolledStudent = USERS.find((user) => user.id === "u1")
    const outsideStudent = USERS.find((user) => user.id === "u4")

    expect(
      isAssignmentVisibleToUserInClass(sharedAssignment, "c1", enrolledStudent),
    ).toEqual(true)
    expect(
      isAssignmentVisibleToUserInClass(sharedAssignment, "c1", outsideStudent),
    ).toEqual(false)
    expect(
      isAssignmentVisibleToUserInClass(sharedAssignment, "c3", outsideStudent),
    ).toEqual(true)
  })
})

describe("getAssignmentsByClass", () => {
  test("filters class assignments by viewer role", () => {
    const teacher = USERS.find((user) => user.id === "t1")
    const otherTeacher = USERS.find((user) => user.id === "t2")
    const enrolledStudent = USERS.find((user) => user.id === "u1")
    const outsideStudent = USERS.find((user) => user.id === "u4")
    const assignments = [sharedAssignment]

    expect(getAssignmentsByClass("c1", teacher, assignments)).toEqual([
      sharedAssignment,
    ])
    expect(getAssignmentsByClass("c1", otherTeacher, assignments)).toEqual([])
    expect(getAssignmentsByClass("c1", enrolledStudent, assignments)).toEqual([
      sharedAssignment,
    ])
    expect(getAssignmentsByClass("c1", outsideStudent, assignments)).toEqual([])
  })

  test("starts empty without store assignments", () => {
    const teacher = USERS.find((user) => user.id === "t1")

    expect(getAssignmentsByClass("c1", teacher)).toEqual([])
  })
})
