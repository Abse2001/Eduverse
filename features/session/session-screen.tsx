"use client"

import { useState } from "react"
import {
  ArrowUpRight,
  ChevronRight,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  Redo2,
  Trash2,
  Undo2,
  Users,
  Video,
  VideoOff,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { ParticipantsPanel } from "./participants-panel"
import {
  MOCK_SESSION_PARTICIPANTS,
  SESSION_COLORS,
  SESSION_TOOLS,
} from "./session-data"
import { SessionChat } from "./session-chat"
import { useWhiteboard } from "./use-whiteboard"
import { VideoTile } from "./video-tile"

export function SessionScreen({ cls }: { cls: Class }) {
  const { currentUser } = useApp()
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [screenSharing, setScreenSharing] = useState(false)
  const [rightPanel, setRightPanel] = useState<"participants" | "chat" | null>(
    "participants",
  )
  const [sessionActive, setSessionActive] = useState(true)

  const isTeacher = currentUser.role === "teacher"
  const whiteboard = useWhiteboard(isTeacher)

  if (!sessionActive) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
        <Phone className="w-10 h-10 text-muted-foreground" />
        <p className="text-lg font-semibold text-foreground">Session ended</p>
        <p className="text-sm text-muted-foreground">
          You left the live session for {cls.name}.
        </p>
        <Button size="sm" onClick={() => setSessionActive(true)}>
          Rejoin
        </Button>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col bg-background overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Session
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
              icon={micOn ? Mic : MicOff}
              label={micOn ? "Mute" : "Unmute"}
              onClick={() => setMicOn((prev) => !prev)}
              destructive={!micOn}
            />
            <ControlButton
              icon={camOn ? Video : VideoOff}
              label={camOn ? "Stop camera" : "Start camera"}
              onClick={() => setCamOn((prev) => !prev)}
              destructive={!camOn}
            />
            {isTeacher ? (
              <ControlButton
                icon={MonitorUp}
                label={screenSharing ? "Stop sharing" : "Share screen"}
                onClick={() => setScreenSharing((prev) => !prev)}
                highlight={screenSharing}
              />
            ) : null}
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5 text-xs h-8"
              onClick={() => setSessionActive(false)}
            >
              <Phone className="w-3.5 h-3.5" />
              Leave
            </Button>
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
              <div className="absolute top-3 left-3 z-10 flex gap-1.5 p-2 bg-card border border-border rounded-xl shadow-lg">
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

            {screenSharing ? (
              <div className="absolute inset-0 z-10 bg-background/90 flex flex-col items-center justify-center gap-3">
                <MonitorUp className="w-12 h-12 text-primary" />
                <p className="text-lg font-semibold text-foreground">
                  Screen sharing active
                </p>
                <p className="text-sm text-muted-foreground">
                  Your screen is being shared with all participants
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setScreenSharing(false)}
                >
                  Stop sharing
                </Button>
              </div>
            ) : null}

            {!isTeacher && !screenSharing ? (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-muted/90 backdrop-blur-sm text-xs text-muted-foreground font-medium border border-border">
                View-only - teacher is presenting
              </div>
            ) : null}

            <canvas
              ref={whiteboard.canvasRef}
              className={cn(
                "w-full h-full object-contain",
                isTeacher && whiteboard.activeTool === "pen"
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
              onMouseDown={whiteboard.handleMouseDown}
              onMouseMove={whiteboard.handleMouseMove}
              onMouseUp={whiteboard.handleMouseUp}
              onMouseLeave={whiteboard.handleMouseUp}
            />
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
                  People ({MOCK_SESSION_PARTICIPANTS.length})
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
                <ParticipantsPanel participants={MOCK_SESSION_PARTICIPANTS} />
              ) : (
                <SessionChat />
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 p-2 border-t border-border bg-card shrink-0 overflow-x-auto">
          {MOCK_SESSION_PARTICIPANTS.map((participant) => (
            <VideoTile key={participant.id} participant={participant} />
          ))}
          <div className="ml-auto hidden md:flex items-center gap-2 text-xs text-muted-foreground pr-2">
            <ArrowUpRight className="w-3.5 h-3.5" />
            Whiteboard synced live
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
