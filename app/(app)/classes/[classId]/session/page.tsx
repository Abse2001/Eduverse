"use client";

import { use, useState, useRef, useEffect, useCallback } from "react";
import { getClassById, getUserById, getStudentsInClass } from "@/lib/mock-data";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Phone,
  Pen,
  Eraser,
  Square,
  Circle,
  Minus,
  Undo2,
  Redo2,
  Trash2,
  Download,
  ChevronRight,
  Users,
  MessageSquare,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Hand,
  MousePointer2,
  SlidersHorizontal,
  ArrowUpRight,
} from "lucide-react";

type Tool = "pen" | "eraser" | "line" | "rect" | "circle" | "pointer";
type DrawAction = {
  tool: Tool;
  color: string;
  width: number;
  points: [number, number][];
};

const COLORS = [
  "#1e1e1e",
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
];

const MOCK_PARTICIPANTS = [
  {
    id: "t1",
    name: "Dr. Priya Nair",
    avatar: "PN",
    role: "teacher",
    muted: false,
    videoOff: false,
    speaking: true,
  },
  {
    id: "u1",
    name: "Alex Rivera",
    avatar: "AR",
    role: "student",
    muted: true,
    videoOff: false,
    speaking: false,
  },
  {
    id: "u2",
    name: "Jordan Kim",
    avatar: "JK",
    role: "student",
    muted: false,
    videoOff: true,
    speaking: false,
  },
  {
    id: "u3",
    name: "Sam Chen",
    avatar: "SC",
    role: "student",
    muted: true,
    videoOff: false,
    speaking: false,
  },
];

