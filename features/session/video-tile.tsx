"use client"

import { Mic, MicOff } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { SessionParticipant } from "./session-data"

export function VideoTile({
  participant,
}: {
  participant: SessionParticipant
}) {
  return (
    <div
      className={cn(
        "relative w-28 h-20 rounded-xl overflow-hidden shrink-0 border-2 transition-all",
        participant.speaking ? "border-primary" : "border-transparent",
      )}
    >
      <div className="w-full h-full bg-muted flex items-center justify-center">
        {participant.videoOff ? (
          <Avatar className="w-10 h-10">
            <AvatarFallback className="text-sm font-semibold bg-primary/20 text-primary">
              {participant.avatar}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, hsl(${participant.id.charCodeAt(1) * 40} 60% 40%), hsl(${participant.id.charCodeAt(1) * 40 + 60} 50% 30%))`,
            }}
          />
        )}
      </div>
      <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-white bg-black/60 px-1.5 py-0.5 rounded-md truncate max-w-[70px]">
          {participant.name.split(" ")[0]}
        </span>
        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-black/60">
          {participant.muted ? (
            <MicOff className="w-2.5 h-2.5 text-red-400" />
          ) : (
            <Mic className="w-2.5 h-2.5 text-white" />
          )}
        </span>
      </div>
    </div>
  )
}
