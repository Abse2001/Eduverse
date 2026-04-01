"use client"

import Link from "next/link"
import { useApp } from "@/lib/store"
import {
  getClassesByStudent,
  getAssignmentsByClass,
  getLeaderboardByClass,
  ASSIGNMENTS,
  Assignment,
  Class,
} from "@/lib/mock-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  BookOpen,
  Clock,
  Star,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  CircleDot,
  Trophy,
  FlaskConical,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format, isPast, isWithinInterval, addDays } from "date-fns"

const STATUS_CONFIG = {
  graded: {
    label: "Graded",
    icon: CheckCircle2,
    class: "text-emerald-600 dark:text-emerald-400",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  submitted: {
    label: "Submitted",
    icon: CircleDot,
    class: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  pending: {
    label: "Pending",
    icon: AlertCircle,
    class: "text-amber-600 dark:text-amber-400",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
}

const CLASS_RING: Record<string, string> = {
  indigo: "ring-indigo-400",
  emerald: "ring-emerald-400",
  violet: "ring-violet-400",
}
const CLASS_BG: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
}

export function StudentDashboard() {
  const { currentUser } = useApp()
  const myClasses = getClassesByStudent(currentUser.id)

  // Gather all assignments across enrolled classes
  const allAssignments: (Assignment & { classInfo: Class })[] =
    myClasses.flatMap((cls) =>
      getAssignmentsByClass(cls.id).map((a) => ({ ...a, classInfo: cls })),
    )

  const pending = allAssignments.filter((a) => a.status === "pending")
  const graded = allAssignments.filter(
    (a) => a.status === "graded" && a.score !== undefined,
  )
  const avgScore =
    graded.length > 0
      ? Math.round(
          graded.reduce((sum, a) => sum + (a.score ?? 0), 0) / graded.length,
        )
      : 0

  // Upcoming deadlines (next 7 days)
  const upcoming = pending
    .filter((a) => {
      const due = new Date(a.dueDate)
      return (
        !isPast(due) ||
        isWithinInterval(due, {
          start: new Date(),
          end: addDays(new Date(), 7),
        })
      )
    })
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    )
    .slice(0, 4)

  // Class leaderboard rank for current user
  const classRanks = myClasses.map((cls) => {
    const lb = getLeaderboardByClass(cls.id)
    const entry = lb.find((e) => e.studentId === currentUser.id)
    return {
      cls,
      rank: entry?.rank,
      total: lb.length,
      score: entry?.totalScore,
    }
  })

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground text-balance">
          Good morning, {currentUser.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {currentUser.institution} &middot; {currentUser.semester}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Enrolled Classes"
          value={String(myClasses.length)}
          icon={BookOpen}
          color="indigo"
        />
        <StatCard
          label="Pending Tasks"
          value={String(pending.length)}
          icon={Clock}
          color="amber"
        />
        <StatCard
          label="Average Score"
          value={`${avgScore}%`}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          label="Current GPA"
          value={String(currentUser.gpa ?? "—")}
          icon={Star}
          color="violet"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* My Classes */}
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">My Classes</h2>
            <Link href="/classes">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
          {myClasses.map((cls) => {
            const assignments = getAssignmentsByClass(cls.id)
            const done = assignments.filter(
              (a) => a.status !== "pending",
            ).length
            const progress =
              assignments.length > 0
                ? Math.round((done / assignments.length) * 100)
                : 0
            const rankInfo = classRanks.find((r) => r.cls.id === cls.id)
            return (
              <Link key={cls.id} href={`/classes/${cls.id}/home`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                        CLASS_BG[cls.color] ?? "bg-primary",
                      )}
                    >
                      {cls.code.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {cls.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cls.code} &middot; {cls.schedule}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {progress}%
                        </span>
                      </div>
                    </div>
                    {rankInfo?.rank && (
                      <div className="shrink-0 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <Trophy className="w-3 h-3 text-amber-500" />
                          <span className="text-sm font-bold text-foreground">
                            #{rankInfo.rank}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          rank
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        {/* Upcoming Deadlines */}
        <div className="space-y-3">
          <h2 className="font-semibold text-foreground">Upcoming Deadlines</h2>
          {upcoming.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">All caught up!</p>
              </CardContent>
            </Card>
          ) : (
            upcoming.map((a) => {
              const due = new Date(a.dueDate)
              const overdue = isPast(due)
              return (
                <Link
                  key={a.id}
                  href={`/classes/${a.classInfo.id}/assignments`}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-3 flex items-start gap-3">
                      <div
                        className={cn(
                          "w-1.5 rounded-full self-stretch mt-1 shrink-0",
                          CLASS_BG[a.classInfo.color] ?? "bg-muted",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {a.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.classInfo.code}
                        </p>
                        <p
                          className={cn(
                            "text-xs font-medium mt-1",
                            overdue
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          Due {format(due, "MMM d, h:mm a")}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] shrink-0",
                          a.type === "lab" &&
                            "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
                          a.type === "quiz" &&
                            "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                          a.type === "exam" &&
                            "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
                        )}
                      >
                        {a.type}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  icon: React.ElementType
  color: string
}) {
  const colorMap: Record<string, string> = {
    indigo:
      "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
    amber:
      "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    emerald:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    violet:
      "bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
  }
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            colorMap[color],
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground leading-none">{label}</p>
          <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
