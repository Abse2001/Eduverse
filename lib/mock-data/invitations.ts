import type { PendingAccessRequest } from "./types"

export const PENDING_ACCESS_REQUESTS: PendingAccessRequest[] = [
  {
    id: "par1",
    name: "Maya Singh",
    email: "maya.singh@horizon.edu",
    role: "student",
    type: "request",
    requestedAt: "2026-05-04T08:15:00Z",
  },
  {
    id: "par2",
    name: "Noah Park",
    email: "noah.park@horizon.edu",
    role: "teacher",
    type: "invite",
    requestedAt: "2026-05-03T16:40:00Z",
  },
  {
    id: "par3",
    name: "Leah Morgan",
    email: "leah.morgan@horizon.edu",
    role: "student",
    type: "invite",
    requestedAt: "2026-05-03T12:20:00Z",
  },
  {
    id: "par4",
    name: "Omar Haddad",
    email: "omar.haddad@horizon.edu",
    role: "student",
    type: "request",
    requestedAt: "2026-05-02T10:05:00Z",
  },
]
