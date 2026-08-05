/**
 * DESIGN.md rule 4: colour is never the only signal.
 *
 * This is the component that rule exists for. Roughly 8% of men have red-green
 * colour deficiency and this audience is overwhelmingly male, so a grade that
 * communicated only through its colour would be unreadable to a meaningful
 * slice of paying users.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

const { GradeBadge } = await import("../../src/components/ui/grade-badge");
const { GRADES, GRADE_MARKS } = await import("../../src/lib/grade");

afterEach(cleanup);

describe("GradeBadge", () => {
  it.each(GRADES)("renders the word for %s, not just a colour", (grade) => {
    render(<GradeBadge grade={grade} static />);
    expect(screen.getByText(GRADE_MARKS[grade].label)).toBeInTheDocument();
  });

  it.each(GRADES)("renders the icon for %s alongside the word", (grade) => {
    const { container } = render(<GradeBadge grade={grade} static />);
    expect(container.textContent).toContain(GRADE_MARKS[grade].icon);
    expect(container.textContent).toContain(GRADE_MARKS[grade].label);
  });

  it("stays legible with colour stripped out", () => {
    // The greyscale check, in text form: remove every colour and the badge must
    // still say which grade it is.
    const { container } = render(<GradeBadge grade="blunder" static />);
    // The visible gap is flex `gap-2`, so there is no whitespace text node
    // between the icon and the word — compare with spacing normalised away.
    const text = (container.textContent ?? "").replace(/\s+/g, "");
    expect(text).toBe("??Blunder");
  });

  it("gives sharp its glow and no other grade one", () => {
    const { container: sharp } = render(<GradeBadge grade="sharp" static />);
    expect((sharp.firstElementChild as HTMLElement).style.boxShadow).toContain(
      "--color-grade-sharp-glow",
    );

    cleanup();

    const { container: best } = render(<GradeBadge grade="best" static />);
    expect((best.firstElementChild as HTMLElement).style.boxShadow).toBe("");
  });

  it("draws its colour from the grade tokens rather than a literal", () => {
    const { container } = render(<GradeBadge grade="mistake" static />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.color).toBe("var(--color-grade-mistake)");
    expect(el.style.background).toBe("var(--color-grade-mistake-fill)");
    expect(el.style.borderColor).toBe("var(--color-grade-mistake-border)");
  });
});
