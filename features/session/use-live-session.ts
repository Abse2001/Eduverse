"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RoomConnectOptions,
  type RoomEventCallbacks,
  type RoomOptions,
  type TrackPublication,
} from "livekit-client"
import type { Role, User } from "@/lib/mock-data"
import { getUserById } from "@/lib/mock-data"
import type {
  LiveSessionChatMessage,
  LiveMediaDeviceStatus,
  LiveMediaStatus,
  LiveSessionNotice,
  LiveSessionState,
  LiveSessionWhiteboardMessage,
  SessionParticipant,
  SessionPresentation,
  WhiteboardOperation,
  WhiteboardPoint,
  WhiteboardShape,
  WhiteboardStrokeTool,
} from "./live-session-types"

const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
}

const ROOM_CONNECT_OPTIONS: RoomConnectOptions = {
  autoSubscribe: true,
}

const WHITEBOARD_TOPIC = "eduverse.whiteboard"
const CHAT_TOPIC = "eduverse.session.chat"
const CHAT_STORAGE_PREFIX = "eduverse:session-chat:v1"
const MAX_CHAT_MESSAGES = 200

type MediaDeviceKind = "microphone" | "camera" | "screen"
type SessionTokenUser = Pick<User, "avatar" | "id" | "name" | "role">
type LiveSessionError =
  | Error
  | string
  | {
      message?: string
      name?: string
    }
  | null
  | undefined
type JsonObject = { [key: string]: JsonValue }
type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]
type ParsedWhiteboardObject = JsonObject &
  Partial<{
    brushSize: JsonValue
    boardId: JsonValue
    color: JsonValue
    delta: JsonValue
    endPoint: JsonValue
    id: JsonValue
    operation: JsonValue
    operations: JsonValue
    point: JsonValue
    points: JsonValue
    senderId: JsonValue
    startPoint: JsonValue
    strokeId: JsonValue
    targetId: JsonValue
    targetIds: JsonValue
    tool: JsonValue
    type: JsonValue
    version: JsonValue
    x: JsonValue
    y: JsonValue
  }>

type ChatStreamAttributes = Record<string, string> | undefined

const INITIAL_MEDIA_STATUS: LiveMediaStatus = {
  microphone: {
    state: "off",
    label: "Microphone is off",
  },
  camera: {
    state: "off",
    label: "Camera is off",
  },
  screen: {
    state: "off",
    label: "Screen sharing is off",
  },
}

const MEDIA_LABELS: Record<MediaDeviceKind, string> = {
  microphone: "Microphone",
  camera: "Camera",
  screen: "Screen sharing",
}

function getErrorName(error: LiveSessionError) {
  if (error && typeof error === "object" && typeof error.name === "string") {
    return error.name
  }

  return undefined
}

function getErrorMessage(error: LiveSessionError) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === "string" && error) {
    return error
  }

  return "An unexpected error occurred."
}

