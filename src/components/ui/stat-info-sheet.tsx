"use client";

import { InfoIcon } from "lucide-react";
import { useState } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/motion";
import { formatStat, getGlossaryEntry, verdictFor } from "@/content/glossary";

export interface StatInfoSheetProps {
  /** A `GLOSSARY` entry id. */
  stat: string;
  value: number;
}

/**
 * The bottom sheet behind the (i) on any stat tile.
 *
 * The structure is fixed and IS the point: name, the current value with a
 * plain-word verdict, what it is in one jargon-free paragraph, then a concrete
 * target and one action. A beginner meeting a stat for the first time needs
 * the definition and the target in the same breath, or the number is noise.
 */
export function StatInfoSheet({ stat, value }: StatInfoSheetProps) {
  const [open, setOpen] = useState(false);
  const entry = getGlossaryEntry(stat);

  // A missing entry means a typo'd id, not a state the user should ever meet.
  if (entry === undefined) return null;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="bare"
          size="icon"
          aria-label={`What is ${entry.name}?`}
          className="text-text-tertiary"
        >
          <InfoIcon />
        </Button>
      </DrawerTrigger>

      <DrawerContent>
        <div className="mx-auto w-full max-w-(--container-marketing) px-4 pb-2">
          <DrawerHeader className="px-0">
            <p className="text-overline text-text-tertiary uppercase">{entry.name}</p>
            <DrawerTitle className="text-display-md mt-2 font-mono tabular-nums">
              <AnimatedNumber value={value} decimals={entry.decimals} suffix={entry.unit} />
              <span className="text-text-secondary text-heading-lg ml-3 font-sans">
                {verdictFor(entry, value)}
              </span>
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {entry.name} is currently {formatStat(entry, value)}.
            </DrawerDescription>
          </DrawerHeader>

          <section className="mt-2">
            <h3 className="text-heading-md">What is this?</h3>
            <p className="text-text-secondary text-body-md mt-2">{entry.what}</p>
          </section>

          <section className="mt-6">
            <h3 className="text-heading-md">How to improve</h3>
            <p className="text-text-secondary text-body-md mt-2">{entry.improve}</p>
          </section>

          <DrawerFooter className="px-0">
            <DrawerClose asChild>
              <Button variant="primary" size="lg" className="w-full">
                Got it
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
