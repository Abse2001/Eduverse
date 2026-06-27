"use client"

import { FormEvent, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Baby,
  BookOpen,
  Building2,
  CheckCircle2,
  Code2,
  GraduationCap,
  Globe2,
  LoaderCircle,
  LucideIcon,
  MessageSquare,
  Puzzle,
  SlidersHorizontal,
  ShieldCheck,
  University,
  Users,
  Video,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useApp } from "@/lib/store"
import { toast } from "@/hooks/use-toast"

const FEATURE_OPTIONS = [
  {
    key: "home",
    label: "Home",
    description: "Class overview and landing page.",
    icon: Building2,
    locked: true,
  },
  {
    key: "chat",
    label: "Chat",
    description: "Class discussion and announcements.",
    icon: MessageSquare,
  },
  {
    key: "materials",
    label: "Materials",
    description: "Shared resources and learning materials.",
    icon: BookOpen,
  },
  {
    key: "assignments",
    label: "Assignments",
    description: "Assignments, quizzes, labs, and submissions.",
    icon: CheckCircle2,
  },
  {
    key: "sessions",
    label: "Sessions",
    description: "Live class sessions and realtime collaboration.",
    icon: Video,
  },
  {
    key: "exam",
    label: "Exam",
    description: "Timed exams and grading workflows.",
    icon: GraduationCap,
  },
  {
    key: "leaderboard",
    label: "Results",
    description: "Performance summaries and leaderboards.",
    icon: Users,
  },
  {
    key: "extensions",
    label: "Extensions",
    description: "Built-in and custom class extensions.",
    icon: Puzzle,
  },
  {
    key: "extensions.ide",
    label: "IDE",
    description: "Code editor and programming workspace.",
    icon: Code2,
    parentKey: "extensions",
  },
] satisfies FeatureOption[]

const ALL_FEATURE_KEYS = FEATURE_OPTIONS.map((feature) => feature.key)

const FEATURE_PRESETS = [
  {
    key: "custom",
    submitKey: "open_learning",
    name: "Custom",
    tagline: "Start from a blank control panel and choose every tool yourself.",
    description: "Custom setup with editable feature settings.",
    icon: SlidersHorizontal,
    accentClass:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300",
    enabledFeatures: ALL_FEATURE_KEYS,
    publicAccessEnabled: true,
  },
  {
    key: "open_learning",
    submitKey: "open_learning",
    name: "Open Learning",
    tagline: "Public access, join links, and broad discovery for open courses.",
    description: "Open learning setup with public organization access enabled.",
    icon: Globe2,
    accentClass:
      "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-300",
    enabledFeatures: ALL_FEATURE_KEYS,
    publicAccessEnabled: true,
  },
  {
    key: "primary_school",
    submitKey: "primary_school",
    name: "Primary School",
    tagline: "A balanced starter workspace for everyday classroom operations.",
    description: "Core classroom tools with live sessions and extensions off.",
    icon: GraduationCap,
    accentClass:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300",
    features: [
      { label: "Classes and rosters", icon: Users },
      { label: "Assignments", icon: BookOpen },
      { label: "Live sessions", icon: Video },
    ],
    enabledFeatures: [
      "home",
      "chat",
      "materials",
      "assignments",
      "exam",
      "leaderboard",
    ],
    publicAccessEnabled: false,
  },
  {
    key: "kindergarten",
    submitKey: "kindergarten",
    name: "Kindergarten",
    tagline: "A lighter template for young learners and simple class routines.",
    description: "Simple setup without exams, sessions, or extensions.",
    icon: Baby,
    accentClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
    features: [
      { label: "Simple classes", icon: Users },
      { label: "Teacher materials", icon: BookOpen },
      { label: "Protected access", icon: ShieldCheck },
    ],
    enabledFeatures: [
      "home",
      "chat",
      "materials",
      "assignments",
      "leaderboard",
    ],
    publicAccessEnabled: false,
  },
  {
    key: "university",
    submitKey: "university",
    name: "University",
    tagline: "A full academic workspace for advanced courses and labs.",
    description: "Full setup with sessions, exams, extensions, and IDE.",
    icon: University,
    accentClass:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
    features: [
      { label: "Exams", icon: CheckCircle2 },
      { label: "Extensions", icon: Puzzle },
      { label: "Code IDE", icon: Code2 },
    ],
    enabledFeatures: ALL_FEATURE_KEYS,
    publicAccessEnabled: false,
  },
] satisfies OrganizationPreset[]