function isJsonObject(
  value: JsonValue | undefined,
): value is ParsedWhiteboardObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isWhiteboardPoint(
  value: JsonValue | undefined,
): value is WhiteboardPoint & JsonObject {
  return (
    isJsonObject(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  )
}

function isWhiteboardPointList(
  value: JsonValue | undefined,
): value is Array<WhiteboardPoint & JsonObject> {
  return Array.isArray(value) && value.every(isWhiteboardPoint)
}

function isStringList(value: JsonValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isWhiteboardShape(
  value: JsonValue | undefined,
): value is WhiteboardShape {
  return value === "line" || value === "rect" || value === "circle"
}

function isWhiteboardStrokeTool(
  value: JsonValue | undefined,
): value is WhiteboardStrokeTool {
  return value === "pen"
}

function isRole(value: string | undefined): value is Role {
  return value === "student" || value === "teacher" || value === "admin"
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}

function createChatMessageId(senderId: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)

  return `chat_${senderId}_${Date.now()}_${random}`
}

function upsertChatMessage(
  messages: LiveSessionChatMessage[],
  message: LiveSessionChatMessage,
) {
  return [...messages.filter((current) => current.id !== message.id), message]
    .sort(
      (left, right) =>
        new Date(left.timestamp).getTime() -
        new Date(right.timestamp).getTime(),
    )
    .slice(-MAX_CHAT_MESSAGES)
}

function mergeChatMessages(
  currentMessages: LiveSessionChatMessage[],
  nextMessages: LiveSessionChatMessage[],
) {
  return nextMessages.reduce(upsertChatMessage, currentMessages)
}

function hasWindow() {
  return typeof window !== "undefined"
}

function getSessionChatStoragePrefix(classId: string, userId: string) {
  return `${CHAT_STORAGE_PREFIX}:${classId}:${userId}:`
}

function getSessionChatStorageKey({
  classId,
  userId,
  roomSid,
}: {
  classId: string
  userId: string
  roomSid: string
}) {
  return `${getSessionChatStoragePrefix(classId, userId)}${roomSid}`
}

function isStoredChatMessage(
  value: unknown,
  classId: string,
): value is LiveSessionChatMessage {
  if (!value || typeof value !== "object") {
    return false
  }

  const message = value as Partial<LiveSessionChatMessage>

  return (
    message.classId === classId &&
    typeof message.id === "string" &&
    typeof message.senderId === "string" &&
    typeof message.senderName === "string" &&
    typeof message.senderAvatar === "string" &&
    isRole(message.senderRole) &&
    typeof message.content === "string" &&
    typeof message.timestamp === "string"
  )
}

function loadStoredSessionChatMessages(
  storageKey: string,
  classId: string,
): LiveSessionChatMessage[] {
  if (!hasWindow()) {
    return []
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : null

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((item) => isStoredChatMessage(item, classId))
      .map((message) => ({ ...message, status: "sent" as const }))
      .slice(-MAX_CHAT_MESSAGES)
  } catch {
    return []
  }
}

function saveStoredSessionChatMessages(
  storageKey: string,
  messages: LiveSessionChatMessage[],
) {
  if (!hasWindow()) {
    return
  }

  try {
    const sentMessages = messages
      .filter((message) => message.status !== "sending")
      .filter((message) => message.status !== "failed")
      .map((message) => ({ ...message, status: "sent" }))
      .slice(-MAX_CHAT_MESSAGES)

    window.localStorage.setItem(storageKey, JSON.stringify(sentMessages))
  } catch {
    console.error("Failed to save session chat to localStorage")
  }
}

function pruneStoredSessionChats({
  classId,
  userId,
  activeStorageKey,
}: {
  classId: string
  userId: string
  activeStorageKey: string
}) {
  if (!hasWindow()) {
    return
  }

  try {
    const prefix = getSessionChatStoragePrefix(classId, userId)

    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index)

      if (key?.startsWith(prefix) && key !== activeStorageKey) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    console.error("Failed to prune old session chat from localStorage")
  }
}

function mapIncomingChatMessage({
  content,
  classId,
  participantIdentity,
  attributes,
}: {
  content: string
  classId: string
  participantIdentity: string
  attributes: ChatStreamAttributes
}): LiveSessionChatMessage | null {
  const trimmed = content.trim()

  if (!trimmed || attributes?.classId !== classId) {
    return null
  }

  const senderId = attributes.senderId || participantIdentity
  const fallbackUser = getUserById(senderId)
  const senderName = attributes.senderName || fallbackUser?.name || senderId
  const senderRole = isRole(attributes.senderRole)
    ? attributes.senderRole
    : (fallbackUser?.role ?? "student")

  return {
    id: attributes.id || createChatMessageId(senderId),
    classId,
    senderId,
    senderName,
    senderAvatar:
      attributes.senderAvatar ||
      fallbackUser?.avatar ||
      getInitials(senderName),
    senderRole,
    content: trimmed,
    timestamp: attributes.timestamp || new Date().toISOString(),
    status: "sent",
  }
}

