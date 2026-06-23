import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  RefObject,
} from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type {
  LiveSessionWhiteboardMessage,
  LiveSessionWhiteboardMessagePayload,
  WhiteboardOperation,
  WhiteboardPoint,
  WhiteboardShape,
  WhiteboardStrokeTool,
  WhiteboardViewport,
} from "./live-session-types"
import type { Tool } from "./session-data"

const PRESENTATION_BOARD_HEIGHT = 900
const DEFAULT_PRESENTATION_ASPECT_RATIO = 16 / 9
const REGULAR_WHITEBOARD_BOARD_ID = "whiteboard"
const SELECTION_OUTLINE_PADDING = 8
const SELECTION_HANDLE_SIZE = 6
const MIN_RESIZE_SIZE = 12
const ROTATE_HANDLE_DISTANCE = 28
const ROTATE_HANDLE_RADIUS = 7
const DEFAULT_VIEWPORT: WhiteboardViewport = { x: 0, y: 0, scale: 1 }
const MIN_VIEWPORT_SCALE = 0.35
const MAX_VIEWPORT_SCALE = 3
const whiteboardViewportCache = new Map<string, WhiteboardViewport>()

type DrawableTool = WhiteboardStrokeTool
type ShapeTool = WhiteboardShape
type StrokeOperation = Extract<WhiteboardOperation, { type: "stroke" }>
type ShapeOperation = Extract<WhiteboardOperation, { type: "shape" }>
type TextOperation = Extract<WhiteboardOperation, { type: "text" }>
type DrawableOperation = StrokeOperation | ShapeOperation | TextOperation
type DeleteOperation = Extract<WhiteboardOperation, { type: "delete" }>
type DeleteManyOperation = Extract<WhiteboardOperation, { type: "delete:many" }>
type MoveOperation = Extract<WhiteboardOperation, { type: "move" }>
type MoveManyOperation = Extract<WhiteboardOperation, { type: "move:many" }>
type ResizeOperation = Extract<WhiteboardOperation, { type: "resize" }>
type RotateOperation = Extract<WhiteboardOperation, { type: "rotate" }>
type StyleOperation = Extract<WhiteboardOperation, { type: "style" }>
type SelectionResizeHandle = "nw" | "ne" | "sw" | "se"
type OperationBounds = {
  left: number
  right: number
  top: number
  bottom: number
}

type OutgoingWhiteboardMessage =
  LiveSessionWhiteboardMessage extends infer Message
    ? Message extends LiveSessionWhiteboardMessage
      ? Omit<Message, "id" | "senderId" | "boardId" | "liveSessionId">
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
  handleWheel: (event: ReactWheelEvent<HTMLCanvasElement>) => void
  handleKeyDown: (event: ReactKeyboardEvent<HTMLCanvasElement>) => void
  handleDeleteSelection: () => void
  handleUndo: () => void
  handleRedo: () => void
  handleClear: () => void
}

interface WhiteboardOptions {
  isTeacher: boolean
  currentUserId: string
  boardId: string
  incomingMessages: LiveSessionWhiteboardMessage[]
  participantCount: number
  overlayActive: boolean
  overlayAspectRatio?: number
  resetKey: number
  syncEnabled: boolean
  sendMessage: (
    message: LiveSessionWhiteboardMessagePayload,
    options?: { reliable?: boolean },
  ) => Promise<boolean>
}

interface RemoteStroke {
  color: string
  brushSize: number
  lastPoint: WhiteboardPoint
  points: WhiteboardPoint[]
}

interface BoardState {
  operations: WhiteboardOperation[]
  redoOperations: WhiteboardOperation[]
  boardVersion: number
  viewport: WhiteboardViewport
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getStateResponseDelay(userId: string) {
  let hash = 0

  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) % 997
  }

  return 120 + (hash % 600)
}

function createStrokeId() {
  return `stroke-${createMessageId()}`
}

function createShapeId() {
  return `shape-${createMessageId()}`
}

function createTextId() {
  return `text-${createMessageId()}`
}

function createClearId() {
  return `clear-${createMessageId()}`
}

function createDeleteId() {
  return `delete-${createMessageId()}`
}

function createDeleteManyId() {
  return `delete-many-${createMessageId()}`
}

function createMoveId() {
  return `move-${createMessageId()}`
}

function createMoveManyId() {
  return `move-many-${createMessageId()}`
}

function createResizeId() {
  return `resize-${createMessageId()}`
}

function createRotateId() {
  return `rotate-${createMessageId()}`
}

function createStyleId() {
  return `style-${createMessageId()}`
}

function createEmptyBoardState(): BoardState {
  return {
    operations: [],
    redoOperations: [],
    boardVersion: 0,
    viewport: { ...DEFAULT_VIEWPORT },
  }
}

