"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RoomConnectOptions,
  type RoomOptions,
  type TrackPublication,
} from "livekit-client"
import type { User } from "@/lib/mock-data"
import { getUserById } from "@/lib/mock-data"
import type {
  LiveMediaDeviceStatus,
  LiveMediaStatus,
  LiveSessionNotice,
  LiveSessionState,
  LiveSessionWhiteboardMessage,
  SessionParticipant,
  SessionPresentation,
  WhiteboardOperation,
} from "./live-session-types"

const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
}

const ROOM_CONNECT_OPTIONS: RoomConnectOptions = {
  autoSubscribe: true,
}

const WHITEBOARD_TOPIC = "eduverse.whiteboard"

type MediaDeviceKind = "microphone" | "camera" | "screen"

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

function getErrorName(error: unknown) {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name
    if (typeof name === "string") {
      return name
    }
  }

  return undefined
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === "string" && error) {
    return error
  }

  return "An unexpected error occurred."
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function isWhiteboardPoint(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  )
}

function isWhiteboardPointList(value: unknown) {
  return Array.isArray(value) && value.every(isWhiteboardPoint)
}

function isWhiteboardShape(value: unknown) {
  return value === "line" || value === "rect" || value === "circle"
}

function isWhiteboardStrokeTool(value: unknown) {
  return value === "pen"
}

function isWhiteboardOperation(value: unknown): value is WhiteboardOperation {
  if (
    !isRecord(value) ||
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

  if (value.type === "move") {
    return typeof value.targetId === "string" && isWhiteboardPoint(value.delta)
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

function isWhiteboardOperationList(value: unknown) {
  return Array.isArray(value) && value.every(isWhiteboardOperation)
}

function isWhiteboardMessage(
  value: unknown,
): value is LiveSessionWhiteboardMessage {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.senderId !== "string" ||
    typeof value.type !== "string"
  ) {
    return false
  }

  if (value.type === "state:request") {
    return true
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

  if (value.type === "move") {
    const operation = value.operation
    return (
      typeof value.version === "number" &&
      isWhiteboardOperation(operation) &&
      operation.type === "move"
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

function createConnectionNotice(error: unknown): LiveSessionNotice {
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
  error: unknown,
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
    isPresenting:
      Boolean(screenSharePublication) &&
      !screenSharePublication?.isMuted &&
      Boolean(screenSharePublication?.track),
    cameraPublication,
    screenSharePublication,
    audioPublications,
  } satisfies SessionParticipant
}

async function fetchSessionToken(classId: string, user: User) {
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
  const [whiteboardMessages, setWhiteboardMessages] = useState<
    LiveSessionWhiteboardMessage[]
  >([])

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
    setWhiteboardMessages([])
    setMedia({
      microphone: {
        state: "starting",
        label: "Starting microphone...",
      },
      camera: {
        state: "starting",
        label: "Starting camera...",
      },
      screen: INITIAL_MEDIA_STATUS.screen,
    })

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

    const eventHandlers: Array<[RoomEvent, (...args: unknown[]) => void]> = [
      [
        RoomEvent.ConnectionStateChanged,
        (nextState) =>
          handleConnectionStateChange(nextState as ConnectionState),
      ],
      [RoomEvent.ParticipantConnected, handleSync],
      [RoomEvent.ParticipantDisconnected, handleSync],
      [RoomEvent.TrackSubscribed, handleSync],
      [RoomEvent.TrackUnsubscribed, handleSync],
      [RoomEvent.TrackMuted, handleSync],
      [RoomEvent.TrackUnmuted, handleSync],
      [RoomEvent.LocalTrackPublished, handleSync],
      [RoomEvent.LocalTrackUnpublished, handleSync],
      [RoomEvent.ActiveSpeakersChanged, handleSync],
      [
        RoomEvent.DataReceived,
        (payload, _participant, _kind, topic) => {
          if (!(payload instanceof Uint8Array)) {
            return
          }

          if (topic && topic !== WHITEBOARD_TOPIC) {
            return
          }

          try {
            const decoded = new TextDecoder().decode(payload)
            const parsed = JSON.parse(decoded) as unknown

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
        },
      ],
      [
        RoomEvent.MediaDevicesError,
        (nextError) => {
          const description =
            nextError instanceof Error
              ? nextError.message
              : "A media device error occurred."

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
        },
      ],
    ]

    eventHandlers.forEach(([event, handler]) => {
      room.on(event, handler as never)
    })

    let isCancelled = false

    const connect = async () => {
      try {
        const { participantToken, serverUrl } = await fetchSessionToken(
          classId,
          currentUser,
        )

        if (isCancelled) {
          return
        }

        await room.connect(serverUrl, participantToken, ROOM_CONNECT_OPTIONS)

        const mediaResults = await Promise.allSettled([
          room.localParticipant.setMicrophoneEnabled(true),
          room.localParticipant.setCameraEnabled(true),
        ])

        const [microphoneResult, cameraResult] = mediaResults

        if (isCancelled) {
          return
        }

        if (microphoneResult.status === "fulfilled") {
          updateMediaDevice("microphone", {
            state: "on",
            label: "Microphone is on",
          })
        } else {
          const { status, ...notice } = createMediaNotice(
            "microphone",
            microphoneResult.reason,
          )
          updateMediaDevice("microphone", status)
          upsertNotice(notice)
          setError(notice.description)
        }

        if (cameraResult.status === "fulfilled") {
          updateMediaDevice("camera", {
            state: "on",
            label: "Camera is on",
          })
        } else {
          const { status, ...notice } = createMediaNotice(
            "camera",
            cameraResult.reason,
          )
          updateMediaDevice("camera", status)
          upsertNotice(notice)
          setError(notice.description)
        }

        if (isCancelled) {
          return
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

        const notice = createConnectionNotice(nextError)
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
      eventHandlers.forEach(([event, handler]) => {
        room.off(event, handler as never)
      })
      room.disconnect()
      if (roomRef.current === room) {
        roomRef.current = null
      }
    }
  }, [
    classId,
    currentUser,
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
        setError(getErrorMessage(nextError))
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
      const { status, ...notice } = createMediaNotice("microphone", nextError)
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
      const { status, ...notice } = createMediaNotice("camera", nextError)
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
      const { status, ...notice } = createMediaNotice("screen", nextError)
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
    whiteboardMessages,
    micOn: !!localParticipant && !localParticipant.muted,
    camOn: !!localParticipant && !localParticipant.videoOff,
    screenSharing: Boolean(localParticipant?.isPresenting),
    presentation,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    sendWhiteboardMessage,
    dismissNotice,
    disconnect,
  }
}
