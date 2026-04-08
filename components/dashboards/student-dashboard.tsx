"use client"

import Link from "next/link"
import { format, isPast } from "date-fns"
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Star,
  TrendingUp,
  Trophy,
} from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  getAssignmentsByClass,
  getClassesByStudent,
  getLeaderboardByClass,
} from "@/lib/mock-data"
import {
  getAssignmentProgress,
  getAssignmentsWithClassInfo,
  getAverageAssignmentScore,
  getStudentRankSummary,
  getUpcomingAssignments,
} from "@/lib/education/selectors"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

export function StudentDashboard() {
  const { currentUser } = useApp()
  const myClasses = getClassesByStudent(currentUser.id)
  const allAssignments = getAssignmentsWithClassInfo(
    myClasses,
    getAssignmentsByClass,
  )
  const pendingAssignments = allAssignments.filter(
    (assignment) => assignment.status === "pending",
  )
  const avgScore = getAverageAssignmentScore(allAssignments)
  const upcomingAssignments = getUpcomingAssignments(allAssignments).slice(0, 4)
  const classRanks = getStudentRankSummary(
    myClasses,
    currentUser.id,
    getLeaderboardByClass,
  )

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground text-balance">
          Good morning, {currentUser.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {currentUser.institution} &middot; {currentUser.semester}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Enrolled Classes"
          value={String(myClasses.length)}
          icon={BookOpen}
          color="indigo"
        />
        <StatCard
          label="Pending Tasks"
          value={String(pendingAssignments.length)}
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
            const { progress } = getAssignmentProgress(assignments)
            const rankInfo = classRanks.find((rank) => rank.cls.id === cls.id)

            return (
              <Link key={cls.id} href={`/classes/${cls.id}/home`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                        CLASS_COLOR_MAP[cls.color] ?? "bg-primary",
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
                    {rankInfo?.rank ? (
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
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold text-foreground">Upcoming Deadlines</h2>
          {upcomingAssignments.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">All caught up!</p>
              </CardContent>
            </Card>
          ) : (
            upcomingAssignments.map((assignment) => {
              const dueDate = new Date(assignment.dueDate)
              const overdue = isPast(dueDate)

              return (
                <Link
                  key={assignment.id}
                  href={`/classes/${assignment.classInfo.id}/assignments`}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-3 flex items-start gap-3">
                      <div
                        className={cn(
                          "w-1.5 rounded-full self-stretch mt-1 shrink-0",
                          CLASS_COLOR_MAP[assignment.classInfo.color] ??
                            "bg-muted",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {assignment.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {assignment.classInfo.code}
                        </p>
                        <p
                          className={cn(
                            "text-xs font-medium mt-1",
                            overdue
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          Due {format(dueDate, "MMM d, h:mm a")}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] shrink-0",
                          assignment.type === "lab" &&
                            "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
                          assignment.type === "quiz" &&
                            "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                          assignment.type === "exam" &&
                            "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
                        )}
                      >
                        {assignment.type}
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
