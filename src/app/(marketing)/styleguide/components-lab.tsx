"use client";

import { useState } from "react";
import { BookOpenIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DrawerLikeDialog } from "./dialog-demos";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { GradeBadge } from "@/components/ui/grade-badge";
import { RingGauge } from "@/components/ui/ring-gauge";
import { SegmentedMeter } from "@/components/ui/segmented-meter";
import { StatTile } from "@/components/ui/stat-tile";
import { Streak } from "@/components/ui/streak";
import { GRADES } from "@/lib/grade";
import { evColor } from "@/lib/ev-color";
import { RATE_LABEL } from "@/lib/units";

const BUTTON_VARIANTS = [
  "primary",
  "accent",
  "secondary",
  "ghost",
  "bare",
  "destructive",
  "action",
  "link",
] as const;

const BUTTON_SIZES = ["sm", "default", "lg", "action"] as const;

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-overline text-text-tertiary uppercase">{title}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-heading-md">{title}</h3>
      <div className="mt-4 flex flex-col gap-6">{children}</div>
    </div>
  );
}

/** Throws on demand so the boundary can be seen doing its job. */
function Bomb({ armed }: { armed: boolean }) {
  if (armed) throw new Error("Demo failure from the styleguide");
  return <p className="text-text-secondary text-body-md">This subtree is fine.</p>;
}

