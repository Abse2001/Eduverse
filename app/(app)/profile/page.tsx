"use client"

import Link from "next/link"
import { useApp } from "@/lib/store"
import {
  getClassesByStudent,
  getClassesByTeacher,
  getAssignmentsByClass,
  getLeaderboardByClass,
  CLASSES,
  CLASS_BADGE_COLOR_MAP,
} from "@/lib/mock-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  BookOpen,
  Trophy,
  Users,
  Clock,
  TrendingUp,
  Star,
  BarChart3,
  GraduationCap,
  Code2,
  FlaskConical,
  PlusCircle,
  Settings,
  Mail,
  Building,
  Calendar,
} from "lucide-react"
import { cn } from "@/lib/utils"

const CLASS_BG: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
}

export default function ProfilePage() {
  const { currentUser } = useApp()
  const isStudent = currentUser.role === "student"
  const isTeacher = currentUser.role === "teacher"

  const myClasses = isStudent
    ? getClassesByStudent(currentUser.id)
    : isTeacher
      ? getClassesByTeacher(currentUser.id)
      : CLASSES

  // Aggregate stats
  const allAssignments = myClasses.flatMap((c) => getAssignmentsByClass(c.id))
  const graded = allAssignments.filter(
    (a) => a.status === "graded" && a.score !== undefined,
  )
  const avgScore =
    graded.length > 0
      ? Math.round(
          graded.reduce((s, a) => s + (a.score ?? 0), 0) / graded.length,
        )
      : 0

  const classRanks = myClasses.map((cls) => {
    const lb = getLeaderboardByClass(cls.id)
    const entry = lb.find((e) => e.studentId === currentUser.id)
    return { cls, rank: entry?.rank, total: lb.length }
  })

  const bestRank = classRanks.reduce<number | null>((best, r) => {
    if (!r.rank) return best
    return best === null || r.rank < best ? r.rank : best
  }, null)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Profile hero */}
      <Card>
        <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center gap-5">
          <Avatar className="w-20 h-20 shrink-0">
            <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
              {currentUser.avatar}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">
                {currentUser.name}
              </h1>
              <span
                className={cn(
                  "text-xs font-semibold px-2.5 py-1 rounded-full capitalize mt-1",
                  currentUser.role === "student" &&
                    "bg-brand-subtle text-brand",
                  currentUser.role === "teacher" &&
                    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                  currentUser.role === "admin" &&
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                )}
              >
                {currentUser.role}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {currentUser.email}
              </span>
              <span className="flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5" />
                {currentUser.institution}
              </span>
              {currentUser.semester && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {currentUser.semester}
                </span>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
            <Settings className="w-3.5 h-3.5" />
            Edit Profile
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      {isStudent && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "GPA",
              value: String(currentUser.gpa ?? "—"),
              icon: Star,
              color: "amber",
            },
            {
              label: "Avg Score",
              value: `${avgScore}%`,
              icon: TrendingUp,
              color: "emerald",
            },
            {
              label: "Classes",
              value: String(myClasses.length),
              icon: BookOpen,
              color: "indigo",
            },
            {
              label: "Best Rank",
              value: bestRank ? `#${bestRank}` : "—",
              icon: Trophy,
              color: "violet",
            },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    s.color === "amber" &&
                      "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
                    s.color === "emerald" &&
                      "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
                    s.color === "indigo" &&
                      "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
                    s.color === "violet" &&
                      "bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
                  )}
                >
                  <s.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* My classes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">
            {isTeacher ? "Teaching" : "Enrolled Classes"}
          </h2>
          {isTeacher && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <PlusCircle className="w-3.5 h-3.5" />
              New Class
            </Button>
          )}
        </div>
        {myClasses.map((cls) => {
          const assignments = getAssignmentsByClass(cls.id)
          const completed = assignments.filter(
            (a) => a.status !== "pending",
          ).length
          const progress =
            assignments.length > 0
              ? Math.round((completed / assignments.length) * 100)
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
                    <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                      {cls.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cls.code} &middot; {cls.schedule}
                    </p>
                    {isStudent && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={progress} className="h-1 flex-1" />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {progress}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] border-0",
                        CLASS_BADGE_COLOR_MAP[cls.color],
                      )}
                    >
                      {cls.subject}
                    </Badge>
                    {isStudent && rankInfo?.rank && (
                      <div className="text-center">
                        <div className="flex items-center gap-0.5">
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
                    {isTeacher && (
                      <div className="text-center">
                        <div className="flex items-center gap-0.5">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm font-bold text-foreground">
                            {cls.studentIds.length}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          students
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Recent grades (student) */}
      {isStudent && graded.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-foreground">Recent Grades</h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {graded.slice(0, 5).map((a) => {
                const cls = myClasses.find((c) =>
                  getAssignmentsByClass(c.id).some((ax) => ax.id === a.id),
                )
                const pct = Math.round(((a.score ?? 0) / a.maxScore) * 100)
                return (
                  <div key={a.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {a.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cls?.name ?? ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Progress
                        value={pct}
                        className="w-20 h-1.5 hidden md:block"
                      />
                      <span
                        className={cn(
                          "text-sm font-bold",
                          pct >= 90
                            ? "text-emerald-600 dark:text-emerald-400"
                            : pct >= 70
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-destructive",
                        )}
                      >
                        {a.score}/{a.maxScore}
                      </span>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
