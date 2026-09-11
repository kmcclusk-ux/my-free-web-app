export function embeddingParentOrigin(referrer: string): string | null {
  try {
    const url = new URL(referrer);
    return ["https:", "http:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

export function trustedEmbeddingMessage(event: Pick<MessageEvent, "origin" | "source">, parent: MessageEventSource, origin: string | null): boolean {
  return origin !== null && event.source === parent && event.origin === origin;
}
