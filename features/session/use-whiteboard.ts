import { useCallback, useEffect, useRef, useState } from "react"
import type { MouseEvent as ReactMouseEvent, RefObject } from "react"
import type {
  LiveSessionWhiteboardMessage,
  WhiteboardPoint,
} from "./live-session-types"
import type { Tool } from "./session-data"

const BOARD_WIDTH = 1400
const BOARD_HEIGHT = 900

type DrawableTool = "pen" | "eraser"

type OutgoingWhiteboardMessage =
  LiveSessionWhiteboardMessage extends infer Message
    ? Message extends LiveSessionWhiteboardMessage
      ? Omit<Message, "id" | "senderId">
      : never
    : never

interface WhiteboardState {
  canvasRef: RefObject<HTMLCanvasElement | null>
  activeTool: Tool
  setActiveTool: (tool: Tool) => void
  color: string
  setColor: (color: string) => void
  brushSize: number
  setBrushSize: (size: number) => void
  showColorPicker: boolean
  setShowColorPicker: (visible: boolean) => void
  redoCount: number
  handleMouseDown: (event: ReactMouseEvent<HTMLCanvasElement>) => void
  handleMouseMove: (event: ReactMouseEvent<HTMLCanvasElement>) => void
  handleMouseUp: () => void
  handleUndo: () => void
  handleRedo: () => void
  handleClear: () => void
}

interface WhiteboardOptions {
  isTeacher: boolean
  currentUserId: string
  incomingMessages: LiveSessionWhiteboardMessage[]
  participantCount: number
  syncEnabled: boolean
  sendMessage: (
    message: LiveSessionWhiteboardMessage,
    options?: { reliable?: boolean },
  ) => Promise<boolean>
}

