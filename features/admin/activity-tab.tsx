"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

const ACTIVITY_FEED = [
  {
    id: 1,
    actor: "Jordan Kim",
    action: "submitted",
    target: "Assignment 1 — Linked Lists",
    cls: "CS301",
    time: "2 min ago",
    color: "emerald",
  },
  {
    id: 2,
    actor: "Dr. Priya Nair",
    action: "started a session in",
    target: "Data Structures & Algorithms",
    cls: "CS301",
    time: "15 min ago",
    color: "indigo",
  },
  {
    id: 3,
    actor: "Alex Rivera",
    action: "joined exam",
    target: "Midterm — Data Structures",
    cls: "CS301",
    time: "30 min ago",
    color: "amber",
  },
  {
    id: 4,
    actor: "Prof. Carlos Mendes",
    action: "uploaded material in",
    target: "Web Development Bootcamp",
    cls: "WD101",
    time: "1 hr ago",
    color: "emerald",
  },
  {
    id: 5,
    actor: "Sam Chen",
    action: "scored 95 on",
    target: "Lab 1 — Linear Regression",
    cls: "ML201",
    time: "2 hr ago",
    color: "violet",
  },
  {
    id: 6,
    actor: "Morgan Walsh",
    action: "submitted",
    target: "Project 1 — Portfolio Page",
    cls: "WD101",
    time: "3 hr ago",
    color: "emerald",
  },
  {
    id: 7,
    actor: "Taylor Brooks",
    action: "joined class",
    target: "Machine Learning Fundamentals",
    cls: "ML201",
    time: "5 hr ago",
    color: "violet",
  },
]

export function ActivityTab() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Recent Platform Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {ACTIVITY_FEED.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 px-5 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex flex-col items-center gap-1 pt-1.5 shrink-0">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    CLASS_COLOR_MAP[item.color] ?? "bg-muted-foreground",
                  )}
                />
                <div className="w-px flex-1 bg-border min-h-[12px]" />
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{item.actor}</span>{" "}
                  {item.action}{" "}
                  <span className="font-medium">{item.target}</span>
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-[10px] border-0">
                    {item.cls}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.time}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
