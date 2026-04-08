import { Circle, Eraser, Minus, MousePointer2, Pen, Square } from "lucide-react"

export type Tool = "pen" | "eraser" | "line" | "rect" | "circle" | "pointer"

export interface SessionParticipant {
  id: string
  name: string
  avatar: string
  role: "teacher" | "student"
  muted: boolean
  videoOff: boolean
  speaking: boolean
}

export const SESSION_COLORS = [
  "#1e1e1e",
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
]

export const SESSION_TOOLS: Array<{
  id: Tool
  icon: typeof MousePointer2
  label: string
}> = [
  { id: "pointer", icon: MousePointer2, label: "Select" },
  { id: "pen", icon: Pen, label: "Pen" },
  { id: "eraser", icon: Eraser, label: "Eraser" },
  { id: "line", icon: Minus, label: "Line" },
  { id: "rect", icon: Square, label: "Rectangle" },
  { id: "circle", icon: Circle, label: "Circle" },
]

export const MOCK_SESSION_PARTICIPANTS: SessionParticipant[] = [
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
]

export const MOCK_SESSION_CHAT = [
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
]
