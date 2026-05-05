"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  CheckCircle2,
  Info,
  MessageSquare,
  Monitor,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  Redo2,
  Square,
  Trash2,
  Undo2,
  Users,
  Video,
  VideoOff,
  X,
  XCircle,
} from "lucide-react"
import { ConnectionState } from "livekit-client"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Class } from "@/lib/mock-data"
import { ControlButton } from "./control-button"
import { usePersistentLiveSession } from "./live-session-provider"
import type { LiveSessionNotice } from "./live-session-types"
import { ParticipantsPanel } from "./participants-panel"
import { SessionAudioRenderer } from "./session-audio-renderer"
import { SESSION_COLORS, SESSION_TOOLS } from "./session-data"
import { SessionChat } from "./session-chat"
import { VideoTrackView } from "./track-media"
import { useWhiteboard } from "./use-whiteboard"
import { VideoTile } from "./video-tile"

const REGULAR_WHITEBOARD_BOARD_ID = "whiteboard"
const DEFAULT_PRESENTATION_ASPECT_RATIO = 16 / 9

const NOTICE_STYLES = {
  error: {
    icon: XCircle,
    className: "border-destructive/30 bg-background text-foreground",
    iconClassName: "text-destructive",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-500/40 bg-background text-foreground",
    iconClassName: "text-amber-500",
  },
  success: {
    icon: CheckCircle2,
    className: "border-emerald-500/40 bg-background text-foreground",
    iconClassName: "text-emerald-500",
  },
  info: {
    icon: Info,
    className: "border-border bg-background text-foreground",
    iconClassName: "text-muted-foreground",
  },
} as const

function isBusyMediaState(state: string) {
  return state === "starting" || state === "stopping"
}