function isWhiteboardOperation(
  value: JsonValue | undefined,
): value is WhiteboardOperation & JsonObject {
  if (
    !isJsonObject(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string"
  ) {
    return false
  }

  if (value.type === "clear") {
    return true
  }

  if (value.type === "delete") {
    return typeof value.targetId === "string"
  }

  if (value.type === "delete:many") {
    return isStringList(value.targetIds)
  }

  if (value.type === "move") {
    return typeof value.targetId === "string" && isWhiteboardPoint(value.delta)
  }

  if (value.type === "move:many") {
    return isStringList(value.targetIds) && isWhiteboardPoint(value.delta)
  }

  if (
    value.type === "stroke" &&
    isWhiteboardStrokeTool(value.tool) &&
    typeof value.color === "string" &&
    typeof value.brushSize === "number" &&
    isWhiteboardPointList(value.points)
  ) {
    return true
  }

  return (
    value.type === "shape" &&
    isWhiteboardShape(value.tool) &&
    typeof value.color === "string" &&
    typeof value.brushSize === "number" &&
    isWhiteboardPoint(value.startPoint) &&
    isWhiteboardPoint(value.endPoint)
  )
}

function isWhiteboardOperationList(
  value: JsonValue | undefined,
): value is Array<WhiteboardOperation & JsonObject> {
  return Array.isArray(value) && value.every(isWhiteboardOperation)
}

function isWhiteboardMessage(
  value: JsonValue | undefined,
): value is LiveSessionWhiteboardMessage & JsonObject {
  if (
    !isJsonObject(value) ||
    typeof value.id !== "string" ||
    typeof value.senderId !== "string" ||
    typeof value.type !== "string" ||
    (value.boardId !== undefined && typeof value.boardId !== "string")
  ) {
    return false
  }

  if (value.type === "state:request") {
    return true
  }

  if (value.type === "session:clear") {
    return value.boardId === undefined
  }

  if (
    value.type === "state:sync" &&
    typeof value.version === "number" &&
    isWhiteboardOperationList(value.operations)
  ) {
    return true
  }

  if (value.type === "shape") {
    const operation = value.operation
    return (
      typeof value.version === "number" &&
      isWhiteboardOperation(operation) &&
      operation.type === "shape"
    )
  }

  if (value.type === "clear") {
    const operation = value.operation
    return (
      typeof value.version === "number" &&
      isWhiteboardOperation(operation) &&
      operation.type === "clear"
    )
  }

  if (value.type === "delete") {
    const operation = value.operation
    return (
      typeof value.version === "number" &&
      isWhiteboardOperation(operation) &&
      operation.type === "delete"
    )
  }

  if (value.type === "delete:many") {
    const operation = value.operation
    return (
      typeof value.version === "number" &&
      isWhiteboardOperation(operation) &&
      operation.type === "delete:many"
    )
  }

  if (value.type === "move") {
    const operation = value.operation
    return (
      typeof value.version === "number" &&
      isWhiteboardOperation(operation) &&
      operation.type === "move"
    )
  }

  if (value.type === "move:many") {
    const operation = value.operation
    return (
      typeof value.version === "number" &&
      isWhiteboardOperation(operation) &&
      operation.type === "move:many"
    )
  }

  if (
    value.type === "stroke:points" &&
    typeof value.strokeId === "string" &&
    isWhiteboardPointList(value.points)
  ) {
    return true
  }

  if (
    value.type === "stroke:end" &&
    typeof value.strokeId === "string" &&
    typeof value.version === "number"
  ) {
    const operation = value.operation
    return isWhiteboardOperation(operation) && operation.type === "stroke"
  }

  return (
    value.type === "stroke:start" &&
    typeof value.strokeId === "string" &&
    isWhiteboardStrokeTool(value.tool) &&
    typeof value.color === "string" &&
    typeof value.brushSize === "number" &&
    isWhiteboardPoint(value.point)
  )
}

function canDeriveMediaStatus(status: LiveMediaDeviceStatus) {
  return !["blocked", "unavailable", "error", "starting", "stopping"].includes(
    status.state,
  )
}

function createConnectionNotice(error: LiveSessionError): LiveSessionNotice {
  const message = getErrorMessage(error)

  if (message.includes("Live session env vars are missing")) {
    return {
      id: "session",
      scope: "session",
      severity: "error",
      title: "Live sessions are not configured",
      description:
        "The classroom call service is missing its LiveKit configuration.",
      nextStep:
        "Ask an administrator to set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL, then try again.",
    }
  }

  if (
    message.toLowerCase().includes("failed to fetch") ||
    message.toLowerCase().includes("network")
  ) {
    return {
      id: "session",
      scope: "session",
      severity: "error",
      title: "Could not reach the live session",
      description:
        "The connection to the classroom call service did not complete.",
      nextStep:
        "Check your internet connection or VPN, then leave and rejoin the session.",
    }
  }

  return {
    id: "session",
    scope: "session",
    severity: "error",
    title: "Could not join the live session",
    description: message,
    nextStep:
      "Leave and rejoin the session. If it keeps failing, contact support.",
  }
}

function createMediaNotice(
  device: MediaDeviceKind,
  error: LiveSessionError,
): LiveSessionNotice & { status: LiveMediaDeviceStatus } {
  const name = getErrorName(error)
  const message = getErrorMessage(error)
  const label = MEDIA_LABELS[device]
  const isScreen = device === "screen"

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    if (isScreen) {
      return {
        id: device,
        scope: device,
        severity: "warning",
        title: "Screen sharing did not start",
        description: "No screen, window, or tab was shared with the session.",
        nextStep:
          "Click Share screen again and choose what to share. If you cancelled on purpose, no action is needed.",
        status: {
          state: "off",
          label: "Screen sharing was cancelled",
          detail: "Nothing is being shared.",
        },
      }
    }

    return {
      id: device,
      scope: device,
      severity: "error",
      title: `${label} permission is blocked`,
      description: `EduFlow could not access your ${device}.`,
      nextStep: `Allow ${device} access in your browser site settings, then try again.`,
      status: {
        state: "blocked",
        label: `${label} blocked`,
        detail: "Permission is blocked in the browser.",
      },
    }
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      id: device,
      scope: device,
      severity: "error",
      title: `${label} not found`,
      description: `No ${device} was detected on this device.`,
      nextStep: `Connect or enable a ${device}, then try again.`,
      status: {
        state: "unavailable",
        label: `${label} not found`,
        detail: "No matching device was detected.",
      },
    }
  }

  if (
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    name === "AbortError"
  ) {
    return {
      id: device,
      scope: device,
      severity: "error",
      title: `${label} is unavailable`,
      description: `The browser found your ${device}, but could not start it.`,
      nextStep: `Close other apps using the ${device}, check system privacy settings, then try again.`,
      status: {
        state: "error",
        label: `${label} could not start`,
        detail: "Another app or system setting may be blocking it.",
      },
    }
  }

  if (
    name === "OverconstrainedError" ||
    name === "ConstraintNotSatisfiedError"
  ) {
    return {
      id: device,
      scope: device,
      severity: "error",
      title: `${label} does not support the requested settings`,
      description: `The selected ${device} cannot be used with the current browser settings.`,
      nextStep: `Choose another ${device} in browser settings or reconnect the device, then try again.`,
      status: {
        state: "unavailable",
        label: `${label} settings are not supported`,
        detail: "The selected device cannot meet the requested settings.",
      },
    }
  }

  if (name === "SecurityError") {
    return {
      id: device,
      scope: device,
      severity: "error",
      title: `${label} access was blocked`,
      description: "The browser blocked media access for this page.",
      nextStep:
        "Open the app over HTTPS or update browser privacy settings, then try again.",
      status: {
        state: "blocked",
        label: `${label} blocked`,
        detail: "Browser security settings blocked access.",
      },
    }
  }

  return {
    id: device,
    scope: device,
    severity: "error",
    title: `${label} could not be updated`,
    description: message,
    nextStep: "Check browser and system permissions, then try again.",
    status: {
      state: "error",
      label: `${label} error`,
      detail: message,
    },
  }
}

