# Decision engine and guardrails

When a complaint comes in, something has to decide what to offer the buyer and whether to pay without asking the seller. In Resolve, that something is ordinary code with numbers the seller can see and change. The model supplies facts, the code supplies the decision.

Two files do the work:

- [`lib/engine/decide.ts`](../lib/engine/decide.ts) picks the outcome.
- [`lib/engine/guardrails.ts`](../lib/engine/guardrails.ts) decides whether that outcome can run on its own.

Both are pure functions with no network or database access, which makes them easy to test. See `decide.test.ts` and `guardrails.test.ts` next to them.

## What goes in

From the model's assessment:

- **Complaint type**: `not_received`, `damaged`, `wrong_item`, `not_as_described`, `changed_mind`, or `other`
- **Evidence strength**: `strong` (e.g. a clear photo of the damage, or a carrier marking the parcel lost), `weak`, or `none`. The model does not report this: code derives it from the photo facts and the carrier status (see [agent.md](agent.md))

From PayPal and the store:

- the order total, and how much of it is still refundable (read live from PayPal)
- what it costs the seller to send the item again, plus shipping
- whether the item is in stock for a replacement

From the seller's settings:

- the dispute fee
- the odds table (below)
- the share of the order to offer as a partial refund

## The options

| Option | What happens | Cost to the seller |
| --- | --- | --- |
| Explain and hold | Share tracking or policy, ask the buyer to wait | Nothing now, but the buyer may dispute |
| Partial refund | Buyer keeps the item and gets some money back | The refund, if the buyer accepts |
| Replacement | Send the item again | Item cost plus shipping |
| Full refund | Refund whatever is still refundable | The refund |

Not every option makes sense for every complaint:

| Complaint | Options considered |
| --- | --- |
| Damaged, wrong item, not as described | All four |
| Not received | Full refund, replacement, hold. No partial refund, since there's no item to keep |
| Changed mind | Hold only. That's a return-policy question, not a refund decision |
| Other | Hold only, and the case goes to the seller |

Replacement is dropped when the item is out of stock.

## How each option is priced

Using three odds from the table, for the complaint type and evidence strength:

- `d` = chance the buyer disputes if the seller just explains and holds
- `l` = chance the seller loses that dispute
- `a` = chance the buyer accepts a partial refund

```
hold        = d × (dispute fee + l × refundable amount)
partial     = a × partial amount + (1 − a) × cost of the fallback
replacement = item cost + shipping
full refund = refundable amount
```

The partial refund's fallback is whichever other option is cheapest, because that's what the seller would offer next if the buyer says no.

The partial amount is 25% of the order total by default, rounded to the nearest whole dollar. It's only offered if it's more than zero and less than what's still refundable.

The cheapest option wins. On a tie, the one that's more generous to the buyer wins (full refund, then replacement, then partial, then hold).

## The fairness rule

Pure cost math can produce answers nobody should defend. Take a $90 parcel that the carrier has marked lost, with no replacement in stock:

```
hold        = 0.8 × ($15 + 0.95 × $90) = $80.40
full refund = $90.00
```

Holding looks $9.60 cheaper, but only because it bets on the buyer giving up. The buyer is clearly owed their money.

So when the evidence is **strong** and the seller would lose a dispute **80% of the time or more**, hold is marked unfair. It still appears in the table so the seller can see the comparison, and "money saved" is still measured against it, but it can't be chosen. In the example above, Resolve offers the full $90 refund, which then goes to the seller for approval because it's over the limit.

If nothing fair is left (say, the order was already fully refunded), the engine falls back to hold.

## Worked example

A buyer paid $60 for a ceramic mug set and sends a photo of a cracked mug. Item cost $18, shipping $8, dispute fee $15. The odds for "damaged, strong evidence" are d = 0.7, l = 0.9, a = 0.6.

