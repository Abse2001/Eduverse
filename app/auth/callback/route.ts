import { NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createRouteSupabaseClient } from "@/lib/api/supabase-route"

function getSafeNextPath(requestUrl: URL) {
  const next = requestUrl.searchParams.get("next")

  if (!next?.startsWith("/") || next.startsWith("//")) {
    return "/dashboard"
  }

  return next
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null
  const nextPath = getSafeNextPath(requestUrl)
  const redirectUrl = new URL(nextPath, requestUrl.origin)

  if (!code && (!tokenHash || !type)) {
    redirectUrl.searchParams.set("error", "missing_code")
    return NextResponse.redirect(redirectUrl)
  }

  const supabase = await createRouteSupabaseClient()
  const { error } =
    tokenHash && type
      ? await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        })
      : await supabase.auth.exchangeCodeForSession(code!)

  if (error) {
    redirectUrl.searchParams.set("error", "recovery_link_failed")
    redirectUrl.searchParams.set("error_description", error.message)
    return NextResponse.redirect(redirectUrl)
  }

  return NextResponse.redirect(redirectUrl)
}
