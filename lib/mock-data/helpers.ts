import { ASSIGNMENTS } from "./assignments"
import { CLASSES } from "./classes"
import { LEADERBOARD } from "./leaderboard"
import { MESSAGES } from "./messages"
import type {
  Assignment,
  Class,
  LeaderboardEntry,
  Message,
  User,
} from "./types"
import { USERS } from "./users"

export function getUserById(id: string): User | undefined {
  return USERS.find((user) => user.id === id)
}

export function getClassById(id: string): Class | undefined {
  return CLASSES.find((cls) => cls.id === id)
}

export function getClassesByStudent(studentId: string): Class[] {
  const user = getUserById(studentId)
  const enrolledClassIds = user?.enrolledClassIds

  if (!enrolledClassIds) return []

  return CLASSES.filter((cls) => enrolledClassIds.includes(cls.id))
}

export function getClassesByTeacher(teacherId: string): Class[] {
  return CLASSES.filter((cls) => cls.teacherId === teacherId)
}

export function getMessagesByClass(classId: string): Message[] {
  return MESSAGES.filter((message) => message.classId === classId).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
}

export function getAssignmentsByClass(classId: string): Assignment[] {
  return ASSIGNMENTS.filter((assignment) => assignment.classId === classId)
}

export function getLeaderboardByClass(classId: string): LeaderboardEntry[] {
  return LEADERBOARD.filter((entry) => entry.classId === classId).sort(
    (a, b) => a.rank - b.rank,
  )
}

export function getStudentsInClass(classId: string): User[] {
  const cls = getClassById(classId)
  if (!cls) return []
  return USERS.filter((user) => cls.studentIds.includes(user.id))
}
