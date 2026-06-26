import type { User } from "@/lib/mock-data"
import type { OrganizationClass } from "@/lib/supabase/classes"

export function getClassesForUser(
  classes: OrganizationClass[],
  user: User,
  options: { publicOrganizationFeaturesEnabled?: boolean } = {},
): OrganizationClass[] {
  return getAccessibleClassesForUser(classes, user, options).filter(
    (classItem) =>
      !classItem.hidden_by_current_user ||
      !isOrganizationVisibleToUser(classItem, options),
  )
}

export function getHiddenClassesForUser(
  classes: OrganizationClass[],
  user: User,
  options: { publicOrganizationFeaturesEnabled?: boolean } = {},
): OrganizationClass[] {
  return getAccessibleClassesForUser(classes, user, options).filter(
    (classItem) =>
      classItem.hidden_by_current_user &&
      isOrganizationVisibleToUser(classItem, options),
  )
}

export function getAccessibleClassesForUser(
  classes: OrganizationClass[],
  user: User,
  options: { publicOrganizationFeaturesEnabled?: boolean } = {},
): OrganizationClass[] {
  if (user.role === "admin") return classes

  return classes.filter((classItem) =>
    hasClassAccessForRole(classItem, user, options),
  )
}

export function hasClassAccessForRole(
  classItem: OrganizationClass,
  user: User,
  options: { publicOrganizationFeaturesEnabled?: boolean } = {},
) {
  if (user.role === "admin") return true

  if (
    user.role === "student" &&
    isOrganizationVisibleToUser(classItem, options)
  ) {
    return true
  }

  if (user.role === "teacher" && isClassTeacher(classItem, user.id)) {
    return true
  }

  if (user.role === "student" && isClassStudent(classItem, user.id)) {
    return true
  }

  return false
}

export function groupClassesByTermAndStage(classes: OrganizationClass[]) {
  const termMap = new Map<string, Map<string, OrganizationClass[]>>()

  for (const classItem of classes) {
    const termLabel = classItem.semester?.trim() || "Unassigned Term"
    const stageLabel = classItem.stage?.trim() || "Unassigned Stage"
    const stageMap =
      termMap.get(termLabel) ?? new Map<string, OrganizationClass[]>()

    stageMap.set(stageLabel, [...(stageMap.get(stageLabel) ?? []), classItem])
    termMap.set(termLabel, stageMap)
  }

  return Array.from(termMap.entries()).map(([label, stageMap]) => {
    const stages = Array.from(stageMap.entries()).map(
      ([stageLabel, stageClasses]) => ({
        label: stageLabel,
        classes: stageClasses,
      }),
    )

    return {
      label,
      stages,
      classes: stages.flatMap((stage) => stage.classes),
    }
  })
}

function isOrganizationVisibleToUser(
  classItem: OrganizationClass,
  options: { publicOrganizationFeaturesEnabled?: boolean },
) {
  return (
    classItem.organization_visible &&
    (options.publicOrganizationFeaturesEnabled ?? true)
  )
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
