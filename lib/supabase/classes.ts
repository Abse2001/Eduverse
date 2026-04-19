import { createClient } from "@/lib/supabase/client"
import type { Class } from "@/lib/mock-data"

export type ClassRole = "teacher" | "student" | "ta"

export type ClassProfile = {
  id: string
  display_name: string
  email: string
}

export type ClassMembership = {
  id: string
  class_id: string
  user_id: string
  role: ClassRole
}

export type OrganizationClass = {
  id: string
  organization_id: string
  name: string
  code: string
  subject: string
  teacher_user_id: string | null
  color: string | null
  description: string
  schedule_text: string | null
  room: string | null
  semester: string | null
  is_archived: boolean
  memberships: ClassMembership[]
  teacher: ClassProfile | null
  students: ClassProfile[]
}

type ClassRow = Omit<OrganizationClass, "memberships" | "teacher" | "students">

export async function loadOrganizationClasses(organizationId: string) {
  const supabase = createClient()
  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select(
      "id, organization_id, name, code, subject, teacher_user_id, color, description, schedule_text, room, semester, is_archived",
    )
    .eq("organization_id", organizationId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })

  if (classError) throw classError

  return hydrateClasses((classData ?? []) as ClassRow[])
}

export async function loadClass(classId: string) {
  const supabase = createClient()
  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select(
      "id, organization_id, name, code, subject, teacher_user_id, color, description, schedule_text, room, semester, is_archived",
    )
    .eq("id", classId)
    .eq("is_archived", false)
    .single()

  if (classError) throw classError

  const [classRow] = await hydrateClasses([classData as ClassRow])

  return classRow
}

export function toLegacyClass(classRow: OrganizationClass): Class {
  return {
    id: classRow.id,
    name: classRow.name,
    code: classRow.code,
    subject: classRow.subject,
    teacherId: classRow.teacher_user_id ?? "",
    color: classRow.color ?? "indigo",
    description: classRow.description,
    studentIds: classRow.students.map((student) => student.id),
    schedule: classRow.schedule_text ?? "No schedule",
    room: classRow.room ?? "No room",
    semester: classRow.semester ?? "",
  }
}

async function hydrateClasses(classRows: ClassRow[]) {
  if (classRows.length === 0) return []

  const supabase = createClient()
  const classIds = classRows.map((classRow) => classRow.id)
  const { data: membershipData, error: membershipError } = await supabase
    .from("class_memberships")
    .select("id, class_id, user_id, role")
    .in("class_id", classIds)
    .order("created_at", { ascending: true })

  if (membershipError) throw membershipError

  const memberships = (membershipData ?? []) as ClassMembership[]
  const profileIds = Array.from(
    new Set([
      ...classRows.flatMap((classRow) =>
        classRow.teacher_user_id ? [classRow.teacher_user_id] : [],
      ),
      ...memberships.map((membership) => membership.user_id),
    ]),
  )

  const { data: profileData, error: profileError } =
    profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", profileIds)
      : { data: [], error: null }

  if (profileError) throw profileError

  const profileMap = new Map(
    ((profileData ?? []) as ClassProfile[]).map((profile) => [
      profile.id,
      profile,
    ]),
  )
  const membershipsByClass = new Map<string, ClassMembership[]>()

  for (const membership of memberships) {
    const existing = membershipsByClass.get(membership.class_id) ?? []
    existing.push(membership)
    membershipsByClass.set(membership.class_id, existing)
  }

  return classRows.map((classRow) => {
    const classMemberships = membershipsByClass.get(classRow.id) ?? []
    const teacher =
      (classRow.teacher_user_id
        ? profileMap.get(classRow.teacher_user_id)
        : undefined) ??
      profileMap.get(
        classMemberships.find((membership) => membership.role === "teacher")
          ?.user_id ?? "",
      ) ??
      null
    const students = classMemberships
      .filter((membership) => membership.role === "student")
      .map((membership) => profileMap.get(membership.user_id))
      .filter((profile): profile is ClassProfile => Boolean(profile))

    return {
      ...classRow,
      memberships: classMemberships,
      teacher,
      students,
    }
  })
}
