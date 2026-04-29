import type { User } from "@/lib/mock-data"
import type { OrganizationClass } from "@/lib/supabase/classes"

export function getClassesForUser(
  classes: OrganizationClass[],
  user: User,
): OrganizationClass[] {
  if (user.role === "admin") return classes

  return classes.filter((classItem) => hasClassMembership(classItem, user.id))
}

function hasClassMembership(classItem: OrganizationClass, userId: string) {
  return classItem.memberships.some(
    (membership) => membership.user_id === userId,
  )
}
