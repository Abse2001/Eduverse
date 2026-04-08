"use client"

import { MoreHorizontal, PlusCircle, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CLASSES, getUserById } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { CLASS_COLOR_MAP } from "@/lib/view-config"

export function ClassesTab() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">All Classes</CardTitle>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7">
            <PlusCircle className="w-3.5 h-3.5" />
            Add Class
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {CLASSES.map((cls) => {
            const teacher = getUserById(cls.teacherId)

            return (
              <div
                key={cls.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors"
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0",
                    CLASS_COLOR_MAP[cls.color] ?? "bg-primary",
                  )}
                >
                  {cls.code.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {cls.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {cls.code} &middot; {teacher?.name}
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {cls.studentIds.length} students
                  </span>
                  <span>{cls.room}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] ml-2">
                  {cls.semester}
                </Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
