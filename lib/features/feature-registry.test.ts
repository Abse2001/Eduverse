import { describe, expect, test } from "bun:test"
import {
  getClassNavFeatures,
  getFeatureByRouteSegment,
  resolveClassFeatures,
} from "@/lib/features/feature-registry"
import type {
  FeatureDefinition,
  FeatureSetting,
} from "@/lib/supabase/features"

const definitions: FeatureDefinition[] = [
  createDefinition("home", "Home", null, "home", true, 10),
  createDefinition("chat", "Chat", null, "chat", true, 20),
  createDefinition("materials", "Materials", null, "materials", true, 30),
  createDefinition("assignments", "Assignments", null, "assignments", true, 40),
  createDefinition("sessions", "Sessions", null, "session", true, 50),
  createDefinition("exam", "Exam", null, "exam", true, 60),
  createDefinition("leaderboard", "Results", null, "leaderboard", true, 70),
  createDefinition("extensions", "Extensions", null, null, true, 80),
  createDefinition("extensions.ide", "IDE", "extensions", "ide", true, 90),
]

describe("resolveClassFeatures", () => {
  test("requires organization and class settings to both be enabled", () => {
    const features = resolveClassFeatures({
      definitions,
      organizationSettings: [
        createSetting("chat", true),
        createSetting("exam", true),
      ],
      classSettings: [
        createSetting("chat", false),
        createSetting("exam", true),
      ],
    })

    expect(features.find((feature) => feature.key === "chat")?.enabled).toEqual(
      false,
    )
    expect(features.find((feature) => feature.key === "exam")?.enabled).toEqual(
      true,
    )
  })

  test("disables child features when parent extension is disabled", () => {
    const features = resolveClassFeatures({
      definitions,
      organizationSettings: [
        createSetting("extensions", false),
        createSetting("extensions.ide", true),
      ],
      classSettings: [
        createSetting("extensions", true),
        createSetting("extensions.ide", true),
      ],
    })

    expect(
      features.find((feature) => feature.key === "extensions.ide")?.enabled,
    ).toEqual(false)
    expect(getFeatureByRouteSegment(features, "ide")?.enabled).toEqual(false)
  })
})

describe("getClassNavFeatures", () => {
  test("returns enabled top-level features with children attached", () => {
    const features = resolveClassFeatures({
      definitions,
      organizationSettings: [
        createSetting("extensions", true),
        createSetting("extensions.ide", true),
      ],
      classSettings: [
        createSetting("extensions", true),
        createSetting("extensions.ide", true),
      ],
    })
    const navFeatures = getClassNavFeatures(features)
    const extensions = navFeatures.find((feature) => feature.key === "extensions")

    expect(
      navFeatures.some((feature) => feature.key === "extensions.ide"),
    ).toEqual(false)
    expect(extensions?.children.map((feature) => feature.key)).toEqual([
      "extensions.ide",
    ])
  })
})

function createDefinition(
  key: string,
  label: string,
  parentKey: string | null,
  routeSegment: string | null,
  defaultEnabled: boolean,
  sortOrder: number,
): FeatureDefinition {
  return {
    key,
    label,
    description: "",
    parent_key: parentKey,
    kind: key.startsWith("extensions") ? "extension" : "core",
    route_segment: routeSegment,
    default_enabled: defaultEnabled,
    is_system: true,
    sort_order: sortOrder,
    metadata: {},
  }
}

function createSetting(featureKey: string, enabled: boolean): FeatureSetting {
  return {
    feature_key: featureKey,
    enabled,
    config: {},
  }
}
