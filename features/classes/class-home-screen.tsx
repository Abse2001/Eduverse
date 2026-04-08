"use client"

import Link from "next/link"
import { format } from "date-fns"
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  MessageSquare,
  Trophy,
  Users,
  Video,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  getAssignmentsByClass,
  getMaterialsByClass,
  getStudentsInClass,
  getUserById,
  type Class,
} from "@/lib/mock-data"
import { getAssignmentProgress } from "@/lib/education/selectors"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { CLASS_HEADER_GRADIENT_MAP } from "@/lib/view-config"

const NAV_SECTIONS = [
  {
    label: "Chat",
    icon: MessageSquare,
    segment: "chat",
    desc: "Class discussions",
  },
  {
    label: "Materials",
    icon: FileText,
    segment: "materials",
    desc: "Lectures & resources",
  },
  {
    label: "Assignments",
    icon: FlaskConical,
    segment: "assignments",
    desc: "Tasks & exams",
  },
  {
    label: "Session",
    icon: Video,
    segment: "session",
    desc: "Live class & whiteboard",
  },
  {
    label: "Leaderboard",
    icon: Trophy,
    segment: "leaderboard",
    desc: "Student rankings",
  },
]

const STATUS_ICON = {
  graded: { icon: CheckCircle2, class: "text-emerald-500" },
  submitted: { icon: Clock, class: "text-blue-500" },
  pending: { icon: AlertCircle, class: "text-amber-500" },
}

export function ClassHomeScreen({ cls }: { cls: Class }) {
  const { currentUser } = useApp()
  const teacher = getUserById(cls.teacherId)
  const students = getStudentsInClass(cls.id)
  const assignments = getAssignmentsByClass(cls.id)
  const materials = getMaterialsByClass(cls.id)
  const { completedCount, progress } = getAssignmentProgress(assignments)

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div
        className={cn(
          "rounded-2xl p-6 text-white bg-gradient-to-br",
          CLASS_HEADER_GRADIENT_MAP[cls.color] ?? "from-primary to-primary/70",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white/70 text-sm font-medium">
              {cls.code} &middot; {cls.subject}
            </p>
            <h1 className="text-2xl font-bold mt-1 text-balance">{cls.name}</h1>
            <p className="text-white/80 text-sm mt-2 leading-relaxed max-w-xl">
              {cls.description}
            </p>
          </div>
          {currentUser.role === "teacher" ? (
            <Link href={`/classes/${cls.id}/session`}>
              <Button
                variant="secondary"
                size="sm"
                className="gap-2 shrink-0 bg-white/20 hover:bg-white/30 text-white border-0"
              >
                <Video className="w-4 h-4" />
                Start Session
              </Button>
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-white/20">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 opacity-70" />
            <span className="text-sm">{cls.schedule}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 opacity-70" />
            <span className="text-sm">{students.length} students</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 opacity-70" />
            <span className="text-sm">{cls.room}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {NAV_SECTIONS.map((section) => (
          <Link
            key={section.segment}
            href={`/classes/${cls.id}/${section.segment}`}
          >
            <Card className="hover:shadow-md hover:border-primary/40 transition-all cursor-pointer group h-full">
              <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <section.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {section.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {section.desc}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Course Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Progress value={progress} className="h-2 flex-1" />
                <span className="text-sm font-semibold text-foreground shrink-0">
                  {progress}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-base font-bold text-foreground">
                    {materials.length}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Materials</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-base font-bold text-foreground">
                    {assignments.length}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Assignments
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-base font-bold text-foreground">
                    {completedCount}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Recent Assignments
                </CardTitle>
                <Link href={`/classes/${cls.id}/assignments`}>
                  <Button variant="ghost" size="sm" className="text-xs">
                    View all
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {assignments.slice(0, 3).map((assignment) => {
                const statusConfig = STATUS_ICON[assignment.status ?? "pending"]

                return (
                  <div
                    key={assignment.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <statusConfig.icon
                      className={cn("w-4 h-4 shrink-0", statusConfig.class)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {assignment.title}
                      </p>
                      <p
                        className="text-xs text-muted-foreground"
                        suppressHydrationWarning
                      >
                        Due {format(new Date(assignment.dueDate), "MMM d")}
                      </p>
                    </div>
                    {assignment.score !== undefined ? (
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                        {assignment.score}/{assignment.maxScore}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {teacher ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Instructor
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="font-semibold bg-primary/10 text-primary">
                    {teacher.avatar}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {teacher.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {teacher.email}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Students ({students.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {students.map((student) => (
                <div key={student.id} className="flex items-center gap-2">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                      {student.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-foreground truncate flex-1">
                    {student.name}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
