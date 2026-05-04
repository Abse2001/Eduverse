"use client"

import { useEffect } from "react"
import {
  Activity,
  Archive,
  BookOpen,
  MailPlus,
  Puzzle,
  ShieldCheck,
  Users,
} from "lucide-react"
import { useApp } from "@/lib/store"
import { PENDING_ACCESS_REQUESTS } from "@/lib/mock-data"
import { ActivityTab } from "@/features/admin/activity-tab"
import { AdminOverviewStats } from "@/features/admin/admin-overview-stats"
import { ClassHistoryTab } from "@/features/admin/class-history-tab"
import { ClassesTab } from "@/features/admin/classes-tab"
import { FeaturesTab } from "@/features/admin/features-tab"
import { PendingRequestsTab } from "@/features/admin/pending-requests-tab"
import { UsersTab } from "@/features/admin/users-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function AdminDashboard() {
  const {
    currentUser,
    organizationClasses,
    organizationInvites,
    refreshOrganizationUsers,
  } = useApp()

  useEffect(() => {
    void refreshOrganizationUsers().catch(() => {})
  }, [refreshOrganizationUsers])

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
  const pendingMockInvites = PENDING_ACCESS_REQUESTS.filter(
    (request) => request.type === "invite",
  ).length
  const pendingMockRequests = PENDING_ACCESS_REQUESTS.filter(
    (request) => request.type === "request",
  ).length
  const pendingLiveInvites = organizationInvites.filter(
    (invite) => invite.status === "invited",
  ).length
  const pendingAccessCount =
    pendingLiveInvites || PENDING_ACCESS_REQUESTS.length
  const pendingAccessSublabel = pendingLiveInvites
    ? "Open invites"
    : `${pendingMockInvites} invites, ${pendingMockRequests} requests`

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">
            Welcome back, {currentUser.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {currentUser.institution} &middot; Spring 2026
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
        pendingAccessCount={pendingAccessCount}
        pendingAccessSublabel={pendingAccessSublabel}
        pendingAccessIcon={MailPlus}
      />

      <Tabs defaultValue="classes">
        <TabsList className="h-9">
          <TabsTrigger value="classes" className="text-xs gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Classes
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5">
            <Archive className="w-3.5 h-3.5" />
            History
          </TabsTrigger>
          <TabsTrigger value="users" className="text-xs gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Users
          </TabsTrigger>
          <TabsTrigger value="requests" className="text-xs gap-1.5">
            <MailPlus className="w-3.5 h-3.5" />
            Requests
          </TabsTrigger>
          <TabsTrigger value="features" className="text-xs gap-1.5">
            <Puzzle className="w-3.5 h-3.5" />
            Features
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Activity
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

        <TabsContent value="requests" className="mt-4">
          <PendingRequestsTab />
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <FeaturesTab />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