function findPublication(participant: Participant, source: Track.Source) {
  return Array.from(participant.trackPublications.values()).find(
    (publication) => publication.source === source,
  )
}

function isActiveVideoPublication(publication?: TrackPublication) {
  return (
    Boolean(publication) &&
    !publication?.isMuted &&
    publication?.track?.kind === Track.Kind.Video &&
    publication.track.mediaStreamTrack.readyState === "live"
  )
}

function parseParticipantMetadata(participant: Participant) {
  const fallbackUser = getUserById(participant.identity)
  const fallbackName = participant.name ?? participant.identity

  if (!participant.metadata) {
    return fallbackUser
  }

  try {
    const metadata = JSON.parse(participant.metadata) as Partial<User>
    return {
      avatar:
        metadata.avatar ??
        fallbackUser?.avatar ??
        fallbackName.slice(0, 2).toUpperCase(),
      role: metadata.role ?? fallbackUser?.role ?? "student",
    }
  } catch {
    return fallbackUser
  }
}

function sortParticipants(participants: SessionParticipant[]) {
  return [...participants].sort((left, right) => {
    if (left.isLocal !== right.isLocal) {
      return left.isLocal ? -1 : 1
    }

    if (left.role !== right.role) {
      return left.role === "teacher" ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })
}

function mapParticipant(
  participant: Participant,
  localParticipantSid?: string,
) {
  const metadata = parseParticipantMetadata(participant)
  const participantName = participant.name ?? participant.identity
  const cameraPublication = findPublication(participant, Track.Source.Camera)
  const screenSharePublication = findPublication(
    participant,
    Track.Source.ScreenShare,
  )
  const microphonePublication = findPublication(
    participant,
    Track.Source.Microphone,
  )
  const audioPublications = Array.from(
    participant.trackPublications.values(),
  ).filter(
    (publication) =>
      publication.track?.kind === Track.Kind.Audio && !publication.isMuted,
  )

  return {
    id: participant.identity,
    name: participantName,
    avatar:
      metadata?.avatar ??
      participantName
        .split(" ")
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase(),
    role: metadata?.role ?? "student",
    isLocal: participant.sid === localParticipantSid,
    muted: microphonePublication?.isMuted ?? true,
    videoOff:
      !cameraPublication ||
      cameraPublication.isMuted ||
      !cameraPublication.track,
    speaking: participant.isSpeaking,
    isPresenting: isActiveVideoPublication(screenSharePublication),
    cameraPublication,
    screenSharePublication,
    audioPublications,
  } satisfies SessionParticipant
}

async function fetchSessionToken(classId: string, user: SessionTokenUser) {
  const response = await fetch("/api/livekit/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      classId,
      user: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
      },
    }),
  })

  const payload = (await response.json().catch(() => null)) as {
    error?: string
    participantToken?: string
    serverUrl?: string
  } | null

  if (!response.ok || !payload?.participantToken || !payload.serverUrl) {
    throw new Error(payload?.error ?? "Unable to create a live session token.")
  }

  return payload as { participantToken: string; serverUrl: string }
}

