export type Role = "student" | "teacher" | "admin"

export interface User {
  id: string
  name: string
  email: string
  role: Role
  avatar: string
  institution: string
  enrolledClassIds?: string[]
  taughtClassIds?: string[]
  semester?: string
  gpa?: number
}

export interface PendingAccessRequest {
  id: string
  name: string
  email: string
  role: "student" | "teacher"
  type: "invite" | "request"
  requestedAt: string
}

export interface Class {
  id: string
  name: string
  code: string
  subject: string
  teacherId: string
  color: string
  description: string
  studentIds: string[]
  schedule: string
  room: string
  semester: string
}

export interface Message {
  id: string
  classId: string
  senderId: string
  content: string
  timestamp: string
  type: "text" | "image" | "file" | "announcement"
  fileName?: string
  fileSize?: string
  mediaUrl?: string
  mimeType?: string
  pinned?: boolean
}

export interface Assignment {
  id: string
  classId: string
  title: string
  description: string
  dueDate: string
  maxScore: number
  type: "assignment" | "quiz" | "exam" | "lab"
  status?: "pending" | "submitted" | "graded"
  score?: number
  hasIde?: boolean
}

export interface Submission {
  id: string
  assignmentId: string
  studentId: string
  submittedAt: string
  score: number
  feedback?: string
  code?: string
}

export interface ExamQuestion {
  id: string
  type: "mcq" | "short" | "code"
  question: string
  options?: string[]
  correctIndex?: number
  points: number
  language?: string
  starterCode?: string
}

export interface Exam {
  id: string
  classId: string
  title: string
  durationMinutes: number
  totalPoints: number
  questions: ExamQuestion[]
  startTime: string
  status: "upcoming" | "live" | "ended"
}

export interface LeaderboardEntry {
  studentId: string
  classId: string
  totalScore: number
  rank: number
  assignments: number
  avgScore: number
}
