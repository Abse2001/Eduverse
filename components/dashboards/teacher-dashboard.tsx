"use client"

import Link from "next/link"
import {
  BookOpen,
  Calendar,
  FileText,
  PlusCircle,
  TrendingUp,
  Users,
  Video,
} from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  getAssignmentsByClass,
  getClassesByTeacher,
  getStudentsInClass,
} from "@/lib/mock-data"
import { getAssignmentProgress } from "@/lib/education/selectors"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

export function TeacherDashboard() {
  const { currentUser } = useApp()
  const myClasses = getClassesByTeacher(currentUser.id)
  const totalStudents = new Set(myClasses.flatMap((cls) => cls.studentIds)).size
  const totalAssignments = myClasses.reduce(
    (sum, cls) => sum + getAssignmentsByClass(cls.id).length,
    0,
  )
  const pendingGrades = myClasses
    .flatMap((cls) => getAssignmentsByClass(cls.id))
    .filter((assignment) => assignment.status === "submitted").length

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">
            Welcome back, {currentUser.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {currentUser.institution} &middot; Spring 2026
          </p>
        </div>
        <Button size="sm" className="gap-2 shrink-0">
          <PlusCircle className="w-4 h-4" />
          New Assignment
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Classes"
          value={String(myClasses.length)}
          icon={BookOpen}
          color="indigo"
        />
        <StatCard
          label="Total Students"
          value={String(totalStudents)}
          icon={Users}
          color="emerald"
        />
        <StatCard
          label="Assignments"
          value={String(totalAssignments)}
          icon={FileText}
          color="violet"
        />
        <StatCard
          label="Pending Grades"
          value={String(pendingGrades)}
          icon={TrendingUp}
          color="amber"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          <h2 className="font-semibold text-foreground">Your Classes</h2>

          {myClasses.map((cls) => {
            const students = getStudentsInClass(cls.id)
            const assignments = getAssignmentsByClass(cls.id)
            const submittedAssignments = assignments.filter(
              (assignment) => assignment.status === "submitted",
            ).length
            const { progress } = getAssignmentProgress(assignments)

            return (
              <Card key={cls.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                        CLASS_COLOR_MAP[cls.color] ?? "bg-primary",
                      )}
                    >
                      {cls.code.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm text-foreground">
                          {cls.name}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {cls.schedule}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cls.code} &middot; {cls.room}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          Completion
                        </span>
                        <div className="flex-1">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {progress}%
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex -space-x-1.5">
                          {students.slice(0, 4).map((student) => (
                            <Avatar
                              key={student.id}
                              className="w-6 h-6 ring-2 ring-card"
                            >
                              <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                                {student.avatar}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {students.length > 4 ? (
                            <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-card flex items-center justify-center text-[9px] text-muted-foreground font-medium">
                              +{students.length - 4}
                            </div>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {students.length} students
                        </span>
                        {submittedAssignments > 0 ? (
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            {submittedAssignments} to grade
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <Link href={`/classes/${cls.id}/home`} className="flex-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs gap-1.5"
                      >
                        <BookOpen className="w-3 h-3" /> Class Home
                      </Button>
                    </Link>
                    <Link
                      href={`/classes/${cls.id}/session`}
                      className="flex-1"
                    >
                      <Button size="sm" className="w-full text-xs gap-1.5">
                        <Video className="w-3 h-3" /> Start Session
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-semibold text-foreground">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: "Start Session",
                  icon: Video,
                  href: `/classes/${myClasses[0]?.id}/session`,
                },
                {
                  label: "New Material",
                  icon: FileText,
                  href: `/classes/${myClasses[0]?.id}/materials`,
                },
                {
                  label: "Schedule Exam",
                  icon: Calendar,
                  href: `/classes/${myClasses[0]?.id}/assignments`,
                },
                {
                  label: "View Chat",
                  icon: Users,
                  href: `/classes/${myClasses[0]?.id}/chat`,
                },
              ].map((action) => (
                <Link key={action.label} href={action.href ?? "#"}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                    <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
                      <action.icon className="w-5 h-5 text-primary" />
                      <span className="text-xs font-medium text-foreground">
                        {action.label}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="font-semibold text-foreground">
              Today&apos;s Schedule
            </h2>
            {myClasses.slice(0, 3).map((cls) => (
              <Card key={cls.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div
                    className={cn(
                      "w-2 h-10 rounded-full shrink-0",
                      CLASS_COLOR_MAP[cls.color] ?? "bg-primary",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {cls.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cls.schedule}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
