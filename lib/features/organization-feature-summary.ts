import type { SupabaseClient } from "@supabase/supabase-js"

export type OrganizationFeatureIconKey =
  | "public"
  | "home"
  | "chat"
  | "materials"
  | "assignments"
  | "sessions"
  | "exam"
  | "leaderboard"
  | "extensions"
  | "ide"

export type OrganizationFeatureSummary = {
  key: string
  label: string
  description: string
  icon: OrganizationFeatureIconKey
}

const PUBLIC_ACCESS_SUMMARY: OrganizationFeatureSummary = {
  key: "public_access",
  label: "Public Access",
  description: "Public join links and visible classes",
  icon: "public",
}

const FEATURE_SUMMARY_BY_KEY: Record<string, OrganizationFeatureSummary> = {
  home: {
    key: "home",
    label: "Home",
    description: "Class overview",
    icon: "home",
  },
  chat: {
    key: "chat",
    label: "Chat",
    description: "Announcements and discussion",
    icon: "chat",
  },
  materials: {
    key: "materials",
    label: "Materials",
    description: "Shared learning resources",
    icon: "materials",
  },
  assignments: {
    key: "assignments",
    label: "Assignments",
    description: "Submissions and quizzes",
    icon: "assignments",
  },
  sessions: {
    key: "sessions",
    label: "Sessions",
    description: "Live classes",
    icon: "sessions",
  },
  exam: {
    key: "exam",
    label: "Exam",
    description: "Timed exams and grading",
    icon: "exam",
  },
  leaderboard: {
    key: "leaderboard",
    label: "Results",
    description: "Performance summaries",
    icon: "leaderboard",
  },
  extensions: {
    key: "extensions",
    label: "Extensions",
    description: "Extra class tools",
    icon: "extensions",
  },
  "extensions.ide": {
    key: "extensions.ide",
    label: "IDE",
    description: "Code workspace",
    icon: "ide",
  },
}

export function getOrganizationFeatureSummary(featureKey: string) {
  return FEATURE_SUMMARY_BY_KEY[featureKey] ?? null
}

export async function loadEnabledOrganizationFeatureSummaries(
  supabase: SupabaseClient,
  organizationId: string,
) {
  const { data: settingsData, error: settingsError } = await supabase
    .from("organization_settings")
    .select("public_features_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle()
  const { data, error } = await supabase
    .from("organization_feature_settings")
    .select("feature_key, enabled")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
  const { data: extensionData, error: extensionError } = await supabase
    .from("organization_extensions")
    .select("id, name, description, launch_url, enabled")
    .eq("organization_id", organizationId)
    .eq("enabled", true)

  if (settingsError) throw settingsError
  if (error) throw error
  if (extensionError) throw extensionError

  const features = (data ?? [])
    .map((setting) => getOrganizationFeatureSummary(setting.feature_key))
    .filter((feature): feature is OrganizationFeatureSummary =>
      Boolean(feature),
    )
  const extensionsEnabled = features.some(
    (feature) => feature.key === "extensions",
  )

  const customExtensions = extensionsEnabled
    ? (extensionData ?? []).map((extension) => ({
        key: `extension:${extension.id}`,
        label: extension.name,
        description: extension.description || "Custom extension",
        icon: "extensions" as const,
      }))
    : []

  const summaries = [...features, ...customExtensions]

  return settingsData?.public_features_enabled
    ? [PUBLIC_ACCESS_SUMMARY, ...summaries]
    : summaries
}

export function isOrganizationFeatureLockedDisabled(config: unknown) {
  return (
    typeof config === "object" &&
    config !== null &&
    "locked_disabled" in config &&
    (config as { locked_disabled?: unknown }).locked_disabled === true
  )
}
