/** Client-safe pieces of "Improve with AI" (no zod), shared by web and mobile. */

export const QUESTION_TOPICS = ["travelers", "budget", "dates", "length", "pace", "interests", "stay", "other"] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];

export type ImproveQuestion = { topic: QuestionTopic; question: string; options: { label: string; addition: string }[] };
export type ImproveResult = { improved: string; questions: ImproveQuestion[]; model: string };

/** How long the app waits for an improvement before keeping the person's own text. */
export const IMPROVE_TIMEOUT_MS = 6000;

/** Appends a tapped answer to the request: its own line in a multi-line brief, else its own sentence. */
export function appendAnswer(prompt: string, addition: string): string {
  const base = prompt.trimEnd();
  if (!base) return addition;
  const sep = base.includes("\n") ? "\n" : /[.!?。！？]$/.test(base) ? " " : ". ";
  return `${base}${sep}${addition}`.slice(0, 2000);
}

/** Resolves to null when the promise takes longer than `ms` or fails. */
export function withTimeout<T>(promise: Promise<T>, ms = IMPROVE_TIMEOUT_MS): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
