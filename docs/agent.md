# The agent

Resolve uses an LLM to read what a buyer wrote and looked at, and to talk to them. It does not use the model to decide anything about money. This page covers what the agent does, what it is deliberately unable to do, and how the design holds up when a buyer tries to trick it.

The code is in [`lib/agent/`](../lib/agent). The default model is `gpt-4o` (override with `OPENAI_MODEL`; set `OPENAI_BASE_URL` for any OpenAI-compatible provider).

## What it does

For each buyer message, the agent:

1. Reads the conversation so far, and any photo the buyer attached.
2. Calls read-only tools to check the facts.
3. Either replies in plain text (usually to ask for a photo or a missing detail) or submits an assessment, which ends its turn.

An assessment is a short, fixed set of facts: the complaint type, how confident the agent is, how likely the buyer is to escalate, what the photo shows, whether the text tried to instruct the agent, a three-line summary for the shop owner, and a short friendly message for the buyer. The schema is in [`assessment.ts`](../lib/agent/assessment.ts) and is checked with Zod.

## What it can't do

The agent has five tools, all read-only:

| Tool | Returns |
| --- | --- |
| `get_order` | Items, total, date and refunds already made, read live from PayPal |
| `get_shipment` | Tracking number, carrier and latest status (from the simulated carrier) |
| `get_policy` | The shop's policy lines for one topic |
| `get_buyer_history` | Orders and refunds for this buyer in the last 90 days |
| `submit_assessment` | Records the assessment. Does not act on it |

None of them takes an order id or an email. They are bound to the order the buyer already proved was theirs, so the model has no way to look up someone else's. There is no tool that issues a refund, changes an order or contacts anyone. A test checks that these five are the only tools sent to the model.

The agent also doesn't choose the outcome or the amount, and it doesn't choose how strong the evidence is. Those come from code:

- **Outcome and amount**: the decision engine, from the odds table the seller controls.
- **Evidence strength**: worked out in [`evidence.ts`](../lib/agent/evidence.ts). For a missing parcel it comes from the carrier status (lost is strong, delivered is none). For damage or a wrong item it comes from what the photo shows: clear and showing damage is strong, an unclear photo is weak, no photo is none.
- **The offer card**: written by code, so the amount on it is always the engine's.

## Prompt injection

Buyers write the text the agent reads, and they can attach images, so both are untrusted. The defences are layered, and the first one matters most.

1. **The agent can't pay anyone.** The worst a successful injection can do is produce a bad assessment. The engine and guardrails then work from that assessment and their own limits.
2. **Buyer text is wrapped as data.** Each message goes to the model inside `<buyer_message>` tags, with `<` and `>` escaped so a message can't close the tag early. The system prompt says that everything in those tags, and anything written in a photo, is never an instruction.
3. **The agent reports attempts.** If the text tries to give orders, claims to be the shop owner, or names an amount to refund, the agent sets `injectionSuspected`. A guardrail then sends the case to the shop owner whatever else it says.
4. **Replies are checked.** Before anything the agent wrote reaches the buyer, [`safety.ts`](../lib/agent/safety.ts) rejects it if it contains a money amount the engine didn't produce, a link, or a claim that a refund has already happened. A rejected reply is replaced with fixed wording.
5. **Assessments are validated.** Anything that doesn't match the schema is sent back once for correction. If it fails twice, the case goes to the shop owner.

What this doesn't claim: a determined attacker can still make the agent classify a complaint wrongly or write an odd reply. Wrong classification is bounded by the limits, because a refund can't exceed the auto-limit, the share of the order, the daily cap or what PayPal says is refundable, and an unusual case goes to a person.

## When the agent hands over

A case goes to the shop owner's approval queue when the agent submits an invalid assessment twice, uses too many steps, has low confidence, can't classify the complaint, or flags an injection attempt. The buyer is told the shop owner will follow up in the same chat.

## Measuring it

[`scripts/benchmark.ts`](../scripts/benchmark.ts) runs 25 test complaints through the real agent and then through the real engine and guardrails. It needs only an `OPENAI_API_KEY`.

```bash
npm run benchmark
```

It reports how many complaints were classified correctly, how many of the three attacks were flagged, and how many outcomes broke a guardrail invariant. The target for that last number is zero. Results go to `docs/benchmark-results.md`, which doesn't exist until the script has been run.

Limits of the benchmark: the cases are text only, so photo judgement isn't measured. There are five per complaint type, and the expected labels were written by the person who built the system.

## How a turn works in the app

[`lib/cases/service.ts`](../lib/cases/service.ts) runs each turn. It checks the order number and email, loads the case, reads the order from PayPal, runs the agent, and then (if there is an assessment) plans the outcome, stores the assessment and decision, and writes the reply. Each assessment is saved as a new version and never overwritten, so the console can show how a case developed.

The chat shows which tools the agent used after each turn. The agent does not stream yet, so that line appears when the reply arrives, not while the agent works.
