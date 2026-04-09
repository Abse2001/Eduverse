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
  LiveSessionState,
  SessionParticipant,
  SessionPresentation,
} from "./live-session-types"

const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
}

const ROOM_CONNECT_OPTIONS: RoomConnectOptions = {
  autoSubscribe: true,
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

    setParticipants(nextParticipants)
    setConnectionState(room.state)
  }, [])

  useEffect(() => {
    if (!enabled) {
      roomRef.current?.disconnect()
      roomRef.current = null
      setParticipants([])
      setConnectionState(ConnectionState.Disconnected)
      setIsConnecting(false)
      setError(null)
      return
    }

    const room = new Room(ROOM_OPTIONS)
    roomRef.current = room
    setParticipants([])
    setConnectionState(room.state)
    setIsConnecting(true)
    setError(null)

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
        RoomEvent.MediaDevicesError,
        (nextError) => {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "A media device error occurred.",
          )
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
        await Promise.allSettled([
          room.localParticipant.setMicrophoneEnabled(true),
          room.localParticipant.setCameraEnabled(true),
        ])

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

        setError(message)
        setIsConnecting(false)
        setConnectionState(ConnectionState.Disconnected)
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
  }, [classId, currentUser, enabled, syncParticipants])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current

    if (!room) {
      return
    }

    const current = findPublication(
      room.localParticipant,
      Track.Source.Microphone,
    )
    setError(null)

    try {
      await room.localParticipant.setMicrophoneEnabled(
        current?.isMuted ?? !current?.track,
      )
      syncParticipants()
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update microphone access.",
      )
    }
  }, [syncParticipants])

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current

    if (!room) {
      return
    }

    const current = findPublication(room.localParticipant, Track.Source.Camera)
    setError(null)

    try {
      await room.localParticipant.setCameraEnabled(
        current?.isMuted ?? !current?.track,
      )
      syncParticipants()
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update camera access.",
      )
    }
  }, [syncParticipants])

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current

    if (!room) {
      return
    }

    const current = findPublication(
      room.localParticipant,
      Track.Source.ScreenShare,
    )
    setError(null)

    try {
      await room.localParticipant.setScreenShareEnabled(
        current?.isMuted ?? !current?.track,
      )
      syncParticipants()
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to start screen sharing.",
      )
    }
  }, [syncParticipants])

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect()
    roomRef.current = null
    setParticipants([])
    setConnectionState(ConnectionState.Disconnected)
    setIsConnecting(false)
    setError(null)
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
    micOn: !!localParticipant && !localParticipant.muted,
    camOn: !!localParticipant && !localParticipant.videoOff,
    screenSharing: Boolean(localParticipant?.isPresenting),
    presentation,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    disconnect,
  }
}
