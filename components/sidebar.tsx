"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  FileText,
  FlaskConical,
  Trophy,
  User,
  Settings,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  LogOut,
  Video,
  Code2,
  Shield,
  ClipboardList,
  Terminal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/lib/store"
import {
  CLASSES,
  getClassesByStudent,
  getClassesByTeacher,
} from "@/lib/mock-data"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const NAV_ITEMS_STUDENT = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "My Classes", icon: BookOpen, href: "/classes" },
  { label: "Profile", icon: User, href: "/profile" },
]

const NAV_ITEMS_TEACHER = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "My Classes", icon: BookOpen, href: "/classes" },
  { label: "Profile", icon: User, href: "/profile" },
]

const NAV_ITEMS_ADMIN = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Admin Panel", icon: Shield, href: "/admin" },
  { label: "All Classes", icon: BookOpen, href: "/classes" },
  { label: "Profile", icon: User, href: "/profile" },
]

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
  const { currentUser } = useApp()
  const isStudent = currentUser.role === "student"
  const isTeacher = currentUser.role === "teacher"
  const isAdmin = currentUser.role === "admin"

  const userClasses = isStudent
    ? getClassesByStudent(currentUser.id)
    : isTeacher
      ? getClassesByTeacher(currentUser.id)
      : CLASSES

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

  const roleBadge = {
    student: "Student",
    teacher: "Teacher",
    admin: "Admin",
  }[currentUser.role]

  const roleColor = {
    student: "bg-brand-subtle text-brand",
    teacher:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    admin:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  }[currentUser.role]

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 shrink-0",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-3 border-b border-sidebar-border">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary shrink-0">
              <GraduationCap className="w-4 h-4 text-primary-foreground" />
            </div>
            {!collapsed && (
              <span className="font-semibold text-sidebar-foreground text-sm truncate">
                EduFlow
              </span>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto text-muted-foreground hover:text-sidebar-foreground transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
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
              {!collapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1.5">
                  Classes
                </p>
              )}
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
                      colorDot={cls.color}
                    />
                    {isActiveClass && !collapsed && (
                      <div className="ml-4 pl-3 border-l border-sidebar-border mt-0.5 space-y-0.5 mb-1">
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

        {/* User footer */}
        <div className="border-t border-sidebar-border p-2">
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-sidebar-accent/50 transition-colors cursor-pointer",
              collapsed && "justify-center",
            )}
          >
            <Avatar className="w-7 h-7 shrink-0">
              <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                {currentUser.avatar}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground truncate">
                  {currentUser.name}
                </p>
                <span
                  className={cn(
                    "inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none mt-0.5",
                    roleColor,
                  )}
                >
                  {roleBadge}
                </span>
              </div>
            )}
          </div>
        </div>
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
        "flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-medium transition-colors w-full",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
        collapsed && "justify-center",
      )}
    >
      {colorDot ? (
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            DOT_COLOR_MAP[colorDot] ?? "bg-muted-foreground",
          )}
        />
      ) : (
        <Icon className="w-4 h-4 shrink-0" />
      )}
      {!collapsed && <span className="truncate">{label}</span>}
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
