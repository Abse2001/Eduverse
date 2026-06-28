"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Archive,
  BookOpen,
  Globe2,
  MailPlus,
  Puzzle,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react"
import { useApp } from "@/lib/store"
import { AdminOverviewStats } from "@/features/admin/admin-overview-stats"
import { ClassHistoryTab } from "@/features/admin/class-history-tab"
import { ClassesTab } from "@/features/admin/classes-tab"
import { FeaturesTab } from "@/features/admin/features-tab"
import { PublicLinkTab } from "@/features/admin/public-link-tab"
import { SettingsTab } from "@/features/admin/settings-tab"
import { UsersTab } from "@/features/admin/users-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const ADMIN_DASHBOARD_TABS = [
  "classes",
  "history",
  "users",
  "features",
  "public-link",
  "settings",
] as const

type AdminDashboardTab = (typeof ADMIN_DASHBOARD_TABS)[number]

const DEFAULT_ADMIN_DASHBOARD_TAB: AdminDashboardTab = "classes"
const ADMIN_DASHBOARD_TAB_STORAGE_KEY = "eduverse.adminDashboard.tab"

export function AdminDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    currentUser,
    organizationClasses,
    organizationInvites,
    organizationJoinRequests,
    refreshOrganizationUsers,
  } = useApp()
  const requestedTab = normalizeAdminDashboardTab(searchParams.get("tab"))
  const [activeTab, setActiveTab] = useState<AdminDashboardTab>(
    () => requestedTab ?? getStoredAdminDashboardTab(),
  )
  const activeTabQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", activeTab)
    return params.toString()
  }, [activeTab, searchParams])

  useEffect(() => {
    void refreshOrganizationUsers().catch(() => {})
  }, [refreshOrganizationUsers])

  useEffect(() => {
    if (requestedTab) setActiveTab(requestedTab)
  }, [requestedTab])

  useEffect(() => {
    window.localStorage.setItem(ADMIN_DASHBOARD_TAB_STORAGE_KEY, activeTab)

    if (searchParams.get("tab") === activeTab) return

    router.replace(`${pathname}?${activeTabQuery}`, { scroll: false })
  }, [activeTab, activeTabQuery, pathname, router, searchParams])

  if (currentUser.role !== "admin") {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center pt-24">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">
          Access Restricted
        </h1>
        <p className="text-sm text-muted-foreground">
          Only administrators can access this panel.
        </p>
      </div>
    )
  }

  const studentIds = new Set(
    organizationClasses.flatMap((classItem) =>
      classItem.students.map((student) => student.id),
    ),
  )
  const teacherIds = new Set(
    organizationClasses.flatMap((classItem) =>
      [
        classItem.teacher_user_id,
        ...classItem.memberships
          .filter((membership) => membership.role === "teacher")
          .map((membership) => membership.user_id),
      ].filter((userId): userId is string => Boolean(userId)),
    ),
  )
  const pendingLiveInvites = organizationInvites.filter(
    (invite) => invite.status === "invited",
  ).length
  const pendingPublicRequests = organizationJoinRequests.length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">
            Welcome back, {currentUser.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {currentUser.institution} &middot; Current term
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-800 dark:bg-amber-900/20">
          <ShieldCheck className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            Administrator
          </span>
        </div>
      </div>

      <AdminOverviewStats
        studentCount={studentIds.size}
        teacherCount={teacherIds.size}
        classCount={organizationClasses.length}
        pendingAccessCount={pendingLiveInvites + pendingPublicRequests}
        pendingAccessSublabel="Awaiting acceptance"
        pendingAccessIcon={MailPlus}
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(
            normalizeAdminDashboardTab(value) ?? DEFAULT_ADMIN_DASHBOARD_TAB,
          )
        }
      >
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="classes" className="text-xs gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Classes
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5">
            <Archive className="w-3.5 h-3.5" />
            Past Terms
          </TabsTrigger>
          <TabsTrigger value="users" className="text-xs gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Users
          </TabsTrigger>
          <TabsTrigger value="features" className="text-xs gap-1.5">
            <Puzzle className="w-3.5 h-3.5" />
            Features
          </TabsTrigger>
          <TabsTrigger value="public-link" className="text-xs gap-1.5">
            <Globe2 className="w-3.5 h-3.5" />
            Public Link
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs gap-1.5">
            <Settings2 className="w-3.5 h-3.5" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="classes" className="mt-4">
          <ClassesTab />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ClassHistoryTab />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <FeaturesTab />
        </TabsContent>

        <TabsContent value="public-link" className="mt-4">
          <PublicLinkTab />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function normalizeAdminDashboardTab(
  value: string | null,
): AdminDashboardTab | null {
  return ADMIN_DASHBOARD_TABS.includes(value as AdminDashboardTab)
    ? (value as AdminDashboardTab)
    : null
}

function getStoredAdminDashboardTab() {
  if (typeof window === "undefined") return DEFAULT_ADMIN_DASHBOARD_TAB

  return (
    normalizeAdminDashboardTab(
      window.localStorage.getItem(ADMIN_DASHBOARD_TAB_STORAGE_KEY),
    ) ?? DEFAULT_ADMIN_DASHBOARD_TAB
  )
}
