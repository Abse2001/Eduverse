"use client"

import { FormEvent, useEffect, useState, useTransition } from "react"
import {
  Ban,
  LoaderCircle,
  MailPlus,
  MoreHorizontal,
  PlusCircle,
  RotateCcw,
  Search,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"

type OrgRole = "org_owner" | "org_admin" | "teacher" | "student"
type RoleFilter = "all" | "org_admin" | "teacher" | "student"

type MemberRow = {
  id: string
  user_id: string
  role: OrgRole
  status: "active" | "invited" | "suspended"
  profile?: {
    display_name: string
    email: string
  }
}

type InviteRow = {
  id: string
  email: string
  role: Exclude<OrgRole, "org_owner">
  status: "active" | "invited" | "suspended"
  token: string
}

const ROLE_BADGE_COLOR_MAP: Record<OrgRole, string> = {
  org_owner: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  org_admin:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  teacher:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  student: "bg-brand-subtle text-brand",
}

function roleLabel(role: OrgRole | RoleFilter) {
  if (role === "all") return "all"
  if (role === "org_owner") return "owner"
  if (role === "org_admin") return "admin"
  return role
}

function initials(name: string) {
  const value = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  return value || "U"
}

function getInviteLink(token: string) {
  if (typeof window === "undefined") return null

  return `${window.location.origin}/invite/${token}`
}

export function UsersTab() {
  const { activeOrganization } = useApp()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<RoleFilter>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] =
    useState<Exclude<OrgRole, "org_owner">>("teacher")
  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isInviting, startInvite] = useTransition()

  async function loadUsers() {
    if (!activeOrganization) return

    setIsLoading(true)
    setErrorMessage(null)

    const supabase = createClient()
    const { data: membershipData, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("id, user_id, role, status")
      .eq("organization_id", activeOrganization.id)
      .order("created_at", { ascending: true })

    if (membershipError) {
      setErrorMessage(membershipError.message)
      setIsLoading(false)
      return
    }

    const typedMemberships = (membershipData ?? []) as Array<{
      id: string
      user_id: string
      role: OrgRole
      status: "active" | "invited" | "suspended"
    }>
    const userIds = typedMemberships.map((membership) => membership.user_id)

    const { data: profileData, error: profileError } =
      userIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", userIds)
        : { data: [], error: null }

    if (profileError) {
      setErrorMessage(profileError.message)
      setIsLoading(false)
      return
    }

    const profileMap = new Map(
      (
        (profileData ?? []) as Array<{
          id: string
          display_name: string
          email: string
        }>
      ).map((profile) => [
        profile.id,
        { display_name: profile.display_name, email: profile.email },
      ]),
    )

    setMembers(
      typedMemberships.map((membership) => ({
        ...membership,
        profile: profileMap.get(membership.user_id),
      })),
    )

    const { data: inviteData, error: inviteError } = await supabase
      .from("organization_invites")
      .select("id, email, role, status, token")
      .eq("organization_id", activeOrganization.id)
      .in("status", ["invited", "suspended"])
      .order("created_at", { ascending: false })

    if (inviteError) {
      setErrorMessage(inviteError.message)
      setIsLoading(false)
      return
    }

    setInvites((inviteData ?? []) as InviteRow[])
    setIsLoading(false)
  }

  useEffect(() => {
    void loadUsers()
  }, [activeOrganization?.id])

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeOrganization) return

    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)

    startInvite(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc("invite_organization_member", {
        target_org_id: activeOrganization.id,
        invited_email: inviteEmail,
        invited_role: inviteRole,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setInviteEmail("")
      setInviteRole("teacher")
      setIsDialogOpen(false)
      await loadUsers()

      if (data?.result === "membership") {
        setSuccessMessage("Existing user added to this organization.")
        return
      }

      const { data: inviteData } = await createClient()
        .from("organization_invites")
        .select("token")
        .eq("id", data?.invite_id)
        .single()

      const token = inviteData?.token
      const inviteLink = token ? getInviteLink(token) : null

      setLastInviteLink(inviteLink)
      setSuccessMessage(
        inviteLink
          ? "Invite created. Send the invite link to the user."
          : "Invite created for this organization.",
      )
    })
  }

  function revokeInvite(invite: InviteRow) {
    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)
    setBusyInviteId(invite.id)

    startInvite(async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc("revoke_organization_invite", {
        target_invite_id: invite.id,
      })

      if (error) {
        setErrorMessage(error.message)
        setBusyInviteId(null)
        return
      }

      await loadUsers()
      setSuccessMessage(`Invite for ${invite.email} revoked.`)
      setBusyInviteId(null)
    })
  }

  function inviteAgain(invite: InviteRow) {
    if (!activeOrganization) return

    setErrorMessage(null)
    setSuccessMessage(null)
    setLastInviteLink(null)
    setBusyInviteId(invite.id)

    startInvite(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc("invite_organization_member", {
        target_org_id: activeOrganization.id,
        invited_email: invite.email,
        invited_role: invite.role,
      })

      if (error) {
        setErrorMessage(error.message)
        setBusyInviteId(null)
        return
      }

      await loadUsers()

      if (data?.result === "membership") {
        setSuccessMessage("Existing user added to this organization.")
        setBusyInviteId(null)
        return
      }

      const { data: inviteData } = await createClient()
        .from("organization_invites")
        .select("token")
        .eq("id", data?.invite_id)
        .single()

      const token = inviteData?.token
      const inviteLink = token ? getInviteLink(token) : null

      setLastInviteLink(inviteLink)
      setSuccessMessage(
        inviteLink
          ? `Invite for ${invite.email} created again. Send the new link.`
          : `Invite for ${invite.email} created again.`,
      )
      setBusyInviteId(null)
    })
  }

  function copyInviteLink(invite: InviteRow) {
    const inviteLink = getInviteLink(invite.token)

    if (!inviteLink) return

    void navigator.clipboard.writeText(inviteLink)
    setLastInviteLink(inviteLink)
    setSuccessMessage("Invite link copied.")
  }

  const visibleMembers = members.filter((member) => {
    const name = member.profile?.display_name ?? ""
    const email = member.profile?.email ?? ""
    const matchesSearch =
      name.toLowerCase().includes(search.toLowerCase()) ||
      email.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === "all" || member.role === filter

    return matchesSearch && matchesFilter
  })

  const visibleInvites = invites.filter((invite) => {
    const matchesSearch = invite.email
      .toLowerCase()
      .includes(search.toLowerCase())
    const matchesFilter = filter === "all" || invite.role === filter

    return matchesSearch && matchesFilter
  })

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search users..."
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "org_admin", "teacher", "student"] as const).map(
                (role) => (
                  <button
                    key={role}
                    onClick={() => setFilter(role)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors",
                      filter === role
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {roleLabel(role)}
                  </button>
                ),
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs h-7 ml-2"
                onClick={() => setIsDialogOpen(true)}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Add User
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {errorMessage ? (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertTitle>Could not load users</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {successMessage ? (
            <div className="p-4">
              <Alert>
                <AlertTitle>Updated</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2">
                    <p>{successMessage}</p>
                    {lastInviteLink ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input readOnly value={lastInviteLink} />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            void navigator.clipboard.writeText(lastInviteLink)
                          }
                        >
                          Copy link
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading organization users...
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visibleMembers.map((member) => {
                const name = member.profile?.display_name ?? "User"
                const email = member.profile?.email ?? "No email"

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                        {initials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {email}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] border-0 capitalize shrink-0",
                        ROLE_BADGE_COLOR_MAP[member.role],
                      )}
                    >
                      {roleLabel(member.role)}
                    </Badge>
                    <div className="hidden md:block text-xs text-muted-foreground shrink-0 capitalize">
                      {member.status}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                )
              })}

              {visibleInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-col gap-3 px-5 py-3 hover:bg-muted/50 transition-colors sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className="text-xs font-semibold bg-muted text-muted-foreground">
                        <MailPlus className="h-3.5 w-3.5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {invite.status === "suspended"
                          ? "Revoked invite"
                          : "Pending invite"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {invite.email}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] border-0 capitalize shrink-0",
                        ROLE_BADGE_COLOR_MAP[invite.role],
                      )}
                    >
                      {roleLabel(invite.role)}
                    </Badge>
                    <div className="hidden md:block text-xs text-muted-foreground shrink-0 capitalize">
                      {invite.status}
                    </div>
                  </div>
                  {invite.status === "invited" ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 sm:pl-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => copyInviteLink(invite)}
                      >
                        Copy link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                        disabled={busyInviteId === invite.id && isInviting}
                        onClick={() => revokeInvite(invite)}
                      >
                        {busyInviteId === invite.id && isInviting ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                        Revoke
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={busyInviteId === invite.id && isInviting}
                        onClick={() => inviteAgain(invite)}
                      >
                        {busyInviteId === invite.id && isInviting ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Invite again
                      </Button>
                    </div>
                  ) : null}
                  {invite.status === "suspended" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 gap-1 text-xs"
                      disabled={busyInviteId === invite.id && isInviting}
                      onClick={() => inviteAgain(invite)}
                    >
                      {busyInviteId === invite.id && isInviting ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Invite again
                    </Button>
                  ) : null}
                </div>
              ))}

              {visibleMembers.length === 0 && visibleInvites.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No users match your search.
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user to organization</DialogTitle>
            <DialogDescription>
              If the email already belongs to a user, they are added directly.
              Otherwise an invite is recorded for this organization.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitInvite}>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="teacher@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) =>
                  setInviteRole(value as Exclude<OrgRole, "org_owner">)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">Admin</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isInviting}>
                {isInviting ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add user"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
