// Minimal OpenAI Responses API client (server-only: reads OPENAI_API_KEY, which has no NEXT_PUBLIC_
// prefix so it never reaches the browser). AI explains and translates; it never computes routes or
// numbers (docs/ARCHITECTURE.md §6). Every call has an explicit timeout and a validated response.

import { z } from "zod";

const ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 30_000;

export type AiErrorKind = "config" | "timeout" | "api" | "refusal" | "incomplete" | "invalid";

export class AiError extends Error {
  kind: AiErrorKind;
  constructor(kind: AiErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiError";
    this.kind = kind;
  }
}

/** The parts of a Response object we rely on; anything else is ignored. */
const responseSchema = z.object({
  status: z.string(),
  incomplete_details: z.object({ reason: z.string().optional() }).nullish(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional(), refusal: z.string().optional() }))
        .optional(),
    }),
  ),
});

type JsonSchemaFormat = { type: "json_schema"; name: string; schema: Record<string, unknown>; strict: true };

async function respond(opts: {
  instructions: string;
  input: string;
  format?: JsonSchemaFormat;
  maxOutputTokens: number;
  timeoutMs: number;
}): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AiError("config", "OPENAI_API_KEY is not set (see .env.example)");
  const model = process.env.OPENAI_MODEL || "gpt-6-luna";

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: opts.instructions,
        input: opts.input,
        max_output_tokens: opts.maxOutputTokens,
        store: false, // nothing kept on OpenAI's side for later retrieval
        ...(opts.format ? { text: { format: opts.format } } : {}),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new AiError("timeout", `OpenAI did not answer within ${opts.timeoutMs} ms`, { cause: error });
    }
    throw new AiError("api", "OpenAI request failed", { cause: error });
  }

  if (!res.ok) {
    // The error body describes the problem (never contains our key); keep it short for logs.
    const body = (await res.text()).slice(0, 500);
    throw new AiError("api", `OpenAI returned ${res.status}: ${body}`);
  }

  const parsed = responseSchema.safeParse(await res.json());
  if (!parsed.success) throw new AiError("invalid", "Unexpected OpenAI response shape", { cause: parsed.error });
  const response = parsed.data;

  const content = response.output.filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
  const refusal = content.find((c) => c.type === "refusal");
  if (refusal) throw new AiError("refusal", `Model refused: ${refusal.refusal ?? ""}`);
  if (response.status !== "completed") {
    throw new AiError("incomplete", `Response ${response.status}: ${response.incomplete_details?.reason ?? "unknown"}`);
  }
  const text = content
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
  if (!text) throw new AiError("invalid", "Empty model output");
  return text;
}

/** Plain-text answer (briefings, summaries). */
export function generateText(opts: {
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  return respond({ maxOutputTokens: 1_500, timeoutMs: DEFAULT_TIMEOUT_MS, ...opts });
}

/**
 * Structured answer: the model must match `jsonSchema` (strict Structured Outputs), and the result
 * is validated again with `schema` before use — model output is untrusted input.
 */
export async function generateJson<T>(opts: {
  name: string;
  instructions: string;
  input: string;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<T> {
  const text = await respond({
    instructions: opts.instructions,
    input: opts.input,
    format: { type: "json_schema", name: opts.name, schema: opts.jsonSchema, strict: true },
    maxOutputTokens: opts.maxOutputTokens ?? 4_000,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new AiError("invalid", "Model output is not JSON", { cause: error });
  }
  const result = opts.schema.safeParse(json);
  if (!result.success) throw new AiError("invalid", "Model output failed validation", { cause: result.error });
  return result.data;
}
