"use client"

import { BarChart3, BookOpen, GraduationCap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ORGANIZATION_CLASS_HISTORY } from "@/lib/mock-data"

export function ClassHistoryTab() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Class History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {ORGANIZATION_CLASS_HISTORY.map((classItem) => (
            <div
              key={classItem.id}
              className="px-5 py-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {classItem.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {classItem.code} &middot; {classItem.teacherName}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:min-w-[420px]">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Students
                    </p>
                    <p className="text-sm font-bold text-foreground">
                      {classItem.students}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Avg Score
                    </p>
                    <p className="text-sm font-bold text-foreground">
                      {classItem.avgScore}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Graded
                    </p>
                    <p className="text-sm font-bold text-foreground">
                      {classItem.gradedAssignments}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Period
                    </p>
                    <Badge variant="secondary" className="border-0 text-[10px]">
                      {classItem.semester}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Progress value={classItem.completion} className="h-1.5" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {classItem.completion}%
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border px-5 py-4 sm:grid-cols-3">
          <SummaryItem
            icon={GraduationCap}
            label="Historical Students"
            value={String(
              ORGANIZATION_CLASS_HISTORY.reduce(
                (sum, classItem) => sum + classItem.students,
                0,
              ),
            )}
          />
          <SummaryItem
            icon={BarChart3}
            label="Avg Completion"
            value={`${Math.round(
              ORGANIZATION_CLASS_HISTORY.reduce(
                (sum, classItem) => sum + classItem.completion,
                0,
              ) / ORGANIZATION_CLASS_HISTORY.length,
            )}%`}
          />
          <SummaryItem
            icon={BookOpen}
            label="Classes"
            value={String(ORGANIZATION_CLASS_HISTORY.length)}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground">{value}</p>
      </div>
    </div>
  )
}