export default function SessionPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);
  const { currentUser } = useApp();
  const cls = getClassById(classId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#6366f1");
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [rightPanel, setRightPanel] = useState<"participants" | "chat" | null>(
    "participants",
  );
  const [sessionActive, setSessionActive] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const isTeacher = currentUser.role === "teacher";

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-30), snapshot]);
    setRedoStack([]);
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isTeacher) return;
    saveHistory();
    setIsDrawing(true);
    const pos = getPos(e);
    lastPos.current = { x: pos.x, y: pos.y };

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPos.current || !isTeacher) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);

    ctx.globalCompositeOperation =
      activeTool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = activeTool === "eraser" ? brushSize * 4 : brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (activeTool === "pen") {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPos.current = { x: pos.x, y: pos.y };
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    lastPos.current = null;
    const canvas = canvasRef.current!;
    if (canvas) {
      const ctx = canvas.getContext("2d")!;
      ctx.globalCompositeOperation = "source-over";
    }
  };

  const handleUndo = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    if (history.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setRedoStack((prev) => [...prev, current]);
    const prev = history[history.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistory((h) => h.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev, current]);
    const next = redoStack[redoStack.length - 1];
    ctx.putImageData(next, 0, 0);
    setRedoStack((r) => r.slice(0, -1));
  };

  const handleClear = () => {
    saveHistory();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 1400;
    canvas.height = 900;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Draw subtle grid
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }, []);

  const TOOLS: { id: Tool; icon: React.ElementType; label: string }[] = [
    { id: "pointer", icon: MousePointer2, label: "Select" },
    { id: "pen", icon: Pen, label: "Pen" },
    { id: "eraser", icon: Eraser, label: "Eraser" },
    { id: "line", icon: Minus, label: "Line" },
    { id: "rect", icon: Square, label: "Rectangle" },
    { id: "circle", icon: Circle, label: "Circle" },
  ];

  if (!cls)
    return <div className="p-6 text-muted-foreground">Class not found.</div>;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col bg-background overflow-hidden">
        {/* Top session bar */}
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

          {/* Video controls */}
          <div className="flex items-center gap-1.5">
            <ControlBtn
              active={micOn}
              onClick={() => setMicOn(!micOn)}
              icon={micOn ? Mic : MicOff}
              label={micOn ? "Mute" : "Unmute"}
              destructive={!micOn}
            />
            <ControlBtn
              active={camOn}
              onClick={() => setCamOn(!camOn)}
              icon={camOn ? Video : VideoOff}
              label={camOn ? "Stop camera" : "Start camera"}
              destructive={!camOn}
            />
            {isTeacher && (
              <ControlBtn
                active={screenSharing}
                onClick={() => setScreenSharing(!screenSharing)}
                icon={MonitorUp}
                label={screenSharing ? "Stop sharing" : "Share screen"}
                highlight={screenSharing}
              />
            )}
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

          {/* Right panel toggles */}
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

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left toolbar */}
          <div className="flex flex-col items-center gap-1 p-2 border-r border-border bg-card w-12 shrink-0">
            {TOOLS.map((t) => (
              <Tooltip key={t.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setActiveTool(t.id)}
                    disabled={!isTeacher}
                    className={cn(
                      "w-8 h-8 flex items-center justify-center rounded-lg transition-colors",
                      activeTool === t.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent",
                      !isTeacher && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <t.icon className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{t.label}</TooltipContent>
              </Tooltip>
            ))}

            <Separator className="my-1 w-6" />

            {/* Undo / Redo */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleUndo}
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
                  onClick={handleRedo}
                  disabled={!isTeacher || redoStack.length === 0}
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
                  onClick={handleClear}
                  disabled={!isTeacher}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Clear board</TooltipContent>
            </Tooltip>

            <Separator className="my-1 w-6" />

            {/* Color picker */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  disabled={!isTeacher}
                  className="w-7 h-7 rounded-full border-2 border-border transition-transform hover:scale-110 disabled:opacity-40 disabled:cursor-not-allowed relative"
                  style={{ backgroundColor: color }}
                />
              </TooltipTrigger>
              <TooltipContent side="right">Color</TooltipContent>
            </Tooltip>

            {/* Brush size dots */}
            {[2, 4, 8].map((s) => (
              <Tooltip key={s}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setBrushSize(s)}
                    disabled={!isTeacher}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-40",
                      brushSize === s ? "bg-accent" : "hover:bg-accent",
                    )}
                  >
                    <span
                      className="rounded-full bg-foreground"
                      style={{ width: s + 2, height: s + 2 }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Size {s}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Canvas area */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Color palette floating */}
            {showColorPicker && (
              <div className="absolute top-3 left-3 z-10 flex gap-1.5 p-2 bg-card border border-border rounded-xl shadow-lg">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setColor(c);
                      setShowColorPicker(false);
                    }}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                      color === c
                        ? "border-primary scale-110"
                        : "border-border",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}

            {/* Screen share mock overlay */}
            {screenSharing && (
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
            )}

            {/* Not teacher notice */}
            {!isTeacher && !screenSharing && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-muted/90 backdrop-blur-sm text-xs text-muted-foreground font-medium border border-border">
                View-only — teacher is presenting
              </div>
            )}

            <canvas
              ref={canvasRef}
              className={cn(
                "w-full h-full object-contain",
                isTeacher && activeTool === "pen" ? "cursor-crosshair" : "",
                isTeacher && activeTool === "eraser" ? "cursor-cell" : "",
                isTeacher && activeTool === "pointer" ? "cursor-default" : "",
                !isTeacher ? "cursor-not-allowed" : "",
              )}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>

          {/* Right panel */}
          {rightPanel && (
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
                  People ({MOCK_PARTICIPANTS.length})
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
                <ParticipantsPanel />
              ) : (
                <SessionChat />
              )}
            </div>
          )}
        </div>

        {/* Video strip at bottom */}
        <div className="flex items-center gap-2 p-2 border-t border-border bg-card shrink-0 overflow-x-auto">
          {MOCK_PARTICIPANTS.map((p) => (
            <VideoTile key={p.id} participant={p} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

function ControlBtn({
  active,
  onClick,
  icon: Icon,
  label,
  destructive,
  highlight,
}: {
  active?: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  destructive?: boolean;
  highlight?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "h-8 w-8 flex items-center justify-center rounded-lg transition-colors",
            destructive
              ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
              : highlight
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "bg-accent/50 text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          <Icon className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function VideoTile({
  participant: p,
}: {
  participant: (typeof MOCK_PARTICIPANTS)[0];
}) {
  return (
    <div
      className={cn(
        "relative w-28 h-20 rounded-xl overflow-hidden shrink-0 border-2 transition-all",
        p.speaking ? "border-primary" : "border-transparent",
      )}
    >
      <div className="w-full h-full bg-muted flex items-center justify-center">
        {p.videoOff ? (
          <Avatar className="w-10 h-10">
            <AvatarFallback className="text-sm font-semibold bg-primary/20 text-primary">
              {p.avatar}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, hsl(${p.id.charCodeAt(1) * 40} 60% 40%), hsl(${p.id.charCodeAt(1) * 40 + 60} 50% 30%))`,
            }}
          />
        )}
      </div>
      <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-white bg-black/60 px-1.5 py-0.5 rounded-md truncate max-w-[70px]">
          {p.name.split(" ")[0]}
        </span>
        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-black/60">
          {p.muted ? (
            <MicOff className="w-2.5 h-2.5 text-red-400" />
          ) : (
            <Mic className="w-2.5 h-2.5 text-white" />
          )}
        </span>
      </div>
    </div>
  );
}

const MOCK_CHAT = [
  {
    id: "1",
    sender: "Jordan Kim",
    avatar: "JK",
    msg: "Can you zoom into the tree traversal diagram?",
    time: "10:14",
  },
  {
    id: "2",
    sender: "Dr. Priya Nair",
    avatar: "PN",
    msg: "Sure, let me highlight that section now.",
    time: "10:15",
  },
  {
    id: "3",
    sender: "Sam Chen",
    avatar: "SC",
    msg: "Will the BFS part be on the midterm?",
    time: "10:17",
  },
  {
    id: "4",
    sender: "Alex Rivera",
    avatar: "AR",
    msg: "Thanks for the walkthrough, very clear!",
    time: "10:20",
  },
];

function SessionChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(MOCK_CHAT);
  const { currentUser } = useApp();

  const send = () => {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        sender: currentUser.name.split(" ")[0],
        avatar: currentUser.avatar,
        msg: input.trim(),
        time: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
    setInput("");
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <Avatar className="w-6 h-6 shrink-0 mt-0.5">
              <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                {m.avatar}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {m.sender}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {m.time}
                </span>
              </div>
              <p className="text-xs text-foreground/90 mt-0.5 leading-relaxed">
                {m.msg}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Send a message..."
          className="flex-1 text-xs px-3 py-2 rounded-lg border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
        <Button size="sm" className="h-8 px-3 text-xs" onClick={send}>
          Send
        </Button>
      </div>
    </div>
  );
}

function ParticipantsPanel() {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1">
      {MOCK_PARTICIPANTS.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors"
        >
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
              {p.avatar}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {p.name}
            </p>
            <p className="text-xs text-muted-foreground capitalize">{p.role}</p>
          </div>
          <div className="flex items-center gap-1">
            {p.muted ? (
              <MicOff className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-emerald-500" />
            )}
            {p.videoOff ? (
              <VideoOff className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <Video className="w-3.5 h-3.5 text-emerald-500" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
