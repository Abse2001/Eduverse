"use client"

import type { ElementType } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ControlButtonProps {
  icon: ElementType
  label: string
  onClick: () => void
  destructive?: boolean
  highlight?: boolean
  disabled?: boolean
}

export function ControlButton({
  icon: Icon,
  label,
  onClick,
  destructive,
  highlight,
  disabled,
}: ControlButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "h-8 w-8 flex items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            destructive
              ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
              : highlight
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "bg-accent/50 text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          <Icon className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
