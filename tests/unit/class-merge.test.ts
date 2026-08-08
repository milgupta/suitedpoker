import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * THE BUG THIS EXISTS TO PREVENT.
 *
 * The design system puts the type scale and the colour palette in the same
 * namespace: `text-body-lg` is a font size, `text-canvas` is a colour. Stock
 * tailwind-merge treats both as one group, so a component that sets a text
 * COLOUR in one variant and a text SIZE in another silently loses the colour.
 *
 * That shipped. `Button variant="primary" size="lg"` resolved to white text on
 * a white pill — the login button and the demo hand's primary call to action
 * both rendered as empty capsules, in production, with nothing thrown and every
 * test green. It is the same failure mode as `text-display-sm`: a class that
 * quietly does nothing.
 *
 * These assertions are behavioural. They check what `cn` actually produces, so
 * they keep working if the merge configuration is rewritten.
 */

describe("cn keeps text colour and text size apart", () => {
  it("does not let a font size strip a colour", () => {
    expect(cn("text-canvas", "text-body-lg")).toBe("text-canvas text-body-lg");
    expect(cn("text-body-lg", "text-canvas")).toBe("text-body-lg text-canvas");
  });

  it("still lets a later font size override an earlier one", () => {
    expect(cn("text-body-sm", "text-body-lg")).toBe("text-body-lg");
    // Real tokens only. There is no `text-heading-sm`, and asserting on one
    // would repeat the `text-display-sm` mistake inside the test meant to
    // catch it.
    expect(cn("text-display-md", "text-heading-md")).toBe("text-heading-md");
  });

  it("still lets a later colour override an earlier one", () => {
    expect(cn("text-canvas", "text-accent-bright")).toBe("text-accent-bright");
  });

  it("leaves unrelated utilities alone", () => {
    expect(cn("px-4", "text-canvas", "text-body-lg", "h-12")).toContain("text-canvas");
  });
});

describe("no button renders its label in its own background colour", () => {
  /**
   * The end-to-end version of the same claim, over every real combination the
   * product ships rather than over one hand-picked pair.
   */
  const VARIANTS = ["primary", "accent", "secondary", "ghost", "bare", "action", "link"] as const;
  const SIZES = ["sm", "default", "lg", "action", "icon", "icon-lg"] as const;

  it("every variant that sets a text colour keeps it at every size", () => {
    const broken: string[] = [];

    for (const variant of VARIANTS) {
      // What the variant asks for on its own, with no size involved.
      const alone = buttonVariants({ variant });
      const wanted =
        /(?:^|\s)(text-(?!body-|display-|heading-|caption|label|mono-)[a-z0-9-]+)/.exec(alone)?.[1];
      if (wanted === undefined) continue;

      for (const size of SIZES) {
        const merged = buttonVariants({ variant, size });
        if (!merged.split(/\s+/).includes(wanted)) {
          broken.push(`${variant}/${size} lost ${wanted}`);
        }
      }
    }

    expect(broken, broken.join("; ")).toEqual([]);
  });

  it("primary is dark text on a light fill, not light on light", () => {
    // The specific pairing that shipped broken, named so a future edit to the
    // variant string cannot quietly reintroduce it.
    const classes = buttonVariants({ variant: "primary", size: "lg" }).split(/\s+/);
    expect(classes).toContain("bg-text-primary");
    expect(classes).toContain("text-canvas");
  });
});

describe("the font-size list matches the stylesheet", () => {
  it("every --text-* token in globals.css is known to the merge config", () => {
    // A new type-scale step that is not registered reintroduces the bug for
    // exactly that step, which is the hardest kind of regression to notice.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const declared = new Set(
      [...css.matchAll(/--text-([a-z0-9-]+):/g)]
        .map((m) => m[1]!)
        .filter((name) => !name.includes("--")),
    );

    const missing = [...declared].filter(
      (size) => cn(`text-${size}`, "text-canvas") !== `text-${size} text-canvas`,
    );

    expect(missing, `unregistered type-scale steps: ${missing.join(", ")}`).toEqual([]);
  });
});
