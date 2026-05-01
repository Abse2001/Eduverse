"use client"

import { Activity, BookOpen, Puzzle, ShieldCheck, Users } from "lucide-react"
import { useApp } from "@/lib/store"
import { ASSIGNMENTS, USERS } from "@/lib/mock-data"
import { ActivityTab } from "@/features/admin/activity-tab"
import { AdminOverviewStats } from "@/features/admin/admin-overview-stats"
import { ClassesTab } from "@/features/admin/classes-tab"
import { FeaturesTab } from "@/features/admin/features-tab"
import { UsersTab } from "@/features/admin/users-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function AdminDashboard() {
  const { currentUser, organizationClasses } = useApp()

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

  const students = USERS.filter((user) => user.role === "student")
  const teachers = USERS.filter((user) => user.role === "teacher")
  const totalAssignments = ASSIGNMENTS.length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {currentUser.institution} &middot; Spring 2026
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <ShieldCheck className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            Administrator
          </span>
        </div>
      </div>

      <AdminOverviewStats
        studentCount={students.length}
        teacherCount={teachers.length}
        classCount={organizationClasses.length}
        assignmentCount={totalAssignments}
      />

      <Tabs defaultValue="classes">
        <TabsList className="h-9">
          <TabsTrigger value="classes" className="text-xs gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Classes
          </TabsTrigger>
          <TabsTrigger value="users" className="text-xs gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Users
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

        <TabsContent value="users" className="mt-4">
          <UsersTab />
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
