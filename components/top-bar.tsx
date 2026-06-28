"use client"

import { Menu, Search, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  loadClassAssignments,
  type ClassAssignment,
} from "@/features/assignments/use-class-assignments"
import { useExamLock } from "@/features/exam/exam-lock"
import {
  loadMaterialsWithThumbnails,
  type ClassMaterial,
} from "@/features/materials/use-class-materials"
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
import type { ClassExamApiDto } from "@/lib/exams/types"
import { type OrganizationUserRole, useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

type SearchResult = {
  key: string
  title: string
  eyebrow: string
  href: string
}

type SearchableExam = {
  id: string
  title: string
  status?: string | null
  questionCount?: number | null
}

type ExamSearchCacheEntry = {
  exams: SearchableExam[] | null
  request: Promise<SearchableExam[]> | null
  updatedAt: number
}

const EXAM_SEARCH_CACHE_TTL_MS = 60_000
const examSearchCache = new Map<string, ExamSearchCacheEntry>()

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
    activeOrganizationRole,
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
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [remoteSearchResults, setRemoteSearchResults] = useState<
    SearchResult[]
  >([])
  const [isRemoteSearchLoading, setIsRemoteSearchLoading] = useState(false)
  const localSearchResults = useMemo(() => {
    if (!activeOrganization || !normalizedSearch) return []

    const results: SearchResult[] = []

    for (const classItem of searchableClasses) {
      const classText = [
        classItem.name,
        classItem.code,
        classItem.semester,
        classItem.stage,
        classItem.room,
        classItem.description,
        classItem.teacher?.display_name,
        classItem.teacher?.email,
        ...classItem.students.flatMap((student) => [
          student.display_name,
          student.email,
        ]),
      ]
        .filter(Boolean)
        .join(" ")

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

      if (matchesSearch(classText, normalizedSearch)) {
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
        addFeatureSearchResults({
          classId: classItem.id,
          className: classItem.name,
          feature,
          normalizedSearch,
          results,
        })
      }
    }

    return results
  }, [
    activeOrganization,
    featureDefinitions,
    normalizedSearch,
    searchableClasses,
  ])
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(normalizedSearch)
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [normalizedSearch])

  useEffect(() => {
    if (!activeOrganization || debouncedSearch.length < 2) {
      setRemoteSearchResults([])
      setIsRemoteSearchLoading(false)
      return
    }

    let cancelled = false
    const targets = searchableClasses.map((classItem) => ({
      classItem,
      canManage: canManageClassContent(
        classItem,
        currentUser.id,
        activeOrganizationRole,
      ),
    }))
    setIsRemoteSearchLoading(true)

    Promise.all(
      targets.map(({ classItem, canManage }) =>
        searchClassContent({
          classItem,
          currentUserId: currentUser.id,
          canManage,
          selectedRole: activeOrganizationRole,
          normalizedSearch: debouncedSearch,
        }),
      ),
    )
      .then((classResults) => {
        if (cancelled) return
        setRemoteSearchResults(dedupeSearchResults(classResults.flat()))
      })
      .catch(() => {
        if (cancelled) return
        setRemoteSearchResults([])
      })
      .finally(() => {
        if (cancelled) return
        setIsRemoteSearchLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    activeOrganization,
    activeOrganizationRole,
    currentUser.id,
    debouncedSearch,
    searchableClasses,
  ])
  const searchResults = useMemo(
    () =>
      dedupeSearchResults([
        ...(debouncedSearch === normalizedSearch ? remoteSearchResults : []),
        ...localSearchResults,
      ]).slice(0, 12),
    [
      debouncedSearch,
      localSearchResults,
      normalizedSearch,
      remoteSearchResults,
    ],
  )
  const showSearchResults = isSearchFocused && normalizedSearch.length > 0
  const closeSearch = () => {
    setSearchQuery("")
    setIsSearchFocused(false)
    setIsMobileSearchOpen(false)
  }

  return (
    <header className="relative z-40 h-14 shrink-0 border-b border-border flex items-center px-3 sm:px-4 gap-2 sm:gap-3 bg-card/80 backdrop-blur-sm">
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
            isLoading={isRemoteSearchLoading}
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
            isLoading={isRemoteSearchLoading}
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
  isLoading,
}: {
  autoFocus?: boolean
  isLoading: boolean
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
          ) : isLoading ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              Searching...
            </div>
          ) : (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No matching results.
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

type ClassNavFeature = ReturnType<typeof getClassNavFeatures>[number]
type SearchableClass = ReturnType<typeof getClassesForUser>[number]

function addFeatureSearchResults({
  classId,
  className,
  feature,
  normalizedSearch,
  results,
}: {
  classId: string
  className: string
  feature: ClassNavFeature
  normalizedSearch: string
  results: SearchResult[]
}) {
  if (feature.routeSegment && matchesSearch(feature.label, normalizedSearch)) {
    results.push({
      key: `feature-${classId}-${feature.key}`,
      title: feature.label,
      eyebrow: className,
      href: `/classes/${classId}/${feature.routeSegment}`,
    })
  }

  for (const child of feature.children) {
    if (!child.routeSegment || !matchesSearch(child.label, normalizedSearch)) {
      continue
    }

    results.push({
      key: `feature-${classId}-${feature.key}-${child.key}`,
      title: child.label,
      eyebrow: className,
      href: `/classes/${classId}/${child.routeSegment}`,
    })
  }
}

async function searchClassContent({
  classItem,
  currentUserId,
  canManage,
  selectedRole,
  normalizedSearch,
}: {
  classItem: SearchableClass
  currentUserId: string | null
  canManage: boolean
  selectedRole: OrganizationUserRole | null
  normalizedSearch: string
}) {
  const results: SearchResult[] = []
  const [assignments, materials, exams] = await Promise.all([
    loadClassAssignments({
      classId: classItem.id,
      currentUserId,
      canManage,
    }).catch(() => [] as ClassAssignment[]),
    loadMaterialsWithThumbnails(classItem.id, {
      cacheKey: getMaterialSearchCacheKey({
        classId: classItem.id,
        currentUserId,
        canManage,
        selectedRole,
      }),
    }).catch(() => [] as ClassMaterial[]),
    fetchCachedClassExams({
      classId: classItem.id,
      currentUserId,
      canManage,
      selectedRole,
    }).catch(() => []),
  ])

  for (const assignment of assignments) {
    const assignmentText = [
      assignment.title,
      assignment.description,
      assignment.status,
      ...assignment.files.map((file) => file.originalFilename),
    ].join(" ")

    if (!matchesSearch(assignmentText, normalizedSearch)) continue

    results.push({
      key: `assignment-${assignment.id}`,
      title: assignment.title,
      eyebrow: `${classItem.name} · Assignment`,
      href: `/classes/${classItem.id}/assignments`,
    })
  }

  for (const material of materials) {
    const materialText = [
      material.title,
      material.description,
      material.type,
      material.originalFilename,
      material.mimeType,
    ].join(" ")

    if (!matchesSearch(materialText, normalizedSearch)) continue

    results.push({
      key: `material-${material.id}`,
      title: material.title,
      eyebrow: `${classItem.name} · Material`,
      href: `/classes/${classItem.id}/materials`,
    })
  }

  for (const exam of exams) {
    const examText = [
      exam.title,
      exam.status,
      "questionCount" in exam ? `${exam.questionCount} questions` : null,
    ]
      .filter(Boolean)
      .join(" ")

    if (!matchesSearch(examText, normalizedSearch)) continue

    results.push({
      key: `exam-${exam.id}`,
      title: exam.title,
      eyebrow: `${classItem.name} · Exam`,
      href: `/classes/${classItem.id}/exam`,
    })
  }

  return results
}

async function fetchCachedClassExams({
  classId,
  currentUserId,
  canManage,
  selectedRole,
}: {
  classId: string
  currentUserId: string | null
  canManage: boolean
  selectedRole: OrganizationUserRole | null
}) {
  const cacheKey = getExamSearchCacheKey({
    classId,
    currentUserId,
    canManage,
    selectedRole,
  })
  const cached = examSearchCache.get(cacheKey)

  if (cached?.exams && isFreshExamCacheEntry(cached)) {
    return cached.exams
  }

  if (cached?.request) {
    return cached.request
  }

  const request = fetchClassExams(classId)
    .then((exams) => {
      examSearchCache.set(cacheKey, {
        exams,
        request: null,
        updatedAt: Date.now(),
      })
      return exams
    })
    .finally(() => {
      const latestCached = examSearchCache.get(cacheKey)

      if (latestCached?.request === request) {
        latestCached.request = null
      }
    })

  examSearchCache.set(cacheKey, {
    exams: cached?.exams ?? null,
    request,
    updatedAt: cached?.updatedAt ?? 0,
  })

  return request
}

function canManageClassContent(
  classItem: SearchableClass,
  currentUserId: string | null,
  selectedRole: OrganizationUserRole | null,
) {
  if (selectedRole === "org_admin") return true
  if (selectedRole !== "teacher") return false
  if (classItem.teacher_user_id === currentUserId) return true

  return classItem.memberships.some(
    (membership) =>
      membership.user_id === currentUserId &&
      (membership.role === "teacher" || membership.role === "ta"),
  )
}

function getExamSearchCacheKey({
  classId,
  currentUserId,
  canManage,
  selectedRole,
}: {
  classId: string
  currentUserId: string | null
  canManage: boolean
  selectedRole: OrganizationUserRole | null
}) {
  return [
    classId,
    selectedRole ?? "none",
    canManage ? "manager" : "student",
    currentUserId ?? "anonymous",
  ].join(":")
}

function getMaterialSearchCacheKey({
  classId,
  currentUserId,
  canManage,
  selectedRole,
}: {
  classId: string
  currentUserId: string | null
  canManage: boolean
  selectedRole: OrganizationUserRole | null
}) {
  return [
    "search",
    classId,
    selectedRole ?? "none",
    canManage ? "manager" : "student",
    currentUserId ?? "anonymous",
  ].join(":")
}

function isFreshExamCacheEntry(entry: ExamSearchCacheEntry) {
  return Date.now() - entry.updatedAt < EXAM_SEARCH_CACHE_TTL_MS
}

async function fetchClassExams(classId: string): Promise<SearchableExam[]> {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/exams`,
  )
  const payload = (await response.json().catch(() => null)) as
    | ClassExamApiDto
    | { error?: string }
    | null

  if (!response.ok || !payload || !("canManage" in payload)) return []

  return payload.canManage
    ? payload.manager.exams.map((exam) => ({
        id: exam.id,
        title: exam.title,
        status: exam.status,
      }))
    : [
        ...payload.student.visibleExams.map((exam) => ({
          id: exam.id,
          title: exam.title,
          status: exam.status,
          questionCount: exam.questionCount,
        })),
        ...payload.student.history.map((exam) => ({
          id: exam.examId,
          title: exam.title,
        })),
        ...payload.student.releasedResults.map((exam) => ({
          id: exam.examId,
          title: exam.title,
          status: exam.status,
        })),
      ]
}

function matchesSearch(text: string, normalizedSearch: string) {
  const normalizedText = text.toLowerCase()

  return normalizedSearch
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => normalizedText.includes(term))
}

function dedupeSearchResults(results: SearchResult[]) {
  const seen = new Set<string>()

  return results.filter((result) => {
    if (seen.has(result.key)) return false
    seen.add(result.key)
    return true
  })
}
