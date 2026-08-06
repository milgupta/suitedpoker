import type { MDXComponents } from "mdx/types";
import { HandExample, KeyIdea, TableExample } from "@/components/curriculum";
import { Checkpoint } from "@/components/curriculum/checkpoint";
import { RangeGridEmbed } from "@/components/curriculum/range-grid-embed";

/**
 * Next's convention: every compiled `.mdx` module resolves its components
 * through this. One place, so a lesson can never reference something that is
 * not wired up.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    RangeGridEmbed,
    HandExample,
    TableExample,
    KeyIdea,
    Checkpoint,
    ...components,
  };
}
