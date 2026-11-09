"use client";

// AI copilot (docs/DESIGN.md §8): the dispatcher types rules in plain English; the server turns them
// into validated constraints, re-plans with the optimiser and explains the result. Numbers on the
// board always come from the optimiser, never from the AI text.

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { SendIcon, SparklesIcon, Undo2Icon } from "lucide-react";
import { describeRules, EMPTY_RULES, hasRules, type DispatchRules } from "@/lib/dispatch-rules";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { askCopilot, optimiseSlot } from "./actions";

type Message = { id: number; role: "user" | "ai"; text: string };

const SUGGESTIONS = ["We only have 15 Grab cars tonight", "Cars can fit 12 boxes today", "Deliver the Sentosa orders last"];

export function CopilotPanel({
  slotId,
  rules,
  onRulesChange,
  locked,
}: {
  slotId: string;
  rules: DispatchRules;
  onRulesChange: (rules: DispatchRules) => void;
  locked: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<DispatchRules[]>([]); // rules before each applied change
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const nextId = useRef(0);
  const say = (role: Message["role"], text: string) =>
    setMessages((list) => [...list, { id: nextId.current++, role, text }]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setDraft("");
    say("user", message);
    startTransition(async () => {
      const result = await askCopilot({ slotId, message, rules });
      if (!result.ok) {
        say("ai", result.message);
        return;
      }
      say("ai", result.reply);
      for (const warning of result.warnings) toast.warning(warning);
      if (result.changed) {
        setHistory((h) => [...h, rules]);
        onRulesChange(result.rules);
      }
    });
  };

  /** Re-plan under earlier rules (no AI involved). */
  const restore = (previous: DispatchRules, note: string) =>
    startTransition(async () => {
      const result = await optimiseSlot(slotId, previous);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      onRulesChange(previous);
      say("ai", `${note} ${result.message}`);
    });

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    restore(previous, "Undone.");
  };

  const chips = describeRules(rules);

  return (
    <Card className="min-h-0 gap-3 py-3">
      <CardHeader className="flex flex-row items-center gap-2 px-3">
        <SparklesIcon className="size-4 text-ember" aria-hidden />
        <CardTitle className="text-sm">AI copilot</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Rules in this plan</p>
          {chips.length === 0 ? (
            <p className="text-sm text-muted-foreground">None. Tell the copilot about deadlines, cars or orders to keep together.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <Badge key={chip} variant="outline">
                  {chip}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="xs" variant="ghost" disabled={pending || locked || history.length === 0} onClick={undo}>
              <Undo2Icon data-icon="inline-start" />
              Undo
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={pending || locked || !hasRules(rules)}
              onClick={() => {
                setHistory((h) => [...h, rules]);
                restore(EMPTY_RULES, "All rules cleared.");
              }}
            >
              Clear rules
            </Button>
          </div>
        </div>

        <ol className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto" aria-live="polite">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                m.role === "user" ? "self-end bg-secondary" : "self-start border bg-card",
              )}
            >
              {m.role === "ai" && (
                <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <SparklesIcon className="size-3 text-ember" aria-hidden /> AI
                </span>
              )}
              {m.text}
            </li>
          ))}
          {pending && (
            <li className="flex w-3/4 flex-col gap-1.5" aria-label="Copilot is thinking">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </li>
          )}
        </ol>

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <Button key={s} size="xs" variant="outline" disabled={pending || locked} onClick={() => send(s)}>
                {s}
              </Button>
            ))}
          </div>
        )}

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            maxLength={500}
            rows={2}
            placeholder={locked ? "Plan is locked: a run has started." : "e.g. W146592 must arrive by 5:15 PM"}
            aria-label="Instruction for the copilot"
            disabled={locked}
            className="min-h-0 resize-none"
          />
          <Button type="submit" size="icon" disabled={pending || locked || !draft.trim()} aria-label="Send">
            <SendIcon />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