export function useLiveSession({
  classId,
  currentUser,
  enabled,
}: {
  classId: string
  currentUser: User
  enabled: boolean
}): LiveSessionState {
  const roomRef = useRef<Room | null>(null)
  const [participants, setParticipants] = useState<SessionParticipant[]>([])
  const [connectionState, setConnectionState] = useState(
    ConnectionState.Disconnected,
  )
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notices, setNotices] = useState<LiveSessionNotice[]>([])
  const [media, setMedia] = useState<LiveMediaStatus>(INITIAL_MEDIA_STATUS)
  const [chatMessages, setChatMessages] = useState<LiveSessionChatMessage[]>([])
  const [chatStorageKey, setChatStorageKey] = useState<string | null>(null)
  const [whiteboardMessages, setWhiteboardMessages] = useState<
    LiveSessionWhiteboardMessage[]
  >([])
  const currentUserId = currentUser.id
  const currentUserName = currentUser.name
  const currentUserAvatar = currentUser.avatar
  const currentUserRole = currentUser.role

  const upsertNotice = useCallback((notice: LiveSessionNotice) => {
    setNotices((prev) =>
      [
        { dismissible: true, ...notice },
        ...prev.filter((current) => current.id !== notice.id),
      ].slice(0, 4),
    )
  }, [])

  const dismissNotice = useCallback((noticeId: string) => {
    setNotices((prev) => prev.filter((notice) => notice.id !== noticeId))
  }, [])

  const updateMediaDevice = useCallback(
    (device: MediaDeviceKind, status: LiveMediaDeviceStatus) => {
      setMedia((prev) => ({
        ...prev,
        [device]: status,
      }))
    },
    [],
  )

  useEffect(() => {
    if (!chatStorageKey) {
      return
    }

    saveStoredSessionChatMessages(chatStorageKey, chatMessages)
  }, [chatMessages, chatStorageKey])

  const syncParticipants = useCallback(() => {
    const room = roomRef.current

    if (!room) {
      setParticipants([])
      setConnectionState(ConnectionState.Disconnected)
      return
    }

    const nextParticipants = sortParticipants([
      mapParticipant(room.localParticipant, room.localParticipant.sid),
      ...Array.from(room.remoteParticipants.values()).map((participant) =>
        mapParticipant(participant, room.localParticipant.sid),
      ),
    ])
    const localParticipant = nextParticipants.find(
      (participant) => participant.isLocal,
    )

    setParticipants(nextParticipants)
    setConnectionState(room.state)
    setMedia((prev) => ({
      microphone: canDeriveMediaStatus(prev.microphone)
        ? {
            state: localParticipant && !localParticipant.muted ? "on" : "off",
            label:
              localParticipant && !localParticipant.muted
                ? "Microphone is on"
                : "Microphone is muted",
          }
        : prev.microphone,
      camera: canDeriveMediaStatus(prev.camera)
        ? {
            state:
              localParticipant && !localParticipant.videoOff ? "on" : "off",
            label:
              localParticipant && !localParticipant.videoOff
                ? "Camera is on"
                : "Camera is off",
          }
        : prev.camera,
      screen: canDeriveMediaStatus(prev.screen)
        ? {
            state:
              localParticipant && localParticipant.isPresenting ? "on" : "off",
            label:
              localParticipant && localParticipant.isPresenting
                ? "Screen sharing is on"
                : "Screen sharing is off",
          }
        : prev.screen,
    }))
  }, [])

  useEffect(() => {
    if (!enabled) {
      roomRef.current?.disconnect()
      roomRef.current = null
      setParticipants([])
      setConnectionState(ConnectionState.Disconnected)
      setIsConnecting(false)
      setError(null)
      setNotices([])
      setMedia(INITIAL_MEDIA_STATUS)
      setChatMessages([])
      setChatStorageKey(null)
      setWhiteboardMessages([])
      return
    }

    const room = new Room(ROOM_OPTIONS)
    roomRef.current = room
    setParticipants([])
    setConnectionState(room.state)
    setIsConnecting(true)
    setError(null)
    setNotices([])
    setChatMessages([])
    setChatStorageKey(null)
    setWhiteboardMessages([])
    setMedia(INITIAL_MEDIA_STATUS)

    const handleSync = () => {
      syncParticipants()
    }

    const handleConnectionStateChange = (nextState: ConnectionState) => {
      setConnectionState(nextState)
      if (nextState === ConnectionState.Connected) {
        setIsConnecting(false)
      }
      handleSync()
    }

    const handleDataReceived: RoomEventCallbacks[RoomEvent.DataReceived] = (
      payload,
      _participant,
      _kind,
      topic,
    ) => {
      if (topic && topic !== WHITEBOARD_TOPIC) {
        return
      }

      try {
        const decoded = new TextDecoder().decode(payload)
        const parsed = JSON.parse(decoded) as JsonValue

        if (!isWhiteboardMessage(parsed)) {
          return
        }

        setWhiteboardMessages((prev) => [...prev.slice(-199), parsed])
      } catch {
        upsertNotice({
          id: "whiteboard-sync",
          scope: "whiteboard",
          severity: "warning",
          title: "Whiteboard update was skipped",
          description:
            "A whiteboard message could not be read by this browser.",
          nextStep:
            "Ask the teacher to keep drawing or rejoin if the board looks out of date.",
        })
      }
    }

    room.registerTextStreamHandler(CHAT_TOPIC, (reader, participantInfo) => {
      void reader
        .readAll()
        .then((content) => {
          const message = mapIncomingChatMessage({
            content,
            classId,
            participantIdentity: participantInfo.identity,
            attributes: reader.info.attributes,
          })

          if (!message) {
            return
          }

          setChatMessages((prev) => upsertChatMessage(prev, message))
        })
        .catch(() => {
          upsertNotice({
            id: "session-chat",
            scope: "chat",
            severity: "warning",
            title: "Chat message was skipped",
            description:
              "A session chat message could not be read by this browser.",
            nextStep:
              "Keep the session open. If chat keeps failing, leave and rejoin.",
          })
        })
    })

    const handleMediaDevicesError: RoomEventCallbacks[RoomEvent.MediaDevicesError] =
      (nextError) => {
        const description =
          nextError.message || "A media device error occurred."

        setError(description)
        upsertNotice({
          id: "media-device",
          scope: "session",
          severity: "error",
          title: "Media device problem",
          description,
          nextStep:
            "Check browser and system camera or microphone permissions, then try again.",
        })
        setIsConnecting(false)
      }

    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChange)
    room.on(RoomEvent.ParticipantConnected, handleSync)
    room.on(RoomEvent.ParticipantDisconnected, handleSync)
    room.on(RoomEvent.TrackUnpublished, handleSync)
    room.on(RoomEvent.TrackSubscribed, handleSync)
    room.on(RoomEvent.TrackUnsubscribed, handleSync)
    room.on(RoomEvent.TrackMuted, handleSync)
    room.on(RoomEvent.TrackUnmuted, handleSync)
    room.on(RoomEvent.LocalTrackPublished, handleSync)
    room.on(RoomEvent.LocalTrackUnpublished, handleSync)
    room.on(RoomEvent.ActiveSpeakersChanged, handleSync)
    room.on(RoomEvent.DataReceived, handleDataReceived)
    room.on(RoomEvent.MediaDevicesError, handleMediaDevicesError)

    let isCancelled = false

    const connect = async () => {
      try {
        const { participantToken, serverUrl } = await fetchSessionToken(
          classId,
          {
            id: currentUserId,
            name: currentUserName,
            avatar: currentUserAvatar,
            role: currentUserRole,
          },
        )

        if (isCancelled) {
          return
        }

        await room.connect(serverUrl, participantToken, ROOM_CONNECT_OPTIONS)

        if (isCancelled) {
          return
        }

        const roomSid = await room.getSid().catch(() => "")

        if (isCancelled) {
          return
        }

        if (roomSid) {
          const nextChatStorageKey = getSessionChatStorageKey({
            classId,
            userId: currentUserId,
            roomSid,
          })

          pruneStoredSessionChats({
            classId,
            userId: currentUserId,
            activeStorageKey: nextChatStorageKey,
          })
          setChatStorageKey(nextChatStorageKey)
          setChatMessages((prev) =>
            mergeChatMessages(
              loadStoredSessionChatMessages(nextChatStorageKey, classId),
              prev,
            ),
          )
        }

        setIsConnecting(false)
        syncParticipants()
      } catch (nextError) {
        if (isCancelled) {
          return
        }

        const message =
          nextError instanceof Error
            ? nextError.message
            : "Unable to join the live session."

        const notice = createConnectionNotice(nextError as LiveSessionError)
        setError(message)
        upsertNotice(notice)
        setIsConnecting(false)
        setConnectionState(ConnectionState.Disconnected)
        setMedia(INITIAL_MEDIA_STATUS)
        room.disconnect()
      }
    }

    void connect()

    return () => {
      isCancelled = true
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChange)
      room.off(RoomEvent.ParticipantConnected, handleSync)
      room.off(RoomEvent.ParticipantDisconnected, handleSync)
      room.off(RoomEvent.TrackUnpublished, handleSync)
      room.off(RoomEvent.TrackSubscribed, handleSync)
      room.off(RoomEvent.TrackUnsubscribed, handleSync)
      room.off(RoomEvent.TrackMuted, handleSync)
      room.off(RoomEvent.TrackUnmuted, handleSync)
      room.off(RoomEvent.LocalTrackPublished, handleSync)
      room.off(RoomEvent.LocalTrackUnpublished, handleSync)
      room.off(RoomEvent.ActiveSpeakersChanged, handleSync)
      room.off(RoomEvent.DataReceived, handleDataReceived)
      room.off(RoomEvent.MediaDevicesError, handleMediaDevicesError)
      room.unregisterTextStreamHandler(CHAT_TOPIC)
      room.disconnect()
      if (roomRef.current === room) {
        roomRef.current = null
      }
    }
  }, [
    classId,
    currentUserAvatar,
    currentUserId,
    currentUserName,
    currentUserRole,
    enabled,
    syncParticipants,
    updateMediaDevice,
    upsertNotice,
  ])

  const sendWhiteboardMessage = useCallback(
    async (
      message: LiveSessionWhiteboardMessage,
      options?: { reliable?: boolean },
    ) => {
      const room = roomRef.current

      if (!room || room.state !== ConnectionState.Connected) {
        return false
      }

      try {
        const encoded = new TextEncoder().encode(JSON.stringify(message))
        await room.localParticipant.publishData(encoded, {
          reliable: options?.reliable ?? true,
          topic: WHITEBOARD_TOPIC,
        })
        return true
      } catch (nextError) {
        setError(getErrorMessage(nextError as LiveSessionError))
        upsertNotice({
          id: "whiteboard-sync",
          scope: "whiteboard",
          severity: "warning",
          title: "Whiteboard is not syncing",
          description: "This whiteboard update could not be sent.",
          nextStep:
            "Check your connection and keep the session open. If it continues, leave and rejoin.",
        })
        return false
      }
    },
    [upsertNotice],
  )

  const clearWhiteboards = useCallback(() => {
    return sendWhiteboardMessage(
      {
        id: createChatMessageId(currentUserId),
        senderId: currentUserId,
        type: "session:clear",
      },
      { reliable: true },
    )
  }, [currentUserId, sendWhiteboardMessage])

  const sendChatMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      const room = roomRef.current

      if (!trimmed) {
        return false
      }

      if (!room || room.state !== ConnectionState.Connected) {
        upsertNotice({
          id: "session-chat",
          scope: "chat",
          severity: "warning",
          title: "Chat is not connected",
          description: "This message was not sent to the session.",
          nextStep: "Wait for the session to reconnect, then send it again.",
        })
        return false
      }

      const timestamp = new Date().toISOString()
      const message: LiveSessionChatMessage = {
        id: createChatMessageId(currentUser.id),
        classId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        senderRole: currentUser.role,
        content: trimmed,
        timestamp,
        status: "sending",
      }

      setChatMessages((prev) => upsertChatMessage(prev, message))

      try {
        await room.localParticipant.sendText(trimmed, {
          topic: CHAT_TOPIC,
          attributes: {
            id: message.id,
            classId,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderAvatar: currentUser.avatar,
            senderRole: currentUser.role,
            timestamp,
          },
        })
        setChatMessages((prev) =>
          upsertChatMessage(prev, { ...message, status: "sent" }),
        )
        return true
      } catch (nextError) {
        const description = getErrorMessage(nextError as LiveSessionError)

        setChatMessages((prev) =>
          upsertChatMessage(prev, { ...message, status: "failed" }),
        )
        upsertNotice({
          id: "session-chat",
          scope: "chat",
          severity: "warning",
          title: "Chat message was not sent",
          description,
          nextStep:
            "Check your connection and keep the session open. If it continues, leave and rejoin.",
        })
        return false
      }
    },
    [classId, currentUser, upsertNotice],
  )

  const toggleMic = useCallback(async () => {
    const room = roomRef.current

    if (!room) {
      return
    }

    const current = findPublication(
      room.localParticipant,
      Track.Source.Microphone,
    )
    const shouldEnable = current?.isMuted ?? !current?.track
    setError(null)
    updateMediaDevice("microphone", {
      state: shouldEnable ? "starting" : "stopping",
      label: shouldEnable ? "Starting microphone..." : "Muting microphone...",
    })

    try {
      await room.localParticipant.setMicrophoneEnabled(shouldEnable)
      updateMediaDevice("microphone", {
        state: shouldEnable ? "on" : "off",
        label: shouldEnable ? "Microphone is on" : "Microphone is muted",
      })
      upsertNotice({
        id: "microphone",
        scope: "microphone",
        severity: shouldEnable ? "success" : "info",
        title: shouldEnable ? "Microphone is on" : "Microphone muted",
        description: shouldEnable
          ? "People in the session can hear you now."
          : "People in the session cannot hear you until you unmute.",
      })
      syncParticipants()
    } catch (nextError) {
      const { status, ...notice } = createMediaNotice(
        "microphone",
        nextError as LiveSessionError,
      )
      updateMediaDevice("microphone", status)
      upsertNotice(notice)
      setError(notice.description)
    }
  }, [syncParticipants, updateMediaDevice, upsertNotice])

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current

    if (!room) {
      return
    }

    const current = findPublication(room.localParticipant, Track.Source.Camera)
    const shouldEnable = current?.isMuted ?? !current?.track
    setError(null)
    updateMediaDevice("camera", {
      state: shouldEnable ? "starting" : "stopping",
      label: shouldEnable ? "Starting camera..." : "Stopping camera...",
    })

    try {
      await room.localParticipant.setCameraEnabled(shouldEnable)
      updateMediaDevice("camera", {
        state: shouldEnable ? "on" : "off",
        label: shouldEnable ? "Camera is on" : "Camera is off",
      })
      upsertNotice({
        id: "camera",
        scope: "camera",
        severity: shouldEnable ? "success" : "info",
        title: shouldEnable ? "Camera is on" : "Camera stopped",
        description: shouldEnable
          ? "People in the session can see your video now."
          : "People in the session will see your avatar until you start the camera again.",
      })
      syncParticipants()
    } catch (nextError) {
      const { status, ...notice } = createMediaNotice(
        "camera",
        nextError as LiveSessionError,
      )
      updateMediaDevice("camera", status)
      upsertNotice(notice)
      setError(notice.description)
    }
  }, [syncParticipants, updateMediaDevice, upsertNotice])

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current

    if (!room) {
      return
    }

    const current = findPublication(
      room.localParticipant,
      Track.Source.ScreenShare,
    )
    const shouldEnable = current?.isMuted ?? !current?.track
    setError(null)
    updateMediaDevice("screen", {
      state: shouldEnable ? "starting" : "stopping",
      label: shouldEnable
        ? "Starting screen sharing..."
        : "Stopping screen sharing...",
    })

    try {
      await room.localParticipant.setScreenShareEnabled(shouldEnable)
      updateMediaDevice("screen", {
        state: shouldEnable ? "on" : "off",
        label: shouldEnable ? "Screen sharing is on" : "Screen sharing is off",
      })
      upsertNotice({
        id: "screen",
        scope: "screen",
        severity: shouldEnable ? "success" : "info",
        title: shouldEnable
          ? "Screen sharing started"
          : "Screen sharing stopped",
        description: shouldEnable
          ? "Everyone in the session can see the screen, window, or tab you selected."
          : "Your screen is no longer shared with the session.",
      })
      syncParticipants()
    } catch (nextError) {
      const { status, ...notice } = createMediaNotice(
        "screen",
        nextError as LiveSessionError,
      )
      updateMediaDevice("screen", status)
      upsertNotice(notice)
      setError(notice.description)
    }
  }, [syncParticipants, updateMediaDevice, upsertNotice])

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect()
    roomRef.current = null
    setParticipants([])
    setConnectionState(ConnectionState.Disconnected)
    setIsConnecting(false)
    setError(null)
    setNotices([])
    setMedia(INITIAL_MEDIA_STATUS)
    setChatMessages([])
    setChatStorageKey(null)
    setWhiteboardMessages([])
  }, [])

  const localParticipant = participants.find(
    (participant) => participant.isLocal,
  )
  const presentation = useMemo<SessionPresentation | null>(() => {
    const presentingParticipant = participants.find(
      (participant) =>
        participant.isPresenting && participant.screenSharePublication,
    )

    if (!presentingParticipant?.screenSharePublication) {
      return null
    }

    return {
      participant: presentingParticipant,
      publication: presentingParticipant.screenSharePublication,
    }
  }, [participants])

  return {
    participants,
    connectionState,
    isConnecting,
    error,
    notices,
    media,
    chatMessages,
    whiteboardMessages,
    micOn: !!localParticipant && !localParticipant.muted,
    camOn: !!localParticipant && !localParticipant.videoOff,
    screenSharing: Boolean(localParticipant?.isPresenting),
    presentation,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    sendWhiteboardMessage,
    clearWhiteboards,
    sendChatMessage,
    dismissNotice,
    disconnect,
  }
}
