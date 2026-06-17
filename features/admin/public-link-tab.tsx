"use client"

import { FormEvent, useEffect, useState, useTransition } from "react"
import {
  Check,
  Copy,
  Globe2,
  LoaderCircle,
  PlusCircle,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react"
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
import { useToast } from "@/hooks/use-toast"
import {
  type OrganizationJoinLinkRow,
  type OrganizationJoinRequestRow,
  useApp,
} from "@/lib/store"
import { cn } from "@/lib/utils"

type PublicRole = "teacher" | "student"
type AccessMode = "approval" | "instant"
type PublicFilter =
  | "all"
  | "enabled"
  | "disabled"
  | "requests"
  | "teacher"
  | "student"

type LinkFormState = {
  purpose: string
  defaultRole: PublicRole
  accessMode: AccessMode
  enabled: boolean
}

type LinkUpdate = Partial<{
  purpose: string
  defaultRole: PublicRole
  approvalRequired: boolean
  enabled: boolean
  regenerate: boolean
}>

type DangerousLinkUpdate = {
  link: OrganizationJoinLinkRow
  updates: LinkUpdate
}

const EMPTY_LINK_FORM: LinkFormState = {
  purpose: "",
  defaultRole: "student",
  accessMode: "approval",
  enabled: false,
}

const ROLE_BADGE_COLOR_MAP: Record<PublicRole, string> = {
  teacher:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  student: "bg-brand-subtle text-brand",
}

function roleLabel(role: PublicRole) {
  return role
}

function getPublicJoinLink(token: string) {
  if (typeof window === "undefined") return null

  return `${window.location.origin}/join/${token}`
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

export function PublicLinkTab() {
  const {
    activeOrganization,
    organizationJoinLinks: joinLinks,
    organizationJoinRequests: joinRequests,
    organizationUsersStatus,
    organizationUsersError,
    refreshOrganizationUsers,
  } = useApp()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [form, setForm] = useState<LinkFormState>(EMPTY_LINK_FORM)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<PublicFilter>("all")
  const [dangerousLinkUpdate, setDangerousLinkUpdate] =
    useState<DangerousLinkUpdate | null>(null)
  const [deleteLinkCandidate, setDeleteLinkCandidate] =
    useState<OrganizationJoinLinkRow | null>(null)
  const [shouldCreateEnabledLink, setShouldCreateEnabledLink] = useState(false)
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null)
  const [busyJoinRequestId, setBusyJoinRequestId] = useState<string | null>(
    null,
  )
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const isLoading = organizationUsersStatus === "loading"

  useEffect(() => {
    void refreshOrganizationUsers().catch(() => {})
  }, [activeOrganization?.id, refreshOrganizationUsers])

  useEffect(() => {
    if (!organizationUsersError) return

    showError("Could not load public links", organizationUsersError)
  }, [organizationUsersError])

  function showError(title: string, description: string) {
    toast({ title, description, variant: "destructive" })
  }

  function showInfo(title: string, description?: string) {
    toast({ title, description })
  }

  async function loadUsers() {
    if (!activeOrganization) return

    try {
      await refreshOrganizationUsers({ force: true })
    } catch (error) {
      showError(
        "Could not refresh public links",
        error instanceof Error ? error.message : "Try again later.",
      )
    }
  }

  function openCreateDialog() {
    setForm(EMPTY_LINK_FORM)
    setIsDialogOpen(true)
  }

  function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeOrganization) return

    if (form.enabled) {
      setShouldCreateEnabledLink(true)
      return
    }

    submitCreateLink(false)
  }

  function submitCreateLink(enabled: boolean) {
    startTransition(async () => {
      try {
        await saveJoinLink({
          purpose: form.purpose.trim(),
          defaultRole: form.defaultRole,
          approvalRequired: form.accessMode === "approval",
          enabled,
        })
        setIsDialogOpen(false)
        setShouldCreateEnabledLink(false)
        setForm(EMPTY_LINK_FORM)
        await loadUsers()
        showInfo("Public link created")
      } catch (error) {
        showError(
          "Could not create public link",
          error instanceof Error ? error.message : "Try again later.",
        )
      }
    })
  }

  function updateLink(
    link: OrganizationJoinLinkRow,
    updates: LinkUpdate,
    skipEnableWarning = false,
  ) {
    if (isDangerousPublicLinkUpdate(link, updates) && !skipEnableWarning) {
      setDangerousLinkUpdate({ link, updates })
      return
    }

    setBusyLinkId(link.id)

    startTransition(async () => {
      try {
        await saveJoinLink({
          linkId: link.id,
          purpose: updates.purpose ?? link.purpose,
          defaultRole: updates.defaultRole ?? link.default_role,
          approvalRequired: updates.approvalRequired ?? link.approval_required,
          enabled: updates.enabled ?? link.enabled,
          regenerate: updates.regenerate ?? false,
        })
        await loadUsers()
        showInfo(
          updates.regenerate
            ? "Public link regenerated"
            : "Public link updated",
        )
      } catch (error) {
        showError(
          "Could not update public link",
          error instanceof Error ? error.message : "Try again later.",
        )
      } finally {
        setBusyLinkId(null)
      }
    })
  }

  function confirmEnableLink() {
    if (dangerousLinkUpdate) {
      const { link, updates } = dangerousLinkUpdate
      setDangerousLinkUpdate(null)
      updateLink(link, updates, true)
      return
    }

    if (shouldCreateEnabledLink) {
      submitCreateLink(true)
    }
  }

  async function saveJoinLink(payload: {
    linkId?: string
    purpose: string
    defaultRole: PublicRole
    approvalRequired: boolean
    enabled: boolean
    regenerate?: boolean
  }) {
    if (!activeOrganization) throw new Error("No organization selected")

    const response = await fetch(
      `/api/organizations/${encodeURIComponent(activeOrganization.id)}/join-link`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )
    const responsePayload = (await response.json().catch(() => ({}))) as {
      error?: string
    }

    if (!response.ok) {
      throw new Error(responsePayload.error ?? "Could not save public link")
    }
  }

  function copyPublicJoinLink(link: OrganizationJoinLinkRow) {
    const publicJoinLink = getPublicJoinLink(link.token)

    if (!publicJoinLink) return

    void navigator.clipboard.writeText(publicJoinLink)
    showInfo("Public join link copied")
  }

  function deleteLink(link: OrganizationJoinLinkRow) {
    if (!activeOrganization) return

    setBusyLinkId(link.id)

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(activeOrganization.id)}/join-link`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linkId: link.id }),
          },
        )
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }

        if (!response.ok) {
          throw new Error(payload.error ?? "Could not delete public link")
        }

        setDeleteLinkCandidate(null)
        await loadUsers()
        showInfo("Public link deleted")
      } catch (error) {
        showError(
          "Could not delete public link",
          error instanceof Error ? error.message : "Try again later.",
        )
      } finally {
        setBusyLinkId(null)
      }
    })
  }

  function reviewJoinRequest(
    request: OrganizationJoinRequestRow,
    action: "approve" | "reject",
  ) {
    if (!activeOrganization) return

    setBusyJoinRequestId(request.id)

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(activeOrganization.id)}/join-requests`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: request.id, action }),
          },
        )
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }

        if (!response.ok) {
          throw new Error(payload.error ?? "Could not review join request")
        }

        await loadUsers()
        showInfo(
          action === "approve"
            ? "Join request approved"
            : "Join request denied",
        )
      } catch (error) {
        showError(
          "Could not review join request",
          error instanceof Error ? error.message : "Try again later.",
        )
      } finally {
        setBusyJoinRequestId(null)
      }
    })
  }

  const normalizedSearch = search.toLowerCase()
  const visibleLinks = joinLinks.filter((link) => {
    const linkUrl = getPublicJoinLink(link.token) ?? ""
    const matchesSearch =
      link.purpose.toLowerCase().includes(normalizedSearch) ||
      linkUrl.toLowerCase().includes(normalizedSearch)
    const matchesFilter =
      filter === "all" ||
      (filter === "enabled" && link.enabled) ||
      (filter === "disabled" && !link.enabled) ||
      (filter !== "requests" &&
        filter !== "enabled" &&
        filter !== "disabled" &&
        link.default_role === filter)

    return matchesSearch && matchesFilter
  })

  const visibleJoinRequests = joinRequests.filter((request) => {
    const name = request.profile?.display_name ?? ""
    const email = request.profile?.email ?? ""
    const matchesSearch =
      name.toLowerCase().includes(normalizedSearch) ||
      email.toLowerCase().includes(normalizedSearch)
    const matchesFilter =
      filter === "all" ||
      filter === "requests" ||
      request.requested_role === filter

    return matchesSearch && matchesFilter
  })

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 items-start sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search public links..."
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  "all",
                  "enabled",
                  "disabled",
                  "requests",
                  "teacher",
                  "student",
                ] as const
              ).map((value) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                    filter === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {value}
                </button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="ml-2 h-7 gap-1 text-xs"
                onClick={openCreateDialog}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Create Link
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading public links...
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visibleLinks.map((link) => (
                <PublicLinkRow
                  key={link.id}
                  link={link}
                  busy={busyLinkId === link.id && isPending}
                  onCopy={copyPublicJoinLink}
                  onUpdate={updateLink}
                  onDeleteRequest={setDeleteLinkCandidate}
                />
              ))}

              {visibleJoinRequests.map((request) => (
                <PublicJoinRequestRow
                  key={request.id}
                  request={request}
                  busy={busyJoinRequestId === request.id && isPending}
                  onReview={reviewJoinRequest}
                />
              ))}

              {visibleLinks.length === 0 && visibleJoinRequests.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No public links or requests match your search.
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create public link</DialogTitle>
            <DialogDescription>
              Create one public link for each role and approval mode. Duplicate
              options are blocked.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createLink}>
            <div className="space-y-2">
              <Label htmlFor="public-link-purpose">Purpose</Label>
              <Input
                id="public-link-purpose"
                value={form.purpose}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    purpose: event.target.value,
                  }))
                }
                placeholder="Student self-enrollment"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={form.defaultRole}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      defaultRole: value as PublicRole,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Access mode</Label>
                <Select
                  value={form.accessMode}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      accessMode: value as AccessMode,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approval">Require approval</SelectItem>
                    <SelectItem value="instant">Join instantly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.enabled}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
              />
              <span>Enable immediately after creating this public link.</span>
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create link"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(dangerousLinkUpdate) || shouldCreateEnabledLink}
        onOpenChange={(open) => {
          if (open) return
          setDangerousLinkUpdate(null)
          setShouldCreateEnabledLink(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable public access?</DialogTitle>
            <DialogDescription>
              Anyone who gets this enabled link can join or request access.
              Shared links can be forwarded outside your intended audience.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {getPendingEnableApprovalRequired(
              dangerousLinkUpdate,
              shouldCreateEnabledLink ? form.accessMode : null,
            )
              ? "Approval is required, but anyone with the link can still submit a request."
              : "This link allows instant joining. Only enable it when the organization is intentionally open."}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDangerousLinkUpdate(null)
                setShouldCreateEnabledLink(false)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={confirmEnableLink}
            >
              {isPending ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Enabling...
                </>
              ) : (
                "Enable public link"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteLinkCandidate)}
        onOpenChange={(open) => {
          if (open) return
          setDeleteLinkCandidate(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete public link?</DialogTitle>
            <DialogDescription>
              This permanently removes the public join URL. Existing members
              keep their access, and pending requests remain for review.
            </DialogDescription>
          </DialogHeader>
          {deleteLinkCandidate ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{deleteLinkCandidate.purpose}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {deleteLinkCandidate.default_role} ·{" "}
                {deleteLinkCandidate.approval_required
                  ? "Approval required"
                  : "Instant join"}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteLinkCandidate(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                Boolean(deleteLinkCandidate) &&
                busyLinkId === deleteLinkCandidate?.id &&
                isPending
              }
              onClick={() => {
                if (deleteLinkCandidate) deleteLink(deleteLinkCandidate)
              }}
            >
              {deleteLinkCandidate &&
              busyLinkId === deleteLinkCandidate.id &&
              isPending ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete link"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PublicLinkRow({
  link,
  busy,
  onCopy,
  onUpdate,
  onDeleteRequest,
}: {
  link: OrganizationJoinLinkRow
  busy: boolean
  onCopy: (link: OrganizationJoinLinkRow) => void
  onUpdate: (link: OrganizationJoinLinkRow, updates: LinkUpdate) => void
  onDeleteRequest: (link: OrganizationJoinLinkRow) => void
}) {
  const publicJoinLink = getPublicJoinLink(link.token)

  return (
    <div className="flex flex-col gap-3 px-5 py-3 hover:bg-muted/50 transition-colors">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary">
              <Globe2 className="h-3.5 w-3.5" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">
                {link.purpose}
              </p>
              <Badge variant={link.enabled ? "default" : "secondary"}>
                {link.enabled ? "Enabled" : "Disabled"}
              </Badge>
              <Badge
                variant="secondary"
                className={cn(
                  "shrink-0 border-0 text-[10px] capitalize",
                  ROLE_BADGE_COLOR_MAP[link.default_role],
                )}
              >
                {roleLabel(link.default_role)}
              </Badge>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {link.approval_required ? "Approval required" : "Instant join"}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {link.enabled && publicJoinLink
                ? publicJoinLink
                : "Disabled public link"}{" "}
              · Used {link.use_count} time{link.use_count === 1 ? "" : "s"}.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 pl-11 lg:pl-0">
          <Button
            size="sm"
            variant={link.enabled ? "outline" : "default"}
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => onUpdate(link, { enabled: !link.enabled })}
          >
            {busy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {link.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={busy}
            onClick={() => onUpdate(link, { regenerate: true })}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => onDeleteRequest(link)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-3 pl-11 lg:grid-cols-[1fr_9rem_12rem]">
        <div className="space-y-1.5">
          <Label className="text-xs">Share link</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={
                link.enabled && publicJoinLink
                  ? publicJoinLink
                  : "Enable this public link before sharing it."
              }
              className="h-8 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={!link.enabled}
              onClick={() => onCopy(link)}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Role</Label>
          <Select
            value={link.default_role}
            onValueChange={(value) =>
              onUpdate(link, { defaultRole: value as PublicRole })
            }
            disabled={busy}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="teacher">Teacher</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Access mode</Label>
          <Select
            value={link.approval_required ? "approval" : "instant"}
            onValueChange={(value) =>
              onUpdate(link, { approvalRequired: value === "approval" })
            }
            disabled={busy}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="approval">Require approval</SelectItem>
              <SelectItem value="instant">Join instantly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

function PublicJoinRequestRow({
  request,
  busy,
  onReview,
}: {
  request: OrganizationJoinRequestRow
  busy: boolean
  onReview: (
    request: OrganizationJoinRequestRow,
    action: "approve" | "reject",
  ) => void
}) {
  const name = request.profile?.display_name ?? "User"
  const email = request.profile?.email ?? "No email"

  return (
    <div className="flex flex-col gap-3 px-5 py-3 hover:bg-muted/50 transition-colors sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-sky-100 text-xs font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            Join request from {name}
          </p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <Badge
          variant="secondary"
          className={cn(
            "shrink-0 border-0 text-[10px] capitalize",
            ROLE_BADGE_COLOR_MAP[request.requested_role],
          )}
        >
          {roleLabel(request.requested_role)}
        </Badge>
        <div className="hidden shrink-0 text-xs text-muted-foreground capitalize md:block">
          pending
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 sm:pl-0">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={busy}
          onClick={() => onReview(request, "approve")}
        >
          {busy ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Approve
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
          disabled={busy}
          onClick={() => onReview(request, "reject")}
        >
          <X className="h-3.5 w-3.5" />
          Deny
        </Button>
      </div>
    </div>
  )
}

function getPendingEnableApprovalRequired(
  dangerousUpdate: DangerousLinkUpdate | null,
  createAccessMode: AccessMode | null,
) {
  if (createAccessMode) return createAccessMode === "approval"

  if (!dangerousUpdate) return true

  return (
    dangerousUpdate.updates.approvalRequired ??
    dangerousUpdate.link.approval_required
  )
}

function isDangerousPublicLinkUpdate(
  link: OrganizationJoinLinkRow,
  updates: LinkUpdate,
) {
  const nextEnabled = updates.enabled ?? link.enabled
  const nextRole = updates.defaultRole ?? link.default_role
  const nextApprovalRequired =
    updates.approvalRequired ?? link.approval_required

  if (!nextEnabled) return false
  if (!link.enabled) return true
  if (link.default_role === "student" && nextRole === "teacher") return true

  return link.approval_required && !nextApprovalRequired
}
