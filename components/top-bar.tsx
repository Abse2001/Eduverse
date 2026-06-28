"use client"

import { Menu, Search } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useExamLock } from "@/features/exam/exam-lock"
import { AccountMenu } from "@/components/top-bar/account-menu"
import { NotificationsMenu } from "@/components/top-bar/notifications-menu"
import { OrganizationMenu } from "@/components/top-bar/organization-menu"
import { RoleMenu } from "@/components/top-bar/role-menu"
import { Button } from "@/components/ui/button"
import {
  getClassNavFeatures,
  resolveClassFeatures,
} from "@/lib/features/feature-registry"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

type SearchResult = {
  key: string
  title: string
  eyebrow: string
  href: string
}

export function TopBar({
  onOpenMobileSidebar,
}: {
  onOpenMobileSidebar?: () => void
}) {
  const { isLocked } = useExamLock()
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const { activeOrganization, featureDefinitions, organizationClasses } =
    useApp()
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const searchResults = useMemo(() => {
    if (!activeOrganization || !normalizedSearch) return []

    const results: SearchResult[] = []

    for (const classItem of organizationClasses) {
      const classText = [
        classItem.name,
        classItem.code,
        classItem.semester,
        classItem.stage,
        classItem.teacher?.display_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      const classFeatures = getClassNavFeatures(
        resolveClassFeatures({
          definitions: featureDefinitions,
          organizationSettings: activeOrganization.featureSettings,
          classSettings: classItem.featureSettings,
          organizationExtensions: activeOrganization.extensions,
          classExtensionSettings: classItem.extensionSettings,
        }),
      )
      const firstFeature = getFirstFeatureRouteSegment(classFeatures) ?? "home"

      if (classText.includes(normalizedSearch)) {
        results.push({
          key: `class-${classItem.id}`,
          title: classItem.name,
          eyebrow: [classItem.code, classItem.semester, classItem.stage]
            .filter(Boolean)
            .join(" · "),
          href: `/classes/${classItem.id}/${firstFeature}`,
        })
      }

      for (const feature of classFeatures) {
        const featureMatches =
          feature.label.toLowerCase().includes(normalizedSearch) ||
          classItem.name.toLowerCase().includes(normalizedSearch)

        if (!feature.routeSegment || !featureMatches) continue

        results.push({
          key: `feature-${classItem.id}-${feature.key}`,
          title: feature.label,
          eyebrow: classItem.name,
          href: `/classes/${classItem.id}/${feature.routeSegment}`,
        })
      }
    }

    return results.slice(0, 8)
  }, [
    activeOrganization,
    featureDefinitions,
    normalizedSearch,
    organizationClasses,
  ])
  const showSearchResults = isSearchFocused && normalizedSearch.length > 0

  return (
    <header className="h-14 border-b border-border flex items-center px-3 sm:px-4 gap-2 sm:gap-3 bg-card/80 backdrop-blur-sm">
      {!isLocked ? (
        <Button
          aria-label="Open navigation"
          className="md:hidden"
          size="icon"
          variant="ghost"
          onClick={onOpenMobileSidebar}
        >
          <Menu className="h-4 w-4" />
        </Button>
      ) : null}
      {!isLocked ? (
        <div className="relative flex-1 max-w-sm hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() =>
              window.setTimeout(() => setIsSearchFocused(false), 120)
            }
            placeholder="Search classes, materials, exams..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          {showSearchResults ? (
            <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
              {searchResults.length > 0 ? (
                <div className="max-h-80 overflow-y-auto p-1">
                  {searchResults.map((result) => (
                    <Link
                      key={result.key}
                      href={result.href}
                      className="block rounded-md px-3 py-2 hover:bg-accent"
                      onClick={() => {
                        setSearchQuery("")
                        setIsSearchFocused(false)
                      }}
                    >
                      <span className="block truncate text-sm font-medium">
                        {result.title}
                      </span>
                      <span
                        className={cn(
                          "block truncate text-xs text-muted-foreground",
                          !result.eyebrow && "sr-only",
                        )}
                      >
                        {result.eyebrow || "Search result"}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  No matching classes or tools.
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex-1">
          <div className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            Exam mode active
          </div>
        </div>
      )}

      {/* Right side */}
      {!isLocked && (
        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          <RoleMenu />
          <OrganizationMenu />
          <NotificationsMenu />
          <AccountMenu />
        </div>
      )}
    </header>
  )
}

function getFirstFeatureRouteSegment(
  features: ReturnType<typeof getClassNavFeatures>,
) {
  for (const feature of features) {
    if (feature.routeSegment) return feature.routeSegment

    const childRouteSegment = feature.children.find(
      (child) => child.routeSegment,
    )?.routeSegment

    if (childRouteSegment) return childRouteSegment
  }

  return null
}
