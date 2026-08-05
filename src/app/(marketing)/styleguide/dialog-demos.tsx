"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog as DialogRoot,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { StatInfoSheet } from "@/components/ui/stat-info-sheet";

/** A centred modal, for a decision that interrupts. */
export function Dialog() {
  return (
    <DialogRoot>
      <DialogTrigger asChild>
        <Button variant="ghost">Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this session?</DialogTitle>
          <DialogDescription>
            Your progress on the hands you have already played is saved.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Keep playing</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive">End session</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

/** A side sheet on desktop; the bottom drawer is what StatInfoSheet uses. */
export function DrawerLikeDialog() {
  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost">Sheet</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow the hand history.</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="primary">Apply</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* The bottom drawer, in its real use: the (i) on a stat. */}
      <span className="border-border inline-flex items-center gap-1 rounded-full border px-3">
        <span className="text-body-sm text-text-secondary">VPIP 33%</span>
        <StatInfoSheet stat="vpip" value={33} />
      </span>
    </>
  );
}
