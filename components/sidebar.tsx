"use client"

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useExamLock } from "@/features/exam/exam-lock"
import { getClassesForUser } from "@/lib/education/classes"
import {
  getClassNavFeatures,
  type ResolvedClassFeature,
  resolveClassFeatures,
} from "@/lib/features/feature-registry"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

const NAV_ITEMS_STUDENT: Array<{
  label: string
  icon: typeof BookOpen
  href: string
}> = []

const NAV_ITEMS_TEACHER: Array<{
  label: string
  icon: typeof BookOpen
  href: string
}> = []

const NAV_ITEMS_ADMIN: Array<{
  label: string
  icon: typeof BookOpen
  href: string
}> = []

interface SidebarProps {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}

export function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const pathname = usePathname()
  const {
    activeOrganization,
    classLiveSessions,
    currentUser,
    featureDefinitions,
    organizationClasses,
  } = useApp()
  const { canNavigateToPath, isLocked } = useExamLock()
  const isTeacher = currentUser.role === "teacher"
  const isAdmin = currentUser.role === "admin"
  const isCollapsed = collapsed || isLocked

  const userClasses = activeOrganization
    ? getClassesForUser(organizationClasses, currentUser)
    : []
  const liveClassIds = new Set(
    classLiveSessions.map((session) => session.class_id),
  )

  const mainNavItems = isAdmin
    ? NAV_ITEMS_ADMIN
    : isTeacher
      ? NAV_ITEMS_TEACHER
      : NAV_ITEMS_STUDENT

  // Detect active class
  const activeClassMatch = pathname.match(/\/classes\/([^/]+)/)
  const activeClassId = activeClassMatch?.[1]
  const activeSegmentMatch = pathname.match(/\/classes\/[^/]+\/(.+)/)
  const activeSegment = activeSegmentMatch?.[1]

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 shrink-0",
          isCollapsed ? "w-16" : "w-60",
        )}
      >
        {/* Dashboard link */}
        <div className="relative flex items-center h-14 px-2 border-b border-sidebar-border">
          {isCollapsed ? (
            <button
              onClick={() => {
                if (!isLocked) setCollapsed(false)
              }}
              className={cn(
                "flex h-9 flex-1 items-center rounded-lg px-2 transition-opacity",
                isLocked ? "cursor-default" : "hover:opacity-90",
              )}
              aria-label="Expand sidebar"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                <ChevronRight className="h-4 w-4 text-primary-foreground" />
              </span>
            </button>
          ) : (
            <>
              <NavItemContent
                href="/dashboard"
                disabled={isLocked}
                className={cn(
                  "flex items-center gap-2.5 py-2 rounded-lg text-sm font-medium transition-colors min-w-0 flex-1 h-9",
                  isLocked
                    ? "cursor-not-allowed text-sidebar-foreground/40"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                  "pl-2 pr-8",
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                  <GraduationCap className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="truncate overflow-hidden transition-opacity duration-150">
                  Eduverse
                </span>
              </NavItemContent>
              <button
                onClick={() => setCollapsed(true)}
                className="absolute right-2 text-muted-foreground hover:text-sidebar-foreground transition-colors"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 px-2">
          {mainNavItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <NavItem
                key={item.href}
                label={item.label}
                icon={item.icon}
                href={item.href}
                active={active}
                collapsed={isCollapsed}
              />
            )
          })}

          {/* Classes */}
          {userClasses.length > 0 && (
            <div className="pt-4">
              <p
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1.5 transition-opacity duration-150",
                  isCollapsed && "opacity-0",
                )}
              >
                Classes
              </p>
              {userClasses.map((cls) => {
                const isActiveClass = activeClassId === cls.id
                const classNavFeatures = activeOrganization
                  ? getClassNavFeatures(
                      resolveClassFeatures({
                        definitions: featureDefinitions,
                        organizationSettings:
                          activeOrganization.featureSettings,
                        classSettings: cls.featureSettings,
                        organizationExtensions: activeOrganization.extensions,
                        classExtensionSettings: cls.extensionSettings,
                      }),
                    )
                  : []
                const landingSegment =
                  getFirstClassNavRouteSegment(classNavFeatures) ?? "home"
                const classHref = `/classes/${cls.id}/${landingSegment}`
                const classDisabled = isLocked && !canNavigateToPath(classHref)

                return (
                  <div key={cls.id}>
                    <NavItem
                      label={cls.name}
                      icon={BookOpen}
                      href={classHref}
                      active={isActiveClass}
                      collapsed={isCollapsed}
                      colorDot={cls.color ?? undefined}
                      live={liveClassIds.has(cls.id)}
                      disabled={classDisabled}
                    />
                    {isActiveClass && !isCollapsed && (
                      <div className="ml-6 pl-3 border-l border-sidebar-border mt-0.5 space-y-0.5 mb-1 overflow-hidden">
                        {classNavFeatures.map((feature) => (
                          <ClassFeatureNavItem
                            key={feature.key}
                            classId={cls.id}
                            feature={feature}
                            activeSegment={activeSegment}
                            disabled={
                              isLocked &&
                              !canNavigateToPath(
                                feature.routeSegment
                                  ? `/classes/${cls.id}/${feature.routeSegment}`
                                  : `/classes/${cls.id}/exam`,
                              )
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </nav>
      </aside>
    </TooltipProvider>
  )
}

function ClassFeatureNavItem({
  classId,
  feature,
  activeSegment,
  disabled,
}: {
  classId: string
  feature: ResolvedClassFeature
  activeSegment?: string
  disabled?: boolean
}) {
  const isActive =
    isFeatureRouteActive(feature.routeSegment, activeSegment) ||
    feature.children.some((child) =>
      isFeatureRouteActive(child.routeSegment, activeSegment),
    )

  if (!feature.routeSegment) {
    return (
      <div>
        <div
          className={cn(
            "flex h-7 min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-xs font-medium whitespace-nowrap",
            isActive
              ? "text-sidebar-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          <feature.icon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{feature.label}</span>
        </div>
        <div className="ml-3.5 pl-2.5 border-l border-sidebar-border/70 space-y-0.5">
          {feature.children.map((child) => (
            <ClassFeatureNavLink
              key={child.key}
              classId={classId}
              feature={child}
              active={isFeatureRouteActive(child.routeSegment, activeSegment)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <ClassFeatureNavLink
      classId={classId}
      feature={feature}
      active={isFeatureRouteActive(feature.routeSegment, activeSegment)}
      disabled={disabled}
    />
  )
}

function ClassFeatureNavLink({
  classId,
  feature,
  active,
  disabled = false,
}: {
  classId: string
  feature: ResolvedClassFeature
  active: boolean
  disabled?: boolean
}) {
  if (!feature.routeSegment) return null

  return (
    <NavItemContent
      href={`/classes/${classId}/${feature.routeSegment}`}
      className={cn(
        "flex h-7 min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
      )}
      disabled={disabled}
    >
      <feature.icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{feature.label}</span>
    </NavItemContent>
  )
}

function isFeatureRouteActive(
  routeSegment: string | null,
  activeSegment?: string,
) {
  if (!routeSegment || !activeSegment) return false

  return (
    activeSegment === routeSegment ||
    activeSegment.startsWith(`${routeSegment}/`)
  )
}

function getFirstClassNavRouteSegment(features: ResolvedClassFeature[]) {
  for (const feature of features) {
    if (feature.routeSegment) return feature.routeSegment

    const childRouteSegment = feature.children.find(
      (child) => child.routeSegment,
    )?.routeSegment

    if (childRouteSegment) return childRouteSegment
  }

  return null
}

interface NavItemProps {
  label: string
  icon: React.ElementType
  href: string
  active: boolean
  collapsed: boolean
  colorDot?: string
  live?: boolean
  disabled?: boolean
}

const DOT_COLOR_MAP: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
}

function NavItem({
  label,
  icon: Icon,
  href,
  active,
  collapsed,
  colorDot,
  live = false,
  disabled = false,
}: NavItemProps) {
  const content = (
    <NavItemContent
      href={href}
      disabled={disabled}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
        disabled
          ? "cursor-not-allowed text-sidebar-foreground/35"
          : active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
      )}
    >
      {colorDot ? (
        <span className="relative flex w-4 shrink-0 justify-center">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              DOT_COLOR_MAP[colorDot] ?? "bg-muted-foreground",
            )}
          />
          {live ? (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-sidebar" />
          ) : null}
        </span>
      ) : (
        <Icon className="w-4 h-4 shrink-0" />
      )}
      <span
        className={cn(
          "truncate overflow-hidden transition-opacity duration-150",
          collapsed && "w-0 opacity-0",
        )}
      >
        {label}
      </span>
      {live && !collapsed ? (
        <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          Live
        </span>
      ) : null}
    </NavItemContent>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return content
}

function NavItemContent({
  href,
  disabled,
  className,
  children,
}: {
  href: string
  disabled: boolean
  className: string
  children: ReactNode
}) {
  if (disabled) {
    return (
      <div aria-disabled="true" className={className}>
        {children}
      </div>
    )
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}
