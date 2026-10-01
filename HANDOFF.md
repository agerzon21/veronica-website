# Handoff, 2026-09-30 into 10-01

Previous handoff covered the hero composition. **That is resolved** and Alex
confirmed it renders correctly on every device he could test. Nothing in this
document relates to it.

Working tree is clean, everything is pushed, `6e564ff` is live.

---

## 1. THE FOOTER, STILL WRONG ON SMALL SCREENS

**This is the live complaint.** Alex's exact words: *"it still looks weird on
smaller devices."* He could not send a screenshot, so **nobody has seen what
is actually wrong.** Get one before changing anything.

### What the footer is

`src/components/Footer.tsx`. One sheet of paper folded once, with the monogram
seal straddling the crease. The seal is **absolutely positioned against the
top of its band**, not in flow. That is the single most important fact about
this component, and it is what I broke: I added a row of links above the
existing row, the links moved down past the fixed seal, and the whole thing
read as sliding upward.

### Current layout

```
Collaborate · Privacy · Terms   [seal / © 2026]   Contact · Portal · Gallery
```

Three links a side in **equal-width columns**. The equality is load bearing:
it is the only thing holding the seal in the centre. A column that sizes to
its own words lets the seal drift with them.

### The measurements, so you do not redo them

At the 13px end of the type clamp:

| Group | Width needed |
|---|---|
| Collaborate · Privacy · Terms | **215px** |
| Contact · Portal · Gallery | 190px |
| Column cap, currently | **240px** |
| Centre column (copyright) | `clamp(118px, 34vw, 146px)` |

Side columns are `clamp(100px, 31vw, 240px)`. The 100px floor and the 31vw
factor together are what keeps `100 + 118 + 100 = 318` inside a 320px phone.
**Raising the vw factor breaks 320px.** I checked: at 34vw a 320px phone needs
336px and the band is `overflow: hidden`, so it clips.

Behaviour by width:

| Viewport | Side | Total | Result |
|---|---|---|---|
| 320px | 100 | 318 | both groups wrap to 2 lines |
| 390px | 121 | 374 | wraps |
| 500px | 155 | 456 | wraps |
| 750px+ | 233-240 | 611-626 | **one line each** |

So **below about 750px the groups wrap by design.** Six links cannot fit one
row on a phone. The 44px link height is a deliberate touch target, so a
wrapped footer is simply taller.

### What "weird" might be, ranked

1. **A `Tick` separator stranded at the start or end of a wrapped line.** The
   ticks are flex children like the links, so wrapping can leave one orphaned.
   Most likely culprit. Fix: render separators with CSS (`:not(:last-child)`
   borders) instead of as elements, or drop them entirely below `sm`.
2. **Ragged alignment.** Left group is `justify: flex-end`, right is
   `flex-start`, so wrapped lines hug the seal and may look lopsided.
3. **The copyright column is fixed at `h="44px"`** while wrapped link columns
   grow to 88px, so the copyright floats near the top of a taller row.

### Options if wrapping is the problem

- Shorten "Collaborate". Alex explicitly asked for that word, so check first.
- Stack the whole footer below `sm`: groups on their own rows, seal and
  copyright beneath. Bigger change, touches the seal positioning, be careful.
- Hide the ticks below `sm`.

**Do not** change the column widths to be unequal. The seal centring depends
on them matching.

---

## 2. PA SALES TAX, RETURNS NOW DUE

Registration is **done**. Both accounts are live in myPATH under Veronika
Polbina, quarterly filer, licence issued. Alex has the logon.

### What is owed, as of 2026-09-30

Re-run this rather than trusting the numbers, payments get added:

```bash
# in the repo root, with .env.local present
node -e "..."  # sum payment_entries by quarter, multiply by 0.06
```

Last measured:

| Period | Payments | Collected | Tax at 6% | Status |
|---|---|---|---|---|
| **Q2 2026** (Apr-Jun) | 8 | $1,380.00 | **$82.80** | **LATE**, was due Jul 20 |
| **Q3 2026** (Jul-Sep) | 12 | $2,975.00 | **$178.50** | **due Oct 20** |
| Q4 2026 | 0 | $0.00 | $0.00 | due Jan 20 |

Note Q3 moved from $2,875 to $2,975 between two of my own checks, so a payment
was logged in between. **Always re-query.**

### How to file

myPATH → Sales and Use Tax account → the Action Center shows both returns
("30-Jun-2026" and "30-Sep-2026") with File Return links. myPATH calculates
the late penalty and interest on Q2; do not try to work it out by hand.

### Context the next agent needs

- PA has **no annual filing option**. Every new business is quarterly for year
  one, reassessed each November on Q3 collections.
