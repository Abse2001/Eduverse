"use client"

import { Bell, Moon, Search, Sun } from "lucide-react"
import { AccountMenu } from "@/components/top-bar/account-menu"
import { OrganizationMenu } from "@/components/top-bar/organization-menu"
import { useApp } from "@/lib/store"
import { Button } from "@/components/ui/button"

export function TopBar() {
  const { isDarkMode, toggleDarkMode } = useApp()

  return (
    <header className="h-14 border-b border-border flex items-center px-4 gap-3 bg-card/80 backdrop-blur-sm">
      <div className="relative flex-1 max-w-sm hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search classes, materials, exams..."
          className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <OrganizationMenu />

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
          <span className="sr-only">Notifications</span>
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
          {isDarkMode ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
          <span className="sr-only">Toggle dark mode</span>
        </Button>

        <AccountMenu />
      </div>
    </header>
  )
}
