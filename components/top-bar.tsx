"use client"

import { Bell, Moon, Sun, Search, ChevronDown } from "lucide-react"
import { useApp } from "@/lib/store"
import { USERS } from "@/lib/mock-data"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const ROLE_COLOR: Record<string, string> = {
  student: "bg-brand-subtle text-brand",
  teacher:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
}

export function TopBar() {
  const { currentUser, setCurrentUser, isDarkMode, toggleDarkMode } = useApp()

  return (
    <header className="h-14 border-b border-border flex items-center px-4 gap-3 bg-card/80 backdrop-blur-sm">
      {/* Search */}
      <div className="relative flex-1 max-w-sm hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search classes, materials, exams..."
          className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
          <span className="sr-only">Notifications</span>
        </Button>

        {/* Dark mode toggle */}
        <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
          {isDarkMode ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
          <span className="sr-only">Toggle dark mode</span>
        </Button>

        {/* Role switcher (dev tool for demo) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors">
              <Avatar className="w-7 h-7">
                <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                  {currentUser.avatar}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:block text-sm font-medium text-foreground">
                {currentUser.name.split(" ")[0]}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              Switch demo user
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {USERS.map((user) => (
              <DropdownMenuItem
                key={user.id}
                onClick={() => setCurrentUser(user)}
                className="flex items-center gap-2 py-2 cursor-pointer"
              >
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                    {user.avatar}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none capitalize",
                    ROLE_COLOR[user.role],
                  )}
                >
                  {user.role}
                </span>
                {currentUser.id === user.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
