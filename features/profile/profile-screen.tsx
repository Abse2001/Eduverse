"use client"

import Link from "next/link"
import {
  BookOpen,
  Building,
  Calendar,
  Mail,
  PlusCircle,
  Settings,
  Star,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  CLASSES,
  getAssignmentsByClass,
  getClassesByStudent,
  getClassesByTeacher,
  getLeaderboardByClass,
} from "@/lib/mock-data"
import {
  getAssignmentProgress,
  getAverageAssignmentScore,
  getBestRank,
  getStudentRankSummary,
} from "@/lib/education/selectors"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import {
  CLASS_BADGE_COLOR_MAP,
  CLASS_COLOR_MAP,
  ROLE_BADGE_COLOR_MAP,
} from "@/lib/view-config"

export function ProfileScreen() {
  const { currentUser } = useApp()
  const isStudent = currentUser.role === "student"
  const isTeacher = currentUser.role === "teacher"
  const myClasses = isStudent
    ? getClassesByStudent(currentUser.id)
    : isTeacher
      ? getClassesByTeacher(currentUser.id)
      : CLASSES
  const allAssignments = myClasses.flatMap((cls) =>
    getAssignmentsByClass(cls.id),
  )
  const gradedAssignments = allAssignments.filter(
    (assignment) =>
      assignment.status === "graded" && assignment.score !== undefined,
  )
  const avgScore = getAverageAssignmentScore(allAssignments)
  const classRanks = getStudentRankSummary(
    myClasses,
    currentUser.id,
    getLeaderboardByClass,
  )
  const bestRank = getBestRank(classRanks)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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
                  ROLE_BADGE_COLOR_MAP[currentUser.role],
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
              {currentUser.semester ? (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {currentUser.semester}
                </span>
              ) : null}
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
            <Settings className="w-3.5 h-3.5" />
            Edit Profile
          </Button>
        </CardContent>
      </Card>

      {isStudent ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="GPA"
            value={String(currentUser.gpa ?? "—")}
            icon={Star}
            color="amber"
          />
          <StatCard
            label="Avg Score"
            value={`${avgScore}%`}
            icon={TrendingUp}
            color="emerald"
          />
          <StatCard
            label="Classes"
            value={String(myClasses.length)}
            icon={BookOpen}
            color="indigo"
          />
          <StatCard
            label="Best Rank"
            value={bestRank ? `#${bestRank}` : "—"}
            icon={Trophy}
            color="violet"
          />
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">
            {isTeacher ? "Teaching" : "Enrolled Classes"}
          </h2>
          {isTeacher ? (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <PlusCircle className="w-3.5 h-3.5" />
              New Class
            </Button>
          ) : null}
        </div>
        {myClasses.map((cls) => {
          const { progress } = getAssignmentProgress(
            getAssignmentsByClass(cls.id),
          )
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
                    <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                      {cls.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cls.code} &middot; {cls.schedule}
                    </p>
                    {isStudent ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={progress} className="h-1 flex-1" />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {progress}%
                        </span>
                      </div>
                    ) : null}
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
                    {isStudent && rankInfo?.rank ? (
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
                    ) : null}
                    {isTeacher ? (
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
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {isStudent && gradedAssignments.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-semibold text-foreground">Recent Grades</h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {gradedAssignments.slice(0, 5).map((assignment) => {
                const cls = myClasses.find((candidate) =>
                  getAssignmentsByClass(candidate.id).some(
                    (current) => current.id === assignment.id,
                  ),
                )
                const percentage = Math.round(
                  ((assignment.score ?? 0) / assignment.maxScore) * 100,
                )

                return (
                  <div
                    key={assignment.id}
                    className="flex items-center gap-4 px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {assignment.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cls?.name ?? ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Progress
                        value={percentage}
                        className="w-20 h-1.5 hidden md:block"
                      />
                      <span
                        className={cn(
                          "text-sm font-bold",
                          percentage >= 90
                            ? "text-emerald-600 dark:text-emerald-400"
                            : percentage >= 70
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-destructive",
                        )}
                      >
                        {assignment.score}/{assignment.maxScore}
                      </span>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
