// Strict reading of a spoken answer to a pending risky action. Mirrors app/approval.py: change both together.
// true = approve, false = cancel, null = not an answer (nothing runs, the action stays pending).
const CONFIRM_PHRASES = new Set([
  "confirm", "confirm it", "confirm send", "yes confirm", "ok confirm", "okay confirm",
  "haan confirm", "han confirm", "confirm karo", "confirm kar do", "haan confirm karo", "haan confirm kar do",
  "कन्फर्म", "कंफर्म", "हाँ कन्फर्म", "हां कन्फर्म", "कन्फर्म करो", "कन्फर्म कर दो",
]);
const CANCEL_WORDS = new Set([
  "no", "nope", "not", "dont", "never", "cancel", "stop", "wait", "hold",
  "na", "nahi", "nahin", "mat", "ruko", "ruk", "rukiye", "rehne",
  "नहीं", "नही", "ना", "मत", "रुको", "रुक", "रुकिए", "रहने", "कैंसल", "कैंसिल",
]);

export function voiceAnswer(text: string): boolean | null {
  const words = text.toLowerCase().replace(/['’]/g, "").replace(/[.,!?;:।"“”()\-…]+/g, " ").split(/\s+/).filter(Boolean);
  if (words.some((w) => CANCEL_WORDS.has(w))) return false;
  return CONFIRM_PHRASES.has(words.join(" ")) ? true : null;
}
