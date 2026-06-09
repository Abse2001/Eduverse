import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function ClassPageHeader({
  className,
  title,
  code,
  section,
  actions,
  detail,
  inverse = false,
  size = "default",
}: {
  className?: string
  title: string
  code: string
  section: string
  actions?: ReactNode
  detail?: ReactNode
  inverse?: boolean
  size?: "default" | "compact"
}) {
  const isCompact = size === "compact"

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        isCompact ? "min-w-0" : "w-full",
        className,
      )}
    >
      <div className={cn("min-w-0", isCompact ? "space-y-0.5" : "space-y-1")}>
        <h1
          className={cn(
            isCompact
              ? "truncate text-sm font-semibold leading-4 tracking-normal"
              : "text-xl font-bold tracking-normal text-balance",
            inverse ? "text-white" : "text-foreground",
          )}
        >
          {title}
        </h1>
        <p
          className={cn(
            isCompact
              ? "truncate text-xs font-medium leading-4"
              : "text-sm font-medium",
            inverse ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {code} &middot; {section}
        </p>
        {detail ? <div>{detail}</div> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}
