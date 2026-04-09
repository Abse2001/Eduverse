import type { Role } from "@/lib/mock-data"
import type { ConnectionState, TrackPublication } from "livekit-client"

export interface SessionParticipant {
  id: string
  name: string
  avatar: string
  role: Role
  isLocal: boolean
  muted: boolean
  videoOff: boolean
  speaking: boolean
  isPresenting: boolean
  cameraPublication?: TrackPublication
  screenSharePublication?: TrackPublication
  audioPublications: TrackPublication[]
}

export interface SessionPresentation {
  participant: SessionParticipant
  publication: TrackPublication
}

export interface LiveSessionState {
  participants: SessionParticipant[]
  connectionState: ConnectionState
  isConnecting: boolean
  error: string | null
  micOn: boolean
  camOn: boolean
  screenSharing: boolean
  presentation: SessionPresentation | null
  toggleMic: () => Promise<void>
  toggleCamera: () => Promise<void>
  toggleScreenShare: () => Promise<void>
  disconnect: () => void
}
