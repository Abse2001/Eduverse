"use client"

import { Mic, MicOff, Video, VideoOff } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { SessionParticipant } from "./session-data"

export function ParticipantsPanel({
  participants,
}: {
  participants: SessionParticipant[]
}) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1">
      {participants.map((participant) => (
        <div
          key={participant.id}
          className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors"
        >
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
              {participant.avatar}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {participant.name}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {participant.role}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {participant.muted ? (
              <MicOff className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-emerald-500" />
            )}
            {participant.videoOff ? (
              <VideoOff className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <Video className="w-3.5 h-3.5 text-emerald-500" />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
