"use client"

import Link from "next/link"
import {
  Bell,
  Building2,
  ChevronDown,
  LogOut,
  Moon,
  Search,
  Sun,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useApp } from "@/lib/store"
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

export function TopBar() {
  const router = useRouter()
  const {
    activeOrganization,
    currentUser,
    isDarkMode,
    toggleDarkMode,
    signOut,
  } = useApp()

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
        {activeOrganization ? (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
          >
            <Link href="/organizations">
              <Building2 className="h-4 w-4" />
              {activeOrganization.name}
            </Link>
          </Button>
        ) : null}

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
              Signed in account
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-2 py-2">
              <p className="text-sm font-medium truncate">{currentUser.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {currentUser.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void signOut().then(() => {
                  router.replace("/auth")
                  router.refresh()
                })
              }}
              className="cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