function getMessageBoardId(message: LiveSessionWhiteboardMessage) {
  if (message.type === "session:clear" || message.type === "session:end") {
    return REGULAR_WHITEBOARD_BOARD_ID
  }

  return message.boardId ?? REGULAR_WHITEBOARD_BOARD_ID
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

function isTextTool(tool: Tool) {
  return tool === "text"
}

function drawBoardBackground(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  overlayActive: boolean,
  overlayAspectRatio = DEFAULT_PRESENTATION_ASPECT_RATIO,
  isDarkMode = false,
  viewport: WhiteboardViewport = DEFAULT_VIEWPORT,
) {
  const safeOverlayAspectRatio =
    Number.isFinite(overlayAspectRatio) && overlayAspectRatio > 0
      ? overlayAspectRatio
      : DEFAULT_PRESENTATION_ASPECT_RATIO
  const rect = canvas.getBoundingClientRect()
  const regularBoardWidth = Math.max(1, Math.round(rect.width || canvas.width))
  const regularBoardHeight = Math.max(
    1,
    Math.round(rect.height || canvas.height),
  )

  canvas.width = overlayActive
    ? Math.round(PRESENTATION_BOARD_HEIGHT * safeOverlayAspectRatio)
    : regularBoardWidth
  canvas.height = overlayActive ? PRESENTATION_BOARD_HEIGHT : regularBoardHeight

  ctx.globalCompositeOperation = "source-over"
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (overlayActive) {
    return
  }

  ctx.fillStyle = isDarkMode ? "#000000" : "#fafafa"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(
    viewport.scale,
    0,
    0,
    viewport.scale,
    -viewport.x * viewport.scale,
    -viewport.y * viewport.scale,
  )
  ctx.strokeStyle = isDarkMode ? "#1f2937" : "#e5e7eb"
  ctx.lineWidth = 1 / viewport.scale

  const gridSize = 40
  const left = viewport.x
  const right = viewport.x + canvas.width / viewport.scale
  const top = viewport.y
  const bottom = viewport.y + canvas.height / viewport.scale
  const startX = Math.floor(left / gridSize) * gridSize
  const startY = Math.floor(top / gridSize) * gridSize

  for (let x = startX; x <= right; x += gridSize) {
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
  }

  for (let y = startY; y <= bottom; y += gridSize) {
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

function normalizePoint(
  point: WhiteboardPoint,
  _canvas: HTMLCanvasElement,
  viewport: WhiteboardViewport = DEFAULT_VIEWPORT,
) {
  return {
    x: viewport.x + point.x / viewport.scale,
    y: viewport.y + point.y / viewport.scale,
  }
}

function denormalizePoint(point: WhiteboardPoint, _canvas: HTMLCanvasElement) {
  return point
}

function applyViewportTransform(
  ctx: CanvasRenderingContext2D,
  viewport: WhiteboardViewport,
) {
  ctx.setTransform(
    viewport.scale,
    0,
    0,
    viewport.scale,
    -viewport.x * viewport.scale,
    -viewport.y * viewport.scale,
  )
}

function resetViewportTransform(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

function clampViewportScale(scale: number) {
  return Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, scale))
}

function isFiniteViewport(viewport: WhiteboardViewport) {
  return (
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.scale) &&
    viewport.scale >= MIN_VIEWPORT_SCALE &&
    viewport.scale <= MAX_VIEWPORT_SCALE
  )
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

function drawShapeOperation(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  operation: ShapeOperation,
) {
  const startPoint = denormalizePoint(operation.startPoint, canvas)
  const endPoint = denormalizePoint(operation.endPoint, canvas)
  const rotation = operation.rotation ?? 0

  if (rotation === 0 || operation.tool === "line") {
    drawShape(
      ctx,
      operation.tool,
      operation.color,
      operation.brushSize,
      startPoint,
      endPoint,
    )
    return
  }

  const bounds = getBoundsFromPoints(startPoint, endPoint)
  const center = getBoundsCenter(bounds)

  ctx.save()
  ctx.translate(center.x, center.y)
  ctx.rotate(rotation)
  ctx.translate(-center.x, -center.y)
  drawShape(
    ctx,
    operation.tool,
    operation.color,
    operation.brushSize,
    startPoint,
    endPoint,
  )
  ctx.restore()
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

function getTextLineHeight(fontSize: number) {
  return fontSize * 1.25
}

function measureTextDimensions(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
) {
  const lines = text.split("\n")
  const lineHeight = getTextLineHeight(fontSize)

  ctx.save()
  ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
  const width = Math.max(
    1,
    ...lines.map((line) => ctx.measureText(line || " ").width),
  )
  ctx.restore()

  return {
    width,
    height: Math.max(1, lines.length) * lineHeight,
  }
}

function getTextDimensions(
  ctx: CanvasRenderingContext2D,
  operation: TextOperation,
) {
  const measured = measureTextDimensions(
    ctx,
    operation.text,
    operation.fontSize,
  )

  return {
    width:
      typeof operation.width === "number" && Number.isFinite(operation.width)
        ? operation.width
        : measured.width,
    height:
      typeof operation.height === "number" && Number.isFinite(operation.height)
        ? operation.height
        : measured.height,
    naturalWidth: measured.width,
    naturalHeight: measured.height,
  }
}

function drawTextOperation(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  operation: TextOperation,
) {
  const point = denormalizePoint(operation.point, canvas)
  const lines = operation.text.split("\n")
  const dimensions = getTextDimensions(ctx, operation)
  const scaleX = dimensions.width / dimensions.naturalWidth
  const scaleY = dimensions.height / dimensions.naturalHeight
  const center = {
    x: point.x + dimensions.width / 2,
    y: point.y + dimensions.height / 2,
  }

  ctx.save()
  ctx.globalCompositeOperation = "source-over"
  ctx.translate(center.x, center.y)
  ctx.rotate(operation.rotation ?? 0)
  ctx.translate(-dimensions.width / 2, -dimensions.height / 2)
  ctx.scale(scaleX, scaleY)
  ctx.fillStyle = operation.color
  ctx.font = `${operation.fontSize}px Inter, system-ui, sans-serif`
  ctx.textBaseline = "top"

  lines.forEach((line, index) => {
    ctx.fillText(line, 0, index * getTextLineHeight(operation.fontSize))
  })

  ctx.restore()
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

    if (operation.type === "delete:many") {
      const targetIds = new Set(operation.targetIds)

      for (let index = visibleOperations.length - 1; index >= 0; index -= 1) {
        if (targetIds.has(visibleOperations[index].id)) {
          visibleOperations.splice(index, 1)
        }
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

    if (operation.type === "move:many") {
      const targetIds = new Set(operation.targetIds)

      for (let index = 0; index < visibleOperations.length; index += 1) {
        if (targetIds.has(visibleOperations[index].id)) {
          visibleOperations[index] = moveDrawableOperation(
            visibleOperations[index],
            operation.delta,
          )
        }
      }
      continue
    }

    if (operation.type === "resize") {
      const targetIds = new Set(operation.targetIds)

      for (let index = 0; index < visibleOperations.length; index += 1) {
        if (targetIds.has(visibleOperations[index].id)) {
          visibleOperations[index] = resizeDrawableOperation(
            visibleOperations[index],
            operation,
          )
        }
      }
      continue
    }

    if (operation.type === "rotate") {
      const targetIds = new Set(operation.targetIds)

      for (let index = 0; index < visibleOperations.length; index += 1) {
        if (targetIds.has(visibleOperations[index].id)) {
          visibleOperations[index] = rotateDrawableOperation(
            visibleOperations[index],
            operation,
          )
        }
      }
      continue
    }

    if (operation.type === "style") {
      const targetIds = new Set(operation.targetIds)

      for (let index = 0; index < visibleOperations.length; index += 1) {
        if (targetIds.has(visibleOperations[index].id)) {
          visibleOperations[index] = styleDrawableOperation(
            visibleOperations[index],
            operation,
          )
        }
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

function styleDrawableOperation(
  operation: DrawableOperation,
  styleOperation: StyleOperation,
): DrawableOperation {
  if (operation.type === "text") {
    const nextFontSize = styleOperation.fontSize

    if (typeof nextFontSize !== "number" || !Number.isFinite(nextFontSize)) {
      return operation
    }

    const fontSize = Math.max(1, nextFontSize)
    const scale = fontSize / operation.fontSize

    return {
      ...operation,
      fontSize,
      width:
        typeof operation.width === "number" && Number.isFinite(operation.width)
          ? Math.max(MIN_RESIZE_SIZE, operation.width * scale)
          : undefined,
      height:
        typeof operation.height === "number" &&
        Number.isFinite(operation.height)
          ? Math.max(MIN_RESIZE_SIZE, operation.height * scale)
          : undefined,
    }
  }

  const nextBrushSize = styleOperation.brushSize

  return typeof nextBrushSize === "number" && Number.isFinite(nextBrushSize)
    ? {
        ...operation,
        brushSize: Math.max(1, nextBrushSize),
      }
    : operation
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

  if (operation.type === "text") {
    return {
      ...operation,
      point: movePoint(operation.point, delta),
    }
  }

  return {
    ...operation,
    startPoint: movePoint(operation.startPoint, delta),
    endPoint: movePoint(operation.endPoint, delta),
  }
}

function resizePoint(
  point: WhiteboardPoint,
  origin: WhiteboardPoint,
  scaleX: number,
  scaleY: number,
) {
  return {
    x: origin.x + (point.x - origin.x) * scaleX,
    y: origin.y + (point.y - origin.y) * scaleY,
  }
}

function resizePointInRotatedSpace({
  point,
  origin,
  startPoint,
  currentPoint,
  rotation,
}: {
  point: WhiteboardPoint
  origin: WhiteboardPoint
  startPoint: WhiteboardPoint
  currentPoint: WhiteboardPoint
  rotation: number
}) {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const xAxis = { x: cos, y: sin }
  const yAxis = { x: -sin, y: cos }
  const toLocal = (worldPoint: WhiteboardPoint) => {
    const vector = {
      x: worldPoint.x - origin.x,
      y: worldPoint.y - origin.y,
    }

    return {
      x: vector.x * xAxis.x + vector.y * xAxis.y,
      y: vector.x * yAxis.x + vector.y * yAxis.y,
    }
  }
  const fromLocal = (localPoint: WhiteboardPoint) => ({
    x: origin.x + localPoint.x * xAxis.x + localPoint.y * yAxis.x,
    y: origin.y + localPoint.x * xAxis.y + localPoint.y * yAxis.y,
  })
  const startLocal = toLocal(startPoint)
  const currentLocal = toLocal(currentPoint)
  const scaleX =
    Math.abs(startLocal.x) < 0.001 ? 1 : currentLocal.x / startLocal.x
  const scaleY =
    Math.abs(startLocal.y) < 0.001 ? 1 : currentLocal.y / startLocal.y
  const localPoint = toLocal(point)

  return fromLocal({
    x: localPoint.x * scaleX,
    y: localPoint.y * scaleY,
  })
}

function getRotatedResizeBox({
  origin,
  currentPoint,
  handle,
  rotation,
}: {
  origin: WhiteboardPoint
  currentPoint: WhiteboardPoint
  handle: SelectionResizeHandle
  rotation: number
}) {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const xAxis = { x: cos, y: sin }
  const yAxis = { x: -sin, y: cos }
  const vector = {
    x: currentPoint.x - origin.x,
    y: currentPoint.y - origin.y,
  }
  const localVector = {
    x: vector.x * xAxis.x + vector.y * xAxis.y,
    y: vector.x * yAxis.x + vector.y * yAxis.y,
  }
  const widthSign = handle.includes("e") ? 1 : -1
  const heightSign = handle.includes("s") ? 1 : -1
  const width = Math.max(MIN_RESIZE_SIZE, localVector.x * widthSign)
  const height = Math.max(MIN_RESIZE_SIZE, localVector.y * heightSign)
  const fixedHandle = getOppositeSelectionHandle(handle)
  const fixedLocalPoint = {
    x: fixedHandle.includes("e") ? width / 2 : -width / 2,
    y: fixedHandle.includes("s") ? height / 2 : -height / 2,
  }
  const rotatedFixedLocalPoint = {
    x: fixedLocalPoint.x * xAxis.x + fixedLocalPoint.y * yAxis.x,
    y: fixedLocalPoint.x * xAxis.y + fixedLocalPoint.y * yAxis.y,
  }

  return {
    center: {
      x: origin.x - rotatedFixedLocalPoint.x,
      y: origin.y - rotatedFixedLocalPoint.y,
    },
    width,
    height,
  }
}

function resizeDrawableOperation(
  operation: DrawableOperation,
  resizeOperation: ResizeOperation,
): DrawableOperation {
  const { origin, scaleX, scaleY } = resizeOperation

  if (operation.type === "stroke") {
    if (
      resizeOperation.handle &&
      resizeOperation.currentPoint &&
      resizeOperation.startPoint &&
      typeof resizeOperation.rotation === "number"
    ) {
      return {
        ...operation,
        rotation: resizeOperation.rotation,
        points: operation.points.map((point) =>
          resizePointInRotatedSpace({
            point,
            origin,
            startPoint: resizeOperation.startPoint as WhiteboardPoint,
            currentPoint: resizeOperation.currentPoint as WhiteboardPoint,
            rotation: resizeOperation.rotation as number,
          }),
        ),
      }
    }

    return {
      ...operation,
      rotation: undefined,
      points: operation.points.map((point) =>
        resizePoint(point, origin, scaleX, scaleY),
      ),
    }
  }

  if (operation.type === "text") {
    const currentWidth =
      typeof operation.width === "number" && Number.isFinite(operation.width)
        ? operation.width
        : Math.max(1, operation.text.length) * operation.fontSize * 0.58
    const currentHeight =
      typeof operation.height === "number" && Number.isFinite(operation.height)
        ? operation.height
        : Math.max(1, operation.text.split("\n").length) *
          getTextLineHeight(operation.fontSize)
    const nextWidth = Math.max(MIN_RESIZE_SIZE, Math.abs(currentWidth * scaleX))
    const nextHeight = Math.max(
      MIN_RESIZE_SIZE,
      Math.abs(currentHeight * scaleY),
    )
    const rotation = operation.rotation ?? 0

    if (resizeOperation.handle && resizeOperation.currentPoint && rotation) {
      const box = getRotatedResizeBox({
        origin: resizeOperation.origin,
        currentPoint: resizeOperation.currentPoint,
        handle: resizeOperation.handle,
        rotation,
      })

      return {
        ...operation,
        point: {
          x: box.center.x - box.width / 2,
          y: box.center.y - box.height / 2,
        },
        width: box.width,
        height: box.height,
      }
    }

    if (resizeOperation.handle) {
      const fixedRight = operation.point.x + currentWidth
      const fixedBottom = operation.point.y + currentHeight
      const point = {
        x: resizeOperation.handle.includes("w")
          ? fixedRight - nextWidth
          : operation.point.x,
        y: resizeOperation.handle.includes("n")
          ? fixedBottom - nextHeight
          : operation.point.y,
      }

      return {
        ...operation,
        point,
        width: nextWidth,
        height: nextHeight,
      }
    }

    return {
      ...operation,
      point: resizePoint(operation.point, origin, scaleX, scaleY),
      width: nextWidth,
      height: nextHeight,
    }
  }

  if (
    operation.tool === "line" &&
    resizeOperation.handle &&
    resizeOperation.currentPoint
  ) {
    const fixedPoint = resizeOperation.handle.includes("e")
      ? operation.startPoint
      : operation.endPoint
    const movingPoint = resizeOperation.handle.includes("e")
      ? operation.endPoint
      : operation.startPoint
    const axis = {
      x: movingPoint.x - fixedPoint.x,
      y: movingPoint.y - fixedPoint.y,
    }
    const length = Math.hypot(axis.x, axis.y)

    if (length < 0.001) {
      return operation
    }

    const unit = {
      x: axis.x / length,
      y: axis.y / length,
    }
    const draggedVector = {
      x: resizeOperation.currentPoint.x - fixedPoint.x,
      y: resizeOperation.currentPoint.y - fixedPoint.y,
    }
    const projectedLength = Math.max(
      MIN_RESIZE_SIZE,
      draggedVector.x * unit.x + draggedVector.y * unit.y,
    )
    const nextMovingPoint = {
      x: fixedPoint.x + unit.x * projectedLength,
      y: fixedPoint.y + unit.y * projectedLength,
    }

    return {
      ...operation,
      startPoint: resizeOperation.handle.includes("e")
        ? fixedPoint
        : nextMovingPoint,
      endPoint: resizeOperation.handle.includes("e")
        ? nextMovingPoint
        : fixedPoint,
    }
  }

  if (
    operation.tool !== "line" &&
    resizeOperation.handle &&
    resizeOperation.currentPoint &&
    operation.rotation
  ) {
    const box = getRotatedResizeBox({
      origin: resizeOperation.origin,
      currentPoint: resizeOperation.currentPoint,
      handle: resizeOperation.handle,
      rotation: operation.rotation,
    })

    return {
      ...operation,
      startPoint: {
        x: box.center.x - box.width / 2,
        y: box.center.y - box.height / 2,
      },
      endPoint: {
        x: box.center.x + box.width / 2,
        y: box.center.y + box.height / 2,
      },
    }
  }

  return {
    ...operation,
    startPoint: resizePoint(operation.startPoint, origin, scaleX, scaleY),
    endPoint: resizePoint(operation.endPoint, origin, scaleX, scaleY),
  }
}

function rotatePoint(
  point: WhiteboardPoint,
  origin: WhiteboardPoint,
  angle: number,
) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const x = point.x - origin.x
  const y = point.y - origin.y

  return {
    x: origin.x + x * cos - y * sin,
    y: origin.y + x * sin + y * cos,
  }
}

function getRotatedBounds(bounds: OperationBounds, angle = 0) {
  if (angle === 0) {
    return bounds
  }

  const center = getBoundsCenter(bounds)
  const points = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ].map((point) => rotatePoint(point, center, angle))

  return getBoundsFromPointList(points)
}

function translateBoundsToRotatedCenter(
  bounds: OperationBounds,
  origin: WhiteboardPoint,
  angle: number,
) {
  const center = getBoundsCenter(bounds)
  const nextCenter = rotatePoint(center, origin, angle)

  return {
    x: nextCenter.x - center.x,
    y: nextCenter.y - center.y,
  }
}

function getFallbackTextDimensions(operation: TextOperation) {
  return {
    width:
      typeof operation.width === "number" && Number.isFinite(operation.width)
        ? operation.width
        : Math.max(1, operation.text.length) * operation.fontSize * 0.58,
    height:
      typeof operation.height === "number" && Number.isFinite(operation.height)
        ? operation.height
        : Math.max(1, operation.text.split("\n").length) *
          getTextLineHeight(operation.fontSize),
  }
}

function rotateDrawableOperation(
  operation: DrawableOperation,
  rotateOperation: RotateOperation,
): DrawableOperation {
  const { origin, angle } = rotateOperation

  if (operation.type === "stroke") {
    const nextRotation =
      (typeof operation.rotation === "number"
        ? operation.rotation
        : getOrientedAngleFromPoints(operation.points)) + angle

    return {
      ...operation,
      rotation: nextRotation,
      points: operation.points.map((point) =>
        rotatePoint(point, origin, angle),
      ),
    }
  }

  if (operation.type === "text") {
    const dimensions = getFallbackTextDimensions(operation)
    const bounds = {
      left: operation.point.x,
      right: operation.point.x + dimensions.width,
      top: operation.point.y,
      bottom: operation.point.y + dimensions.height,
    }
    const delta = translateBoundsToRotatedCenter(bounds, origin, angle)

    return {
      ...operation,
      point: movePoint(operation.point, delta),
      rotation: (operation.rotation ?? 0) + angle,
    }
  }

  if (operation.tool !== "line") {
    const bounds = getBoundsFromPoints(operation.startPoint, operation.endPoint)
    const delta = translateBoundsToRotatedCenter(bounds, origin, angle)

    return {
      ...operation,
      startPoint: movePoint(operation.startPoint, delta),
      endPoint: movePoint(operation.endPoint, delta),
      rotation: (operation.rotation ?? 0) + angle,
    }
  }

  return {
    ...operation,
    startPoint: rotatePoint(operation.startPoint, origin, angle),
    endPoint: rotatePoint(operation.endPoint, origin, angle),
  }
}

function getUnrotatedTextOperationBounds(
  operation: TextOperation,
  canvas: HTMLCanvasElement,
): OperationBounds | null {
  const context = canvas.getContext("2d")
  if (!context) return null

  const point = denormalizePoint(operation.point, canvas)
  const dimensions = getTextDimensions(context, operation)
  return {
    left: point.x,
    right: point.x + dimensions.width,
    top: point.y,
    bottom: point.y + dimensions.height,
  }
}

function getTextOperationBounds(
  operation: TextOperation,
  canvas: HTMLCanvasElement,
): OperationBounds | null {
  const bounds = getUnrotatedTextOperationBounds(operation, canvas)

  return bounds ? getRotatedBounds(bounds, operation.rotation) : null
}

function getOperationBounds(
  operation: DrawableOperation,
  canvas: HTMLCanvasElement,
): OperationBounds | null {
  if (operation.type === "shape") {
    const startPoint = denormalizePoint(operation.startPoint, canvas)
    const endPoint = denormalizePoint(operation.endPoint, canvas)

    const bounds = {
      left: Math.min(startPoint.x, endPoint.x),
      right: Math.max(startPoint.x, endPoint.x),
      top: Math.min(startPoint.y, endPoint.y),
      bottom: Math.max(startPoint.y, endPoint.y),
    }

    return getRotatedBounds(
      bounds,
      operation.tool === "line" ? 0 : operation.rotation,
    )
  }

  if (operation.type === "text") {
    return getTextOperationBounds(operation, canvas)
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

function mergeBounds(
  first: OperationBounds | null,
  second: OperationBounds | null,
) {
  if (!first) {
    return second
  }

  if (!second) {
    return first
  }

  return {
    left: Math.min(first.left, second.left),
    right: Math.max(first.right, second.right),
    top: Math.min(first.top, second.top),
    bottom: Math.max(first.bottom, second.bottom),
  }
}

function getSelectionBounds(
  operationsToMeasure: DrawableOperation[],
  canvas: HTMLCanvasElement,
) {
  return operationsToMeasure.reduce<OperationBounds | null>(
    (bounds, operation) =>
      mergeBounds(bounds, getOperationBounds(operation, canvas)),
    null,
  )
}

function getBoundsFromPoints(
  firstPoint: WhiteboardPoint,
  secondPoint: WhiteboardPoint,
): OperationBounds {
  return {
    left: Math.min(firstPoint.x, secondPoint.x),
    right: Math.max(firstPoint.x, secondPoint.x),
    top: Math.min(firstPoint.y, secondPoint.y),
    bottom: Math.max(firstPoint.y, secondPoint.y),
  }
}

function getBoundsFromPointList(points: WhiteboardPoint[]): OperationBounds {
  return points.reduce(
    (bounds, point) => ({
      left: Math.min(bounds.left, point.x),
      right: Math.max(bounds.right, point.x),
      top: Math.min(bounds.top, point.y),
      bottom: Math.max(bounds.bottom, point.y),
    }),
    {
      left: points[0].x,
      right: points[0].x,
      top: points[0].y,
      bottom: points[0].y,
    },
  )
}

function boundsIntersect(first: OperationBounds, second: OperationBounds) {
  return (
    first.left <= second.right &&
    first.right >= second.left &&
    first.top <= second.bottom &&
    first.bottom >= second.top
  )
}

function boundsContainPoint(
  bounds: OperationBounds,
  point: WhiteboardPoint,
  padding = 0,
) {
  return (
    point.x >= bounds.left - padding &&
    point.x <= bounds.right + padding &&
    point.y >= bounds.top - padding &&
    point.y <= bounds.bottom + padding
  )
}

function drawSelectionOutline(
  ctx: CanvasRenderingContext2D,
  bounds: OperationBounds,
) {
  const padding = SELECTION_OUTLINE_PADDING
  const handleSize = SELECTION_HANDLE_SIZE
  const left = bounds.left - padding
  const top = bounds.top - padding
  const width = Math.max(1, bounds.right - bounds.left + padding * 2)
  const height = Math.max(1, bounds.bottom - bounds.top + padding * 2)
  const rotateHandle = {
    x: left + width / 2,
    y: top - ROTATE_HANDLE_DISTANCE,
  }
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
  ctx.beginPath()
  ctx.moveTo(left + width / 2, top)
  ctx.lineTo(rotateHandle.x, rotateHandle.y)
  ctx.stroke()
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

  ctx.beginPath()
  ctx.arc(rotateHandle.x, rotateHandle.y, ROTATE_HANDLE_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.restore()
}

function drawRotatedSelectionOutline(
  ctx: CanvasRenderingContext2D,
  handlePoints: Record<SelectionResizeHandle, WhiteboardPoint>,
) {
  const handleSize = SELECTION_HANDLE_SIZE
  const topCenter = getHandlePointsTopCenter(handlePoints)
  const rotateHandle = getHandlePointsRotateHandlePoint(handlePoints)

  ctx.save()
  ctx.globalCompositeOperation = "source-over"
  ctx.setLineDash([6, 4])
  ctx.strokeStyle = "#2563eb"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(handlePoints.nw.x, handlePoints.nw.y)
  ctx.lineTo(handlePoints.ne.x, handlePoints.ne.y)
  ctx.lineTo(handlePoints.se.x, handlePoints.se.y)
  ctx.lineTo(handlePoints.sw.x, handlePoints.sw.y)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(topCenter.x, topCenter.y)
  ctx.lineTo(rotateHandle.x, rotateHandle.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = "#ffffff"

  for (const point of Object.values(handlePoints)) {
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

  ctx.beginPath()
  ctx.arc(rotateHandle.x, rotateHandle.y, ROTATE_HANDLE_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.restore()
}

function getSelectionHandlePoints(bounds: OperationBounds) {
  const padding = SELECTION_OUTLINE_PADDING
  const left = bounds.left - padding
  const top = bounds.top - padding
  const right = bounds.right + padding
  const bottom = bounds.bottom + padding

  return {
    nw: { x: left, y: top },
    ne: { x: right, y: top },
    sw: { x: left, y: bottom },
    se: { x: right, y: bottom },
  } satisfies Record<SelectionResizeHandle, WhiteboardPoint>
}

function getResizeHandlePoints(bounds: OperationBounds) {
  return {
    nw: { x: bounds.left, y: bounds.top },
    ne: { x: bounds.right, y: bounds.top },
    sw: { x: bounds.left, y: bounds.bottom },
    se: { x: bounds.right, y: bounds.bottom },
  } satisfies Record<SelectionResizeHandle, WhiteboardPoint>
}

function getRotateHandlePoint(bounds: OperationBounds) {
  const padding = SELECTION_OUTLINE_PADDING

  return {
    x: bounds.left + (bounds.right - bounds.left) / 2,
    y: bounds.top - padding - ROTATE_HANDLE_DISTANCE,
  }
}

function getHandlePointsCenter(
  handlePoints: Record<SelectionResizeHandle, WhiteboardPoint>,
) {
  return {
    x:
      (handlePoints.nw.x +
        handlePoints.ne.x +
        handlePoints.sw.x +
        handlePoints.se.x) /
      4,
    y:
      (handlePoints.nw.y +
        handlePoints.ne.y +
        handlePoints.sw.y +
        handlePoints.se.y) /
      4,
  }
}

function getHandlePointsTopCenter(
  handlePoints: Record<SelectionResizeHandle, WhiteboardPoint>,
) {
  return {
    x: (handlePoints.nw.x + handlePoints.ne.x) / 2,
    y: (handlePoints.nw.y + handlePoints.ne.y) / 2,
  }
}

function getHandlePointsRotateHandlePoint(
  handlePoints: Record<SelectionResizeHandle, WhiteboardPoint>,
) {
  const topCenter = getHandlePointsTopCenter(handlePoints)
  const center = getHandlePointsCenter(handlePoints)
  const outward = {
    x: topCenter.x - center.x,
    y: topCenter.y - center.y,
  }
  const outwardLength = Math.hypot(outward.x, outward.y)

  if (outwardLength >= 0.001) {
    return {
      x: topCenter.x + (outward.x / outwardLength) * ROTATE_HANDLE_DISTANCE,
      y: topCenter.y + (outward.y / outwardLength) * ROTATE_HANDLE_DISTANCE,
    }
  }

  const topEdge = {
    x: handlePoints.ne.x - handlePoints.nw.x,
    y: handlePoints.ne.y - handlePoints.nw.y,
  }
  const edgeLength = Math.hypot(topEdge.x, topEdge.y)

  if (edgeLength < 0.001) {
    return {
      x: topCenter.x,
      y: topCenter.y - ROTATE_HANDLE_DISTANCE,
    }
  }

  return {
    x: topCenter.x + (topEdge.y / edgeLength) * ROTATE_HANDLE_DISTANCE,
    y: topCenter.y - (topEdge.x / edgeLength) * ROTATE_HANDLE_DISTANCE,
  }
}

function getOppositeSelectionHandle(handle: SelectionResizeHandle) {
  const opposite = {
    nw: "se",
    ne: "sw",
    sw: "ne",
    se: "nw",
  } satisfies Record<SelectionResizeHandle, SelectionResizeHandle>

  return opposite[handle]
}

function getSelectionHandleAtPoint(
  bounds: OperationBounds,
  point: WhiteboardPoint,
): SelectionResizeHandle | null {
  return getHandleAtPoint(getSelectionHandlePoints(bounds), point)
}

function getHandleAtPoint(
  handles: Record<SelectionResizeHandle, WhiteboardPoint>,
  point: WhiteboardPoint,
): SelectionResizeHandle | null {
  const radius = Math.max(SELECTION_HANDLE_SIZE, 8)

  for (const [handle, handlePoint] of Object.entries(handles)) {
    if (
      Math.abs(point.x - handlePoint.x) <= radius &&
      Math.abs(point.y - handlePoint.y) <= radius
    ) {
      return handle as SelectionResizeHandle
    }
  }

  return null
}

function getOrientedAngleFromPoints(points: WhiteboardPoint[]) {
  const mean = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  )
  const covariance = points.reduce(
    (sum, point) => {
      const x = point.x - mean.x
      const y = point.y - mean.y

      return {
        xx: sum.xx + x * x,
        xy: sum.xy + x * y,
        yy: sum.yy + y * y,
      }
    },
    { xx: 0, xy: 0, yy: 0 },
  )
  const angle =
    covariance.xx === covariance.yy && covariance.xy === 0
      ? 0
      : 0.5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy)

  return angle
}

function getOrientedHandlePointsFromPoints(
  points: WhiteboardPoint[],
  orientation?: number,
) {
  if (points.length === 0) {
    return null
  }

  if (points.length === 1) {
    const point = points[0]
    const halfSize = MIN_RESIZE_SIZE / 2

    return {
      nw: { x: point.x - halfSize, y: point.y - halfSize },
      ne: { x: point.x + halfSize, y: point.y - halfSize },
      sw: { x: point.x - halfSize, y: point.y + halfSize },
      se: { x: point.x + halfSize, y: point.y + halfSize },
    } satisfies Record<SelectionResizeHandle, WhiteboardPoint>
  }

  const mean = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  )
  const angle = orientation ?? getOrientedAngleFromPoints(points)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const xAxis = { x: cos, y: sin }
  const yAxis = { x: -sin, y: cos }
  const projections = points.map((point) => {
    const vector = {
      x: point.x - mean.x,
      y: point.y - mean.y,
    }

    return {
      x: vector.x * xAxis.x + vector.y * xAxis.y,
      y: vector.x * yAxis.x + vector.y * yAxis.y,
    }
  })
  const initialProjection = projections[0]
  const projectionBounds = projections.reduce(
    (bounds, point) => ({
      left: Math.min(bounds.left, point.x),
      right: Math.max(bounds.right, point.x),
      top: Math.min(bounds.top, point.y),
      bottom: Math.max(bounds.bottom, point.y),
    }),
    {
      left: initialProjection.x,
      right: initialProjection.x,
      top: initialProjection.y,
      bottom: initialProjection.y,
    },
  )
  const width = projectionBounds.right - projectionBounds.left
  const height = projectionBounds.bottom - projectionBounds.top
  const paddedBounds = {
    left:
      width < MIN_RESIZE_SIZE
        ? (projectionBounds.left + projectionBounds.right) / 2 -
          MIN_RESIZE_SIZE / 2
        : projectionBounds.left,
    right:
      width < MIN_RESIZE_SIZE
        ? (projectionBounds.left + projectionBounds.right) / 2 +
          MIN_RESIZE_SIZE / 2
        : projectionBounds.right,
    top:
      height < MIN_RESIZE_SIZE
        ? (projectionBounds.top + projectionBounds.bottom) / 2 -
          MIN_RESIZE_SIZE / 2
        : projectionBounds.top,
    bottom:
      height < MIN_RESIZE_SIZE
        ? (projectionBounds.top + projectionBounds.bottom) / 2 +
          MIN_RESIZE_SIZE / 2
        : projectionBounds.bottom,
  }
  const toWorld = (point: WhiteboardPoint) => ({
    x: mean.x + point.x * xAxis.x + point.y * yAxis.x,
    y: mean.y + point.x * xAxis.y + point.y * yAxis.y,
  })

  return {
    nw: toWorld({ x: paddedBounds.left, y: paddedBounds.top }),
    ne: toWorld({ x: paddedBounds.right, y: paddedBounds.top }),
    sw: toWorld({ x: paddedBounds.left, y: paddedBounds.bottom }),
    se: toWorld({ x: paddedBounds.right, y: paddedBounds.bottom }),
  } satisfies Record<SelectionResizeHandle, WhiteboardPoint>
}

function getOperationHandlePoints(
  operation: DrawableOperation,
  canvas: HTMLCanvasElement,
) {
  if (operation.type === "stroke") {
    return getOrientedHandlePointsFromPoints(
      operation.points.map((point) => denormalizePoint(point, canvas)),
      operation.rotation,
    )
  }

  if (operation.type === "shape" && operation.tool === "line") {
    const startPoint = denormalizePoint(operation.startPoint, canvas)
    const endPoint = denormalizePoint(operation.endPoint, canvas)
    const axis = {
      x: endPoint.x - startPoint.x,
      y: endPoint.y - startPoint.y,
    }
    const length = Math.hypot(axis.x, axis.y)

    if (length < 0.001) {
      return getOrientedHandlePointsFromPoints([startPoint])
    }

    const normal = {
      x: (-axis.y / length) * MIN_RESIZE_SIZE * 0.5,
      y: (axis.x / length) * MIN_RESIZE_SIZE * 0.5,
    }

    return {
      nw: { x: startPoint.x + normal.x, y: startPoint.y + normal.y },
      sw: { x: startPoint.x - normal.x, y: startPoint.y - normal.y },
      ne: { x: endPoint.x + normal.x, y: endPoint.y + normal.y },
      se: { x: endPoint.x - normal.x, y: endPoint.y - normal.y },
    } satisfies Record<SelectionResizeHandle, WhiteboardPoint>
  }

  const bounds =
    operation.type === "text"
      ? getUnrotatedTextOperationBounds(operation, canvas)
      : getBoundsFromPoints(
          denormalizePoint(operation.startPoint, canvas),
          denormalizePoint(operation.endPoint, canvas),
        )

  if (!bounds) {
    return null
  }

  const center = getBoundsCenter(bounds)
  const rotation = operation.rotation ?? 0

  return {
    nw: rotatePoint({ x: bounds.left, y: bounds.top }, center, rotation),
    ne: rotatePoint({ x: bounds.right, y: bounds.top }, center, rotation),
    sw: rotatePoint({ x: bounds.left, y: bounds.bottom }, center, rotation),
    se: rotatePoint({ x: bounds.right, y: bounds.bottom }, center, rotation),
  } satisfies Record<SelectionResizeHandle, WhiteboardPoint>
}

function hitsRotateHandle(bounds: OperationBounds, point: WhiteboardPoint) {
  return (
    getDistance(getRotateHandlePoint(bounds), point) <= ROTATE_HANDLE_RADIUS + 4
  )
}

function hitsHandlePointsRotateHandle(
  handlePoints: Record<SelectionResizeHandle, WhiteboardPoint>,
  point: WhiteboardPoint,
) {
  return (
    getDistance(getHandlePointsRotateHandlePoint(handlePoints), point) <=
    ROTATE_HANDLE_RADIUS + 4
  )
}

function getBoundsCenter(bounds: OperationBounds): WhiteboardPoint {
  return {
    x: bounds.left + (bounds.right - bounds.left) / 2,
    y: bounds.top + (bounds.bottom - bounds.top) / 2,
  }
}

function getResizeOperationFromHandle({
  bounds,
  currentPoint,
  handle,
  targetIds,
  id,
}: {
  bounds: OperationBounds
  currentPoint: WhiteboardPoint
  handle: SelectionResizeHandle
  targetIds: string[]
  id: string
}): ResizeOperation {
  const handles = getResizeHandlePoints(bounds)
  const originPoint = handles[getOppositeSelectionHandle(handle)]
  const startPoint = handles[handle]
  const minWidth =
    startPoint.x >= originPoint.x ? MIN_RESIZE_SIZE : -MIN_RESIZE_SIZE
  const minHeight =
    startPoint.y >= originPoint.y ? MIN_RESIZE_SIZE : -MIN_RESIZE_SIZE
  const clampedPoint = {
    x:
      startPoint.x >= originPoint.x
        ? Math.max(currentPoint.x, originPoint.x + minWidth)
        : Math.min(currentPoint.x, originPoint.x + minWidth),
    y:
      startPoint.y >= originPoint.y
        ? Math.max(currentPoint.y, originPoint.y + minHeight)
        : Math.min(currentPoint.y, originPoint.y + minHeight),
  }
  const width = startPoint.x - originPoint.x
  const height = startPoint.y - originPoint.y

  return {
    id,
    type: "resize",
    targetIds,
    origin: originPoint,
    scaleX: width === 0 ? 1 : (clampedPoint.x - originPoint.x) / width,
    scaleY: height === 0 ? 1 : (clampedPoint.y - originPoint.y) / height,
    handle,
    currentPoint: clampedPoint,
  }
}

function getResizeOperationFromHandlePoints({
  handlePoints,
  currentPoint,
  handle,
  targetIds,
  id,
}: {
  handlePoints: Record<SelectionResizeHandle, WhiteboardPoint>
  currentPoint: WhiteboardPoint
  handle: SelectionResizeHandle
  targetIds: string[]
  id: string
}): ResizeOperation {
  const originPoint = handlePoints[getOppositeSelectionHandle(handle)]
  const startPoint = handlePoints[handle]
  const width = startPoint.x - originPoint.x
  const height = startPoint.y - originPoint.y
  const topEdge = {
    x: handlePoints.ne.x - handlePoints.nw.x,
    y: handlePoints.ne.y - handlePoints.nw.y,
  }
  const rotation = Math.atan2(topEdge.y, topEdge.x)

  return {
    id,
    type: "resize",
    targetIds,
    origin: originPoint,
    scaleX: width === 0 ? 1 : (currentPoint.x - originPoint.x) / width,
    scaleY: height === 0 ? 1 : (currentPoint.y - originPoint.y) / height,
    handle,
    currentPoint,
    startPoint,
    rotation,
  }
}

function drawMarqueeOutline(
  ctx: CanvasRenderingContext2D,
  bounds: OperationBounds,
) {
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top

  ctx.save()
  ctx.globalCompositeOperation = "source-over"
  ctx.fillStyle = "rgba(37, 99, 235, 0.08)"
  ctx.strokeStyle = "#2563eb"
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.fillRect(bounds.left, bounds.top, width, height)
  ctx.strokeRect(bounds.left, bounds.top, width, height)
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
  const rotation = operation.rotation ?? 0
  const hitPoint =
    rotation === 0
      ? point
      : rotatePoint(
          point,
          getBoundsCenter({ left, right, top, bottom }),
          -rotation,
        )

  if (
    hitPoint.x < left - threshold ||
    hitPoint.x > right + threshold ||
    hitPoint.y < top - threshold ||
    hitPoint.y > bottom + threshold
  ) {
    return false
  }

  if (operation.tool === "rect") {
    if (includeInterior) {
      return true
    }

    const distanceToEdge = Math.min(
      Math.abs(hitPoint.x - left),
      Math.abs(hitPoint.x - right),
      Math.abs(hitPoint.y - top),
      Math.abs(hitPoint.y - bottom),
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
    return getDistance(hitPoint, center) <= threshold
  }

  const normalizedDistance = Math.hypot(
    (hitPoint.x - center.x) / radiusX,
    (hitPoint.y - center.y) / radiusY,
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
  if (operation.type === "text") {
    const bounds = getUnrotatedTextOperationBounds(operation, canvas)
    const rotation = operation.rotation ?? 0
    const hitPoint =
      bounds && rotation !== 0
        ? rotatePoint(point, getBoundsCenter(bounds), -rotation)
        : point

    return bounds ? boundsContainPoint(bounds, hitPoint, radius) : false
  }

  return operation.type === "stroke"
    ? hitsStroke(operation, point, canvas, radius)
    : hitsShape(operation, point, canvas, radius, includeShapeInterior)
}

function useResolvedDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    function readDarkMode() {
      setIsDarkMode(
        document.documentElement.classList.contains("dark") ||
          document.body.classList.contains("dark") ||
          document.documentElement.dataset.theme === "dark",
      )
    }

    readDarkMode()

    const observer = new MutationObserver(readDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })

    return () => observer.disconnect()
  }, [])

  return isDarkMode
}

export function useWhiteboard({
  isTeacher,
  currentUserId,
  boardId,
  incomingMessages,
  participantCount,
  overlayActive,
  overlayAspectRatio,
  resetKey,
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
  const [, setViewportVersion] = useState(0)
  const isDarkMode = useResolvedDarkMode()
  const viewportRef = useRef<WhiteboardViewport>(
    whiteboardViewportCache.get(boardId) ?? { ...DEFAULT_VIEWPORT },
  )
  const viewportSyncFrame = useRef<number | null>(null)
  const isDrawingRef = useRef(false)
  const lastPos = useRef<WhiteboardPoint | null>(null)
  const startPos = useRef<WhiteboardPoint | null>(null)
  const previewSnapshot = useRef<ImageData | null>(null)
  const selectedOperationIds = useRef(new Set<string>())
  const movingOperationIds = useRef<string[]>([])
  const resizingOperationIds = useRef<string[]>([])
  const resizeStartBounds = useRef<OperationBounds | null>(null)
  const resizeStartHandlePoints = useRef<Record<
    SelectionResizeHandle,
    WhiteboardPoint
  > | null>(null)
  const activeResizeHandle = useRef<SelectionResizeHandle | null>(null)
  const resizePointerOffset = useRef<WhiteboardPoint>({ x: 0, y: 0 })
  const rotatingOperationIds = useRef<string[]>([])
  const rotateOrigin = useRef<WhiteboardPoint | null>(null)
  const rotateStartAngle = useRef<number | null>(null)
  const marqueeStartPos = useRef<WhiteboardPoint | null>(null)
  const marqueeBaseSelectionIds = useRef<string[]>([])
  const activeStrokeId = useRef<string | null>(null)
  const activeStrokePoints = useRef<WhiteboardPoint[]>([])
  const pendingStrokePoints = useRef<WhiteboardPoint[]>([])
  const strokeFlushFrame = useRef<number | null>(null)
  const processedMessageIds = useRef(new Set<string>())
  const remoteStrokes = useRef(new Map<string, RemoteStroke>())
  const boardStates = useRef(new Map<string, BoardState>())
  const activeBoardId = useRef(boardId)
  const lastParticipantCount = useRef(participantCount)
  const lastResetKey = useRef(resetKey)
  const stateRequested = useRef(new Set<string>())
  const stateRequestIds = useRef(new Map<string, string>())
  const stateResponseTimers = useRef(new Set<number>())
  const operations = useRef<WhiteboardOperation[]>([])
  const redoOperations = useRef<WhiteboardOperation[]>([])
  const boardVersion = useRef(0)

  const clearStateResponseTimers = useCallback(() => {
    for (const timerId of stateResponseTimers.current) {
      window.clearTimeout(timerId)
    }
    stateResponseTimers.current.clear()
  }, [])

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

    drawBoardBackground(
      context.canvas,
      context.ctx,
      overlayActive,
      overlayAspectRatio,
      isDarkMode,
      overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
    )
  }, [getContext, isDarkMode, overlayActive, overlayAspectRatio])

  const renderOperations = useCallback(
    (nextOperations: WhiteboardOperation[]) => {
      const context = getContext()

      if (!context) {
        return
      }

      drawBoardBackground(
        context.canvas,
        context.ctx,
        overlayActive,
        overlayAspectRatio,
        isDarkMode,
        overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
      )
      applyViewportTransform(
        context.ctx,
        overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
      )

      const visibleOperations = getVisibleDrawableOperations(nextOperations)

      for (const operation of visibleOperations) {
        if (operation.type === "text") {
          drawTextOperation(context.ctx, context.canvas, operation)
          continue
        }

        if (operation.type === "shape") {
          drawShapeOperation(context.ctx, context.canvas, operation)
          continue
        }

        drawStrokeOperation(context.ctx, context.canvas, operation)
      }

      if (selectedOperationIds.current.size > 0) {
        const selectedOperations = visibleOperations.filter((operation) =>
          selectedOperationIds.current.has(operation.id),
        )
        const bounds = getSelectionBounds(selectedOperations, context.canvas)

        if (bounds) {
          const operationHandlePoints =
            selectedOperations.length === 1
              ? getOperationHandlePoints(selectedOperations[0], context.canvas)
              : null

          if (operationHandlePoints) {
            drawRotatedSelectionOutline(context.ctx, operationHandlePoints)
          } else {
            drawSelectionOutline(context.ctx, bounds)
          }
        }
      }

      context.ctx.globalCompositeOperation = "source-over"
      resetViewportTransform(context.ctx)
    },
    [getContext, isDarkMode, overlayActive, overlayAspectRatio],
  )

  const handleActiveToolChange = useCallback(
    (tool: Tool) => {
      setActiveTool(tool)

      if (!isPointerTool(tool) && selectedOperationIds.current.size > 0) {
        selectedOperationIds.current = new Set()
        setHasSelection(false)
        renderOperations(operations.current)
      }
    },
    [renderOperations],
  )

  const getScreenPos = (
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top

    return {
      x: Math.min(Math.max(x * (canvas.width / rect.width), 0), canvas.width),
      y: Math.min(
        Math.max(y * (canvas.height / rect.height), 0),
        canvas.height,
      ),
    }
  }

  const getPos = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const screenPoint = getScreenPos(event.clientX, event.clientY, canvas)

    return overlayActive
      ? screenPoint
      : normalizePoint(screenPoint, canvas, viewportRef.current)
  }

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    if (!isTeacher || overlayActive) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    event.preventDefault()

    const viewport = viewportRef.current
    const screenPoint = getScreenPos(event.clientX, event.clientY, canvas)

    if (event.ctrlKey || event.metaKey) {
      const worldPoint = normalizePoint(screenPoint, canvas, viewport)
      const nextScale = clampViewportScale(
        viewport.scale * Math.exp(-event.deltaY * 0.002),
      )

      applyViewport(
        {
          x: worldPoint.x - screenPoint.x / nextScale,
          y: worldPoint.y - screenPoint.y / nextScale,
          scale: nextScale,
        },
        { broadcast: true },
      )
      return
    }

    applyViewport(
      {
        x: viewport.x + event.deltaX / viewport.scale,
        y: viewport.y + event.deltaY / viewport.scale,
        scale: viewport.scale,
      },
      { broadcast: true },
    )
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
          boardId,
          ...message,
        } as LiveSessionWhiteboardMessagePayload,
        options,
      )
    },
    [boardId, currentUserId, sendMessage, syncEnabled],
  )

  const applyViewport = useCallback(
    (viewport: WhiteboardViewport, options?: { broadcast?: boolean }) => {
      if (overlayActive || !isFiniteViewport(viewport)) {
        return
      }

      viewportRef.current = {
        x: viewport.x,
        y: viewport.y,
        scale: clampViewportScale(viewport.scale),
      }
      whiteboardViewportCache.set(boardId, viewportRef.current)
      setViewportVersion((version) => version + 1)
      renderOperations(operations.current)

      if (!options?.broadcast || !isTeacher) {
        return
      }

      if (viewportSyncFrame.current !== null) {
        cancelAnimationFrame(viewportSyncFrame.current)
      }

      viewportSyncFrame.current = requestAnimationFrame(() => {
        viewportSyncFrame.current = null
        sendWhiteboardMessage(
          {
            type: "viewport",
            viewport: viewportRef.current,
          },
          { reliable: false },
        )
      })
    },
    [
      boardId,
      isTeacher,
      overlayActive,
      renderOperations,
      sendWhiteboardMessage,
    ],
  )

  const sendStateSync = useCallback(
    (requestId?: string) => {
      sendWhiteboardMessage(
        {
          type: "state:sync",
          ...(requestId ? { requestId } : {}),
          version: boardVersion.current,
          operations: getStateSyncOperations(operations.current),
          ...(!overlayActive ? { viewport: viewportRef.current } : {}),
        },
        { reliable: true },
      )
    },
    [overlayActive, sendWhiteboardMessage],
  )

  const commitOperation = useCallback((operation: WhiteboardOperation) => {
    operations.current = [...operations.current, operation]
    redoOperations.current = []
    setRedoCount(0)
    boardVersion.current += 1
    return boardVersion.current
  }, [])

  const updateSelection = useCallback(
    (operationIds: Iterable<string>) => {
      selectedOperationIds.current = new Set(operationIds)
      setHasSelection(selectedOperationIds.current.size > 0)
      renderOperations(operations.current)
    },
    [renderOperations],
  )

  const handleBrushSizeChange = useCallback(
    (size: number) => {
      const nextSize = Math.max(1, size)

      setBrushSize(nextSize)

      if (selectedOperationIds.current.size === 0) {
        return
      }

      const selectedIds = selectedOperationIds.current
      const selectedOperations = getVisibleDrawableOperations(
        operations.current,
      ).filter((operation) => selectedIds.has(operation.id))
      const appliesToText = selectedOperations.some(
        (operation) => operation.type === "text",
      )
      const appliesToStrokeOrShape = selectedOperations.some(
        (operation) => operation.type !== "text",
      )

      if (!appliesToText && !appliesToStrokeOrShape) {
        return
      }

      const operation = {
        id: createStyleId(),
        type: "style",
        targetIds: selectedOperations.map((operation) => operation.id),
        ...(appliesToStrokeOrShape ? { brushSize: nextSize } : {}),
        ...(appliesToText ? { fontSize: Math.max(16, nextSize * 6) } : {}),
      } satisfies StyleOperation
      const version = commitOperation(operation)

      renderOperations(operations.current)
      sendWhiteboardMessage(
        {
          type: "style",
          operation,
          version,
        },
        { reliable: true },
      )
    },
    [commitOperation, renderOperations, sendWhiteboardMessage],
  )

  const reconcileSelection = useCallback(
    (nextOperations: WhiteboardOperation[]) => {
      if (selectedOperationIds.current.size === 0) {
        return
      }

      const visibleOperationIds = new Set(
        getVisibleDrawableOperations(nextOperations).map(
          (operation) => operation.id,
        ),
      )
      const nextSelectedOperationIds = new Set(
        Array.from(selectedOperationIds.current).filter((operationId) =>
          visibleOperationIds.has(operationId),
        ),
      )

      if (nextSelectedOperationIds.size !== selectedOperationIds.current.size) {
        selectedOperationIds.current = nextSelectedOperationIds
        setHasSelection(nextSelectedOperationIds.size > 0)
      }
    },
    [],
  )

  const getSelectedOperationIds = useCallback(
    () => Array.from(selectedOperationIds.current),
    [],
  )

  const getOperationsInBounds = useCallback(
    (bounds: OperationBounds, canvas: HTMLCanvasElement) =>
      getVisibleDrawableOperations(operations.current).filter((operation) => {
        const operationBounds = getOperationBounds(operation, canvas)

        return operationBounds && boundsIntersect(bounds, operationBounds)
      }),
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
        updateSelection([])
        return false
      }

      const operation = {
        id: createDeleteId(),
        type: "delete",
        targetId,
      } satisfies DeleteOperation
      const version = commitOperation(operation)

      selectedOperationIds.current = new Set()
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

  const deleteOperationIds = useCallback(
    (targetIds: string[]) => {
      const targetIdSet = new Set(targetIds)
      const visibleTargetIds = getVisibleDrawableOperations(operations.current)
        .filter((operation) => targetIdSet.has(operation.id))
        .map((operation) => operation.id)

      if (visibleTargetIds.length === 0) {
        updateSelection([])
        return false
      }

      if (visibleTargetIds.length === 1) {
        return deleteOperationById(visibleTargetIds[0])
      }

      const operation = {
        id: createDeleteManyId(),
        type: "delete:many",
        targetIds: visibleTargetIds,
      } satisfies DeleteManyOperation
      const version = commitOperation(operation)

      selectedOperationIds.current = new Set()
      setHasSelection(false)
      renderOperations(operations.current)
      sendWhiteboardMessage(
        {
          type: "delete:many",
          operation,
          version,
        },
        { reliable: true },
      )

      return true
    },
    [
      commitOperation,
      deleteOperationById,
      renderOperations,
      sendWhiteboardMessage,
      updateSelection,
    ],
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
    const selectedIds = getSelectedOperationIds()

    if (!isTeacher || selectedIds.length === 0) {
      return
    }

    deleteOperationIds(selectedIds)
  }, [deleteOperationIds, getSelectedOperationIds, isTeacher])

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
        points,
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
    marqueeStartPos.current = null
    marqueeBaseSelectionIds.current = []
    previewSnapshot.current = null
    activeStrokeId.current = null
    movingOperationIds.current = []
    resizingOperationIds.current = []
    resizeStartBounds.current = null
    resizeStartHandlePoints.current = null
    activeResizeHandle.current = null
    resizePointerOffset.current = { x: 0, y: 0 }
    rotatingOperationIds.current = []
    rotateOrigin.current = null
    rotateStartAngle.current = null
    activeStrokePoints.current = []
    pendingStrokePoints.current = []
  }, [])

  const clearAllBoards = useCallback(() => {
    boardStates.current.clear()
    operations.current = []
    redoOperations.current = []
    boardVersion.current = 0
    viewportRef.current = { ...DEFAULT_VIEWPORT }
    whiteboardViewportCache.set(boardId, viewportRef.current)
    selectedOperationIds.current = new Set()
    remoteStrokes.current.clear()
    stateRequested.current.clear()
    stateRequestIds.current.clear()
    clearStateResponseTimers()
    setHasSelection(false)
    setViewportVersion((version) => version + 1)
    setRedoCount(0)
    resetDrawingState()
    resetBoard()
  }, [boardId, clearStateResponseTimers, resetBoard, resetDrawingState])

  useEffect(() => {
    if (lastResetKey.current === resetKey) {
      return
    }

    lastResetKey.current = resetKey
    clearAllBoards()
  }, [clearAllBoards, resetKey])

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (
      !isTeacher ||
      (!isDrawableTool(activeTool) &&
        !isShapeTool(activeTool) &&
        !isTextTool(activeTool) &&
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
      const selectedIds = getSelectedOperationIds()
      const selectedOperations = getVisibleDrawableOperations(
        operations.current,
      ).filter((operation) => selectedOperationIds.current.has(operation.id))
      const selectionBounds = getSelectionBounds(
        selectedOperations,
        context.canvas,
      )
      const operationHandlePoints =
        selectedOperations.length === 1
          ? getOperationHandlePoints(selectedOperations[0], context.canvas)
          : null
      const operationResizeHandle = operationHandlePoints
        ? getHandleAtPoint(operationHandlePoints, pos)
        : null
      const resizeHandle =
        operationResizeHandle ??
        (!operationHandlePoints && selectionBounds
          ? getSelectionHandleAtPoint(selectionBounds, pos)
          : null)
      const resizeHandlePoint =
        operationResizeHandle && operationHandlePoints
          ? operationHandlePoints[operationResizeHandle]
          : selectionBounds && resizeHandle
            ? getResizeHandlePoints(selectionBounds)[resizeHandle]
            : null
      const rotateHandleHit = operationHandlePoints
        ? hitsHandlePointsRotateHandle(operationHandlePoints, pos)
        : selectionBounds
          ? hitsRotateHandle(selectionBounds, pos)
          : false
      const rotateOriginPoint = operationHandlePoints
        ? getHandlePointsCenter(operationHandlePoints)
        : selectionBounds
          ? getBoundsCenter(selectionBounds)
          : null

      if (selectedIds.length > 0 && rotateOriginPoint && rotateHandleHit) {
        event.currentTarget.setPointerCapture(event.pointerId)
        isDrawingRef.current = true
        lastPos.current = pos
        startPos.current = pos
        rotatingOperationIds.current = selectedIds
        rotateOrigin.current = rotateOriginPoint
        rotateStartAngle.current = Math.atan2(
          pos.y - rotateOriginPoint.y,
          pos.x - rotateOriginPoint.x,
        )
        return
      }

      if (
        selectedIds.length > 0 &&
        selectionBounds &&
        resizeHandle &&
        resizeHandlePoint
      ) {
        event.currentTarget.setPointerCapture(event.pointerId)
        isDrawingRef.current = true
        lastPos.current = pos
        startPos.current = pos
        resizingOperationIds.current = selectedIds
        resizeStartBounds.current = selectionBounds
        resizeStartHandlePoints.current = operationResizeHandle
          ? operationHandlePoints
          : null
        activeResizeHandle.current = resizeHandle
        resizePointerOffset.current = {
          x: pos.x - resizeHandlePoint.x,
          y: pos.y - resizeHandlePoint.y,
        }
        return
      }

      if (
        !targetOperation &&
        selectedIds.length > 0 &&
        selectionBounds &&
        boundsContainPoint(selectionBounds, pos, SELECTION_OUTLINE_PADDING)
      ) {
        event.currentTarget.setPointerCapture(event.pointerId)
        isDrawingRef.current = true
        lastPos.current = pos
        startPos.current = pos
        movingOperationIds.current = selectedIds
        return
      }

      if (!targetOperation) {
        event.currentTarget.setPointerCapture(event.pointerId)
        isDrawingRef.current = true
        lastPos.current = pos
        startPos.current = pos
        marqueeStartPos.current = pos
        marqueeBaseSelectionIds.current = event.shiftKey
          ? getSelectedOperationIds()
          : []
        updateSelection(marqueeBaseSelectionIds.current)
        return
      }

      if (event.shiftKey) {
        const nextSelectedOperationIds = new Set(selectedOperationIds.current)

        if (nextSelectedOperationIds.has(targetOperation.id)) {
          nextSelectedOperationIds.delete(targetOperation.id)
        } else {
          nextSelectedOperationIds.add(targetOperation.id)
        }

        updateSelection(nextSelectedOperationIds)
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      isDrawingRef.current = true
      lastPos.current = pos
      startPos.current = pos
      movingOperationIds.current = selectedOperationIds.current.has(
        targetOperation.id,
      )
        ? selectedIds
        : [targetOperation.id]
      updateSelection(movingOperationIds.current)
      return
    }

    if (isTextTool(activeTool)) {
      const text = window.prompt("Text")?.trim()
      if (!text) return

      const fontSize = Math.max(16, brushSize * 6)
      const dimensions = measureTextDimensions(context.ctx, text, fontSize)
      const operation = {
        id: createTextId(),
        type: "text",
        color,
        fontSize,
        point: pos,
        width: dimensions.width,
        height: dimensions.height,
        text,
      } satisfies TextOperation
      const version = commitOperation(operation)

      applyViewportTransform(
        context.ctx,
        overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
      )
      drawTextOperation(context.ctx, context.canvas, operation)
      resetViewportTransform(context.ctx)
      sendWhiteboardMessage(
        {
          type: "text",
          operation,
          version,
        },
        { reliable: true },
      )
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
    const normalizedPoint = pos
    activeStrokeId.current = strokeId
    activeStrokePoints.current = [normalizedPoint]
    pendingStrokePoints.current = []
    applyViewportTransform(
      context.ctx,
      overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
    )
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
        !isTextTool(activeTool) &&
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
      marqueeStartPos.current &&
      startPos.current
    ) {
      const marqueeBounds = getBoundsFromPoints(marqueeStartPos.current, pos)
      const marqueeOperationIds = getOperationsInBounds(
        marqueeBounds,
        context.canvas,
      ).map((operation) => operation.id)
      const nextSelection = new Set([
        ...marqueeBaseSelectionIds.current,
        ...marqueeOperationIds,
      ])

      selectedOperationIds.current = nextSelection
      setHasSelection(nextSelection.size > 0)
      renderOperations(operations.current)
      drawMarqueeOutline(context.ctx, marqueeBounds)
      lastPos.current = pos
      return
    }

    if (
      isPointerTool(activeTool) &&
      rotatingOperationIds.current.length > 0 &&
      rotateOrigin.current &&
      rotateStartAngle.current !== null
    ) {
      const currentAngle = Math.atan2(
        pos.y - rotateOrigin.current.y,
        pos.x - rotateOrigin.current.x,
      )
      const operation = {
        id: "rotate-preview",
        type: "rotate",
        targetIds: rotatingOperationIds.current,
        origin: rotateOrigin.current,
        angle: currentAngle - rotateStartAngle.current,
      } satisfies RotateOperation

      renderOperations([...operations.current, operation])
      lastPos.current = pos
      return
    }

    if (
      isPointerTool(activeTool) &&
      resizingOperationIds.current.length > 0 &&
      resizeStartBounds.current &&
      activeResizeHandle.current
    ) {
      const resizePoint = {
        x: pos.x - resizePointerOffset.current.x,
        y: pos.y - resizePointerOffset.current.y,
      }
      const operation = resizeStartHandlePoints.current
        ? getResizeOperationFromHandlePoints({
            handlePoints: resizeStartHandlePoints.current,
            currentPoint: resizePoint,
            handle: activeResizeHandle.current,
            targetIds: resizingOperationIds.current,
            id: "resize-preview",
          })
        : getResizeOperationFromHandle({
            bounds: resizeStartBounds.current,
            currentPoint: resizePoint,
            handle: activeResizeHandle.current,
            targetIds: resizingOperationIds.current,
            id: "resize-preview",
          })

      renderOperations([...operations.current, operation])
      lastPos.current = pos
      return
    }

    if (
      isPointerTool(activeTool) &&
      movingOperationIds.current.length > 0 &&
      startPos.current
    ) {
      const startPoint = startPos.current
      const currentPoint = pos
      const delta = {
        x: currentPoint.x - startPoint.x,
        y: currentPoint.y - startPoint.y,
      }
      const operation =
        movingOperationIds.current.length === 1
          ? ({
              id: "move-preview",
              type: "move",
              targetId: movingOperationIds.current[0],
              delta,
            } satisfies MoveOperation)
          : ({
              id: "move-many-preview",
              type: "move:many",
              targetIds: movingOperationIds.current,
              delta,
            } satisfies MoveManyOperation)

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
        applyViewportTransform(
          context.ctx,
          overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
        )
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
    activeStrokePoints.current.push(pos)
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
      marqueeStartPos.current &&
      startPos.current
    ) {
      const endPoint = event ? getPos(event) : lastPos.current

      if (endPoint) {
        const marqueeBounds = getBoundsFromPoints(
          marqueeStartPos.current,
          endPoint,
        )
        const movedEnough =
          getDistance(marqueeStartPos.current, endPoint) >=
          Math.max(2, brushSize / 2)

        if (movedEnough) {
          const marqueeOperationIds = getOperationsInBounds(
            marqueeBounds,
            context.canvas,
          ).map((operation) => operation.id)
          updateSelection([
            ...new Set([
              ...marqueeBaseSelectionIds.current,
              ...marqueeOperationIds,
            ]),
          ])
        } else {
          updateSelection(marqueeBaseSelectionIds.current)
        }
      }
    } else if (
      isDrawingRef.current &&
      isTeacher &&
      isPointerTool(activeTool) &&
      context &&
      rotatingOperationIds.current.length > 0 &&
      rotateOrigin.current &&
      rotateStartAngle.current !== null &&
      startPos.current
    ) {
      const endPoint = event ? getPos(event) : lastPos.current

      if (endPoint) {
        const currentAngle = Math.atan2(
          endPoint.y - rotateOrigin.current.y,
          endPoint.x - rotateOrigin.current.x,
        )
        const angle = currentAngle - rotateStartAngle.current
        const movedEnough = Math.abs(angle) >= 0.01

        if (movedEnough) {
          const operation = {
            id: createRotateId(),
            type: "rotate",
            targetIds: rotatingOperationIds.current,
            origin: rotateOrigin.current,
            angle,
          } satisfies RotateOperation
          const version = commitOperation(operation)

          renderOperations(operations.current)
          sendWhiteboardMessage(
            {
              type: "rotate",
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
      isPointerTool(activeTool) &&
      context &&
      resizingOperationIds.current.length > 0 &&
      resizeStartBounds.current &&
      activeResizeHandle.current &&
      startPos.current
    ) {
      const endPoint = event ? getPos(event) : lastPos.current

      if (endPoint) {
        const movedEnough =
          getDistance(startPos.current, endPoint) >= Math.max(2, brushSize / 2)

        if (movedEnough) {
          const resizePoint = {
            x: endPoint.x - resizePointerOffset.current.x,
            y: endPoint.y - resizePointerOffset.current.y,
          }
          const operation = resizeStartHandlePoints.current
            ? getResizeOperationFromHandlePoints({
                handlePoints: resizeStartHandlePoints.current,
                currentPoint: resizePoint,
                handle: activeResizeHandle.current,
                targetIds: resizingOperationIds.current,
                id: createResizeId(),
              })
            : getResizeOperationFromHandle({
                bounds: resizeStartBounds.current,
                currentPoint: resizePoint,
                handle: activeResizeHandle.current,
                targetIds: resizingOperationIds.current,
                id: createResizeId(),
              })
          const version = commitOperation(operation)

          renderOperations(operations.current)
          sendWhiteboardMessage(
            {
              type: "resize",
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
      isPointerTool(activeTool) &&
      context &&
      movingOperationIds.current.length > 0 &&
      startPos.current
    ) {
      const endPoint = event ? getPos(event) : lastPos.current

      if (endPoint) {
        const startPoint = startPos.current
        const normalizedEndPoint = endPoint
        const delta = {
          x: normalizedEndPoint.x - startPoint.x,
          y: normalizedEndPoint.y - startPoint.y,
        }
        const movedEnough =
          getDistance(startPos.current, endPoint) >= Math.max(2, brushSize / 2)

        if (movedEnough) {
          const operation =
            movingOperationIds.current.length === 1
              ? ({
                  id: createMoveId(),
                  type: "move",
                  targetId: movingOperationIds.current[0],
                  delta,
                } satisfies MoveOperation)
              : ({
                  id: createMoveManyId(),
                  type: "move:many",
                  targetIds: movingOperationIds.current,
                  delta,
                } satisfies MoveManyOperation)
          const version = commitOperation(operation)

          renderOperations(operations.current)
          sendWhiteboardMessage(
            operation.type === "move"
              ? {
                  type: "move",
                  operation,
                  version,
                }
              : {
                  type: "move:many",
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
          startPoint: startPos.current,
          endPoint,
        } satisfies Extract<WhiteboardOperation, { type: "shape" }>
        const version = commitOperation(operation)

        context.ctx.putImageData(previewSnapshot.current, 0, 0)
        applyViewportTransform(
          context.ctx,
          overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
        )
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
        activeStrokePoints.current.push(endPoint)
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
      resetViewportTransform(context.ctx)
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
      selectedOperationIds.current.size === 0
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
    selectedOperationIds.current = new Set()
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
    if (activeBoardId.current === boardId) {
      return
    }

    boardStates.current.set(activeBoardId.current, {
      operations: operations.current,
      redoOperations: redoOperations.current,
      boardVersion: boardVersion.current,
      viewport: viewportRef.current,
    })

    const nextBoardState =
      boardStates.current.get(boardId) ?? createEmptyBoardState()

    activeBoardId.current = boardId
    operations.current = nextBoardState.operations
    redoOperations.current = nextBoardState.redoOperations
    boardVersion.current = nextBoardState.boardVersion
    viewportRef.current =
      whiteboardViewportCache.get(boardId) ?? nextBoardState.viewport
    whiteboardViewportCache.set(boardId, viewportRef.current)
    selectedOperationIds.current = new Set()
    remoteStrokes.current.clear()
    setHasSelection(false)
    setViewportVersion((version) => version + 1)
    setRedoCount(nextBoardState.redoOperations.length)
    resetDrawingState()
    renderOperations(nextBoardState.operations)
  }, [boardId, renderOperations, resetDrawingState])

  useEffect(() => {
    renderOperations(operations.current)
  }, [renderOperations])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver(() => {
      renderOperations(operations.current)
    })
    observer.observe(canvas)

    return () => observer.disconnect()
  }, [renderOperations])

  useEffect(() => {
    return () => {
      if (!overlayActive) {
        whiteboardViewportCache.set(boardId, viewportRef.current)
      }
      if (strokeFlushFrame.current !== null) {
        cancelAnimationFrame(strokeFlushFrame.current)
      }
      if (viewportSyncFrame.current !== null) {
        cancelAnimationFrame(viewportSyncFrame.current)
      }
      clearStateResponseTimers()
    }
  }, [boardId, clearStateResponseTimers, overlayActive])

  useEffect(() => {
    if (!syncEnabled) {
      stateRequested.current.clear()
      stateRequestIds.current.clear()
      clearStateResponseTimers()
      return
    }

    if (!stateRequested.current.has(boardId)) {
      const requestId = createMessageId()

      stateRequested.current.add(boardId)
      stateRequestIds.current.set(boardId, requestId)
      sendWhiteboardMessage(
        {
          type: "state:request",
          requestId,
          requesterRole: isTeacher ? "teacher" : "student",
        },
        { reliable: true },
      )
    }

    if (isTeacher && !overlayActive) {
      sendWhiteboardMessage(
        {
          type: "viewport",
          viewport: viewportRef.current,
        },
        { reliable: true },
      )
    }
  }, [
    boardId,
    clearStateResponseTimers,
    isTeacher,
    overlayActive,
    sendWhiteboardMessage,
    syncEnabled,
  ])

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

      if (message.type === "session:clear" || message.type === "session:end") {
        clearAllBoards()
        continue
      }

      if (getMessageBoardId(message) !== boardId) {
        continue
      }

      if (message.type === "state:request") {
        const hasBoardState =
          operations.current.length > 0 || boardVersion.current > 0

        if (!hasBoardState) {
          continue
        }

        if (isTeacher) {
          sendStateSync(message.requestId)
          continue
        }

        if (message.requesterRole === "teacher") {
          const timerId = window.setTimeout(() => {
            stateResponseTimers.current.delete(timerId)
            sendStateSync(message.requestId)
          }, getStateResponseDelay(currentUserId))

          stateResponseTimers.current.add(timerId)
        }

        continue
      }

      if (message.type === "state:sync") {
        const currentRequestId = stateRequestIds.current.get(boardId)
        const isRequestedSync = Boolean(
          message.requestId && message.requestId === currentRequestId,
        )

        if (message.requestId && !isRequestedSync) {
          continue
        }

        if (
          message.version < boardVersion.current ||
          (!isRequestedSync && message.version === boardVersion.current)
        ) {
          continue
        }

        if (isRequestedSync) {
          stateRequestIds.current.delete(boardId)
        }

        boardVersion.current = message.version
        operations.current = message.operations
        redoOperations.current = []
        setRedoCount(0)
        remoteStrokes.current.clear()
        if (!isTeacher && message.viewport && !overlayActive) {
          viewportRef.current = message.viewport
          whiteboardViewportCache.set(boardId, viewportRef.current)
          setViewportVersion((version) => version + 1)
        }
        renderOperations(message.operations)
        continue
      }

      if (message.type === "viewport") {
        if (!isTeacher && !overlayActive) {
          applyViewport(message.viewport)
        }
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
        selectedOperationIds.current = new Set()
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
        if (selectedOperationIds.current.has(message.operation.targetId)) {
          selectedOperationIds.current.delete(message.operation.targetId)
          setHasSelection(selectedOperationIds.current.size > 0)
        }
        renderOperations(operations.current)
        remoteStrokes.current.clear()
        continue
      }

      if (message.type === "delete:many") {
        if (message.version < boardVersion.current) {
          continue
        }

        boardVersion.current = message.version
        operations.current = [...operations.current, message.operation]
        redoOperations.current = []
        setRedoCount(0)
        for (const targetId of message.operation.targetIds) {
          selectedOperationIds.current.delete(targetId)
        }
        setHasSelection(selectedOperationIds.current.size > 0)
        renderOperations(operations.current)
        remoteStrokes.current.clear()
        continue
      }

      if (
        message.type === "move" ||
        message.type === "move:many" ||
        message.type === "resize" ||
        message.type === "rotate" ||
        message.type === "style"
      ) {
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
        applyViewportTransform(
          context.ctx,
          overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
        )
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
        applyViewportTransform(
          context.ctx,
          overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
        )
        drawShapeOperation(context.ctx, context.canvas, message.operation)
        context.ctx.globalCompositeOperation = "source-over"
        resetViewportTransform(context.ctx)
        continue
      }

      if (message.type === "text") {
        if (message.version < boardVersion.current) {
          continue
        }

        boardVersion.current = message.version
        operations.current = [...operations.current, message.operation]
        redoOperations.current = []
        setRedoCount(0)
        applyViewportTransform(
          context.ctx,
          overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
        )
        drawTextOperation(context.ctx, context.canvas, message.operation)
        context.ctx.globalCompositeOperation = "source-over"
        resetViewportTransform(context.ctx)
        continue
      }

      if (message.type === "stroke:points") {
        const stroke = remoteStrokes.current.get(message.strokeId)
        if (!stroke) {
          continue
        }

        for (const normalizedPoint of message.points) {
          const point = denormalizePoint(normalizedPoint, context.canvas)
          applyViewportTransform(
            context.ctx,
            overlayActive ? DEFAULT_VIEWPORT : viewportRef.current,
          )
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
        resetViewportTransform(context.ctx)
      }
    }
  }, [
    boardId,
    clearAllBoards,
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
    setBrushSize: handleBrushSizeChange,
    showColorPicker,
    setShowColorPicker,
    hasSelection,
    redoCount,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleWheel,
    handleKeyDown,
    handleDeleteSelection,
    handleUndo,
    handleRedo,
    handleClear,
  }
}