interface RemoteStroke {
  tool: DrawableTool
  color: string
  brushSize: number
  lastPoint: WhiteboardPoint
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createStrokeId() {
  return `stroke-${createMessageId()}`
}

function isDrawableTool(tool: Tool): tool is DrawableTool {
  return tool === "pen" || tool === "eraser"
}

function drawBoardBackground(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
) {
  canvas.width = BOARD_WIDTH
  canvas.height = BOARD_HEIGHT

  ctx.globalCompositeOperation = "source-over"
  ctx.fillStyle = "#fafafa"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = "#e5e7eb"
  ctx.lineWidth = 0.5

  for (let x = 0; x <= canvas.width; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }

  for (let y = 0; y <= canvas.height; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
  }
}

function normalizePoint(point: WhiteboardPoint, canvas: HTMLCanvasElement) {
  return {
    x: point.x / canvas.width,
    y: point.y / canvas.height,
  }
}

function denormalizePoint(point: WhiteboardPoint, canvas: HTMLCanvasElement) {
  return {
    x: point.x * canvas.width,
    y: point.y * canvas.height,
  }
}

function configureStroke(
  ctx: CanvasRenderingContext2D,
  tool: DrawableTool,
  color: string,
  brushSize: number,
) {
  ctx.globalCompositeOperation =
    tool === "eraser" ? "destination-out" : "source-over"
  ctx.strokeStyle = color
  ctx.lineWidth = tool === "eraser" ? brushSize * 4 : brushSize
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
}

export function useWhiteboard({
  isTeacher,
  currentUserId,
  incomingMessages,
  participantCount,
  syncEnabled,
  sendMessage,
}: WhiteboardOptions): WhiteboardState {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [activeTool, setActiveTool] = useState<Tool>("pen")
  const [color, setColor] = useState("#6366f1")
  const [brushSize, setBrushSize] = useState(3)
  const [isDrawing, setIsDrawing] = useState(false)
  const [history, setHistory] = useState<ImageData[]>([])
  const [redoStack, setRedoStack] = useState<ImageData[]>([])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const lastPos = useRef<WhiteboardPoint | null>(null)
  const activeStrokeId = useRef<string | null>(null)
  const processedMessageIds = useRef(new Set<string>())
  const remoteStrokes = useRef(new Map<string, RemoteStroke>())
  const lastParticipantCount = useRef(participantCount)
  const snapshotRequested = useRef(false)

  const getContext = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    if (!canvas || !ctx) {
      return null
    }

    return { canvas, ctx }
  }, [])

  const resetBoard = useCallback(() => {
    const context = getContext()

    if (!context) {
      return
    }

    drawBoardBackground(context.canvas, context.ctx)
  }, [getContext])

  const getPos = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  const sendWhiteboardMessage = useCallback(
    (message: OutgoingWhiteboardMessage, options?: { reliable?: boolean }) => {
      if (!syncEnabled) {
        return
      }

      void sendMessage(
        {
          id: createMessageId(),
          senderId: currentUserId,
          ...message,
        } as LiveSessionWhiteboardMessage,
        options,
      )
    },
    [currentUserId, sendMessage, syncEnabled],
  )

  const sendSnapshot = useCallback(() => {
    const context = getContext()

    if (!context || !syncEnabled) {
      return
    }

    sendWhiteboardMessage(
      {
        type: "snapshot",
        imageDataUrl: context.canvas.toDataURL("image/webp", 0.72),
      },
      { reliable: true },
    )
  }, [getContext, sendWhiteboardMessage, syncEnabled])

  const saveHistory = useCallback(() => {
    const context = getContext()

    if (!context) return

    const snapshot = context.ctx.getImageData(
      0,
      0,
      context.canvas.width,
      context.canvas.height,
    )
    setHistory((prev) => [...prev.slice(-30), snapshot])
    setRedoStack([])
  }, [getContext])

  const drawLineTo = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      tool: DrawableTool,
      color: string,
      size: number,
      point: WhiteboardPoint,
    ) => {
      configureStroke(ctx, tool, color, size)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    },
    [],
  )

  const handleMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isTeacher || !isDrawableTool(activeTool)) return

    const pos = getPos(event)
    const context = getContext()
    if (!pos || !context) return

    saveHistory()
    setIsDrawing(true)
    lastPos.current = pos

    const strokeId = createStrokeId()
    activeStrokeId.current = strokeId
    configureStroke(context.ctx, activeTool, color, brushSize)
    context.ctx.beginPath()
    context.ctx.moveTo(pos.x, pos.y)

    sendWhiteboardMessage(
      {
        type: "stroke:start",
        strokeId,
        tool: activeTool,
        color,
        brushSize,
        point: normalizePoint(pos, context.canvas),
      },
      { reliable: true },
    )
  }

  const handleMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (
      !isDrawing ||
      !lastPos.current ||
      !isTeacher ||
      !isDrawableTool(activeTool)
    ) {
      return
    }

    const context = getContext()
    const pos = getPos(event)

    if (!context || !pos) return

    drawLineTo(context.ctx, activeTool, color, brushSize, pos)

    if (activeStrokeId.current) {
      sendWhiteboardMessage(
        {
          type: "stroke:point",
          strokeId: activeStrokeId.current,
          point: normalizePoint(pos, context.canvas),
        },
        { reliable: true },
      )
    }

    lastPos.current = pos
  }

  const handleMouseUp = () => {
    if (isDrawing && activeStrokeId.current) {
      sendWhiteboardMessage(
        {
          type: "stroke:end",
          strokeId: activeStrokeId.current,
        },
        { reliable: true },
      )
    }

    setIsDrawing(false)
    lastPos.current = null
    activeStrokeId.current = null

    const context = getContext()

    if (context) {
      context.ctx.globalCompositeOperation = "source-over"
    }
  }

  const handleUndo = () => {
    const context = getContext()

    if (!context) return

    if (history.length === 0) {
      resetBoard()
      sendSnapshot()
      return
    }

    const current = context.ctx.getImageData(
      0,
      0,
      context.canvas.width,
      context.canvas.height,
    )
    setRedoStack((prev) => [...prev, current])

    const previous = history[history.length - 1]
    context.ctx.putImageData(previous, 0, 0)
    context.ctx.globalCompositeOperation = "source-over"
    setHistory((prev) => prev.slice(0, -1))
    sendSnapshot()
  }

  const handleRedo = () => {
    if (redoStack.length === 0) return

    const context = getContext()

    if (!context) return

    const current = context.ctx.getImageData(
      0,
      0,
      context.canvas.width,
      context.canvas.height,
    )
    setHistory((prev) => [...prev, current])

    const next = redoStack[redoStack.length - 1]
    context.ctx.putImageData(next, 0, 0)
    context.ctx.globalCompositeOperation = "source-over"
    setRedoStack((prev) => prev.slice(0, -1))
    sendSnapshot()
  }

  const handleClear = () => {
    saveHistory()
    resetBoard()
    sendWhiteboardMessage({ type: "clear" }, { reliable: true })
  }

  useEffect(() => {
    resetBoard()
  }, [resetBoard])

  useEffect(() => {
    if (!syncEnabled) {
      snapshotRequested.current = false
      return
    }

    if (!isTeacher && !snapshotRequested.current) {
      snapshotRequested.current = true
      sendWhiteboardMessage({ type: "snapshot:request" }, { reliable: true })
    }
  }, [isTeacher, sendWhiteboardMessage, syncEnabled])

  useEffect(() => {
    if (!isTeacher || !syncEnabled) {
      lastParticipantCount.current = participantCount
      return
    }

    if (participantCount > lastParticipantCount.current) {
      sendSnapshot()
    }

    lastParticipantCount.current = participantCount
  }, [isTeacher, participantCount, sendSnapshot, syncEnabled])

  useEffect(() => {
    const context = getContext()

    if (!context) {
      return
    }

    for (const message of incomingMessages) {
      if (
        processedMessageIds.current.has(message.id) ||
        message.senderId === currentUserId
      ) {
        continue
      }

      processedMessageIds.current.add(message.id)

      if (isTeacher) {
        if (message.type === "snapshot:request") {
          sendSnapshot()
        }
        continue
      }

      if (message.type === "clear") {
        resetBoard()
        remoteStrokes.current.clear()
        continue
      }

      if (message.type === "snapshot") {
        const image = new Image()
        image.onload = () => {
          resetBoard()
          context.ctx.drawImage(
            image,
            0,
            0,
            context.canvas.width,
            context.canvas.height,
          )
        }
        image.src = message.imageDataUrl
        continue
      }

      if (message.type === "stroke:start") {
        const point = denormalizePoint(message.point, context.canvas)
        remoteStrokes.current.set(message.strokeId, {
          tool: message.tool,
          color: message.color,
          brushSize: message.brushSize,
          lastPoint: point,
        })
        configureStroke(
          context.ctx,
          message.tool,
          message.color,
          message.brushSize,
        )
        context.ctx.beginPath()
        context.ctx.moveTo(point.x, point.y)
        continue
      }

      if (message.type === "stroke:point") {
        const stroke = remoteStrokes.current.get(message.strokeId)
        if (!stroke) {
          continue
        }

        const point = denormalizePoint(message.point, context.canvas)
        drawLineTo(
          context.ctx,
          stroke.tool,
          stroke.color,
          stroke.brushSize,
          point,
        )
        stroke.lastPoint = point
        continue
      }

      if (message.type === "stroke:end") {
        remoteStrokes.current.delete(message.strokeId)
        context.ctx.globalCompositeOperation = "source-over"
      }
    }
  }, [
    currentUserId,
    drawLineTo,
    getContext,
    incomingMessages,
    isTeacher,
    resetBoard,
    sendSnapshot,
  ])

  return {
    canvasRef,
    activeTool,
    setActiveTool,
    color,
    setColor,
    brushSize,
    setBrushSize,
    showColorPicker,
    setShowColorPicker,
    redoCount: redoStack.length,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleUndo,
    handleRedo,
    handleClear,
  }
}
