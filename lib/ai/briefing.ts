// Forecast briefing for the founder: the model words it, from numbers we computed.

import type { briefingInput } from "../insights.ts";
import { generateText } from "./openai.ts";

const INSTRUCTIONS = `You write a short planning briefing for the founder of Jett Barbecue, a Singapore caterer that delivers smoked beef ribs by Grab car, to prepare for next December.
Use only the numbers provided. Do not calculate new numbers; you may say which of two numbers is larger.
Write 4 to 6 lines, each starting with "- ", plain text, no markdown headings or bold:
the busiest days and delivery windows; how many Grab cars to pre-book for each peak slot; any slot whose forecast ribs exceed this year's rib capacity (or has no slot set up yet); where customers are; booking pace this year versus the same date last year.
Say once that the forecast assumes the given growth over last year and that car counts assume the current car capacity setting.`;

export function writeBriefing(input: ReturnType<typeof briefingInput>): Promise<string> {
  return generateText({ instructions: INSTRUCTIONS, input: JSON.stringify(input), maxOutputTokens: 1_500, timeoutMs: 45_000 });
}
