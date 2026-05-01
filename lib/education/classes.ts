import type { User } from "@/lib/mock-data"
import type { OrganizationClass } from "@/lib/supabase/classes"

export function getClassesForUser(
  classes: OrganizationClass[],
  user: User,
): OrganizationClass[] {
  if (user.role === "admin") return classes

  return classes.filter((classItem) => hasClassAccessForRole(classItem, user))
}

export function hasClassAccessForRole(
  classItem: OrganizationClass,
  user: User,
) {
  if (user.role === "admin") return true

  if (user.role === "teacher" && isClassTeacher(classItem, user.id)) {
    return true
  }

  if (user.role === "student" && isClassStudent(classItem, user.id)) {
    return true
  }

  return false
}

function isClassTeacher(classItem: OrganizationClass, userId: string) {
  if (classItem.teacher_user_id === userId) return true

  return classItem.memberships.some(
    (membership) =>
      membership.user_id === userId &&
      (membership.role === "teacher" || membership.role === "ta"),
  )
}

function isClassStudent(classItem: OrganizationClass, userId: string) {
  return classItem.memberships.some(
    (membership) =>
      membership.user_id === userId && membership.role === "student",
  )
}
