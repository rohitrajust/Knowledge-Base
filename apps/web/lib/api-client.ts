import type { Message, MessageSource, SearchResult } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ErrorEnvelope {
  error: { code: string; message: string; request_id: string | null };
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorEnvelope | null = null;
  try {
    body = (await response.json()) as ErrorEnvelope;
  } catch {
    body = null;
  }
  return new ApiError(
    response.status,
    body?.error?.code ?? "unknown_error",
    body?.error?.message ?? response.statusText
  );
}

/** One line of the backend's NDJSON chat-event stream (see the /stream endpoints). */
export type ChatStreamEvent =
  | { type: "sources"; sources: SearchResult[] | MessageSource[] }
  | { type: "delta"; text: string }
  | { type: "done"; message?: Message }
  | { type: "error"; error: { code: string; message: string } };

/** Parses one NDJSON line; returns null for blank/corrupt lines rather than throwing,
 * so a single bad chunk can't kill an in-flight answer. Exported for tests. */
export function parseChatStreamLine(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as ChatStreamEvent;
  } catch {
    return null;
  }
}

/**
 * POSTs `body` and consumes an NDJSON event stream (one JSON object per line),
 * invoking `onEvent` per event. Streaming keeps first-token latency visible in the UI
 * instead of waiting for the whole generation. `signal` aborts the client-side render;
 * the server still finishes persisting the full answer either way.
 */
export async function postStream(
  path: string,
  body: unknown,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    throw await toApiError(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emitLines = (flush: boolean) => {
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const event = parseChatStreamLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
      if (event) onEvent(event);
    }
    if (flush) {
      const event = parseChatStreamLine(buffer);
      buffer = "";
      if (event) onEvent(event);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value && value.length > 0) buffer += decoder.decode(value, { stream: true });
    if (done) {
      buffer += decoder.decode();
      emitLines(true);
      return;
    }
    emitLines(false);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path),
};
