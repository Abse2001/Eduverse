import { useCallback, useEffect, useRef, useState } from "react"
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react"
import type {
  LiveSessionWhiteboardMessage,
  WhiteboardOperation,
  WhiteboardPoint,
  WhiteboardShape,
  WhiteboardStrokeTool,
} from "./live-session-types"
import type { Tool } from "./session-data"

const BOARD_WIDTH = 1400
const BOARD_HEIGHT = 900

type DrawableTool = WhiteboardStrokeTool
type ShapeTool = WhiteboardShape
type StrokeOperation = Extract<WhiteboardOperation, { type: "stroke" }>
type ShapeOperation = Extract<WhiteboardOperation, { type: "shape" }>
type DrawableOperation = StrokeOperation | ShapeOperation

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
  hasSelection: boolean
  redoCount: number
  handlePointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  handlePointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  handlePointerUp: (event?: ReactPointerEvent<HTMLCanvasElement>) => void
  handlePointerCancel: (event?: ReactPointerEvent<HTMLCanvasElement>) => void
  handleKeyDown: (event: ReactKeyboardEvent<HTMLCanvasElement>) => void
  handleDeleteSelection: () => void
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
  color: string
  brushSize: number
  lastPoint: WhiteboardPoint
  points: WhiteboardPoint[]
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createStrokeId() {
  return `stroke-${createMessageId()}`
}

function createShapeId() {
  return `shape-${createMessageId()}`
}

function createClearId() {
  return `clear-${createMessageId()}`
}

function createDeleteId() {
  return `delete-${createMessageId()}`
}

function createMoveId() {
  return `move-${createMessageId()}`
}

function isDrawableTool(tool: Tool): tool is DrawableTool {
  return tool === "pen"
}

function isEraserTool(tool: Tool) {
  return tool === "eraser"
}

function isPointerTool(tool: Tool) {
  return tool === "pointer"
}

function isShapeTool(tool: Tool): tool is ShapeTool {
  return tool === "line" || tool === "rect" || tool === "circle"
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
  color: string,
  brushSize: number,
) {
  ctx.globalCompositeOperation = "source-over"
  ctx.strokeStyle = color
  ctx.lineWidth = brushSize
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
}

function configureShape(
  ctx: CanvasRenderingContext2D,
  color: string,
  brushSize: number,
) {
  ctx.globalCompositeOperation = "source-over"
  ctx.strokeStyle = color
  ctx.lineWidth = brushSize
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  tool: ShapeTool,
  color: string,
  brushSize: number,
  startPoint: WhiteboardPoint,
  endPoint: WhiteboardPoint,
) {
  const width = endPoint.x - startPoint.x
  const height = endPoint.y - startPoint.y

  configureShape(ctx, color, brushSize)
  ctx.beginPath()

  if (tool === "line") {
    ctx.moveTo(startPoint.x, startPoint.y)
    ctx.lineTo(endPoint.x, endPoint.y)
  } else if (tool === "rect") {
    ctx.rect(startPoint.x, startPoint.y, width, height)
  } else {
    ctx.ellipse(
      startPoint.x + width / 2,
      startPoint.y + height / 2,
      Math.abs(width / 2),
      Math.abs(height / 2),
      0,
      0,
      Math.PI * 2,
    )
  }

  ctx.stroke()
}

function drawStrokePoint(
  ctx: CanvasRenderingContext2D,
  color: string,
  brushSize: number,
  point: WhiteboardPoint,
) {
  configureStroke(ctx, color, brushSize)
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
}

function drawStrokeOperation(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  operation: StrokeOperation,
) {
  if (operation.points.length === 0) {
    return
  }

  const [startPoint, ...points] = operation.points.map((point) =>
    denormalizePoint(point, canvas),
  )

  configureStroke(ctx, operation.color, operation.brushSize)
  ctx.beginPath()
  ctx.moveTo(startPoint.x, startPoint.y)

  if (points.length === 0) {
    ctx.lineTo(startPoint.x + 0.1, startPoint.y + 0.1)
    ctx.stroke()
    return
  }

  for (const point of points) {
    ctx.lineTo(point.x, point.y)
  }

  ctx.stroke()
}