| Option | Expected cost |
| --- | --- |
| Partial refund $15, fallback replacement | 0.6 × $15 + 0.4 × $26 = **$19.40** |
| Replacement | $18 + $8 = $26.00 |
| Explain and hold (unfair here) | 0.7 × ($15 + 0.9 × $60) = $48.30 |
| Full refund | $60.00 |

The engine picks the $15 partial refund, an expected $28.90 cheaper than holding. This exact case is a test.

## Default odds

These are starting guesses, not measured data. The seller is expected to tune them, and the console labels them "your estimates". They live in [`lib/settings.ts`](../lib/settings.ts).

Each cell is `d / l / a`.

| Complaint | Strong evidence | Weak evidence | No evidence |
| --- | --- | --- | --- |
| Not received | 0.8 / 0.95 / 0.2 | 0.3 / 0.5 / 0.2 | 0.2 / 0.3 / 0.2 |
| Damaged | 0.7 / 0.9 / 0.6 | 0.5 / 0.6 / 0.5 | 0.3 / 0.4 / 0.4 |
| Wrong item | 0.7 / 0.9 / 0.4 | 0.5 / 0.6 / 0.4 | 0.3 / 0.4 / 0.3 |
| Not as described | 0.6 / 0.85 / 0.5 | 0.4 / 0.5 / 0.4 | 0.25 / 0.35 / 0.3 |
| Changed mind | 0.1 / 0.1 / 0.1 | 0.1 / 0.1 / 0.1 | 0.1 / 0.1 / 0.1 |
| Other | 0.3 / 0.5 / 0.3 | 0.2 / 0.3 / 0.3 | 0.1 / 0.2 / 0.2 |

## Guardrails

Once the engine has picked an outcome, the guardrails decide what happens to it. Every check that fails leads to one of two results, and the worst one wins:

- **blocked**: nothing is paid, even if the seller approves
- **needs approval**: the seller has to tap Approve first

If every check passes, the result is **auto-execute**.

| Check | Fails when | Result |
| --- | --- | --- |
| Identity | The order number and payer email didn't match | Blocked |
| One open case | Another case is already open for this order | Blocked |
| Confidence | The model's confidence is below 0.7 | Needs approval |
| No injection signal | The agent flagged the buyer's text as trying to instruct it | Needs approval |
| Known complaint | The complaint type is `other` | Needs approval |

These apply only when money would move:

| Check | Fails when | Result |
| --- | --- | --- |
| Fits the capture | The refund is more than what's still refundable | Blocked |
| Capture is refundable | PayPal's capture status isn't `COMPLETED` or `PARTIALLY_REFUNDED` | Blocked |
| Kill switch | Automatic refunds are turned off | Needs approval |
| Auto-limit | The refund is over $25 | Needs approval |
| Share of order | The refund is over 50% of the order | Needs approval |
| Daily cap | Today's automatic refunds plus this one would pass $150 | Needs approval |
| No earlier refund | This order has been refunded before | Needs approval |
| Repeat refunder | This buyer has had 2 or more refunds in 90 days | Needs approval |

Every limit above is a seller setting. The numbers shown are the defaults.

The result, the reasons for each failed check, and the full list of checks are stored with the decision so the seller can see why a case landed where it did.

## What the executor checks again

The guardrails run when the decision is made. The seller might approve hours later, and the buyer could have been refunded some other way in the meantime. So [`lib/paypal/executor.ts`](../lib/paypal/executor.ts) checks again right before paying:

- It refuses anything `blocked`, and anything `needs_approval` without the approver's name.
- If this exact request already succeeded, it returns that result instead of paying again.
- It reads the order from PayPal again and refuses if the refund is now more than what's refundable.
- It sends an explicit amount, never PayPal's empty "refund everything" body, so the log always shows exactly what was asked for.
- It sends a `PayPal-Request-Id` built from the case id and decision version. If the network drops and the call is retried, PayPal recognises it and doesn't refund twice.
- It logs the request before calling PayPal and the response after, including failures.
