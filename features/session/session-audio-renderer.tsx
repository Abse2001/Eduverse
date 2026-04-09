"use client"

import type { SessionParticipant } from "./live-session-types"
import { AudioTrackPlayer } from "./track-media"

export function SessionAudioRenderer({
  participants,
}: {
  participants: SessionParticipant[]
}) {
  return (
    <>
      {participants
        .filter((participant) => !participant.isLocal)
        .flatMap((participant) =>
          participant.audioPublications.map((publication) => (
            <AudioTrackPlayer
              key={`${participant.id}-${publication.trackSid}`}
              publication={publication}
            />
          )),
        )}
    </>
  )
}
