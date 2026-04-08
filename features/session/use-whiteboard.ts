import { useCallback, useEffect, useRef, useState } from "react"
import type { MouseEvent as ReactMouseEvent, RefObject } from "react"
import type { Tool } from "./session-data"

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

export function useWhiteboard(isTeacher: boolean): WhiteboardState {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [activeTool, setActiveTool] = useState<Tool>("pen")
  const [color, setColor] = useState("#6366f1")
  const [brushSize, setBrushSize] = useState(3)
  const [isDrawing, setIsDrawing] = useState(false)
  const [history, setHistory] = useState<ImageData[]>([])
  const [redoStack, setRedoStack] = useState<ImageData[]>([])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

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

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    if (!canvas || !ctx) return

    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory((prev) => [...prev.slice(-30), snapshot])
    setRedoStack([])
  }, [])

  const handleMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isTeacher) return

    saveHistory()
    setIsDrawing(true)

    const pos = getPos(event)
    if (!pos) return

    lastPos.current = pos

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const handleMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPos.current || !isTeacher) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    const pos = getPos(event)

    if (!ctx || !pos) return

    ctx.globalCompositeOperation =
      activeTool === "eraser" ? "destination-out" : "source-over"
    ctx.strokeStyle = color
    ctx.lineWidth = activeTool === "eraser" ? brushSize * 4 : brushSize
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    if (activeTool === "pen") {
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }

    lastPos.current = pos
  }

  const handleMouseUp = () => {
    setIsDrawing(false)
    lastPos.current = null

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    if (ctx) {
      ctx.globalCompositeOperation = "source-over"
    }
  }

  const handleUndo = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    if (!canvas || !ctx) return

    if (history.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setRedoStack((prev) => [...prev, current])

    const previous = history[history.length - 1]
    ctx.putImageData(previous, 0, 0)
    setHistory((prev) => prev.slice(0, -1))
  }

  const handleRedo = () => {
    if (redoStack.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    if (!canvas || !ctx) return

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory((prev) => [...prev, current])

    const next = redoStack[redoStack.length - 1]
    ctx.putImageData(next, 0, 0)
    setRedoStack((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    saveHistory()

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    if (!canvas || !ctx) return

    canvas.width = 1400
    canvas.height = 900

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
  }, [])

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
