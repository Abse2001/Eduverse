"use client"

import { Mic, MicOff, MonitorUp } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { SessionParticipant } from "./live-session-types"
import { VideoTrackView } from "./track-media"

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
        {participant.videoOff || !participant.cameraPublication ? (
          <Avatar className="w-10 h-10">
            <AvatarFallback className="text-sm font-semibold bg-primary/20 text-primary">
              {participant.avatar}
            </AvatarFallback>
          </Avatar>
        ) : (
          <VideoTrackView
            publication={participant.cameraPublication}
            muted={participant.isLocal}
          />
        )}
      </div>
      <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-white bg-black/60 px-1.5 py-0.5 rounded-md truncate max-w-[70px]">
          {participant.isLocal ? "You" : participant.name.split(" ")[0]}
        </span>
        <div className="flex items-center gap-1">
          {participant.isPresenting ? (
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-primary/80">
              <MonitorUp className="w-2.5 h-2.5 text-primary-foreground" />
            </span>
          ) : null}
          <span className="w-5 h-5 flex items-center justify-center rounded-full bg-black/60">
            {participant.muted ? (
              <MicOff className="w-2.5 h-2.5 text-red-400" />
            ) : (
              <Mic className="w-2.5 h-2.5 text-white" />
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
