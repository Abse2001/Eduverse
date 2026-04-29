"use client"

import { ChevronDown, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useApp } from "@/lib/store"

export function AccountMenu() {
  const router = useRouter()
  const { currentUser, signOut } = useApp()

  return (
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
  )
}
