export const ORGANIZATION_ROLE_BADGES: Record<string, string> = {
  org_owner:
    "border-0 bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  org_admin:
    "border-0 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  teacher:
    "border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  student:
    "border-0 bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
}

export function organizationRoleLabel(role: string) {
  if (role === "org_owner") return "Owner"
  if (role === "org_admin") return "Admin"
  if (role === "teacher") return "Teacher"
  return "Student"
}
