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

export type LiveSessionNoticeSeverity = "success" | "info" | "warning" | "error"

export type LiveSessionNoticeScope =
  | "session"
  | "microphone"
  | "camera"
  | "screen"
  | "whiteboard"

export interface LiveSessionNotice {
  id: string
  scope: LiveSessionNoticeScope
  severity: LiveSessionNoticeSeverity
  title: string
  description: string
  nextStep?: string
  dismissible?: boolean
}

export type LiveMediaState =
  | "off"
  | "starting"
  | "stopping"
  | "on"
  | "blocked"
  | "unavailable"
  | "error"

export interface LiveMediaDeviceStatus {
  state: LiveMediaState
  label: string
  detail?: string
}

export interface LiveMediaStatus {
  microphone: LiveMediaDeviceStatus
  camera: LiveMediaDeviceStatus
  screen: LiveMediaDeviceStatus
}

export interface WhiteboardPoint {
  x: number
  y: number
}

export type LiveSessionWhiteboardMessage =
  | {
      id: string
      senderId: string
      type: "stroke:start"
      strokeId: string
      tool: "pen" | "eraser"
      color: string
      brushSize: number
      point: WhiteboardPoint
    }
  | {
      id: string
      senderId: string
      type: "stroke:point"
      strokeId: string
      point: WhiteboardPoint
    }
  | {
      id: string
      senderId: string
      type: "stroke:end"
      strokeId: string
    }
  | {
      id: string
      senderId: string
      type: "clear"
    }
  | {
      id: string
      senderId: string
      type: "snapshot"
      imageDataUrl: string
    }
  | {
      id: string
      senderId: string
      type: "snapshot:request"
    }

export interface LiveSessionState {
  participants: SessionParticipant[]
  connectionState: ConnectionState
  isConnecting: boolean
  error: string | null
  notices: LiveSessionNotice[]
  media: LiveMediaStatus
  whiteboardMessages: LiveSessionWhiteboardMessage[]
  micOn: boolean
  camOn: boolean
  screenSharing: boolean
  presentation: SessionPresentation | null
  toggleMic: () => Promise<void>
  toggleCamera: () => Promise<void>
  toggleScreenShare: () => Promise<void>
  sendWhiteboardMessage: (
    message: LiveSessionWhiteboardMessage,
    options?: { reliable?: boolean },
  ) => Promise<boolean>
  dismissNotice: (noticeId: string) => void
  disconnect: () => void
}
