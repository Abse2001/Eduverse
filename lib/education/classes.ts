import type { User } from "@/lib/mock-data"
import type { OrganizationClass } from "@/lib/supabase/classes"

export function getClassesForUser(
  classes: OrganizationClass[],
  user: User,
): OrganizationClass[] {
  if (user.role === "admin") return classes

  return classes.filter((classItem) => hasClassAccess(classItem, user))
}

function hasClassAccess(classItem: OrganizationClass, user: User) {
  if (user.role === "teacher" && classItem.teacher_user_id === user.id) {
    return true
  }

  return classItem.memberships.some(
    (membership) => membership.user_id === user.id,
  )
}
