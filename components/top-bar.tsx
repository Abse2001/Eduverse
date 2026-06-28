"use client"

import { Menu, Search, X } from "lucide-react"
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
import { getClassesForUser } from "@/lib/education/classes"
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
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const {
    activeOrganization,
    currentUser,
    featureDefinitions,
    organizationClasses,
  } = useApp()
  const searchableClasses = useMemo(() => {
    if (!activeOrganization) return []

    return getClassesForUser(organizationClasses, currentUser, {
      publicOrganizationFeaturesEnabled:
        activeOrganization.settings.public_features_enabled,
    })
  }, [activeOrganization, currentUser, organizationClasses])
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const searchResults = useMemo(() => {
    if (!activeOrganization || !normalizedSearch) return []

    const results: SearchResult[] = []

    for (const classItem of searchableClasses) {
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
    searchableClasses,
  ])
  const showSearchResults = isSearchFocused && normalizedSearch.length > 0
  const closeSearch = () => {
    setSearchQuery("")
    setIsSearchFocused(false)
    setIsMobileSearchOpen(false)
  }

  return (
    <header className="relative h-14 border-b border-border flex items-center px-3 sm:px-4 gap-2 sm:gap-3 bg-card/80 backdrop-blur-sm">
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
        <div className="relative hidden flex-1 md:block md:max-w-sm">
          <SearchInput
            query={searchQuery}
            results={searchResults}
            setFocused={setIsSearchFocused}
            setQuery={setSearchQuery}
            showResults={showSearchResults}
            onSelect={closeSearch}
          />
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
          <Button
            aria-label={isMobileSearchOpen ? "Close search" : "Open search"}
            className="md:hidden"
            size="icon"
            variant="ghost"
            onClick={() => {
              setIsMobileSearchOpen((open) => !open)
              setIsSearchFocused(true)
            }}
          >
            {isMobileSearchOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
          <RoleMenu />
          <OrganizationMenu />
          <NotificationsMenu />
          <AccountMenu />
        </div>
      )}
      {!isLocked && isMobileSearchOpen ? (
        <div className="absolute inset-x-0 top-full z-50 border-b bg-card p-2 shadow-sm md:hidden">
          <SearchInput
            query={searchQuery}
            results={searchResults}
            setFocused={setIsSearchFocused}
            setQuery={setSearchQuery}
            showResults={normalizedSearch.length > 0}
            onSelect={closeSearch}
            autoFocus
          />
        </div>
      ) : null}
    </header>
  )
}

function SearchInput({
  autoFocus,
  onSelect,
  query,
  results,
  setFocused,
  setQuery,
  showResults,
}: {
  autoFocus?: boolean
  onSelect: () => void
  query: string
  results: SearchResult[]
  setFocused: (focused: boolean) => void
  setQuery: (query: string) => void
  showResults: boolean
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        autoFocus={autoFocus}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        placeholder="Search classes, materials, exams..."
        className="w-full rounded-lg border border-input bg-background py-1.5 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
      />
      {showResults ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
          {results.length > 0 ? (
            <div className="max-h-80 overflow-y-auto p-1">
              {results.map((result) => (
                <Link
                  key={result.key}
                  href={result.href}
                  className="block rounded-md px-3 py-2 hover:bg-accent"
                  onClick={onSelect}
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
