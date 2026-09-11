import { useState } from "react";
import { formatDollarInputValue, toNumber } from "./numericInput";

export function useCurrencyDraft(value: number) {
  const [draft, setDraft] = useState(() => ({ value, text: formatDollarInputValue(value) }));
  if (draft.value !== value) setDraft({ value, text: formatDollarInputValue(value) });

  function updateDraft(text: string) {
    const amount = toNumber(text);
    setDraft({ value: amount, text: formatDollarInputValue(text) });
    return amount;
  }

  return { text: draft.text, updateDraft };
}
