"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BookOpen,
  MessageSquare,
  FileText,
  FlaskConical,
  Trophy,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Video,
  ClipboardList,
  Terminal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/lib/store"
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

const CLASS_NAV_ITEMS = [
  { label: "Home", icon: BookOpen, segment: "home" },
  { label: "Chat", icon: MessageSquare, segment: "chat" },
  { label: "Materials", icon: FileText, segment: "materials" },
  { label: "Assignments", icon: FlaskConical, segment: "assignments" },
  { label: "Session", icon: Video, segment: "session" },
  { label: "Exam", icon: ClipboardList, segment: "exam" },
  { label: "IDE", icon: Terminal, segment: "ide" },
  { label: "Leaderboard", icon: Trophy, segment: "leaderboard" },
]

interface SidebarProps {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}

export function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const pathname = usePathname()
  const { activeOrganization, currentUser, organizationClasses } = useApp()
  const isTeacher = currentUser.role === "teacher"
  const isAdmin = currentUser.role === "admin"

  const userClasses =
    activeOrganization && isAdmin
      ? organizationClasses
      : organizationClasses.filter((classItem) =>
          classItem.memberships.some(
            (membership) => membership.user_id === currentUser.id,
          ),
        )

  const mainNavItems = isAdmin
    ? NAV_ITEMS_ADMIN
    : isTeacher
      ? NAV_ITEMS_TEACHER
      : NAV_ITEMS_STUDENT

  // Detect active class
  const activeClassMatch = pathname.match(/\/classes\/([^/]+)/)
  const activeClassId = activeClassMatch?.[1]
  const activeSegmentMatch = pathname.match(/\/classes\/[^/]+\/([^/]+)/)
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
                return (
                  <div key={cls.id}>
                    <NavItem
                      label={cls.name}
                      icon={BookOpen}
                      href={`/classes/${cls.id}/home`}
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
                        {CLASS_NAV_ITEMS.map((sub) => (
                          <Link
                            key={sub.segment}
                            href={`/classes/${cls.id}/${sub.segment}`}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                              activeSegment === sub.segment
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                            )}
                          >
                            <sub.icon className="w-3.5 h-3.5 shrink-0" />
                            {sub.label}
                          </Link>
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
