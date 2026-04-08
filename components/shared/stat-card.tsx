"use client"

import type { ElementType } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { STAT_TONE_MAP } from "@/lib/view-config"

interface StatCardProps {
  label: string
  value: string
  icon: ElementType
  color: string
  sublabel?: string
}

export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sublabel,
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            STAT_TONE_MAP[color],
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground leading-none">{label}</p>
          <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
          {sublabel ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {sublabel}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
