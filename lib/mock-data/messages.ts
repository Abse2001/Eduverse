import type { Message } from "./types"

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
