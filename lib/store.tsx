"use client"

import React, { createContext, useContext, useState, ReactNode } from "react"
import { type Assignment, type User, USERS } from "@/lib/mock-data"

interface AppContextValue {
  currentUser: User
  setCurrentUser: (user: User) => void
  allUsers: User[]
  assignments: Assignment[]
  addAssignment: (assignment: Assignment) => void
  isDarkMode: boolean
  toggleDarkMode: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  // Default to student view
  const [currentUser, setCurrentUser] = useState<User>(USERS[0])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [isDarkMode, setIsDarkMode] = useState(false)

  function addAssignment(assignment: Assignment) {
    setAssignments((current) => [assignment, ...current])
  }

  function toggleDarkMode() {
    setIsDarkMode((prev) => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add("dark")
      } else {
        document.documentElement.classList.remove("dark")
      }
      return next
    })
  }

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        allUsers: USERS,
        assignments,
        addAssignment,
        isDarkMode,
        toggleDarkMode,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
