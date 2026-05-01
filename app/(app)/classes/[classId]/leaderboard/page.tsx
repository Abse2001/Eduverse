"use client"

import { use } from "react"
import {
  getLeaderboardByClass,
  getUserById,
  LeaderboardEntry,
} from "@/lib/mock-data"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import { useApp } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ChartColumn, Medal, Star, Users } from "lucide-react"
import { cn } from "@/lib/utils"

const RANK_STYLES = [
  {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    border: "border-amber-300 dark:border-amber-700",
    text: "text-amber-700 dark:text-amber-300",
    icon: "text-amber-500",
  },
  {
    bg: "bg-slate-100 dark:bg-slate-800/50",
    border: "border-slate-300 dark:border-slate-600",
    text: "text-slate-600 dark:text-slate-300",
    icon: "text-slate-400",
  },
  {
    bg: "bg-orange-100 dark:bg-orange-900/20",
    border: "border-orange-300 dark:border-orange-700",
    text: "text-orange-700 dark:text-orange-300",
    icon: "text-orange-500",
  },
]

export default function LeaderboardPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { currentUser } = useApp()
  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "leaderboard")
  const entries = getLeaderboardByClass(classId)

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (isFeatureDisabled) {
    return (
      <ClassFeatureDisabledFallback classId={classId} featureLabel="Results" />
    )
  }

  const maxScore = entries[0]?.totalScore ?? 1
  const myEntry = entries.find((e) => e.studentId === currentUser.id)

  const top3 = entries.slice(0, 3)
  const rest = entries.slice(3)

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{cls.name}</h1>
          <p className="text-sm text-muted-foreground">
            {cls.code} &middot; Results &middot; {entries.length} students
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <ChartColumn className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            {cls.semester}
          </span>
        </div>
      </div>

      {/* My rank callout */}
      {myEntry && currentUser.role === "student" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Star className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                Your Result
              </p>
              <p className="text-xs text-muted-foreground">
                {myEntry.totalScore} points &middot; {myEntry.avgScore}% average
                &middot; {myEntry.assignments} assignments
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-primary">#{myEntry.rank}</p>
              <p className="text-xs text-muted-foreground">
                of {entries.length}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top 3 podium */}
      {top3.length >= 2 && (
        <div className="flex items-end justify-center gap-3 pt-4">
          {/* 2nd */}
          <PodiumCard
            entry={top3[1]}
            rank={2}
            maxScore={maxScore}
            height="h-28"
            currentUserId={currentUser.id}
          />
          {/* 1st */}
          <PodiumCard
            entry={top3[0]}
            rank={1}
            maxScore={maxScore}
            height="h-36"
            currentUserId={currentUser.id}
          />
          {/* 3rd */}
          {top3[2] && (
            <PodiumCard
              entry={top3[2]}
              rank={3}
              maxScore={maxScore}
              height="h-20"
              currentUserId={currentUser.id}
            />
          )}
        </div>
      )}

      {/* Full table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Class Results
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {entries.map((entry) => {
              const user = getUserById(entry.studentId)
              if (!user) return null
              const isMe = entry.studentId === currentUser.id
              const rankStyle = RANK_STYLES[entry.rank - 1]
              return (
                <div
                  key={entry.studentId}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors",
                    isMe ? "bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  {/* Rank */}
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                      entry.rank <= 3
                        ? cn(
                            rankStyle?.bg,
                            rankStyle?.text,
                            "border",
                            rankStyle?.border,
                          )
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {entry.rank <= 3 ? (
                      <Medal className={cn("w-3.5 h-3.5", rankStyle?.icon)} />
                    ) : (
                      entry.rank
                    )}
                  </div>

                  {/* Avatar */}
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback
                      className={cn(
                        "text-xs font-semibold",
                        isMe
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {user.avatar}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name + progress */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "text-sm font-medium truncate",
                          isMe && "text-primary",
                        )}
                      >
                        {user.name}
                        {isMe && (
                          <span className="ml-1.5 text-[10px] text-primary font-semibold">
                            (you)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress
                        value={(entry.totalScore / maxScore) * 100}
                        className="h-1.5 flex-1"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">
                        {entry.avgScore}%
                      </span>
                    </div>
                  </div>

                  {/* Result */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground">
                      {entry.totalScore}
                    </p>
                    <p className="text-[10px] text-muted-foreground">points</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PodiumCard({
  entry,
  rank,
  maxScore,
  height,
  currentUserId,
}: {
  entry: LeaderboardEntry
  rank: number
  maxScore: number
  height: string
  currentUserId: string
}) {
  const user = getUserById(entry.studentId)
  if (!user) return null
  const isMe = entry.studentId === currentUserId
  const style = RANK_STYLES[rank - 1]

  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <Avatar
        className={cn(
          "w-12 h-12 ring-2",
          isMe ? "ring-primary" : "ring-border",
        )}
      >
        <AvatarFallback
          className={cn(
            "font-bold text-sm",
            isMe ? "bg-primary/20 text-primary" : "bg-muted",
          )}
        >
          {user.avatar}
        </AvatarFallback>
      </Avatar>
      <div className="text-center">
        <p className="text-xs font-semibold text-foreground leading-none">
          {user.name.split(" ")[0]}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {entry.totalScore} points
        </p>
      </div>
      <div
        className={cn(
          "w-full flex items-center justify-center rounded-t-lg border-t border-x",
          height,
          style?.bg,
          style?.border,
        )}
      >
        <div className="flex flex-col items-center gap-1">
          <Medal className={cn("w-5 h-5", style?.icon)} />
          <span className={cn("text-lg font-bold", style?.text)}>#{rank}</span>
        </div>
      </div>
    </div>
  )
}
