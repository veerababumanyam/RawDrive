export type ClipboardCopyMethod = "async-clipboard" | "selection-fallback";

function preserveSelection(): (() => void) | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const ranges = Array.from({ length: selection.rangeCount }, (_, index) =>
    selection.getRangeAt(index),
  );

  return () => {
    selection.removeAllRanges();
    for (const range of ranges) {
      selection.addRange(range);
    }
  };
}

function copyWithSelectionFallback(text: string): ClipboardCopyMethod {
  if (
    typeof document === "undefined" ||
    typeof document.execCommand !== "function"
  ) {
    throw new Error("Clipboard unavailable");
  }

  const restoreSelection = preserveSelection();
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  try {
    try {
      textarea.focus({ preventScroll: true });
    } catch {
      textarea.focus();
    }
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    if (!document.execCommand("copy")) {
      throw new Error("Clipboard fallback failed");
    }
    return "selection-fallback";
  } finally {
    textarea.remove();
    restoreSelection?.();
  }
}

export async function copyTextToClipboard(
  text: string,
): Promise<ClipboardCopyMethod> {
  let asyncClipboardError: unknown;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "async-clipboard";
    } catch (err) {
      asyncClipboardError = err;
    }
  }

  try {
    return copyWithSelectionFallback(text);
  } catch (fallbackError) {
    if (asyncClipboardError instanceof Error) throw asyncClipboardError;
    if (fallbackError instanceof Error) throw fallbackError;
    throw new Error("Clipboard unavailable");
  }
}
