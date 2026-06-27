import { describe, expect, test } from "bun:test"
import {
  getClassesForUser,
  getHiddenClassesForUser,
} from "@/lib/education/classes"
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
  createClass("class-4", [
    {
      id: "membership-3",
      class_id: "class-4",
      user_id: "student-1",
      role: "teacher",
    },
  ]),
  createClass("class-5", [
    {
      id: "membership-4",
      class_id: "class-5",
      user_id: "teacher-2",
      role: "student",
    },
  ]),
  createClass("class-6", [], null, {
    organizationVisible: true,
  }),
  createClass("class-7", [], null, {
    organizationVisible: true,
    hiddenByCurrentUser: true,
  }),
  createClass(
    "class-8",
    [
      {
        id: "membership-5",
        class_id: "class-8",
        user_id: "student-1",
        role: "student",
      },
    ],
    null,
    {
      hiddenByCurrentUser: true,
    },
  ),
]

describe("getClassesForUser", () => {
  test("returns student classes when the selected role is student", () => {
    expect(
      getClassesForUser(classes, baseUser).map((classItem) => classItem.id),
    ).toEqual(["class-1", "class-6", "class-8"])
  })

  test("does not return teacher classes when the selected role is student", () => {
    expect(
      getClassesForUser(classes, { ...baseUser, id: "teacher-2" }).map(
        (classItem) => classItem.id,
      ),
    ).toEqual(["class-5", "class-6"])
  })

  test("returns admin-visible classes and respects hidden preferences", () => {
    expect(
      getClassesForUser(classes, { ...baseUser, role: "admin" }).map(
        (classItem) => classItem.id,
      ),
    ).toEqual([
      "class-1",
      "class-2",
      "class-3",
      "class-4",
      "class-5",
      "class-6",
      "class-8",
    ])
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

  test("returns teacher memberships when the selected role is teacher", () => {
    expect(
      getClassesForUser(classes, {
        ...baseUser,
        role: "teacher",
      }).map((classItem) => classItem.id),
    ).toEqual(["class-4"])
  })

  test("returns hidden accessible classes separately", () => {
    expect(
      getHiddenClassesForUser(classes, baseUser).map(
        (classItem) => classItem.id,
      ),
    ).toEqual(["class-7"])
  })

  test("ignores organization-visible classes when public organization features are disabled", () => {
    expect(
      getClassesForUser(classes, baseUser, {
        publicOrganizationFeaturesEnabled: false,
      }).map((classItem) => classItem.id),
    ).toEqual(["class-1", "class-8"])

    expect(
      getHiddenClassesForUser(classes, baseUser, {
        publicOrganizationFeaturesEnabled: false,
      }).map((classItem) => classItem.id),
    ).toEqual([])
  })
})

function createClass(
  id: string,
  memberships: OrganizationClass["memberships"],
  teacherUserId: string | null = null,
  options: {
    organizationVisible?: boolean
    hiddenByCurrentUser?: boolean
  } = {},
): OrganizationClass {
  return {
    id,
    organization_id: "organization-1",
    name: id,
    code: id.toUpperCase(),
    teacher_user_id: teacherUserId,
    color: "indigo",
    description: "",
    room: null,
    semester: null,
    stage: null,
    is_archived: false,
    organization_visible: options.organizationVisible ?? false,
    results_visible_to_students: false,
    teacher_can_toggle_results_visibility: false,
    hidden_by_current_user: options.hiddenByCurrentUser ?? false,
    memberships,
    teacher: null,
    students: [],
    featureSettings: [],
    extensionSettings: [],
  }
}