- Quarters are **fixed calendar quarters**, not relative to registration.
  Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec, each due the 20th of the following
  month. Alex initially assumed they ran from his registration date.
- First taxable sale was **2026-05-12** (a $100 Venmo retainer). That date is
  on the registration.
- The **Matt & Kim destination wedding is excluded**: the couple is in
  California and delivery was digital to them, so nothing was delivered or
  billed to a PA location. Their $1,500 is still *income* and the portal
  record says $0 paid, which is a bookkeeping gap for the Schedule C.
- **From Oct 1, 6% goes on PA-billed work.** Nothing in the contract, the
  portal or the balance maths knows sales tax exists yet. That is unbuilt and
  it touches the eight places that derive a balance.
- The licence can be recorded in **Admin → Integrations**, last four digits
  only, and the card tracks the five-year renewal and the quarterly deadlines.
  Alex had the number on screen in myPATH but I do not know if he entered it.

---

## 3. INSURANCE, DELIBERATELY DEFERRED TO MARCH

Researched at length, **nothing purchased**, and that is the correct state.

**The decision: per-event, not annual.** Veronika is in the Dominican Republic
from November to March, and Full Frame's policy excludes all non-US/Canada
work outright, so four months of an annual policy would buy nothing. Event
policies are $59 plus $5 for unlimited additional insureds, against roughly
$530 a year.

**The catch, which Alex knows:** event policies cannot carry gear cover, which
is annual-only. So her $6,100 of equipment, including a $2,600 Mavic, is
uninsured, including on the flight to the Caribbean.

**Unanswered after asking four times: does Veronika hold an FAA Part 107
certificate?** No carrier writes commercial drone coverage without one, and
paid drone flights are not legal without one. Roughly $500/year of any policy
hinges on this.

**Built and shipped:** per-event insurance tracking on every booking
(migration 047, `api/admin/_portal-insurance.ts`,
`src/components/AdminClientInsurance.tsx`). Flag a booking, record the policy
with cost and document link, and it creates a `portal_charges` row exactly
once. An `EVENT INSURANCE` contract clause exists on all six contract types,
capped at $150, billable only when the venue required it or the client caused
it.

**Also shipped:** `docs/KB-RETIRED-2026-09-30.md`, and the site still says
"available worldwide" in eight files. If the eventual policy is US-only those
need retuning; per-event buying makes it moot.

---

## 4. THE AI ASSISTANT, LARGELY REBUILT

Alex's complaint was that it asked customers for details they had already
given, and re-asked on every revision. **It was not improvising. It was
faithfully quoting a knowledge base that had drifted from the website.**

### What was wrong, and is now fixed

- `ai_context` said Full Wedding Day was **$1,000**; the site sells it at
  **$1,200**. It was quoting $200 under the real price.
- It said "minimum 500 professionally color-corrected photos". **That is where
  "500-700 professionally edited photos" came from** in a reply that reached a
  real couple. Not invented from training data, read out of the database.
- Five `Response example for <name>` rows held replies to past customers under
  the `tone` category, injected as **known facts**. One states unavailability
  on a long-past date. Another is the literal source of the "just to clarify,
  how many hours are you looking for?" habit.
- **Neither prompt knew what day it was.** A contact form asked for a session
  on the day it was submitted and the draft confirmed it as a normal future
  booking. Took four rounds of correction.
- `HISTORY_CONTEXT_MESSAGES` was **12**, about six exchanges.
- Three stores were **written and never read**: the conversation summary, the
  portal state, and `conversations.client_facts`. One thread held eight facts
  Vero typed by hand, including an agreed $500, invisible to every draft.
- `read_thread` paged `ORDER BY sent_at ASC LIMIT 40`, returning the **oldest**
  40 messages and hiding everything recent.
- "(Nothing was saved against this client.)" fired on nearly every draft
  revision because the claim detector matched a bare "noted" anywhere in the
  reply, including inside the customer-facing draft.

### Still open: three knowledge base contradictions

`npm run check:kb` reports them. **Vero has to decide, there is no published
source to adjudicate:**

| Topic | Row A | Row B |
|---|---|---|
| Family session price | `Family session pricing`: **$300** | `Family session details`: **$250** |
| Family session length | `Family session duration`: **max 1.5 hrs** | the others: **extend to 2.5 hrs** |
| Single session price | `Individual session pricing`: **$200** | `One-hour session pricing`: **$500** |
| Retainer | `Booking process`: **$50-100 deposit** | site + contract: **15%** |

And a policy conflict worth a decision: `No pricing in replies` says never
quote a price, while eight pricing rows exist to be quoted and the hardcoded
prompt says to give ranges. **The assistant is pulled three ways.**

### Lesson worth carrying

