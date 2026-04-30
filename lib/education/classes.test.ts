import { describe, expect, test } from "bun:test"
import { getClassesForUser } from "@/lib/education/classes"
import type { User } from "@/lib/mock-data"
import type { OrganizationClass } from "@/lib/supabase/classes"

const baseUser: User = {
  id: "student-1",
  name: "Student One",
  email: "student@example.com",
  role: "student",
  avatar: "SO",
  institution: "Eduverse",
}

const classes: OrganizationClass[] = [
  createClass("class-1", [
    {
      id: "membership-1",
      class_id: "class-1",
      user_id: "student-1",
      role: "student",
    },
  ]),
  createClass("class-2", [
    {
      id: "membership-2",
      class_id: "class-2",
      user_id: "teacher-1",
      role: "teacher",
    },
  ]),
  createClass("class-3", [], "teacher-2"),
]

describe("getClassesForUser", () => {
  test("returns classes where the user has a membership", () => {
    expect(
      getClassesForUser(classes, baseUser).map((classItem) => classItem.id),
    ).toEqual(["class-1"])
  })

  test("returns all classes for admins", () => {
    expect(
      getClassesForUser(classes, { ...baseUser, role: "admin" }).map(
        (classItem) => classItem.id,
      ),
    ).toEqual(["class-1", "class-2", "class-3"])
  })

  test("returns classes assigned through teacher_user_id", () => {
    expect(
      getClassesForUser(classes, {
        ...baseUser,
        id: "teacher-2",
        role: "teacher",
      }).map((classItem) => classItem.id),
    ).toEqual(["class-3"])
  })
})

function createClass(
  id: string,
  memberships: OrganizationClass["memberships"],
  teacherUserId: string | null = null,
): OrganizationClass {
  return {
    id,
    organization_id: "organization-1",
    name: id,
    code: id.toUpperCase(),
    subject: "General",
    teacher_user_id: teacherUserId,
    color: "indigo",
    description: "",
    schedule_text: null,
    room: null,
    semester: null,
    is_archived: false,
    memberships,
    teacher: null,
    students: [],
    featureSettings: [],
  }
}