export function ComponentsLab() {
  const [checked, setChecked] = useState(true);
  const [switched, setSwitched] = useState(true);
  const [armed, setArmed] = useState(false);
  const [streak, setStreak] = useState(7);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-10">
        <Block title="Buttons">
          <Row title="Variants">
            {BUTTON_VARIANTS.map((v) => (
              <Button key={v} variant={v}>
                {v}
              </Button>
            ))}
          </Row>
          <Row title="Sizes — every one clears 44px">
            {BUTTON_SIZES.map((s) => (
              <Button key={s} variant="secondary" size={s}>
                {s}
              </Button>
            ))}
            <Button variant="secondary" size="icon" aria-label="Search">
              <SearchIcon />
            </Button>
            <Button variant="secondary" size="icon-lg" aria-label="Search">
              <SearchIcon />
            </Button>
          </Row>
          <Row title="States">
            <Button variant="primary">Default</Button>
            <Button variant="primary" className="ring-accent-bright/50 ring-[3px]">
              Focus-visible
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button variant="primary" loading>
              Loading
            </Button>
            <Button variant="accent" disabled>
              Accent disabled
            </Button>
            <Button variant="destructive" loading>
              Deleting
            </Button>
          </Row>
        </Block>

        <Block title="Badge">
          <Row title="Variants">
            {(["default", "secondary", "destructive", "outline", "ghost"] as const).map((v) => (
              <Badge key={v} variant={v}>
                {v}
              </Badge>
            ))}
          </Row>
        </Block>

        <Block title="Grade badge">
          <Row title="Every grade — icon and word, never colour alone">
            {GRADES.map((g) => (
              <GradeBadge key={g} grade={g} />
            ))}
          </Row>
          <Row title="Sizes">
            <GradeBadge grade="best" size="sm" />
            <GradeBadge grade="best" size="default" />
            <GradeBadge grade="best" size="lg" />
          </Row>
        </Block>

        <Block title="Form controls">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sg-input">Input</Label>
              <Input id="sg-input" placeholder="Search a spot" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sg-input-invalid">Invalid</Label>
              <Input id="sg-input-invalid" aria-invalid defaultValue="Not a hand" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sg-input-disabled">Disabled</Label>
              <Input id="sg-input-disabled" disabled placeholder="Unavailable" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sg-select">Select</Label>
              <Select>
                <SelectTrigger id="sg-select" className="w-full">
                  <SelectValue placeholder="Position" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="btn">Button</SelectItem>
                  <SelectItem value="co">Cutoff</SelectItem>
                  <SelectItem value="bb">Big blind</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Row title="Checkbox, radio, switch — 44px hit area, 20px visual">
            <span className="flex items-center gap-2">
              <Checkbox
                id="sg-check"
                checked={checked}
                onCheckedChange={(v) => setChecked(v === true)}
              />
              <Label htmlFor="sg-check">Checked</Label>
            </span>
            <span className="flex items-center gap-2">
              <Checkbox id="sg-check-off" />
              <Label htmlFor="sg-check-off">Unchecked</Label>
            </span>
            <span className="flex items-center gap-2">
              <Checkbox id="sg-check-dis" disabled />
              <Label htmlFor="sg-check-dis">Disabled</Label>
            </span>
            <RadioGroup defaultValue="a" className="flex items-center gap-4">
              <span className="flex items-center gap-2">
                <RadioGroupItem value="a" id="sg-r-a" />
                <Label htmlFor="sg-r-a">Cash</Label>
              </span>
              <span className="flex items-center gap-2">
                <RadioGroupItem value="b" id="sg-r-b" />
                <Label htmlFor="sg-r-b">Tournament</Label>
              </span>
            </RadioGroup>
            <span className="flex items-center gap-2">
              <Switch id="sg-switch" checked={switched} onCheckedChange={setSwitched} />
              <Label htmlFor="sg-switch">Sound</Label>
            </span>
          </Row>
        </Block>

        <Block title="Segmented control">
          <Tabs defaultValue="preflop">
            <TabsList>
              <TabsTrigger value="preflop">Preflop</TabsTrigger>
              <TabsTrigger value="flop">Flop</TabsTrigger>
              <TabsTrigger value="turn">Turn</TabsTrigger>
            </TabsList>
            <TabsContent value="preflop" className="text-text-secondary text-body-md pt-4">
              A capsule chip inside a capsule track, one radius step apart.
            </TabsContent>
            <TabsContent value="flop" className="text-text-secondary text-body-md pt-4">
              Flop content.
            </TabsContent>
            <TabsContent value="turn" className="text-text-secondary text-body-md pt-4">
              Turn content.
            </TabsContent>
          </Tabs>
        </Block>

        <Block title="Surfaces and overlays">
          <Card>
            <CardHeader>
              <CardTitle>Card</CardTitle>
              <CardDescription>surface-1, --border, radius-lg.</CardDescription>
            </CardHeader>
            <CardContent className="text-text-secondary text-body-md">
              The default container for everything in the app.
            </CardContent>
          </Card>

          <Row title="Overlays">
            <Dialog />
            <DrawerLikeDialog />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost">Popover</Button>
              </PopoverTrigger>
              <PopoverContent className="text-body-md">
                Anchored to its trigger, for short secondary content.
              </PopoverContent>
            </Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost">Tooltip</Button>
              </TooltipTrigger>
              <TooltipContent>Pointer-only — never the sole carrier of meaning.</TooltipContent>
            </Tooltip>
            <Button variant="ghost" onClick={() => toast.success("Hand saved to review")}>
              Toast
            </Button>
            <Button variant="ghost" onClick={() => toast.error("Could not reach the server")}>
              Error toast
            </Button>
          </Row>

          <Accordion type="single" collapsible>
            <AccordionItem value="one">
              <AccordionTrigger>What is an accordion for?</AccordionTrigger>
              <AccordionContent className="text-text-secondary">
                Progressive disclosure — the FAQ and the glossary index.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="two">
              <AccordionTrigger>Second item</AccordionTrigger>
              <AccordionContent className="text-text-secondary">More content.</AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex items-center gap-4">
            <Avatar>
              <AvatarFallback>MG</AvatarFallback>
            </Avatar>
            <Separator orientation="vertical" className="h-8" />
            <ScrollArea className="border-border h-20 w-56 rounded-md border p-3">
              <p className="text-text-secondary text-body-sm">
                A scroll area keeps a long list inside its own bounds instead of pushing the page
                wider. Range grids, hand histories and the glossary all need one on a phone.
              </p>
            </ScrollArea>
          </div>

          <div className="flex flex-col gap-3">
            <Progress value={62} />
            <div className="flex gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </Block>

        <Block title="Data display">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile
              label="VPIP"
              value={33}
              suffix="%"
              stat="vpip"
              delta={4}
              higherIsBetter={false}
              meterMax={60}
            />
            <StatTile
              label="EV lost"
              value={2.4}
              decimals={1}
              suffix={` ${RATE_LABEL}`}
              stat="ev-loss"
              delta={-1.2}
              higherIsBetter={false}
            />
            <StatTile label="Accuracy" value={78} suffix="%" stat="accuracy" meterMax={100} />
            <StatTile label="Hands played" value={1284} />
          </div>

          <Row title="Ring gauge — per-street performance">
            {[
              ["Preflop", 86],
              ["Flop", 71],
              ["Turn", 54],
              ["River", 38],
            ].map(([street, pct]) => (
              <span key={street as string} className="flex flex-col items-center gap-2">
                <RingGauge
                  value={pct as number}
                  label={`${street as string} accuracy`}
                  color={evColor((100 - (pct as number)) / 12)}
                >
                  <span className="text-body-md font-mono font-semibold tabular-nums">{pct}</span>
                </RingGauge>
                <span className="text-text-tertiary text-caption">{street as string}</span>
              </span>
            ))}
            <RingGauge value={40} max={100} label="Lesson progress" />
          </Row>

          <Row title="Segmented meter">
            <div className="w-48">
              <SegmentedMeter value={3} max={5} segments={5} label="Lessons complete" />
            </div>
            <div className="w-48">
              <SegmentedMeter
                value={8}
                max={10}
                segments={10}
                color="var(--color-grade-best)"
                label="Daily challenge"
              />
            </div>
          </Row>

          <Row title="Streak">
            <Streak days={streak} />
            <Streak days={0} />
            <Button variant="ghost" size="sm" onClick={() => setStreak((d) => d + 1)}>
              Increment
            </Button>
          </Row>
        </Block>

        <Block title="Empty and error states">
          <EmptyState
            icon={BookOpenIcon}
            headline="No hands reviewed yet"
            body="Finish a drill and the hands you got wrong will collect here, worst first."
            action={<Button variant="primary">Start a drill</Button>}
          />

          <div className="border-border rounded-lg border border-dashed p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-body-md text-text-secondary">ErrorBoundary</p>
              <Button variant="ghost" size="sm" onClick={() => setArmed((a) => !a)}>
                {armed ? "Disarm" : "Throw an error"}
              </Button>
            </div>
            <ErrorBoundary key={armed ? "armed" : "safe"}>
              <Bomb armed={armed} />
            </ErrorBoundary>
          </div>
        </Block>
      </div>
    </TooltipProvider>
  );
}
