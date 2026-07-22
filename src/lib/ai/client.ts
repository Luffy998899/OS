import "server-only";

export function isAiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export type ClaudeMessage = { role: "user" | "assistant"; content: string };

/**
 * Minimal Anthropic Messages API client (no SDK). Returns the assistant text,
 * or null on any error so callers can fall back gracefully.
 */
export async function callClaude(
  system: string,
  messages: ClaudeMessage[],
  maxTokens = 1200,
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      console.error("[claude] error", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    return text || null;
  } catch (e) {
    console.error("[claude] request failed", e);
    return null;
  }
}

/** Extracts the first JSON array/object from a model response. */
export function extractJson<T>(text: string): T | null {
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
