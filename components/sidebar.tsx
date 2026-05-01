"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BookOpen,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/lib/store"
import { getClassesForUser } from "@/lib/education/classes"
import {
  getClassNavFeatures,
  resolveClassFeatures,
  type ResolvedClassFeature,
} from "@/lib/features/feature-registry"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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
    currentUser,
    featureDefinitions,
    organizationClasses,
  } = useApp()
  const isTeacher = currentUser.role === "teacher"
  const isAdmin = currentUser.role === "admin"

  const userClasses = activeOrganization
    ? getClassesForUser(organizationClasses, currentUser)
    : []

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
          collapsed ? "w-16" : "w-60",
        )}
      >
        {/* Dashboard link */}
        <div className="relative flex items-center h-14 px-2 border-b border-sidebar-border">
          {collapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              className="flex h-9 flex-1 items-center rounded-lg px-2 transition-opacity hover:opacity-90"
              aria-label="Expand sidebar"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                <ChevronRight className="h-4 w-4 text-primary-foreground" />
              </span>
            </button>
          ) : (
            <>
              <Link
                href="/dashboard"
                className={cn(
                  "flex items-center gap-2.5 py-2 rounded-lg text-sm font-medium transition-colors min-w-0 flex-1 h-9",
                  "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                  "pl-2 pr-8",
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                  <GraduationCap className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="truncate overflow-hidden transition-opacity duration-150">
                  Eduverse
                </span>
              </Link>
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
              pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <NavItem
                key={item.href}
                label={item.label}
                icon={item.icon}
                href={item.href}
                active={active}
                collapsed={collapsed}
              />
            )
          })}

          {/* Classes */}
          {userClasses.length > 0 && (
            <div className="pt-4">
              <p
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1.5 transition-opacity duration-150",
                  collapsed && "opacity-0",
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

                return (
                  <div key={cls.id}>
                    <NavItem
                      label={cls.name}
                      icon={BookOpen}
                      href={`/classes/${cls.id}/${landingSegment}`}
                      active={isActiveClass}
                      collapsed={collapsed}
                      colorDot={cls.color ?? undefined}
                    />
                    {isActiveClass && (
                      <div
                        className={cn(
                          "ml-4 pl-3 border-l border-sidebar-border mt-0.5 space-y-0.5 mb-1 overflow-hidden transition-opacity duration-150",
                          collapsed && "opacity-0 pointer-events-none",
                        )}
                      >
                        {classNavFeatures.map((feature) => (
                          <ClassFeatureNavItem
                            key={feature.key}
                            classId={cls.id}
                            feature={feature}
                            activeSegment={activeSegment}
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
}: {
  classId: string
  feature: ResolvedClassFeature
  activeSegment?: string
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
            "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium",
            isActive
              ? "text-sidebar-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          <feature.icon className="w-3.5 h-3.5 shrink-0" />
          {feature.label}
        </div>
        <div className="ml-4 pl-2 border-l border-sidebar-border/70 space-y-0.5">
          {feature.children.map((child) => (
            <ClassFeatureNavLink
              key={child.key}
              classId={classId}
              feature={child}
              active={isFeatureRouteActive(child.routeSegment, activeSegment)}
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
    />
  )
}

function ClassFeatureNavLink({
  classId,
  feature,
  active,
}: {
  classId: string
  feature: ResolvedClassFeature
  active: boolean
}) {
  if (!feature.routeSegment) return null

  return (
    <Link
      href={`/classes/${classId}/${feature.routeSegment}`}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
      )}
    >
      <feature.icon className="w-3.5 h-3.5 shrink-0" />
      {feature.label}
    </Link>
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
}: NavItemProps) {
  const content = (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full h-9",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
      )}
    >
      {colorDot ? (
        <span className="flex w-4 shrink-0 justify-center">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              DOT_COLOR_MAP[colorDot] ?? "bg-muted-foreground",
            )}
          />
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
    </Link>
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
