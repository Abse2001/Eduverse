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
  | "chat"
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

export type WhiteboardShape = "line" | "rect" | "circle"
export type WhiteboardStrokeTool = "pen"

export type WhiteboardOperation =
  | {
      id: string
      type: "stroke"
      tool: WhiteboardStrokeTool
      color: string
      brushSize: number
      points: WhiteboardPoint[]
    }
  | {
      id: string
      type: "shape"
      tool: WhiteboardShape
      color: string
      brushSize: number
      startPoint: WhiteboardPoint
      endPoint: WhiteboardPoint
    }
  | {
      id: string
      type: "clear"
    }
  | {
      id: string
      type: "delete"
      targetId: string
    }
  | {
      id: string
      type: "delete:many"
      targetIds: string[]
    }
  | {
      id: string
      type: "move"
      targetId: string
      delta: WhiteboardPoint
    }
  | {
      id: string
      type: "move:many"
      targetIds: string[]
      delta: WhiteboardPoint
    }

export type LiveSessionWhiteboardMessage =
  | {
      id: string
      senderId: string
      boardId?: string
      type: "stroke:start"
      strokeId: string
      tool: WhiteboardStrokeTool
      color: string
      brushSize: number
      point: WhiteboardPoint
    }
  | {
      id: string
      senderId: string
      boardId?: string
      type: "stroke:points"
      strokeId: string
      points: WhiteboardPoint[]
    }
  | {
      id: string
      senderId: string
      boardId?: string
      type: "stroke:end"
      strokeId: string
      operation: Extract<WhiteboardOperation, { type: "stroke" }>
      version: number
    }
  | {
      id: string
      senderId: string
      boardId?: string
      type: "shape"
      operation: Extract<WhiteboardOperation, { type: "shape" }>
      version: number
    }
  | {
      id: string
      senderId: string
      boardId?: string
      type: "clear"
      operation: Extract<WhiteboardOperation, { type: "clear" }>
      version: number
    }
  | {
      id: string
      senderId: string
      boardId?: string
      type: "delete"
      operation: Extract<WhiteboardOperation, { type: "delete" }>
      version: number
    }
  | {
      id: string
      senderId: string
      boardId?: string
      type: "delete:many"
      operation: Extract<WhiteboardOperation, { type: "delete:many" }>
      version: number
    }
  | {
      id: string
      senderId: string
      boardId?: string
      type: "move"
      operation: Extract<WhiteboardOperation, { type: "move" }>
      version: number
    }
  | {
      id: string
      senderId: string
      boardId?: string
      type: "move:many"
      operation: Extract<WhiteboardOperation, { type: "move:many" }>
      version: number
    }
  | {
      id: string
      senderId: string
      boardId?: string
      type: "state:request"
    }
  | {
      id: string
      senderId: string
      boardId?: string
      type: "state:sync"
      version: number
      operations: WhiteboardOperation[]
    }
  | {
      id: string
      senderId: string
      type: "session:clear"
    }

export interface LiveSessionChatMessage {
  id: string
  classId: string
  senderId: string
  senderName: string
  senderAvatar: string
  senderRole: Role
  content: string
  timestamp: string
  status?: "sending" | "sent" | "failed"
}

export interface LiveSessionState {
  participants: SessionParticipant[]
  connectionState: ConnectionState
  isConnecting: boolean
  error: string | null
  notices: LiveSessionNotice[]
  media: LiveMediaStatus
  chatMessages: LiveSessionChatMessage[]
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
  clearWhiteboards: () => Promise<boolean>
  sendChatMessage: (content: string) => Promise<boolean>
  dismissNotice: (noticeId: string) => void
  disconnect: () => void
}
