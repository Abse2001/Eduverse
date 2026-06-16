type SendInviteEmailInput = {
  to: string
  organizationName: string
  roleLabel: string
  inviteUrl: string
}

type SendInviteEmailResult =
  | { status: "sent" }
  | { status: "not_configured" }
  | { status: "failed"; error: string }

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

export async function sendOrganizationInviteEmail({
  to,
  organizationName,
  roleLabel,
  inviteUrl,
}: SendInviteEmailInput): Promise<SendInviteEmailResult> {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim()
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim()
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim()
  const fromEmail = process.env.GMAIL_FROM_EMAIL?.trim()
  const fromName = process.env.GMAIL_FROM_NAME?.trim() || "Eduverse"

  if (!clientId || !clientSecret || !refreshToken || !fromEmail) {
    return { status: "not_configured" }
  }

  const accessTokenResult = await getGmailAccessToken({
    clientId,
    clientSecret,
    refreshToken,
  })

  if (accessTokenResult.status === "failed") {
    return {
      status: "failed",
      error: `Could not refresh Gmail access token: ${accessTokenResult.error}`,
    }
  }

  const message = createInviteMessage({
    to,
    from: formatAddress(fromEmail, fromName),
    organizationName,
    roleLabel,
    inviteUrl,
  })

  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessTokenResult.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: base64UrlEncode(message),
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string }
    } | null

    return {
      status: "failed",
      error: `Gmail send returned HTTP ${response.status}: ${
        payload?.error?.message ?? response.statusText
      }`,
    }
  }

  return { status: "sent" }
}

async function getGmailAccessToken({
  clientId,
  clientSecret,
  refreshToken,
}: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): Promise<
  { status: "ok"; accessToken: string } | { status: "failed"; error: string }
> {
  const response = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string
    error?: string
    error_description?: string
  } | null

  if (!response.ok || !payload?.access_token) {
    return {
      status: "failed",
      error: `HTTP ${response.status}: ${
        payload?.error_description ?? payload?.error ?? response.statusText
      }`,
    }
  }

  return { status: "ok", accessToken: payload.access_token }
}

function createInviteMessage({
  to,
  from,
  organizationName,
  roleLabel,
  inviteUrl,
}: SendInviteEmailInput & { from: string }) {
  const safeOrganizationName = escapeHtml(organizationName)
  const safeRoleLabel = escapeHtml(roleLabel)
  const safeInviteUrl = escapeHtml(inviteUrl)
  const boundary = `eduverse-${crypto.randomUUID()}`
  const subject = `Confirm your ${sanitizeHeader(organizationName)} invitation`
  const text = [
    `You have been invited to join ${organizationName} as ${roleLabel}.`,
    "",
    "Confirm the invitation by opening this link:",
    inviteUrl,
    "",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n")
  const html = `
<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 12px">Confirm your invitation</h1>
  <p>You have been invited to join <strong>${safeOrganizationName}</strong> as <strong>${safeRoleLabel}</strong>.</p>
  <p>
    <a href="${safeInviteUrl}" style="display:inline-block;background:#0284c7;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none">
      Accept invitation
    </a>
  </p>
  <p style="font-size:13px;color:#64748b">If you were not expecting this invitation, you can ignore this email.</p>
</div>`.trim()

  return [
    `From: ${from}`,
    `To: ${sanitizeHeader(to)}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n")
}

function formatAddress(email: string, name: string) {
  return `"${sanitizeHeader(name).replaceAll('"', "'")}" <${sanitizeHeader(email)}>`
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]/g, " ").trim()
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })
}
