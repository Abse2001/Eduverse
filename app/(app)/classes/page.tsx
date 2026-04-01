"use client"

import Link from "next/link"
import { useApp } from "@/lib/store"
import {
  CLASSES,
  USERS,
  getAssignmentsByClass,
  getLeaderboardByClass,
  CLASS_BADGE_COLOR_MAP,
} from "@/lib/mock-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  BookOpen,
  Users,
  Trophy,
  Clock,
  Video,
  MessageSquare,
  FlaskConical,
  ArrowRight,
  PlusCircle,
  Star,
} from "lucide-react"
import { cn } from "@/lib/utils"

const CLASS_BG: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
}

export default function ClassesPage() {
  const { currentUser } = useApp()

  const myClasses =
    currentUser.role === "student"
      ? CLASSES.filter((c) => c.studentIds.includes(currentUser.id))
      : currentUser.role === "teacher"
        ? CLASSES.filter((c) => c.teacherId === currentUser.id)
        : CLASSES

  const isTeacher = currentUser.role === "teacher"
  const isAdmin = currentUser.role === "admin"

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">
            {isAdmin
              ? "All Classes"
              : isTeacher
                ? "My Classes"
                : "Enrolled Classes"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {myClasses.length} class{myClasses.length !== 1 ? "es" : ""}{" "}
            &middot; {currentUser.institution}
          </p>
        </div>
        {(isTeacher || isAdmin) && (
          <Button size="sm" className="gap-1.5">
            <PlusCircle className="w-4 h-4" />
            Create Class
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {myClasses.map((cls) => {
          const teacher = USERS.find((u) => u.id === cls.teacherId)
          const assignments = getAssignmentsByClass(cls.id)
          const pending = assignments.filter(
            (a) => a.status === "pending",
          ).length
          const lb = getLeaderboardByClass(cls.id)
          const myRank = lb.find((e) => e.studentId === currentUser.id)
          const studentCount = cls.studentIds.length
          const completed = assignments.filter(
            (a) => a.status !== "pending",
          ).length
          const progress =
            assignments.length > 0
              ? Math.round((completed / assignments.length) * 100)
              : 0

          return (
            <Card
              key={cls.id}
              className="group hover:shadow-lg transition-shadow flex flex-col"
            >
              <CardContent className="p-5 flex flex-col flex-1 gap-4">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                      CLASS_BG[cls.color] ?? "bg-primary",
                    )}
                  >
                    {cls.code.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-foreground text-sm leading-tight group-hover:text-primary transition-colors">
                      {cls.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] border-0",
                          CLASS_BADGE_COLOR_MAP[cls.color],
                        )}
                      >
                        {cls.code}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {cls.semester}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {cls.description}
                </p>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    {studentCount} students
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{cls.schedule}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5 shrink-0" />
                    {assignments.length} assignments
                  </div>
                  {pending > 0 && (
                    <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      {pending} pending
                    </div>
                  )}
                </div>

                {/* Teacher info */}
                {teacher && (
                  <div className="flex items-center gap-2">
                    <Avatar className="w-5 h-5">
                      <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
                        {teacher.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">
                      {teacher.name}
                    </span>
                  </div>
                )}

                {/* Progress (students) */}
                {currentUser.role === "student" && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium text-foreground">
                        {progress}%
                      </span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                {/* Rank strip (students) */}
                {myRank && currentUser.role === "student" && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Rank #{myRank.rank} of {lb.length}
                    </span>
                    <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">
                      {myRank.totalScore} pts
                    </span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-auto">
                  <Link href={`/classes/${cls.id}/home`} className="flex-1">
                    <Button size="sm" className="w-full gap-1.5 text-xs h-8">
                      <BookOpen className="w-3.5 h-3.5" />
                      Open Class
                    </Button>
                  </Link>
                  <Link href={`/classes/${cls.id}/chat`}>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                  <Link href={`/classes/${cls.id}/session`}>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                      <Video className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
