// ─── Types ───────────────────────────────────────────────────────────────────

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

export interface Material {
  id: string
  classId: string
  title: string
  type: "pdf" | "video" | "link" | "code" | "slide"
  url: string
  uploadedBy: string
  uploadedAt: string
  size?: string
  description?: string
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

// ─── Users ────────────────────────────────────────────────────────────────────

export const USERS: User[] = [
  {
    id: "u1",
    name: "Alex Rivera",
    email: "alex@eduflow.io",
    role: "student",
    avatar: "AR",
    institution: "Horizon Institute",
    enrolledClassIds: ["c1", "c2", "c3"],
    semester: "Spring 2026",
    gpa: 3.7,
  },
  {
    id: "u2",
    name: "Jordan Kim",
    email: "jordan@eduflow.io",
    role: "student",
    avatar: "JK",
    institution: "Horizon Institute",
    enrolledClassIds: ["c1", "c2"],
    semester: "Spring 2026",
    gpa: 3.4,
  },
  {
    id: "u3",
    name: "Sam Chen",
    email: "sam@eduflow.io",
    role: "student",
    avatar: "SC",
    institution: "Horizon Institute",
    enrolledClassIds: ["c1", "c3"],
    semester: "Spring 2026",
    gpa: 3.9,
  },
  {
    id: "u4",
    name: "Morgan Walsh",
    email: "morgan@eduflow.io",
    role: "student",
    avatar: "MW",
    institution: "Horizon Institute",
    enrolledClassIds: ["c2", "c3"],
    semester: "Spring 2026",
    gpa: 3.2,
  },
  {
    id: "u5",
    name: "Taylor Brooks",
    email: "taylor@eduflow.io",
    role: "student",
    avatar: "TB",
    institution: "Horizon Institute",
    enrolledClassIds: ["c1", "c2", "c3"],
    semester: "Spring 2026",
    gpa: 2.9,
  },
  {
    id: "t1",
    name: "Dr. Priya Nair",
    email: "priya@eduflow.io",
    role: "teacher",
    avatar: "PN",
    institution: "Horizon Institute",
    taughtClassIds: ["c1", "c3"],
  },
  {
    id: "t2",
    name: "Prof. Carlos Mendes",
    email: "carlos@eduflow.io",
    role: "teacher",
    avatar: "CM",
    institution: "Horizon Institute",
    taughtClassIds: ["c2"],
  },
  {
    id: "a1",
    name: "Admin User",
    email: "admin@eduflow.io",
    role: "admin",
    avatar: "AU",
    institution: "Horizon Institute",
  },
]

// ─── Classes ──────────────────────────────────────────────────────────────────

export const CLASSES: Class[] = [
  {
    id: "c1",
    name: "Data Structures & Algorithms",
    code: "CS301",
    subject: "Computer Science",
    teacherId: "t1",
    color: "indigo",
    description:
      "An in-depth study of data structures, algorithmic design, and complexity analysis.",
    studentIds: ["u1", "u2", "u3", "u5"],
    schedule: "Mon & Wed, 10:00 – 11:30 AM",
    room: "Lab 4B",
    semester: "Spring 2026",
  },
  {
    id: "c2",
    name: "Web Development Bootcamp",
    code: "WD101",
    subject: "Software Engineering",
    teacherId: "t2",
    color: "emerald",
    description:
      "Full-stack web development from HTML/CSS to React and Node.js.",
    studentIds: ["u1", "u2", "u4", "u5"],
    schedule: "Tue & Thu, 1:00 – 2:30 PM",
    room: "Room 201",
    semester: "Spring 2026",
  },
  {
    id: "c3",
    name: "Machine Learning Fundamentals",
    code: "ML201",
    subject: "Artificial Intelligence",
    teacherId: "t1",
    color: "violet",
    description:
      "Core concepts of machine learning: regression, classification, neural networks.",
    studentIds: ["u1", "u3", "u4", "u5"],
    schedule: "Fri, 9:00 – 12:00 PM",
    room: "Lecture Hall A",
    semester: "Spring 2026",
  },
]

// ─── Messages ─────────────────────────────────────────────────────────────────

export const MESSAGES: Message[] = [
  {
    id: "m1",
    classId: "c1",
    senderId: "t1",
    content:
      "Welcome everyone to CS301! Please review the syllabus I just uploaded.",
    timestamp: "2026-03-24T09:00:00Z",
    type: "announcement",
    pinned: true,
  },
  {
    id: "m2",
    classId: "c1",
    senderId: "u1",
    content:
      "Thanks Professor! Quick question — will Assignment 1 cover binary trees?",
    timestamp: "2026-03-24T09:15:00Z",
    type: "text",
  },
  {
    id: "m3",
    classId: "c1",
    senderId: "t1",
    content:
      "Yes, Assignment 1 covers linked lists and binary trees. Check the materials section for the problem set.",
    timestamp: "2026-03-24T09:20:00Z",
    type: "text",
  },
  {
    id: "m4",
    classId: "c1",
    senderId: "u2",
    content: "Problem Set 2 has been uploaded.",
    timestamp: "2026-03-25T10:00:00Z",
    type: "file",
    fileName: "problem-set-2.pdf",
    fileSize: "245 KB",
  },
  {
    id: "m5",
    classId: "c1",
    senderId: "u3",
    content:
      "Has anyone started on the graph traversal section? It's quite complex.",
    timestamp: "2026-03-26T14:00:00Z",
    type: "text",
  },
  {
    id: "m6",
    classId: "c1",
    senderId: "u1",
    content:
      "Yeah I found this really helpful resource: https://visualgo.net for visualizing algorithms.",
    timestamp: "2026-03-26T14:30:00Z",
    type: "text",
  },
  {
    id: "m7",
    classId: "c2",
    senderId: "t2",
    content:
      "Tomorrow's session will be a live coding walkthrough of React hooks. Come prepared!",
    timestamp: "2026-03-27T08:00:00Z",
    type: "announcement",
    pinned: true,
  },
  {
    id: "m8",
    classId: "c2",
    senderId: "u4",
    content: "Will the session be recorded?",
    timestamp: "2026-03-27T08:30:00Z",
    type: "text",
  },
  {
    id: "m9",
    classId: "c2",
    senderId: "t2",
    content: "Yes, recordings are always posted in Materials within 24 hours.",
    timestamp: "2026-03-27T08:45:00Z",
    type: "text",
  },
  {
    id: "m10",
    classId: "c3",
    senderId: "t1",
    content:
      "Midterm exam is scheduled for April 10th. It will cover chapters 1–6.",
    timestamp: "2026-03-28T11:00:00Z",
    type: "announcement",
    pinned: true,
  },
]

// ─── Materials ────────────────────────────────────────────────────────────────

export const MATERIALS: Material[] = [
  {
    id: "mat1",
    classId: "c1",
    title: "CS301 Syllabus — Spring 2026",
    type: "pdf",
    url: "#",
    uploadedBy: "t1",
    uploadedAt: "2026-03-01T00:00:00Z",
    size: "180 KB",
    description: "Full course syllabus including grading policy and schedule.",
  },
  {
    id: "mat2",
    classId: "c1",
    title: "Lecture 1 — Arrays & Linked Lists",
    type: "slide",
    url: "#",
    uploadedBy: "t1",
    uploadedAt: "2026-03-03T00:00:00Z",
    size: "2.4 MB",
    description:
      "Slides covering contiguous vs. linked memory, insertion/deletion complexity.",
  },
  {
    id: "mat3",
    classId: "c1",
    title: "Lecture 2 — Stacks & Queues",
    type: "slide",
    url: "#",
    uploadedBy: "t1",
    uploadedAt: "2026-03-10T00:00:00Z",
    size: "1.9 MB",
  },
  {
    id: "mat4",
    classId: "c1",
    title: "Binary Trees Walkthrough",
    type: "video",
    url: "#",
    uploadedBy: "t1",
    uploadedAt: "2026-03-17T00:00:00Z",
    size: "320 MB",
    description: "Recorded walkthrough of binary tree traversal algorithms.",
  },
  {
    id: "mat5",
    classId: "c2",
    title: "WD101 Starter Kit",
    type: "code",
    url: "#",
    uploadedBy: "t2",
    uploadedAt: "2026-03-01T00:00:00Z",
    size: "12 MB",
    description: "HTML/CSS/JS boilerplate for the first 4 weeks.",
  },
  {
    id: "mat6",
    classId: "c2",
    title: "React Hooks Reference",
    type: "pdf",
    url: "#",
    uploadedBy: "t2",
    uploadedAt: "2026-03-20T00:00:00Z",
    size: "560 KB",
  },
  {
    id: "mat7",
    classId: "c3",
    title: "ML Chapter 1–3 Notes",
    type: "pdf",
    url: "#",
    uploadedBy: "t1",
    uploadedAt: "2026-03-05T00:00:00Z",
    size: "1.1 MB",
  },
  {
    id: "mat8",
    classId: "c3",
    title: "Linear Regression Jupyter Notebook",
    type: "code",
    url: "#",
    uploadedBy: "t1",
    uploadedAt: "2026-03-12T00:00:00Z",
    size: "45 KB",
    description: "Hands-on notebook for linear & logistic regression.",
  },
]

// ─── Assignments ──────────────────────────────────────────────────────────────

export const ASSIGNMENTS: Assignment[] = [
  {
    id: "a1",
    classId: "c1",
    title: "Assignment 1 — Linked Lists",
    description:
      "Implement a doubly-linked list with insert, delete, and reverse operations.",
    dueDate: "2026-04-01T23:59:00Z",
    maxScore: 100,
    type: "assignment",
    status: "graded",
    score: 92,
    hasIde: true,
  },
  {
    id: "a2",
    classId: "c1",
    title: "Assignment 2 — Binary Trees",
    description:
      "Implement BST with in-order, pre-order, and post-order traversal.",
    dueDate: "2026-04-15T23:59:00Z",
    maxScore: 100,
    type: "assignment",
    status: "submitted",
    hasIde: true,
  },
  {
    id: "a3",
    classId: "c1",
    title: "Midterm Quiz — Complexity Analysis",
    description: "25-question quiz on Big-O notation and complexity analysis.",
    dueDate: "2026-04-10T14:00:00Z",
    maxScore: 50,
    type: "quiz",
    status: "pending",
  },
  {
    id: "a4",
    classId: "c2",
    title: "Project 1 — Portfolio Page",
    description:
      "Build a responsive personal portfolio using HTML, CSS, and vanilla JS.",
    dueDate: "2026-04-05T23:59:00Z",
    maxScore: 100,
    type: "assignment",
    status: "graded",
    score: 88,
    hasIde: true,
  },
  {
    id: "a5",
    classId: "c2",
    title: "React Lab — Todo App",
    description:
      "Build a full CRUD todo app using React hooks and local state.",
    dueDate: "2026-04-20T23:59:00Z",
    maxScore: 100,
    type: "lab",
    status: "pending",
    hasIde: true,
  },
  {
    id: "a6",
    classId: "c3",
    title: "Lab 1 — Linear Regression",
    description: "Implement linear regression from scratch using NumPy.",
    dueDate: "2026-04-03T23:59:00Z",
    maxScore: 100,
    type: "lab",
    status: "graded",
    score: 95,
    hasIde: true,
  },
]

// ─── Exams ────────────────────────────────────────────────────────────────────

export const EXAMS: Exam[] = [
  {
    id: "ex1",
    classId: "c1",
    title: "Midterm — Data Structures",
    durationMinutes: 60,
    totalPoints: 100,
    status: "upcoming",
    startTime: "2026-04-10T10:00:00Z",
    questions: [
      {
        id: "q1",
        type: "mcq",
        question: "What is the time complexity of searching in a balanced BST?",
        options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
        correctIndex: 1,
        points: 10,
      },
      {
        id: "q2",
        type: "mcq",
        question: "Which data structure uses LIFO ordering?",
        options: ["Queue", "Heap", "Stack", "Deque"],
        correctIndex: 2,
        points: 10,
      },
      {
        id: "q3",
        type: "short",
        question: "Explain the difference between BFS and DFS graph traversal.",
        points: 20,
      },
      {
        id: "q4",
        type: "code",
        question:
          "Write a function that reverses a singly linked list in O(n) time and O(1) space.",
        points: 30,
        language: "python",
        starterCode:
          "class Node:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\n\ndef reverse_list(head: Node) -> Node:\n    # Your solution here\n    pass\n",
      },
      {
        id: "q5",
        type: "mcq",
        question: "What is the worst-case space complexity of merge sort?",
        options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
        correctIndex: 2,
        points: 10,
      },
      {
        id: "q6",
        type: "short",
        question: "What is amortized analysis and when is it useful?",
        points: 20,
      },
    ],
  },
  {
    id: "ex2",
    classId: "c3",
    title: "ML Quiz — Regression & Classification",
    durationMinutes: 45,
    totalPoints: 80,
    status: "live",
    startTime: "2026-03-30T09:00:00Z",
    questions: [
      {
        id: "q7",
        type: "mcq",
        question:
          "Which loss function is typically used for linear regression?",
        options: [
          "Cross-entropy",
          "Mean Squared Error",
          "Hinge loss",
          "KL-divergence",
        ],
        correctIndex: 1,
        points: 10,
      },
      {
        id: "q8",
        type: "mcq",
        question: "What does the learning rate control in gradient descent?",
        options: [
          "Number of iterations",
          "Step size per update",
          "Model depth",
          "Regularization strength",
        ],
        correctIndex: 1,
        points: 10,
      },
      {
        id: "q9",
        type: "code",
        question: "Implement gradient descent for linear regression.",
        points: 30,
        language: "python",
        starterCode:
          "import numpy as np\n\ndef gradient_descent(X, y, lr=0.01, epochs=1000):\n    # Initialize weights\n    w = np.zeros(X.shape[1])\n    b = 0\n    # Your solution here\n    return w, b\n",
      },
      {
        id: "q10",
        type: "short",
        question: "Explain overfitting and describe two ways to prevent it.",
        points: 30,
      },
    ],
  },
]

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export const LEADERBOARD: LeaderboardEntry[] = [
  {
    studentId: "u3",
    classId: "c1",
    totalScore: 287,
    rank: 1,
    assignments: 3,
    avgScore: 95.7,
  },
  {
    studentId: "u1",
    classId: "c1",
    totalScore: 276,
    rank: 2,
    assignments: 3,
    avgScore: 92.0,
  },
  {
    studentId: "u5",
    classId: "c1",
    totalScore: 251,
    rank: 3,
    assignments: 3,
    avgScore: 83.7,
  },
  {
    studentId: "u2",
    classId: "c1",
    totalScore: 238,
    rank: 4,
    assignments: 3,
    avgScore: 79.3,
  },
  {
    studentId: "u1",
    classId: "c2",
    totalScore: 176,
    rank: 1,
    assignments: 2,
    avgScore: 88.0,
  },
  {
    studentId: "u4",
    classId: "c2",
    totalScore: 165,
    rank: 2,
    assignments: 2,
    avgScore: 82.5,
  },
  {
    studentId: "u5",
    classId: "c2",
    totalScore: 154,
    rank: 3,
    assignments: 2,
    avgScore: 77.0,
  },
  {
    studentId: "u2",
    classId: "c2",
    totalScore: 148,
    rank: 4,
    assignments: 2,
    avgScore: 74.0,
  },
  {
    studentId: "u3",
    classId: "c3",
    totalScore: 190,
    rank: 1,
    assignments: 2,
    avgScore: 95.0,
  },
  {
    studentId: "u1",
    classId: "c3",
    totalScore: 185,
    rank: 2,
    assignments: 2,
    avgScore: 92.5,
  },
  {
    studentId: "u4",
    classId: "c3",
    totalScore: 172,
    rank: 3,
    assignments: 2,
    avgScore: 86.0,
  },
  {
    studentId: "u5",
    classId: "c3",
    totalScore: 155,
    rank: 4,
    assignments: 2,
    avgScore: 77.5,
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getUserById(id: string): User | undefined {
  return USERS.find((u) => u.id === id)
}

export function getClassById(id: string): Class | undefined {
  return CLASSES.find((c) => c.id === id)
}

export function getClassesByStudent(studentId: string): Class[] {
  const user = getUserById(studentId)
  if (!user?.enrolledClassIds) return []
  return CLASSES.filter((c) => user.enrolledClassIds!.includes(c.id))
}

export function getClassesByTeacher(teacherId: string): Class[] {
  return CLASSES.filter((c) => c.teacherId === teacherId)
}

export function getMessagesByClass(classId: string): Message[] {
  return MESSAGES.filter((m) => m.classId === classId).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
}

export function getMaterialsByClass(classId: string): Material[] {
  return MATERIALS.filter((m) => m.classId === classId)
}

export function getAssignmentsByClass(classId: string): Assignment[] {
  return ASSIGNMENTS.filter((a) => a.classId === classId)
}

export function getLeaderboardByClass(classId: string): LeaderboardEntry[] {
  return LEADERBOARD.filter((l) => l.classId === classId).sort(
    (a, b) => a.rank - b.rank,
  )
}

export function getStudentsInClass(classId: string): User[] {
  const cls = getClassById(classId)
  if (!cls) return []
  return USERS.filter((u) => cls.studentIds.includes(u.id))
}

export const CLASS_COLOR_MAP: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
}

export const CLASS_BADGE_COLOR_MAP: Record<string, string> = {
  indigo:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
}
