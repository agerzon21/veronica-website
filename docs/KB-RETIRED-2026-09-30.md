# Knowledge base rows retired 2026-09-30

Nine `ai_context` rows were set `active = FALSE`. **Nothing was deleted.** Every
one is a single UPDATE away from coming back.

## Why

Vero reported the assistant drafting replies that asked a customer for details
she had already given, and re-asking on every revision. The cause was not the
model improvising: it was faithfully citing a knowledge base that had drifted
away from the live website and had accumulated snapshots of old conversations
stored as current fact.

Two groups.

### Wedding pricing that contradicted the published site

| Row | Said | Site says |
|---|---|---|
| Full wedding day package | **$1,000**, minimum 500 photos | **$1,200**, no count published |
| Small Wedding / Ceremony Package | minimum 300 photos | no count published |
| Half wedding day package | $500 for 3-4 hours | no such tier; Wedding Day is $900 / 6 hrs |
| Drone for $1,000 wedding package | keyed to $1,000 | drone is on Full Wedding Day, $1,200 |

The $1,000 row was quoting customers **$200 under** the real price. The photo
counts are where "500-700 professionally edited photos" came from in the reply
that went to Jordan and Dante: not invented from training data, read out of
here. `src/data/contract-template.ts` states the image count is agreed
separately, and the site publishes none.

These are safe to retire because `api/_business-facts.ts` now generates wedding
pricing from `src/data/wedding-page.json`, the same file the public weddings
page renders, so the correct figures reach the assistant automatically and
cannot drift again.

### Stale conversation snapshots stored as facts

Five `Response example for <name>` rows, holding replies to real past customers
under the `tone` category, which the prompt injects as KNOWN FACTS.

- **Availability that has expired.** One states unavailability on a specific
  past September date. A model citing it could tell a live customer that Vero is
  booked on a date she is free.
- **The "how many hours" habit.** "Just to clarify, how many hours are you
  looking for?" was being copied into replies as a template, including into a
  family enquiry that had already said everything the contract needed but one.
- **Pricing that contradicts the row next to it.** Two quote $250 and a $50
  deposit, against the 15% retainer the site and contract publish, and against
  the `No pricing in replies` rule in the same category.

## Undo

```sql
UPDATE ai_context SET active = TRUE WHERE id IN (
  '51a3af91-47b2-49a0-882f-cd5374b817ac', -- Full wedding day package
  '19afdecb-69a1-443a-b664-cf10894e5e2d', -- Small Wedding / Ceremony Package
  '6a656878-0059-461d-bde0-63b81d2365ea', -- Half wedding day package
  'a6e697d4-b405-40f4-a239-c153091992cd', -- Drone for $1,000 wedding package
  '3193a0d4-aba4-458e-bdab-9cfb852042e4', -- Response example for James
  'c6f443f5-4163-44aa-9016-78d62f1e31e8', -- Response example for Eunhye
  'b572fab7-393c-45ae-8777-9d7200ec5514', -- Response example for Eunhye with details
  '586258a4-fd9a-475f-9e16-3feb37ccaddb', -- Response example for Kakay
  'e0bdbd85-6357-4d1e-8051-ca9cc7b98882'  -- Response example for Trisha
);
```

## Still contradictory, NOT touched

These need Vero to say which is right. There is no published source to
adjudicate them, so guessing would be worse than leaving them.

| Topic | Row A | Row B |
|---|---|---|
| Family session price | `Family session pricing`: **$300** | `Family session details`: **$250** |
| Family session length | `Family session duration`: **max 1.5 hrs** | both others: **extend to 2.5 hrs** |
| Single session price | `Individual session pricing`: **$200** | `One-hour session pricing`: **$500** |
| Retainer | `Booking process`: **$50-100 deposit** | `Booking process details` + site: **15%** |

And one policy conflict worth a decision rather than a fix: `No pricing in
replies` says never quote a price, while eight pricing rows exist to be quoted
and the hardcoded prompt says to give ranges. The assistant is being pulled
three ways.

`npm run check:kb` reports all of this on demand.