function getVisibleDrawableOperations(
  nextOperations: WhiteboardOperation[],
): DrawableOperation[] {
  const visibleOperations: DrawableOperation[] = []

  for (const operation of nextOperations) {
    if (operation.type === "clear") {
      visibleOperations.length = 0
      continue
    }

    if (operation.type === "delete") {
      const targetIndex = visibleOperations.findIndex(
        (visibleOperation) => visibleOperation.id === operation.targetId,
      )

      if (targetIndex >= 0) {
        visibleOperations.splice(targetIndex, 1)
      }
      continue
    }

    if (operation.type === "move") {
      const targetIndex = visibleOperations.findIndex(
        (visibleOperation) => visibleOperation.id === operation.targetId,
      )

      if (targetIndex >= 0) {
        visibleOperations[targetIndex] = moveDrawableOperation(
          visibleOperations[targetIndex],
          operation.delta,
        )
      }
      continue
    }

    visibleOperations.push(operation)
  }

  return visibleOperations
}

function getStateSyncOperations(nextOperations: WhiteboardOperation[]) {
  return getVisibleDrawableOperations(nextOperations)
}

function movePoint(point: WhiteboardPoint, delta: WhiteboardPoint) {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  }
}

function moveDrawableOperation(
  operation: DrawableOperation,
  delta: WhiteboardPoint,
): DrawableOperation {
  if (operation.type === "stroke") {
    return {
      ...operation,
      points: operation.points.map((point) => movePoint(point, delta)),
    }
  }

  return {
    ...operation,
    startPoint: movePoint(operation.startPoint, delta),
    endPoint: movePoint(operation.endPoint, delta),
  }
}

function getOperationBounds(
  operation: DrawableOperation,
  canvas: HTMLCanvasElement,
) {
  if (operation.type === "shape") {
    const startPoint = denormalizePoint(operation.startPoint, canvas)
    const endPoint = denormalizePoint(operation.endPoint, canvas)

    return {
      left: Math.min(startPoint.x, endPoint.x),
      right: Math.max(startPoint.x, endPoint.x),
      top: Math.min(startPoint.y, endPoint.y),
      bottom: Math.max(startPoint.y, endPoint.y),
    }
  }

  const points = operation.points.map((point) =>
    denormalizePoint(point, canvas),
  )

  if (points.length === 0) {
    return null
  }

  const padding = operation.brushSize / 2

  return points.reduce(
    (bounds, point) => ({
      left: Math.min(bounds.left, point.x - padding),
      right: Math.max(bounds.right, point.x + padding),
      top: Math.min(bounds.top, point.y - padding),
      bottom: Math.max(bounds.bottom, point.y + padding),
    }),
    {
      left: points[0].x - padding,
      right: points[0].x + padding,
      top: points[0].y - padding,
      bottom: points[0].y + padding,
    },
  )
}

function drawSelectionOutline(
  ctx: CanvasRenderingContext2D,
  bounds: NonNullable<ReturnType<typeof getOperationBounds>>,
) {
  const padding = 8
  const handleSize = 6
  const left = bounds.left - padding
  const top = bounds.top - padding
  const width = Math.max(1, bounds.right - bounds.left + padding * 2)
  const height = Math.max(1, bounds.bottom - bounds.top + padding * 2)
  const handlePoints = [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left, y: top + height },
    { x: left + width, y: top + height },
  ]

  ctx.save()
  ctx.globalCompositeOperation = "source-over"
  ctx.setLineDash([6, 4])
  ctx.strokeStyle = "#2563eb"
  ctx.lineWidth = 1.5
  ctx.strokeRect(left, top, width, height)
  ctx.setLineDash([])
  ctx.fillStyle = "#ffffff"

  for (const point of handlePoints) {
    ctx.fillRect(
      point.x - handleSize / 2,
      point.y - handleSize / 2,
      handleSize,
      handleSize,
    )
    ctx.strokeRect(
      point.x - handleSize / 2,
      point.y - handleSize / 2,
      handleSize,
      handleSize,
    )
  }

  ctx.restore()
}