function SessionNoticeStack({
  notices,
  onDismiss,
}: {
  notices: LiveSessionNotice[]
  onDismiss: (noticeId: string) => void
}) {
  if (notices.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex w-[min(28rem,calc(100%-1.5rem))] flex-col gap-2">
      {notices.map((notice) => {
        const style = NOTICE_STYLES[notice.severity]
        const Icon = style.icon

        return (
          <div
            key={notice.id}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs shadow-lg",
              style.className,
            )}
          >
            <div className="flex items-start gap-2">
              <Icon
                className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClassName)}
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{notice.title}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {notice.description}
                </p>
                {notice.nextStep ? (
                  <p className="mt-1 text-muted-foreground">
                    {notice.nextStep}
                  </p>
                ) : null}
              </div>
              {notice.dismissible ? (
                <button
                  type="button"
                  aria-label={`Dismiss ${notice.title}`}
                  onClick={() => onDismiss(notice.id)}
                  className="pointer-events-auto rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function SessionScreen({ cls }: { cls: Class }) {
  const { classLiveSessions, currentUser } = useApp()
  const {
    activeClass,
    endSession,
    joinSession,
    leaveSession,
    liveSession,
    sessionActive,
    whiteboardResetKey,
  } = usePersistentLiveSession()
  const [rightPanel, setRightPanel] = useState<"participants" | "chat" | null>(
    "participants",
  )

  const isTeacher = currentUser.role === "teacher"
  const canStartSession = currentUser.role !== "student"
  const classHasLiveSession = classLiveSessions.some(
    (session) => session.class_id === cls.id,
  )
  const canJoinSession = canStartSession || classHasLiveSession
  const isThisClassSession = activeClass?.id === cls.id && sessionActive
  const isTeacherPreviewSession = isTeacher && !isThisClassSession
  const teacherReconnectAvailable =
    isTeacherPreviewSession && classHasLiveSession
  const presentationStageRef = useRef<HTMLDivElement | null>(null)
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | undefined>()
  const [presentationStageSize, setPresentationStageSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const presentationSessionId = liveSession.presentation
    ? `presentation:${cls.id}`
    : null
  const presentationDimensions =
    liveSession.presentation?.publication.dimensions
  const publicationAspectRatio =
    presentationDimensions && presentationDimensions.height > 0
      ? presentationDimensions.width / presentationDimensions.height
      : undefined
  const presentationAspectRatio =
    videoAspectRatio ??
    publicationAspectRatio ??
    DEFAULT_PRESENTATION_ASPECT_RATIO
  const participantCount = liveSession.participants.length
  const connected = liveSession.connectionState === ConnectionState.Connected
  const whiteboard = useWhiteboard({
    isTeacher,
    currentUserId: currentUser.id,
    boardId: presentationSessionId ?? REGULAR_WHITEBOARD_BOARD_ID,
    incomingMessages: liveSession.whiteboardMessages,
    participantCount,
    overlayActive: Boolean(liveSession.presentation),
    overlayAspectRatio: presentationAspectRatio,
    resetKey: whiteboardResetKey,
    syncEnabled: connected,
    sendMessage: liveSession.sendWhiteboardMessage,
  })
  const handlePresentationDimensionsChange = useCallback(
    (dimensions: { width: number; height: number }) => {
      if (dimensions.height <= 0) {
        return
      }

      setVideoAspectRatio(dimensions.width / dimensions.height)
    },
    [],
  )
  const liveBadgeLabel = liveSession.isConnecting
    ? "Connecting"
    : liveSession.connectionState === ConnectionState.Connected
      ? "Live Session"
      : teacherReconnectAvailable
        ? "Disconnected"
        : isTeacherPreviewSession
          ? "Not Live"
          : "Offline"
  const micBusy = isBusyMediaState(liveSession.media.microphone.state)
  const cameraBusy = isBusyMediaState(liveSession.media.camera.state)
  const screenBusy = isBusyMediaState(liveSession.media.screen.state)
  const micControlLabel = micBusy
    ? liveSession.media.microphone.label
    : liveSession.micOn
      ? "Mute"
      : "Unmute"
  const cameraControlLabel = cameraBusy
    ? liveSession.media.camera.label
    : liveSession.camOn
      ? "Stop camera"
      : "Start camera"
  const screenControlLabel = screenBusy
    ? liveSession.media.screen.label
    : liveSession.screenSharing
      ? "Stop sharing"
      : "Share screen"

  useEffect(() => {
    setVideoAspectRatio(undefined)
  }, [presentationSessionId])

  useEffect(() => {
    const element = presentationStageRef.current

    if (!element || !liveSession.presentation) {
      setPresentationStageSize(null)
      return
    }

    const updateStageSize = () => {
      const rect = element.getBoundingClientRect()

      if (rect.width <= 0 || rect.height <= 0) {
        return
      }

      let width = rect.width
      let height = width / presentationAspectRatio

      if (height > rect.height) {
        height = rect.height
        width = height * presentationAspectRatio
      }

      setPresentationStageSize((prev) => {
        const roundedWidth = Math.round(width)
        const roundedHeight = Math.round(height)

        if (prev?.width === roundedWidth && prev.height === roundedHeight) {
          return prev
        }

        return {
          width: roundedWidth,
          height: roundedHeight,
        }
      })
    }

    updateStageSize()

    const observer = new ResizeObserver(updateStageSize)
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [liveSession.presentation, presentationAspectRatio])

  if (!isThisClassSession && !isTeacher) {
    const title = classHasLiveSession
      ? "Live session is open"
      : "Waiting for teacher"
    const description = classHasLiveSession
      ? `Join the live session for ${cls.name}.`
      : `The teacher has not started the live session for ${cls.name} yet.`
    const buttonLabel = classHasLiveSession
      ? "Join live session"
      : "Not live yet"

    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          <span
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl",
              classHasLiveSession
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Video className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <Button
            size="sm"
            disabled={!canJoinSession}
            onClick={() => {
              joinSession(cls)
            }}
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col bg-background overflow-hidden">
        <SessionAudioRenderer participants={liveSession.participants} />
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  liveSession.connectionState === ConnectionState.Connected
                    ? "bg-emerald-500 animate-pulse"
                    : liveSession.isConnecting
                      ? "bg-amber-500 animate-pulse"
                      : "bg-muted-foreground",
                )}
              />
              {liveBadgeLabel}
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm font-semibold text-foreground truncate">
              {cls.name}
            </span>
            <span className="text-xs text-muted-foreground hidden md:block">
              {cls.code}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <ControlButton
              icon={liveSession.micOn ? Mic : MicOff}
              label={micControlLabel}
              onClick={() => void liveSession.toggleMic()}
              destructive={!liveSession.micOn}
              disabled={!connected || micBusy}
            />
            <ControlButton
              icon={liveSession.camOn ? Video : VideoOff}
              label={cameraControlLabel}
              onClick={() => void liveSession.toggleCamera()}
              destructive={!liveSession.camOn}
              disabled={!connected || cameraBusy}
            />
            {isTeacher ? (
              <ControlButton
                icon={MonitorUp}
                label={screenControlLabel}
                onClick={() => void liveSession.toggleScreenShare()}
                highlight={liveSession.screenSharing}
                disabled={!connected || screenBusy}
              />
            ) : null}
            <Separator orientation="vertical" className="h-6 mx-1" />
            {isTeacherPreviewSession ? (
              <Button
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => joinSession(cls)}
              >
                <Video className="w-3.5 h-3.5" />
                {teacherReconnectAvailable ? "Reconnect" : "Go Live"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-8"
                onClick={leaveSession}
              >
                <Phone className="w-3.5 h-3.5" />
                Leave
              </Button>
            )}
            {isTeacher && !isTeacherPreviewSession ? (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5 text-xs h-8"
                onClick={() => void endSession()}
              >
                <Square className="w-3.5 h-3.5" />
                End Session
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-1 ml-2">
            <Button
              variant={rightPanel === "participants" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setRightPanel(
                  rightPanel === "participants" ? null : "participants",
                )
              }
            >
              <Users className="w-4 h-4" />
            </Button>
            <Button
              variant={rightPanel === "chat" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setRightPanel(rightPanel === "chat" ? null : "chat")
              }
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-col items-center gap-1 p-2 border-r border-border bg-card w-12 shrink-0">
            {SESSION_TOOLS.map((tool) => (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => whiteboard.setActiveTool(tool.id)}
                    disabled={!isTeacher}
                    className={cn(
                      "w-8 h-8 flex items-center justify-center rounded-lg transition-colors",
                      whiteboard.activeTool === tool.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent",
                      !isTeacher && "opacity-40 cursor-not-allowed",
                    )}
                    aria-label={tool.label}
                    title={tool.label}
                  >
                    <tool.icon className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{tool.label}</TooltipContent>
              </Tooltip>
            ))}

            <Separator className="my-1 w-6" />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={whiteboard.handleUndo}
                  disabled={!isTeacher}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Undo</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={whiteboard.handleRedo}
                  disabled={!isTeacher || whiteboard.redoCount === 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Redo</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={whiteboard.handleDeleteSelection}
                  disabled={!isTeacher || !whiteboard.hasSelection}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <X className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Delete selected</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={whiteboard.handleClear}
                  disabled={!isTeacher}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Clear board</TooltipContent>
            </Tooltip>

            <Separator className="my-1 w-6" />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() =>
                    whiteboard.setShowColorPicker(!whiteboard.showColorPicker)
                  }
                  disabled={!isTeacher}
                  className="w-7 h-7 rounded-full border-2 border-border transition-transform hover:scale-110 disabled:opacity-40 disabled:cursor-not-allowed relative"
                  style={{ backgroundColor: whiteboard.color }}
                />
              </TooltipTrigger>
              <TooltipContent side="right">Color</TooltipContent>
            </Tooltip>

            {[2, 4, 8].map((size) => (
              <Tooltip key={size}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => whiteboard.setBrushSize(size)}
                    disabled={!isTeacher}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-40",
                      whiteboard.brushSize === size
                        ? "bg-accent"
                        : "hover:bg-accent",
                    )}
                  >
                    <span
                      className="rounded-full bg-foreground"
                      style={{ width: size + 2, height: size + 2 }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Size {size}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden relative">
            {whiteboard.showColorPicker ? (
              <div className="absolute top-3 left-3 z-30 flex gap-1.5 p-2 bg-card border border-border rounded-xl shadow-lg">
                {SESSION_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      whiteboard.setColor(color)
                      whiteboard.setShowColorPicker(false)
                    }}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                      whiteboard.color === color
                        ? "border-primary scale-110"
                        : "border-border",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            ) : null}

            {liveSession.presentation ? (
              <div
                ref={presentationStageRef}
                className="absolute inset-0 bg-black"
              >
                <div
                  className="absolute left-1/2 top-1/2 overflow-hidden"
                  style={{
                    width: presentationStageSize?.width ?? "100%",
                    height: presentationStageSize?.height ?? "100%",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <VideoTrackView
                    publication={liveSession.presentation.publication}
                    muted={liveSession.presentation.participant.isLocal}
                    className="absolute inset-0 h-full w-full object-fill"
                    onDimensionsChange={handlePresentationDimensionsChange}
                  />
                  <canvas
                    ref={whiteboard.canvasRef}
                    aria-label="Presentation annotation canvas"
                    tabIndex={isTeacher ? 0 : -1}
                    className={cn(
                      "absolute inset-0 z-10 h-full w-full touch-none",
                      isTeacher &&
                        ["pen", "line", "rect", "circle"].includes(
                          whiteboard.activeTool,
                        )
                        ? "cursor-crosshair"
                        : "",
                      isTeacher && whiteboard.activeTool === "eraser"
                        ? "cursor-cell"
                        : "",
                      isTeacher && whiteboard.activeTool === "pointer"
                        ? "cursor-default"
                        : "",
                      !isTeacher ? "cursor-not-allowed" : "",
                    )}
                    onPointerDown={whiteboard.handlePointerDown}
                    onPointerMove={whiteboard.handlePointerMove}
                    onPointerUp={whiteboard.handlePointerUp}
                    onPointerCancel={whiteboard.handlePointerCancel}
                    onKeyDown={whiteboard.handleKeyDown}
                  />
                </div>
                <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white">
                  <Monitor className="w-3.5 h-3.5" />
                  {liveSession.presentation.participant.isLocal
                    ? "You are presenting"
                    : `${liveSession.presentation.participant.name} is presenting`}
                </div>
                {liveSession.screenSharing ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-3 right-3 z-20"
                    onClick={() => void liveSession.toggleScreenShare()}
                  >
                    Stop sharing
                  </Button>
                ) : null}
              </div>
            ) : null}

            {!isTeacher && !liveSession.presentation ? (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-muted/90 backdrop-blur-sm text-xs text-muted-foreground font-medium border border-border">
                View-only whiteboard
              </div>
            ) : null}

            <SessionNoticeStack
              notices={liveSession.notices}
              onDismiss={liveSession.dismissNotice}
            />

            {liveSession.isConnecting ? (
              <div className="absolute right-3 top-3 z-20 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                Joining room...
              </div>
            ) : null}

            {!liveSession.presentation ? (
              <canvas
                ref={whiteboard.canvasRef}
                aria-label="Whiteboard canvas"
                tabIndex={isTeacher ? 0 : -1}
                className={cn(
                  "relative z-10 w-full h-full touch-none object-contain",
                  isTeacher &&
                    ["pen", "line", "rect", "circle"].includes(
                      whiteboard.activeTool,
                    )
                    ? "cursor-crosshair"
                    : "",
                  isTeacher && whiteboard.activeTool === "eraser"
                    ? "cursor-cell"
                    : "",
                  isTeacher && whiteboard.activeTool === "pointer"
                    ? "cursor-default"
                    : "",
                  !isTeacher ? "cursor-not-allowed" : "",
                )}
                onPointerDown={whiteboard.handlePointerDown}
                onPointerMove={whiteboard.handlePointerMove}
                onPointerUp={whiteboard.handlePointerUp}
                onPointerCancel={whiteboard.handlePointerCancel}
                onKeyDown={whiteboard.handleKeyDown}
              />
            ) : null}
          </div>

          {rightPanel ? (
            <div className="w-72 border-l border-border bg-card flex flex-col shrink-0">
              <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
                <button
                  onClick={() => setRightPanel("participants")}
                  className={cn(
                    "text-sm font-medium pb-0.5 transition-colors",
                    rightPanel === "participants"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  People ({participantCount})
                </button>
                <button
                  onClick={() => setRightPanel("chat")}
                  className={cn(
                    "text-sm font-medium pb-0.5 transition-colors",
                    rightPanel === "chat"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Chat
                </button>
                <button
                  onClick={() => setRightPanel(null)}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {rightPanel === "participants" ? (
                <ParticipantsPanel participants={liveSession.participants} />
              ) : (
                <SessionChat
                  messages={liveSession.chatMessages}
                  connected={connected}
                  onSend={liveSession.sendChatMessage}
                />
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 p-2 border-t border-border bg-card shrink-0 overflow-x-auto">
          {liveSession.participants.map((participant) => (
            <VideoTile key={participant.id} participant={participant} />
          ))}
          <div className="ml-auto hidden md:flex items-center gap-2 text-xs text-muted-foreground pr-2">
            <ArrowUpRight className="w-3.5 h-3.5" />
            {teacherReconnectAvailable
              ? "Live session is waiting for you to reconnect"
              : isTeacherPreviewSession
                ? "Whiteboard is local until you go live"
                : liveSession.presentation
                  ? "Presentation synced live"
                  : "Whiteboard synced live"}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
