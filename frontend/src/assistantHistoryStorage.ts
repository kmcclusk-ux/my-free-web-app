export const ASSISTANT_MESSAGE_HISTORY_KEY = "portfolio-assistant-message-history";
export const ASSISTANT_PROMPT_HISTORY_KEY = "portfolio-assistant-prompt-history";

type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function assistantHistoryKey(base: string, userId?: string | null) {
  return userId ? `${base}:user:${encodeURIComponent(userId)}` : null;
}

export function readAssistantHistory(storage: HistoryStorage, base: string, userId?: string | null): unknown {
  const key = assistantHistoryKey(base, userId);
  if (!key) return [];
  try {
    return JSON.parse(storage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

export function writeAssistantHistory(storage: HistoryStorage, base: string, userId: string | null | undefined, history: readonly unknown[]) {
  const key = assistantHistoryKey(base, userId);
  if (!key) return;
  try {
    storage.setItem(key, JSON.stringify(history));
  } catch {
    return;
  }
}

export function clearAssistantHistoryStorage(storage: HistoryStorage, userId?: string | null) {
  for (const base of [ASSISTANT_MESSAGE_HISTORY_KEY, ASSISTANT_PROMPT_HISTORY_KEY]) {
    for (const key of [base, assistantHistoryKey(base, userId)]) {
      if (!key) continue;
      try {
        storage.removeItem(key);
      } catch {
        continue;
      }
    }
  }
}