function getDistance(first: WhiteboardPoint, second: WhiteboardPoint) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function getDistanceToSegment(
  point: WhiteboardPoint,
  startPoint: WhiteboardPoint,
  endPoint: WhiteboardPoint,
) {
  const width = endPoint.x - startPoint.x
  const height = endPoint.y - startPoint.y
  const lengthSquared = width * width + height * height

  if (lengthSquared === 0) {
    return getDistance(point, startPoint)
  }

  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point.x - startPoint.x) * width + (point.y - startPoint.y) * height) /
        lengthSquared,
    ),
  )

  return getDistance(point, {
    x: startPoint.x + ratio * width,
    y: startPoint.y + ratio * height,
  })
}

function hitsStroke(
  operation: StrokeOperation,
  point: WhiteboardPoint,
  canvas: HTMLCanvasElement,
  radius: number,
) {
  const points = operation.points.map((operationPoint) =>
    denormalizePoint(operationPoint, canvas),
  )
  const threshold = radius + operation.brushSize / 2

  if (points.length === 0) {
    return false
  }

  if (points.length === 1) {
    return getDistance(point, points[0]) <= threshold
  }

  return points.some((currentPoint, index) => {
    const nextPoint = points[index + 1]

    return (
      Boolean(nextPoint) &&
      getDistanceToSegment(point, currentPoint, nextPoint) <= threshold
    )
  })
}

function hitsShape(
  operation: ShapeOperation,
  point: WhiteboardPoint,
  canvas: HTMLCanvasElement,
  radius: number,
  includeInterior = false,
) {
  const startPoint = denormalizePoint(operation.startPoint, canvas)
  const endPoint = denormalizePoint(operation.endPoint, canvas)
  const threshold = radius + operation.brushSize / 2

  if (operation.tool === "line") {
    return getDistanceToSegment(point, startPoint, endPoint) <= threshold
  }

  const left = Math.min(startPoint.x, endPoint.x)
  const right = Math.max(startPoint.x, endPoint.x)
  const top = Math.min(startPoint.y, endPoint.y)
  const bottom = Math.max(startPoint.y, endPoint.y)

  if (
    point.x < left - threshold ||
    point.x > right + threshold ||
    point.y < top - threshold ||
    point.y > bottom + threshold
  ) {
    return false
  }

  if (operation.tool === "rect") {
    if (includeInterior) {
      return true
    }

    const distanceToEdge = Math.min(
      Math.abs(point.x - left),
      Math.abs(point.x - right),
      Math.abs(point.y - top),
      Math.abs(point.y - bottom),
    )

    return distanceToEdge <= threshold
  }

  const radiusX = Math.abs(right - left) / 2
  const radiusY = Math.abs(bottom - top) / 2
  const center = {
    x: left + radiusX,
    y: top + radiusY,
  }

  if (radiusX <= threshold || radiusY <= threshold) {
    return getDistance(point, center) <= threshold
  }

  const normalizedDistance = Math.hypot(
    (point.x - center.x) / radiusX,
    (point.y - center.y) / radiusY,
  )

  if (includeInterior) {
    return normalizedDistance <= 1 + threshold / Math.min(radiusX, radiusY)
  }

  const outlineDistance =
    Math.abs(normalizedDistance - 1) * Math.min(radiusX, radiusY)

  return outlineDistance <= threshold
}

