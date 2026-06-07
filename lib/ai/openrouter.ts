export type AiChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type OpenRouterChoice = {
  message?: {
    content?: string
  }
}

type OpenRouterResponse = {
  choices?: OpenRouterChoice[]
  error?: {
    message?: string
  }
}

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions"

export const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"

export async function generateAiText({
  messages,
  temperature = 0.4,
  maxTokens = 900,
}: {
  messages: AiChatMessage[]
  temperature?: number
  maxTokens?: number
}) {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing.")
  }

  const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Eduverse",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  const payload = (await response
    .json()
    .catch(() => null)) as OpenRouterResponse | null

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `OpenRouter request failed (${response.status}).`,
    )
  }

  const content = payload?.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error("The AI model returned an empty response.")
  }

  return content
}

export function parseJsonObject<T>(text: string): T | null {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1] ?? text
  const firstBrace = candidate.indexOf("{")
  const lastBrace = candidate.lastIndexOf("}")

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }

  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T
  } catch {
    return null
  }
}