I built the insurance claim gate as a blanket ban on the word. Alex then asked
three times for a reply to say they arrange per-event cover, every truthful
phrasing was refused by my own function, and the only wording that passed was
"I will follow up personally". **A gate that only permits silence teaches
silence.** It now blocks the two false claims and allows the true one.

---

## 5. PENDING CLIENT THREADS

**Jordan & Dante**, a wedding enquiry with four questions. The reply has been
redrafted several times. **I do not know whether it was sent.** Check. The
insurance answer should now read as arranging event cover per booking. Two
things that may still be wrong and are not gated in code: it says "Stripe"
where the site lists card/Zelle/Venmo/CashApp, and it describes "$1,300" as a
package when it is Wedding Day ($900) plus a second photographer ($400).

**April Mathews**, wedding **2027-07-31**: Intimate Wedding, $500, 11 AM to
2 PM, contract **pending**. Outstanding:
- **Lake Scranton needs a full street address.** Currently a place name, so
  the Directions button has nothing to open.
- **Partner's full name** still missing; wedding is a couple type and the
  contract will not render without it.
- Retainer is **$75** (15% of $500).
- Price review clause is correctly **off**: the date is 304 days out, inside
  the 365-day trigger.
- Worth raising with her: 11 AM to 2 PM on 31 July outdoors is peak overhead
  sun at two open parks. Her own FAQ promises exactly this advice.
- Both Nay Aug Park and Lake Scranton are public/utility land and may need
  permits.

**Goldy Noe**, a family session enquiry, Lancaster. Her preferred date was
**the day she submitted the form**. Needs clarifying before anything else.
Everything else the contract needs was already in her message except
**coverage hours**.

**Ryan Schmucker**, videographer, Lancaster, nine years at Johns Hopkins, no
wedding reel. Vero replied asking for a call. **Do not add him to the vendors
page until he has actually worked a day**: that list is recommendations to
couples and it is her reputation being lent out. Before he shoots anything,
get his **certificate of insurance**, and note that **$600 in a year triggers
PA Other Income Withholding Tax registration**, the box deliberately left
unticked on Tuesday.

---

## 6. ALSO SHIPPED THIS SESSION

- **Enter asks before sending** in the Messages composer, showing the actual
  text, after Alex sent a half-finished reply to a customer. Cmd/Ctrl+Enter
  still sends immediately.
- **`/collaborate`** page, footer-linked, prerendered, in the sitemap. Contact
  form gained a Collaboration enquiry type that the reply engine understands,
  so applicants are not pitched packages.
- **Price review clause** now on all six contract types, not wedding-only. It
  ticks itself past 365 days and **cannot be ticked inside them**, because the
  clause's own first line would be false.
- **PA sales tax licence card** in Admin → Integrations, tracking the
  five-year renewal and the quarterly deadlines. Stores only the last four
  digits.
- `docs/META-BUSINESS-VERIFICATION.md` corrected: her legal name is **Polbina**,
  not Gerzon. The public site brands as Gerzon throughout while contracts say
  Polbina. That split is deliberate but `src/pages/Terms.tsx:44` names the
  wrong legal person as the site's operator and should be fixed.

---

## 7. TRAPS THAT COST TIME

- **`failProd()` in `scripts/prerender-photos.mjs` only exits when
  `VERCEL_ENV === 'production'`.** A local build prints the warning and exits
  0. I shipped a broken build this way. **Read the prerender section of build
  output specifically**, do not grep across it: my own filter for `FAILED`
  matched the `0 failed` lines of six passing suites and truncated before the
  one line that mattered.
- **Anything in the sitemap must be reachable by link-walking the prerendered
  HTML.** A React Router link does not count. Add it to the noscript nav in
  `index.html`.
- **The footer seal is absolutely positioned.** Adding rows moves everything
  except the seal.
- **The i18n file has sections.** Strings added next to `thisCustomer` land in
  `messages`, not `clientDetail`. Check which object you are inside.
- **Guard scripts encode past decisions.** `check-price-review.mjs` asserted
  wedding-only and failed when I changed that. It was right to fail; I updated
  it deliberately rather than deleting the assertion.
- **Production DB reads may be blocked by the sandbox.** Ask Alex to approve,
  or use `.env.local`, which has `DATABASE_URL`.
- **No OpenAI key locally**, so the assistant cannot be exercised end to end
  from the repo. Verify at the prompt and pure-logic level, then deploy and
  have Alex test.

---

## 8. VERIFICATION COMMANDS

```bash
npm run build          # includes every guard, 250+ checks
npm run check:kb       # knowledge base vs the live site (needs DB)
npm run check:assistant # assistant wiring guard
node scripts/check-api-imports.mjs
npx vercel ls          # deployment status
```

Builds take 6-8 minutes on Vercel. Each one consumes roughly a month of
storage quota, so batch pushes rather than deploying per commit.