function hitsDrawableOperation(
  operation: DrawableOperation,
  point: WhiteboardPoint,
  canvas: HTMLCanvasElement,
  radius: number,
  includeShapeInterior = false,
) {
  return operation.type === "stroke"
    ? hitsStroke(operation, point, canvas, radius)
    : hitsShape(operation, point, canvas, radius, includeShapeInterior)
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
  const [redoCount, setRedoCount] = useState(0)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const isDrawingRef = useRef(false)
  const lastPos = useRef<WhiteboardPoint | null>(null)
  const startPos = useRef<WhiteboardPoint | null>(null)
  const previewSnapshot = useRef<ImageData | null>(null)
  const selectedOperationId = useRef<string | null>(null)
  const movingOperationId = useRef<string | null>(null)
  const activeStrokeId = useRef<string | null>(null)
  const activeStrokePoints = useRef<WhiteboardPoint[]>([])
  const pendingStrokePoints = useRef<WhiteboardPoint[]>([])
  const strokeFlushFrame = useRef<number | null>(null)
  const processedMessageIds = useRef(new Set<string>())
  const remoteStrokes = useRef(new Map<string, RemoteStroke>())
  const lastParticipantCount = useRef(participantCount)
  const stateRequested = useRef(false)
  const operations = useRef<WhiteboardOperation[]>([])
  const redoOperations = useRef<WhiteboardOperation[]>([])
  const boardVersion = useRef(0)

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

  const renderOperations = useCallback(
    (nextOperations: WhiteboardOperation[]) => {
      const context = getContext()

      if (!context) {
        return
      }

      drawBoardBackground(context.canvas, context.ctx)

      const visibleOperations = getVisibleDrawableOperations(nextOperations)

      for (const operation of visibleOperations) {
        if (operation.type === "shape") {
          drawShape(
            context.ctx,
            operation.tool,
            operation.color,
            operation.brushSize,
            denormalizePoint(operation.startPoint, context.canvas),
            denormalizePoint(operation.endPoint, context.canvas),
          )
          continue
        }

        drawStrokeOperation(context.ctx, context.canvas, operation)
      }

      if (selectedOperationId.current) {
        const selectedOperation = visibleOperations.find(
          (operation) => operation.id === selectedOperationId.current,
        )
        const bounds =
          selectedOperation &&
          getOperationBounds(selectedOperation, context.canvas)

        if (bounds) {
          drawSelectionOutline(context.ctx, bounds)
        }
      }

      context.ctx.globalCompositeOperation = "source-over"
    },
    [getContext],
  )

  const handleActiveToolChange = useCallback(
    (tool: Tool) => {
      setActiveTool(tool)

      if (!isPointerTool(tool) && selectedOperationId.current) {
        selectedOperationId.current = null
        setHasSelection(false)
        renderOperations(operations.current)
      }
    },
    [renderOperations],
  )

  const getPos = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const boardRatio = canvas.width / canvas.height
    const containerRatio = rect.width / rect.height
    const drawWidth =
      containerRatio > boardRatio ? rect.height * boardRatio : rect.width
    const drawHeight =
      containerRatio > boardRatio ? rect.height : rect.width / boardRatio
    const offsetX = (rect.width - drawWidth) / 2
    const offsetY = (rect.height - drawHeight) / 2
    const x = event.clientX - rect.left - offsetX
    const y = event.clientY - rect.top - offsetY

    return {
      x: Math.min(Math.max(x * (canvas.width / drawWidth), 0), canvas.width),
      y: Math.min(Math.max(y * (canvas.height / drawHeight), 0), canvas.height),
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

  const sendStateSync = useCallback(() => {
    sendWhiteboardMessage(
      {
        type: "state:sync",
        version: boardVersion.current,
        operations: getStateSyncOperations(operations.current),
      },
      { reliable: true },
    )
  }, [sendWhiteboardMessage])

  const commitOperation = useCallback((operation: WhiteboardOperation) => {
    operations.current = [...operations.current, operation]
    redoOperations.current = []
    setRedoCount(0)
    boardVersion.current += 1
    return boardVersion.current
  }, [])

  const updateSelection = useCallback(
    (operationId: string | null) => {
      selectedOperationId.current = operationId
      setHasSelection(Boolean(operationId))
      renderOperations(operations.current)
    },
    [renderOperations],
  )

  const reconcileSelection = useCallback(
    (nextOperations: WhiteboardOperation[]) => {
      if (
        selectedOperationId.current &&
        !getVisibleDrawableOperations(nextOperations).some(
          (operation) => operation.id === selectedOperationId.current,
        )
      ) {
        selectedOperationId.current = null
        setHasSelection(false)
      }
    },
    [],
  )

  const findOperationAtPoint = useCallback(
    (
      point: WhiteboardPoint,
      canvas: HTMLCanvasElement,
      radius: number,
      includeShapeInterior = false,
    ) =>
      getVisibleDrawableOperations(operations.current)
        .slice()
        .reverse()
        .find((operation) =>
          hitsDrawableOperation(
            operation,
            point,
            canvas,
            radius,
            includeShapeInterior,
          ),
        ) ?? null,
    [],
  )

  const deleteOperationById = useCallback(
    (targetId: string) => {
      const targetOperation = getVisibleDrawableOperations(
        operations.current,
      ).find((operation) => operation.id === targetId)

      if (!targetOperation) {
        updateSelection(null)
        return false
      }

      const operation = {
        id: createDeleteId(),
        type: "delete",
        targetId,
      } satisfies Extract<WhiteboardOperation, { type: "delete" }>
      const version = commitOperation(operation)

      selectedOperationId.current = null
      setHasSelection(false)
      renderOperations(operations.current)
      sendWhiteboardMessage(
        {
          type: "delete",
          operation,
          version,
        },
        { reliable: true },
      )

      return true
    },
    [commitOperation, renderOperations, sendWhiteboardMessage, updateSelection],
  )

  const deleteOperationAtPoint = useCallback(
    (point: WhiteboardPoint, canvas: HTMLCanvasElement) => {
      const eraserRadius = Math.max(12, brushSize * 3)
      const targetOperation = findOperationAtPoint(point, canvas, eraserRadius)

      if (!targetOperation) {
        return false
      }

      return deleteOperationById(targetOperation.id)
    },
    [brushSize, deleteOperationById, findOperationAtPoint],
  )

  const handleDeleteSelection = useCallback(() => {
    if (!isTeacher || !selectedOperationId.current) {
      return
    }

    deleteOperationById(selectedOperationId.current)
  }, [deleteOperationById, isTeacher])

  const flushStrokePoints = useCallback(() => {
    if (strokeFlushFrame.current !== null) {
      cancelAnimationFrame(strokeFlushFrame.current)
      strokeFlushFrame.current = null
    }

    const context = getContext()
    const strokeId = activeStrokeId.current
    const points = pendingStrokePoints.current

    if (!context || !strokeId || points.length === 0) {
      pendingStrokePoints.current = []
      return
    }

    pendingStrokePoints.current = []
    sendWhiteboardMessage(
      {
        type: "stroke:points",
        strokeId,
        points: points.map((point) => normalizePoint(point, context.canvas)),
      },
      { reliable: false },
    )
  }, [getContext, sendWhiteboardMessage])

  const scheduleStrokeFlush = useCallback(() => {
    if (strokeFlushFrame.current !== null) {
      return
    }

    strokeFlushFrame.current = requestAnimationFrame(() => {
      strokeFlushFrame.current = null
      flushStrokePoints()
    })
  }, [flushStrokePoints])

  const savePreviewSnapshot = useCallback(() => {
    const context = getContext()

    if (!context) {
      return
    }

    previewSnapshot.current = context.ctx.getImageData(
      0,
      0,
      context.canvas.width,
      context.canvas.height,
    )
  }, [getContext])

  const restorePreviewSnapshot = useCallback(() => {
    const context = getContext()

    if (!context || !previewSnapshot.current) {
      return
    }

    context.ctx.putImageData(previewSnapshot.current, 0, 0)
    context.ctx.globalCompositeOperation = "source-over"
  }, [getContext])

  const resetDrawingState = useCallback(() => {
    isDrawingRef.current = false
    lastPos.current = null
    startPos.current = null
    previewSnapshot.current = null
    activeStrokeId.current = null
    movingOperationId.current = null
    activeStrokePoints.current = []
    pendingStrokePoints.current = []
  }, [])

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (
      !isTeacher ||
      (!isDrawableTool(activeTool) &&
        !isShapeTool(activeTool) &&
        !isEraserTool(activeTool) &&
        !isPointerTool(activeTool))
    ) {
      return
    }

    const pos = getPos(event)
    const context = getContext()
    if (!pos || !context) return

    event.currentTarget.focus()

    if (isPointerTool(activeTool)) {
      const targetOperation = findOperationAtPoint(
        pos,
        context.canvas,
        10,
        true,
      )

      if (!targetOperation) {
        updateSelection(null)
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      isDrawingRef.current = true
      lastPos.current = pos
      startPos.current = pos
      movingOperationId.current = targetOperation.id
      updateSelection(targetOperation.id)
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    isDrawingRef.current = true
    lastPos.current = pos
    startPos.current = pos

    if (isEraserTool(activeTool)) {
      deleteOperationAtPoint(pos, context.canvas)
      return
    }

    if (isShapeTool(activeTool)) {
      savePreviewSnapshot()
      return
    }

    const strokeId = createStrokeId()
    const normalizedPoint = normalizePoint(pos, context.canvas)
    activeStrokeId.current = strokeId
    activeStrokePoints.current = [normalizedPoint]
    pendingStrokePoints.current = []
    configureStroke(context.ctx, color, brushSize)
    context.ctx.beginPath()
    context.ctx.moveTo(pos.x, pos.y)

    sendWhiteboardMessage(
      {
        type: "stroke:start",
        strokeId,
        tool: activeTool,
        color,
        brushSize,
        point: normalizedPoint,
      },
      { reliable: true },
    )
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (
      !isDrawingRef.current ||
      !lastPos.current ||
      !isTeacher ||
      (!isDrawableTool(activeTool) &&
        !isShapeTool(activeTool) &&
        !isEraserTool(activeTool) &&
        !isPointerTool(activeTool))
    ) {
      return
    }

    const context = getContext()
    const pos = getPos(event)

    if (!context || !pos) return

    if (
      isPointerTool(activeTool) &&
      movingOperationId.current &&
      startPos.current
    ) {
      const startPoint = normalizePoint(startPos.current, context.canvas)
      const currentPoint = normalizePoint(pos, context.canvas)
      const operation = {
        id: "move-preview",
        type: "move",
        targetId: movingOperationId.current,
        delta: {
          x: currentPoint.x - startPoint.x,
          y: currentPoint.y - startPoint.y,
        },
      } satisfies Extract<WhiteboardOperation, { type: "move" }>

      renderOperations([...operations.current, operation])
      lastPos.current = pos
      return
    }

    if (isEraserTool(activeTool)) {
      deleteOperationAtPoint(pos, context.canvas)
      lastPos.current = pos
      return
    }

    if (isShapeTool(activeTool)) {
      if (previewSnapshot.current && startPos.current) {
        context.ctx.putImageData(previewSnapshot.current, 0, 0)
        drawShape(
          context.ctx,
          activeTool,
          color,
          brushSize,
          startPos.current,
          pos,
        )
      }
      lastPos.current = pos
      return
    }

    drawStrokePoint(context.ctx, color, brushSize, pos)
    pendingStrokePoints.current.push(pos)
    activeStrokePoints.current.push(normalizePoint(pos, context.canvas))
    scheduleStrokeFlush()
    lastPos.current = pos
  }

  const handlePointerUp = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    const context = getContext()

    if (
      isDrawingRef.current &&
      isTeacher &&
      isPointerTool(activeTool) &&
      context &&
      movingOperationId.current &&
      startPos.current
    ) {
      const endPoint = event ? getPos(event) : lastPos.current

      if (endPoint) {
        const startPoint = normalizePoint(startPos.current, context.canvas)
        const normalizedEndPoint = normalizePoint(endPoint, context.canvas)
        const delta = {
          x: normalizedEndPoint.x - startPoint.x,
          y: normalizedEndPoint.y - startPoint.y,
        }
        const movedEnough =
          getDistance(startPos.current, endPoint) >= Math.max(2, brushSize / 2)

        if (movedEnough) {
          const operation = {
            id: createMoveId(),
            type: "move",
            targetId: movingOperationId.current,
            delta,
          } satisfies Extract<WhiteboardOperation, { type: "move" }>
          const version = commitOperation(operation)

          renderOperations(operations.current)
          sendWhiteboardMessage(
            {
              type: "move",
              operation,
              version,
            },
            { reliable: true },
          )
        } else {
          renderOperations(operations.current)
        }
      }
    } else if (
      isDrawingRef.current &&
      isTeacher &&
      isShapeTool(activeTool) &&
      context &&
      startPos.current &&
      previewSnapshot.current
    ) {
      const endPoint = event ? getPos(event) : lastPos.current

      if (endPoint) {
        const operation = {
          id: createShapeId(),
          type: "shape",
          tool: activeTool,
          color,
          brushSize,
          startPoint: normalizePoint(startPos.current, context.canvas),
          endPoint: normalizePoint(endPoint, context.canvas),
        } satisfies Extract<WhiteboardOperation, { type: "shape" }>
        const version = commitOperation(operation)

        context.ctx.putImageData(previewSnapshot.current, 0, 0)
        drawShape(
          context.ctx,
          activeTool,
          color,
          brushSize,
          startPos.current,
          endPoint,
        )
        sendWhiteboardMessage(
          {
            type: "shape",
            operation,
            version,
          },
          { reliable: true },
        )
      }
    } else if (
      isDrawingRef.current &&
      isTeacher &&
      isDrawableTool(activeTool) &&
      activeStrokeId.current
    ) {
      const endPoint = event ? getPos(event) : lastPos.current

      if (context && endPoint && lastPos.current) {
        drawStrokePoint(context.ctx, color, brushSize, endPoint)
        pendingStrokePoints.current.push(endPoint)
        activeStrokePoints.current.push(
          normalizePoint(endPoint, context.canvas),
        )
      }

      flushStrokePoints()

      const operation = {
        id: activeStrokeId.current,
        type: "stroke",
        tool: activeTool,
        color,
        brushSize,
        points: activeStrokePoints.current,
      } satisfies Extract<WhiteboardOperation, { type: "stroke" }>
      const version = commitOperation(operation)

      sendWhiteboardMessage(
        {
          type: "stroke:end",
          strokeId: activeStrokeId.current,
          operation,
          version,
        },
        { reliable: true },
      )
    }

    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    resetDrawingState()

    if (context) {
      context.ctx.globalCompositeOperation = "source-over"
    }
  }

  const handlePointerCancel = (
    event?: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawingRef.current) {
      return
    }

    restorePreviewSnapshot()
    renderOperations(operations.current)
    sendStateSync()

    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    resetDrawingState()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (
      !isTeacher ||
      !isPointerTool(activeTool) ||
      !selectedOperationId.current
    ) {
      return
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault()
      handleDeleteSelection()
    }
  }

  const handleUndo = () => {
    if (operations.current.length === 0) return

    const nextOperations = operations.current.slice(0, -1)
    const removedOperation = operations.current[operations.current.length - 1]
    operations.current = nextOperations
    redoOperations.current = [removedOperation, ...redoOperations.current]
    setRedoCount(redoOperations.current.length)
    boardVersion.current += 1
    reconcileSelection(nextOperations)
    renderOperations(nextOperations)
    sendStateSync()
  }

  const handleRedo = () => {
    const [nextOperation, ...remainingRedo] = redoOperations.current

    if (!nextOperation) return

    operations.current = [...operations.current, nextOperation]
    redoOperations.current = remainingRedo
    setRedoCount(remainingRedo.length)
    boardVersion.current += 1
    reconcileSelection(operations.current)
    renderOperations(operations.current)
    sendStateSync()
  }

  const handleClear = () => {
    const operation = {
      id: createClearId(),
      type: "clear",
    } satisfies Extract<WhiteboardOperation, { type: "clear" }>
    const version = commitOperation(operation)
    selectedOperationId.current = null
    setHasSelection(false)
    resetBoard()
    sendWhiteboardMessage(
      {
        type: "clear",
        operation,
        version,
      },
      { reliable: true },
    )
  }

  useEffect(() => {
    resetBoard()
  }, [resetBoard])

  useEffect(() => {
    return () => {
      if (strokeFlushFrame.current !== null) {
        cancelAnimationFrame(strokeFlushFrame.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!syncEnabled) {
      stateRequested.current = false
      return
    }

    if (!isTeacher && !stateRequested.current) {
      stateRequested.current = true
      sendWhiteboardMessage({ type: "state:request" }, { reliable: true })
    }
  }, [isTeacher, sendWhiteboardMessage, syncEnabled])

  useEffect(() => {
    if (!isTeacher || !syncEnabled) {
      lastParticipantCount.current = participantCount
      return
    }

    if (participantCount > lastParticipantCount.current) {
      sendStateSync()
    }

    lastParticipantCount.current = participantCount
  }, [isTeacher, participantCount, sendStateSync, syncEnabled])

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
        if (message.type === "state:request") {
          sendStateSync()
        }
        continue
      }

      if (message.type === "state:sync") {
        if (message.version < boardVersion.current) {
          continue
        }

        boardVersion.current = message.version
        operations.current = message.operations
        redoOperations.current = []
        setRedoCount(0)
        remoteStrokes.current.clear()
        renderOperations(message.operations)
        continue
      }

      if (message.type === "clear") {
        if (message.version < boardVersion.current) {
          continue
        }

        boardVersion.current = message.version
        operations.current = [...operations.current, message.operation]
        redoOperations.current = []
        setRedoCount(0)
        selectedOperationId.current = null
        setHasSelection(false)
        resetBoard()
        remoteStrokes.current.clear()
        continue
      }

      if (message.type === "delete") {
        if (message.version < boardVersion.current) {
          continue
        }

        boardVersion.current = message.version
        operations.current = [...operations.current, message.operation]
        redoOperations.current = []
        setRedoCount(0)
        if (selectedOperationId.current === message.operation.targetId) {
          selectedOperationId.current = null
          setHasSelection(false)
        }
        renderOperations(operations.current)
        remoteStrokes.current.clear()
        continue
      }

      if (message.type === "move") {
        if (message.version < boardVersion.current) {
          continue
        }

        boardVersion.current = message.version
        operations.current = [...operations.current, message.operation]
        redoOperations.current = []
        setRedoCount(0)
        renderOperations(operations.current)
        remoteStrokes.current.clear()
        continue
      }

      if (message.type === "stroke:start") {
        const point = denormalizePoint(message.point, context.canvas)
        remoteStrokes.current.set(message.strokeId, {
          color: message.color,
          brushSize: message.brushSize,
          lastPoint: point,
          points: [message.point],
        })
        configureStroke(context.ctx, message.color, message.brushSize)
        context.ctx.beginPath()
        context.ctx.moveTo(point.x, point.y)
        continue
      }

      if (message.type === "shape") {
        if (message.version < boardVersion.current) {
          continue
        }

        boardVersion.current = message.version
        operations.current = [...operations.current, message.operation]
        redoOperations.current = []
        setRedoCount(0)
        drawShape(
          context.ctx,
          message.operation.tool,
          message.operation.color,
          message.operation.brushSize,
          denormalizePoint(message.operation.startPoint, context.canvas),
          denormalizePoint(message.operation.endPoint, context.canvas),
        )
        context.ctx.globalCompositeOperation = "source-over"
        continue
      }

      if (message.type === "stroke:points") {
        const stroke = remoteStrokes.current.get(message.strokeId)
        if (!stroke) {
          continue
        }

        for (const normalizedPoint of message.points) {
          const point = denormalizePoint(normalizedPoint, context.canvas)
          drawStrokePoint(context.ctx, stroke.color, stroke.brushSize, point)
          stroke.lastPoint = point
          stroke.points.push(normalizedPoint)
        }
        continue
      }

      if (message.type === "stroke:end") {
        if (message.version >= boardVersion.current) {
          boardVersion.current = message.version
          operations.current = [...operations.current, message.operation]
          redoOperations.current = []
          setRedoCount(0)
          renderOperations(operations.current)
        }

        remoteStrokes.current.delete(message.strokeId)
        context.ctx.globalCompositeOperation = "source-over"
      }
    }
  }, [
    currentUserId,
    getContext,
    incomingMessages,
    isTeacher,
    renderOperations,
    resetBoard,
    sendStateSync,
  ])

  return {
    canvasRef,
    activeTool,
    setActiveTool: handleActiveToolChange,
    color,
    setColor,
    brushSize,
    setBrushSize,
    showColorPicker,
    setShowColorPicker,
    hasSelection,
    redoCount,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleKeyDown,
    handleDeleteSelection,
    handleUndo,
    handleRedo,
    handleClear,
  }
}
