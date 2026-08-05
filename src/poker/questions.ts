import type { HandKey } from "./range";
import { grade as gradePreflop, gradeDecision, type Grade } from "./grader";
import { evOf, frequencyOf, type PreflopActionName, type PreflopNode } from "./solutions";

/**
 * Question types.
 *
 * ALL of them grade through the 2.7 grader on EV loss. There is deliberately no
 * second grading path: one grader, one six-grade vocabulary, one accuracy
 * formula. That consistency is the entire reason the rating means anything —
 * a "sizing" question scored on a different scale would silently make the
 * number incomparable between sessions.
 */

export const QUESTION_TYPES = ["action", "hand_choice", "sizing"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface ActionQuestion {
  readonly type: "action";
}

/** "Which hand is the better bluff here?" — four candidates. */
export interface HandChoiceQuestion {
  readonly type: "hand_choice";
  readonly prompt: string;
  /** The action being considered with each candidate hand. */
  readonly action: PreflopActionName;
  readonly candidates: readonly HandKey[];
}

/** "Which sizing is best?" */
export interface SizingQuestion {
  readonly type: "sizing";
  readonly prompt: string;
  /** Action names in the node, e.g. raise / allin. */
  readonly options: readonly PreflopActionName[];
}

export type Question = ActionQuestion | HandChoiceQuestion | SizingQuestion;

export interface QuestionOption {
  /** The value submitted as the answer. */
  readonly value: string;
  readonly label: string;
  /** Hole cards to render, for hand_choice. */
  readonly handKey?: HandKey;
}

export function optionsFor(question: Question): QuestionOption[] {
  switch (question.type) {
    case "hand_choice":
      return question.candidates.map((hand) => ({
        value: hand,
        label: hand,
        handKey: hand,
      }));
    case "sizing":
      return question.options.map((option) => ({ value: option, label: option }));
    case "action":
      return [];
  }
}

/**
 * Grades any question type.
 *
 * `action` and `sizing` are the same problem — which action in this node — so
 * they go straight to the grader. `hand_choice` inverts it: the action is
 * fixed and the HAND varies, so the EV comparison is across candidate hands.
 * The grade band is then computed by the same grader, from an EV loss.
 */
export function gradeQuestion(
  question: Question,
  node: PreflopNode,
  handKey: HandKey,
  answer: string,
): Grade {
  if (question.type === "hand_choice") {
    return gradeHandChoice(question, node, answer);
  }
  // 'action' and 'sizing' are both "which action", so neither needs its own path.
  return gradePreflop(node, handKey, answer as PreflopActionName);
}

/**
 * Which candidate hand is the best one to take `action` with.
 *
 * Reshaped into a GradeInput and handed to the REAL grader: the candidate hands
 * become the "actions" of a one-decision node whose EVs are each hand's EV for
 * the fixed action. No second band table, no second vocabulary — the earlier
 * draft of this duplicated the thresholds, which is precisely the drift the
 * one-grader rule exists to prevent.
 */
function gradeHandChoice(question: HandChoiceQuestion, node: PreflopNode, answer: string): Grade {
  const evs: Record<string, number> = {};
  const rawFreqs: Record<string, number> = {};

  for (const candidate of question.candidates) {
    evs[candidate] = evOf(node, candidate, question.action);
    rawFreqs[candidate] = frequencyOf(node, candidate, question.action);
  }

  // Normalised so the frequency bar reads as a distribution over the four
  // candidates rather than over the node's own actions.
  const total = Object.values(rawFreqs).reduce((sum, f) => sum + f, 0);
  const frequencies: Record<string, number> = {};
  for (const candidate of question.candidates) {
    frequencies[candidate] =
      total > 0 ? (rawFreqs[candidate] ?? 0) / total : 1 / question.candidates.length;
  }

  return gradeDecision({ actions: [...question.candidates], frequencies, evs }, answer);
}

/* ── Presentation routing ────────────────────────────────────────────────── */

export type Presentation = "table" | "history";

export interface PresentationInput {
  /** How many streets carry action. */
  readonly streetsWithAction: number;
  readonly questionType: QuestionType;
}

/**
 * Which format renders a spot.
 *
 * An explicit function rather than conditionals scattered through the player:
 * the rule has to be identical everywhere, and there is a test that runs it
 * over 5,000 generated spots asserting it never returns undefined.
 *
 * The graphical table is right for a single in-the-moment decision. It cannot
 * show four streets at a glance, and it can only ever ask "what do you do?" —
 * so anything deeper or any other question type goes to the text format.
 */
export function presentationFor(input: PresentationInput): Presentation {
  if (input.questionType !== "action") return "history";
  return input.streetsWithAction >= 3 ? "history" : "table";
}