type FeatureOption = {
  key: string
  label: string
  description: string
  icon: LucideIcon
  locked?: boolean
  parentKey?: string
}

type OrganizationPreset = {
  key: string
  submitKey: "primary_school" | "kindergarten" | "university" | "open_learning"
  name: string
  tagline: string
  description: string
  icon: LucideIcon
  accentClass: string
  features?: Array<{
    label: string
    icon: LucideIcon
  }>
  enabledFeatures: string[]
  publicAccessEnabled: boolean
}

export function OrganizationCreatePage() {
  const router = useRouter()
  const { currentUser, refreshCurrentUser } = useApp()
  const [orgName, setOrgName] = useState("")
  const [orgSlug, setOrgSlug] = useState("")
  const [presetKey, setPresetKey] = useState("custom")
  const [customPublicAccessEnabled, setCustomPublicAccessEnabled] =
    useState(true)
  const [customFeatures, setCustomFeatures] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        FEATURE_OPTIONS.map((feature) => [feature.key, true]),
      ) as Record<string, boolean>,
  )
  const [isPending, startTransition] = useTransition()
  const selectedPreset =
    FEATURE_PRESETS.find((preset) => preset.key === presetKey) ??
    FEATURE_PRESETS[0]
  const displayedFeatures =
    selectedPreset.key === "custom"
      ? customFeatures
      : Object.fromEntries(
          FEATURE_OPTIONS.map((feature) => [
            feature.key,
            selectedPreset.enabledFeatures.includes(feature.key),
          ]),
        )
  const publicAccessEnabled =
    selectedPreset.key === "custom"
      ? customPublicAccessEnabled
      : selectedPreset.publicAccessEnabled
  const isCustomPreset = selectedPreset.key === "custom"

  function submitCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc("create_organization", {
        org_name: orgName,
        requested_slug: orgSlug || null,
        preset_key: selectedPreset.submitKey,
        public_access_enabled: publicAccessEnabled,
        feature_enabled_overrides: buildFeatureOverrides(displayedFeatures),
      })

      if (error) {
        toast({
          title: "Could not create organization",
          description: error.message,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Organization created",
        description: "You now have a new workspace.",
      })

      await refreshCurrentUser()
      router.replace("/dashboard")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center p-6">
      <div className="mb-6 flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">
              Create organization
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Signed in as {currentUser.name}. You will become the admin of this
              organization.
            </p>
          </div>
        </div>
      </div>

      <form
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)]"
        onSubmit={submitCreateOrganization}
      >
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Choose a template
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Templates preselect the tools your organization starts with.
            </p>
          </div>
          <div className="grid gap-3">
            {FEATURE_PRESETS.map((preset) => (
              <PresetCard
                key={preset.key}
                preset={preset}
                isSelected={presetKey === preset.key}
                onSelect={() => setPresetKey(preset.key)}
              />
            ))}
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Organization details</CardTitle>
            <CardDescription>
              The organization becomes your active workspace after creation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                  placeholder="Eduverse Academy"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Preferred slug</Label>
                <Input
                  id="org-slug"
                  value={orgSlug}
                  onChange={(event) => setOrgSlug(event.target.value)}
                  placeholder="eduverse-academy"
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Leave blank to auto-generate from the name.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>Access and features</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isCustomPreset
                      ? "Choose who can find this organization and which tools it starts with."
                      : "Unavailable access and tools are muted for the selected preset."}
                  </p>
                </div>
                <div className="grid gap-2">
                  <PublicAccessToggle
                    checked={publicAccessEnabled}
                    disabled={!isCustomPreset}
                    onCheckedChange={setCustomPublicAccessEnabled}
                  />
                  {FEATURE_OPTIONS.map((feature) => (
                    <FeatureToggle
                      key={feature.key}
                      feature={feature}
                      checked={displayedFeatures[feature.key] ?? false}
                      disabled={!isCustomPreset || Boolean(feature.locked)}
                      parentDisabled={isParentDisabled(
                        feature,
                        displayedFeatures,
                      )}
                      onCheckedChange={(checked) =>
                        setCustomFeatures((currentFeatures) =>
                          updateFeatureSelection(
                            currentFeatures,
                            feature,
                            checked,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create organization"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}

function PresetCard({
  preset,
  isSelected,
  onSelect,
}: {
  preset: OrganizationPreset
  isSelected: boolean
  onSelect: () => void
}) {
  const PresetIcon = preset.icon

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={cn(
        "group rounded-xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isSelected &&
          "border-primary bg-primary/5 shadow-md ring-1 ring-primary",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border",
              preset.accentClass,
            )}
          >
            <PresetIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-foreground">{preset.name}</h3>
              {isSelected ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  Selected
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {preset.tagline}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-72 sm:grid-cols-3">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs font-medium text-foreground",
              !preset.publicAccessEnabled &&
                "border-dashed bg-muted/40 text-muted-foreground opacity-55",
            )}
          >
            <Globe2
              className={cn(
                "h-3.5 w-3.5",
                preset.publicAccessEnabled
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            />
            Public
          </span>
          {FEATURE_OPTIONS.filter((feature) => feature.key !== "home").map(
            (feature) => {
              const FeatureIcon = feature.icon
              const isIncluded = preset.enabledFeatures.includes(feature.key)

              return (
                <span
                  key={feature.label}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs font-medium text-foreground",
                    !isIncluded &&
                      "border-dashed bg-muted/40 text-muted-foreground opacity-55",
                  )}
                >
                  <FeatureIcon
                    className={cn(
                      "h-3.5 w-3.5",
                      isIncluded ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  {feature.label}
                </span>
              )
            },
          )}
        </div>
      </div>
    </button>
  )
}

function PublicAccessToggle({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border bg-background p-3",
        !checked && "bg-muted/40 text-muted-foreground opacity-70",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
            !checked && "bg-muted text-muted-foreground",
          )}
        >
          <Globe2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Public access</p>
          <p className="text-xs text-muted-foreground">
            Public join links and organization-visible classes.
          </p>
        </div>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label="Toggle public access"
      />
    </div>
  )
}

function FeatureToggle({
  feature,
  checked,
  disabled,
  parentDisabled,
  onCheckedChange,
}: {
  feature: FeatureOption
  checked: boolean
  disabled: boolean
  parentDisabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const FeatureIcon = feature.icon
  const isMuted = !checked || parentDisabled
  const switchDisabled = disabled || parentDisabled

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border bg-background p-3",
        isMuted && "bg-muted/40 text-muted-foreground opacity-70",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
            isMuted && "bg-muted text-muted-foreground",
          )}
        >
          <FeatureIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {feature.label}
            </p>
            {feature.locked ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Always on
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {parentDisabled
              ? "Requires Extensions to be enabled."
              : feature.description}
          </p>
        </div>
      </div>
      <Switch
        checked={checked && !parentDisabled}
        disabled={switchDisabled}
        onCheckedChange={onCheckedChange}
        aria-label={`Toggle ${feature.label}`}
      />
    </div>
  )
}

function updateFeatureSelection(
  currentFeatures: Record<string, boolean>,
  feature: FeatureOption,
  checked: boolean,
) {
  const nextFeatures = {
    ...currentFeatures,
    [feature.key]: checked,
  }

  if (feature.key === "extensions" && !checked) {
    nextFeatures["extensions.ide"] = false
  }

  if (feature.parentKey && checked) {
    nextFeatures[feature.parentKey] = true
  }

  return nextFeatures
}

function isParentDisabled(
  feature: FeatureOption,
  features: Record<string, boolean>,
) {
  return Boolean(feature.parentKey && !features[feature.parentKey])
}

function resolveFeatureEnabled(
  feature: FeatureOption,
  features: Record<string, boolean>,
) {
  if (feature.locked) return true
  if (isParentDisabled(feature, features)) return false

  return features[feature.key] === true
}

function buildFeatureOverrides(features: Record<string, boolean>) {
  return Object.fromEntries(
    FEATURE_OPTIONS.map((feature) => [
      feature.key,
      resolveFeatureEnabled(feature, features),
    ]),
  )
}
