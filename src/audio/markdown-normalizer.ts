/**
 * Deterministically normalizes Markdown formatted text into clean speech text for Text-to-Speech synthesis.
 *
 * Rules:
 * - Removes visual markup (**bold**, *italic*, `code`, ~~strike~~, etc.)
 * - Preserves target words, vocabulary items, and phonetic examples verbatim
 * - Converts links [Label](URL) to Label
 * - Strips headers and formatting symbols while keeping sentence punctuation (. , ! ? : ; -)
 * - Collapses extra whitespace
 * - Does NOT invoke an LLM (deterministic and fast)
 */
export function normalizeMarkdownForSpeech(markdown: string): string {
  if (!markdown || typeof markdown !== "string") {
    return "";
  }

  let text = markdown;

  // 1. Remove code blocks (```lang ... ``` or ``` ... ```) but keep the code content inside
  text = text.replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, "$1");

  // 2. Remove inline code (`code` -> code)
  text = text.replace(/`([^`]+)`/g, "$1");

  // 3. Remove Markdown links ([text](url) -> text)
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 4. Remove bold/italic combinations (***bold italic*** -> bold italic, ___bold italic___ -> bold italic)
  text = text.replace(/(\*\*\*|___)(.*?)\1/g, "$2");

  // 5. Remove bold (**bold** -> bold, __bold__ -> bold)
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");

  // 6. Remove italic (*italic* -> italic, _italic_ -> italic)
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");

  // 7. Remove strikethrough (~~strike~~ or ~strike~ -> strike)
  text = text.replace(/~~?(.*?)~~?/g, "$1");

  // 8. Remove Markdown headers (# Header -> Header)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "$1.");

  // 9. Remove blockquotes (> quote -> quote)
  text = text.replace(/^>\s*(.+)$/gm, "$1");

  // 10. Normalize bullet points (- item, * item, • item -> item)
  text = text.replace(/^[\s]*[-*•]\s+/gm, "");

  // 11. Normalize numbered lists (1. item -> item)
  text = text.replace(/^[\s]*\d+\.\s+/gm, "");

  // 12. Remove visual horizontal rules (---, ***, ___)
  text = text.replace(/^[-*_]{3,}$/gm, "");

  // 13. Remove decorative emojis that sound awkward in speech if any (or keep standard text clean)
  // We keep standard letters, numbers, punctuation, spaces
  text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");

  // 14. Collapse multiple spaces and blank lines into sentences
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  text = lines
    .map((line) => (/[.!?]$/.test(line) ? line : line + "."))
    .join(" ");

  // 15. Clean up duplicate punctuation (e.g. ".. " -> ". ")
  text = text
    .replace(/\.+/g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}
