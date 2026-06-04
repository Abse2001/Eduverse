import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"

type ServerClient = ReturnType<typeof initializeServerClient>

let serverClient: ServerClient | null = null

export function createServerClient() {
  if (serverClient) return serverClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    )
  }

  serverClient = initializeServerClient(supabaseUrl, supabaseSecretKey)

  return serverClient
}

function initializeServerClient(
  supabaseUrl: string,
  supabaseSecretKey: string,
) {
  return createSupabaseClient(supabaseUrl, supabaseSecretKey, {
    global: {
      fetch: createSupabaseServerFetch(),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function createSupabaseServerFetch(): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest
    const shouldAllowInsecureTls =
      process.env.NODE_ENV !== "production" &&
      url.hostname.endsWith(".supabase.co")
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? null
        : Buffer.from(await request.arrayBuffer())

    return new Promise<Response>((resolve, reject) => {
      const headers = new Headers(request.headers)

      const nodeRequest = transport(
        url,
        {
          method: request.method,
          headers: Object.fromEntries(headers.entries()),
          rejectUnauthorized:
            url.protocol === "https:" ? !shouldAllowInsecureTls : undefined,
        },
        (nodeResponse) => {
          const chunks: Buffer[] = []

          nodeResponse.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })

          nodeResponse.on("end", () => {
            const responseHeaders = new Headers()

            for (const [key, value] of Object.entries(nodeResponse.headers)) {
              if (Array.isArray(value)) {
                for (const item of value) {
                  responseHeaders.append(key, item)
                }
                continue
              }

              if (value !== undefined) {
                responseHeaders.set(key, value)
              }
            }

            resolve(
              new Response(chunks.length > 0 ? Buffer.concat(chunks) : null, {
                status: nodeResponse.statusCode ?? 500,
                statusText: nodeResponse.statusMessage ?? "",
                headers: responseHeaders,
              }),
            )
          })
        },
      )

      nodeRequest.on("error", reject)

      if (request.signal.aborted) {
        const error = new Error("This operation was aborted.")
        error.name = "AbortError"
        nodeRequest.destroy(error)
        return
      }

      request.signal.addEventListener(
        "abort",
        () => {
          const error = new Error("This operation was aborted.")
          error.name = "AbortError"
          nodeRequest.destroy(error)
        },
        { once: true },
      )

      if (body) {
        nodeRequest.write(body)
      }

      nodeRequest.end()
    })
  }
}
