import {
  BookOpen,
  ChartColumn,
  ClipboardList,
  FileText,
  FlaskConical,
  MessageSquare,
  Puzzle,
  Terminal,
  Video,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type {
  FeatureDefinition,
  FeatureSetting,
  ClassExtensionSetting,
  OrganizationExtension,
} from "@/lib/supabase/features"

export const FEATURE_KEYS = [
  "home",
  "chat",
  "materials",
  "assignments",
  "sessions",
  "exam",
  "leaderboard",
  "extensions",
  "extensions.ide",
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

export type FeatureRegistryItem = {
  key: string
  label: string
  icon: LucideIcon
  parentKey: string | null
  routeSegment: string | null
  defaultEnabled: boolean
  sortOrder: number
  renderInClassNav: boolean
}

export type ResolvedClassFeature = FeatureRegistryItem & {
  enabled: boolean
  orgEnabled: boolean
  classEnabled: boolean
  definition: FeatureDefinition | null
  organizationSetting: FeatureSetting | null
  classSetting: FeatureSetting | null
  customExtension: OrganizationExtension | null
  extensionSetting: ClassExtensionSetting | null
  children: ResolvedClassFeature[]
}

export const FEATURE_REGISTRY = [
  {
    key: "home",
    label: "Home",
    icon: BookOpen,
    parentKey: null,
    routeSegment: "home",
    defaultEnabled: true,
    sortOrder: 10,
    renderInClassNav: true,
  },
  {
    key: "chat",
    label: "Chat",
    icon: MessageSquare,
    parentKey: null,
    routeSegment: "chat",
    defaultEnabled: true,
    sortOrder: 20,
    renderInClassNav: true,
  },
  {
    key: "materials",
    label: "Materials",
    icon: FileText,
    parentKey: null,
    routeSegment: "materials",
    defaultEnabled: true,
    sortOrder: 30,
    renderInClassNav: true,
  },
  {
    key: "assignments",
    label: "Assignments",
    icon: FlaskConical,
    parentKey: null,
    routeSegment: "assignments",
    defaultEnabled: true,
    sortOrder: 40,
    renderInClassNav: true,
  },
  {
    key: "sessions",
    label: "Sessions",
    icon: Video,
    parentKey: null,
    routeSegment: "session",
    defaultEnabled: true,
    sortOrder: 50,
    renderInClassNav: true,
  },
  {
    key: "exam",
    label: "Exam",
    icon: ClipboardList,
    parentKey: null,
    routeSegment: "exam",
    defaultEnabled: true,
    sortOrder: 60,
    renderInClassNav: true,
  },
  {
    key: "leaderboard",
    label: "Results",
    icon: ChartColumn,
    parentKey: null,
    routeSegment: "leaderboard",
    defaultEnabled: true,
    sortOrder: 70,
    renderInClassNav: true,
  },
  {
    key: "extensions",
    label: "Extensions",
    icon: Puzzle,
    parentKey: null,
    routeSegment: null,
    defaultEnabled: true,
    sortOrder: 80,
    renderInClassNav: true,
  },
  {
    key: "extensions.ide",
    label: "IDE",
    icon: Terminal,
    parentKey: "extensions",
    routeSegment: "ide",
    defaultEnabled: true,
    sortOrder: 90,
    renderInClassNav: true,
  },
] satisfies FeatureRegistryItem[]

export const FEATURE_REGISTRY_BY_KEY = new Map(
  FEATURE_REGISTRY.map((feature) => [feature.key, feature]),
)

export function resolveClassFeatures({
  definitions,
  organizationSettings,
  classSettings,
  organizationExtensions = [],
  classExtensionSettings = [],
}: {
  definitions: FeatureDefinition[]
  organizationSettings: FeatureSetting[]
  classSettings: FeatureSetting[]
  organizationExtensions?: OrganizationExtension[]
  classExtensionSettings?: ClassExtensionSetting[]
}) {
  const definitionsByKey = new Map(
    definitions.map((definition) => [definition.key, definition]),
  )
  const organizationSettingsByKey = toSettingsMap(organizationSettings)
  const classSettingsByKey = toSettingsMap(classSettings)
  const extensionSettingsById = new Map(
    classExtensionSettings.map((setting) => [setting.extension_id, setting]),
  )
  const resolvedByKey = new Map<string, ResolvedClassFeature>()

  function resolveFeature(feature: FeatureRegistryItem): ResolvedClassFeature {
    const existing = resolvedByKey.get(feature.key)
    if (existing) return existing

    const definition = definitionsByKey.get(feature.key) ?? null
    const organizationSetting = organizationSettingsByKey.get(feature.key) ?? null
    const classSetting = classSettingsByKey.get(feature.key) ?? null
    const parent = feature.parentKey
      ? resolveFeature(FEATURE_REGISTRY_BY_KEY.get(feature.parentKey)!)
      : null
    const orgEnabled =
      parent?.orgEnabled !== false &&
      (organizationSetting?.enabled ??
        definition?.default_enabled ??
        feature.defaultEnabled)
    const classEnabled =
      parent?.classEnabled !== false && (classSetting?.enabled ?? true)
    const enabled = orgEnabled && classEnabled
    const resolved: ResolvedClassFeature = {
      ...feature,
      label: definition?.label ?? feature.label,
      routeSegment: definition?.route_segment ?? feature.routeSegment,
      defaultEnabled: definition?.default_enabled ?? feature.defaultEnabled,
      sortOrder: definition?.sort_order ?? feature.sortOrder,
      enabled,
      orgEnabled,
      classEnabled,
      definition,
      organizationSetting,
      classSetting,
      customExtension: null,
      extensionSetting: null,
      children: [],
    }

    resolvedByKey.set(feature.key, resolved)
    return resolved
  }

  for (const feature of FEATURE_REGISTRY) {
    resolveFeature(feature)
  }

  const extensionsParent = resolvedByKey.get("extensions")

  if (extensionsParent) {
    for (const extension of organizationExtensions) {
      const extensionSetting = extensionSettingsById.get(extension.id) ?? null
      const orgEnabled = extensionsParent.orgEnabled && extension.enabled
      const classEnabled =
        extensionsParent.classEnabled && (extensionSetting?.enabled ?? true)
      const enabled = orgEnabled && classEnabled

      resolvedByKey.set(`custom-extension:${extension.id}`, {
        key: `custom-extension:${extension.id}`,
        label: extension.name,
        icon: Puzzle,
        parentKey: "extensions",
        routeSegment: `extensions/${extension.id}`,
        defaultEnabled: true,
        sortOrder: extension.sort_order,
        renderInClassNav: true,
        enabled,
        orgEnabled,
        classEnabled,
        definition: null,
        organizationSetting: null,
        classSetting: null,
        customExtension: extension,
        extensionSetting,
        children: [],
      })
    }
  }

  const resolvedFeatures = Array.from(resolvedByKey.values()).sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )

  for (const feature of resolvedFeatures) {
    if (!feature.parentKey) continue

    const parent = resolvedByKey.get(feature.parentKey)
    if (parent) {
      parent.children.push(feature)
    }
  }

  return resolvedFeatures
}

export function getClassNavFeatures(features: ResolvedClassFeature[]) {
  return features
    .filter(
      (feature) =>
        feature.enabled &&
        feature.renderInClassNav &&
        feature.parentKey === null,
    )
    .map((feature) => ({
      ...feature,
      children: feature.children.filter(
        (child) => child.enabled && child.renderInClassNav,
      ),
    }))
    .filter(
      (feature) => feature.routeSegment !== null || feature.children.length > 0,
    )
}

export function getFeatureByRouteSegment(
  features: ResolvedClassFeature[],
  routeSegment: string,
) {
  return features.find((feature) => feature.routeSegment === routeSegment)
}

function toSettingsMap(settings: FeatureSetting[]) {
  return new Map(settings.map((setting) => [setting.feature_key, setting]))
}
