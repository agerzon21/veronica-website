# Handoff, 2026-09-29 (overnight)

THE ONE THING THAT MATTERS: **the hero composition is REVERTED and the original
defect is back.** With Safari's toolbar up the composition still renders
(lvh - svh) / 2 low. Do not attempt it again from arithmetic. See below.

## THE HERO, AND WHY IT FAILED

`0a04a33` anchored the composition to `svh`. It fixed the 17 Pro Max the
complaint came from and BROKE an iPhone 13 mini: the gold eyebrow went behind
the navbar and the next-section ring landed on top of Book a Session.
`49e1954` reverted it.

The root cause is not a bad formula, it is an unmeasurable one. **`svh` and
`lvh` are the same number in headless Chrome**, so the state the fix exists for
cannot be entered in the harness at all. Three separate agents said they could
not measure iOS; that agreement was treated as confirmation when it was the
same blind spot three times. Every number behind the change was emulated or
derived from CSS semantics.

**A probe is published and waiting for Alex:**
https://claude.ai/artifact/8qA775AtuqouSsXR2oRHGj
He opens it on each phone. It reports what Safari actually says for svh, lvh
and the safe-area insets, then runs the real `computeCameraSize` constants
against them and prints where the eyebrow, the CTA and the arrow ring land.
**Do not touch the hero until those two screenshots exist.**

Kept from that work, because it is independent and was measured on a real build
at 691 widths: `scrollPastHero` offsets by SITE_HEADER_H + SAFE_BUFFER.
`layoutViewport` still returns `chrome`; nothing reads it.

## WHAT SHIPPED OVERNIGHT

`dec0639` section menu numbering (Info and Favorites unnumbered so a folder
called "1. Proposal Video" stops rendering as "2  1. Proposal Video"); the
gallery-only share section gets its `gray.50` back, matching its twin in
ClientPortalView; the photo page's closing band joins the footer.
`ba40069` the portal's loading state: footer flush to the bottom edge (was two
thirds up), and the eyebrow-and-rule treatment instead of grey text.
`bc2c03f` the image work. Photo page 4,564 KiB to 52 KiB at the Lighthouse
mobile profile, 35 subjects checked, zero served under their painted size.
Gallery category panels, journal strip cells, the signed-out portal no longer
downloading ClientPortalView and ImageModal, one canonical per route, and the
video notice.

## OPEN, WITH THE DECISION EACH ONE NEEDS

1. **The hero.** Blocked on the probe screenshots. Nothing else.
2. **/contact's footer seam.** Asked for twice and deliberately NOT done. Unlike
   About and the photo pages it has no separate closing band: the whole page is
   one `brand.surface` box, so the same fix recolours the entire page. Built,
   measured, reverted: it introduced 7 new WCAG failures (the same 3.96:1
   gold-on-fold as About) and fixing them means editing `ContactRail`, which
   /thank-you also renders. Either recolour and fix the seven, or give Contact a
   real closing band.
3. **`SIGN IN` contrast on /portal.** Reported by Lighthouse, not yet fixed.
4. **/portal ships two robots tags**, the static `index, follow` and its own
   `noindex, nofollow`. Pre-existing and identical on production today. The most
   restrictive wins so it is not indexed. Left alone on purpose: stripping a
   robots tag unattended is how a site gets deindexed.
5. **The journal thumbnails and the video notice are unverified locally.** Both
   need Drive data a local build does not have. Measured by the agents that
   built them and adversarially reviewed, but nobody has seen either render.
6. **The page heroes** stay on the settled ladder. Alex confirmed he is happy to
   leave the 2026-09-06 ruling alone.

## THE LESSON THIS SESSION KEPT TEACHING

**Four checks passed while observing zero of their subject.** A menu check that
found no open menu, a loading-state check that seeded the wrong storage key, a
softness check that read `naturalWidth` (which the spec divides by the computed
density under a `w` descriptor, so it reports back whatever `sizes` said), and
one more. Every one reported green.

Assert the subject exists and FAIL LOUDLY when it does not, and run the
positive control: measure the same thing on a pre-fix build and show the defect
is detectable. A green result from a harness that cannot see the bug is worth
nothing. Adversarial reviewers caught three real blockers that would have
shipped, twice on PortalMosaic and once on the photo page.

Also: do not use `git stash` when agents share the tree, use `git worktree`.

---

# Handoff, 2026-09-29

**Issues A and B are CLOSED**, shipped in `0a04a33` and `9f3e431` and pushed to
`main`. The two portal items the owner raised on 2026-09-29 are closed in the
same push. What follows below this block is the 2026-09-28 handoff, kept for the
reasoning; treat its sections A and B as history, not as work.

Sections 1 to 5 of the 2026-09-24 handoff, further down, are still the source of
truth for WhatsApp. Section C (open items) is unchanged.

---

## WHAT SHIPPED, AND THE TWO PLACES THE DIAGNOSIS BELOW WAS WRONG

`0a04a33` the hero. The arrow now lands SITE_HEADER_H + SAFE_BUFFER above the
next section (measured: 0px of the heading hidden at every width 320 to 2600,
against 11 of 11 hidden on a phone before). The composition is anchored in CSS
`svh` units rather than 50% of the lvh sticky.

**The handoff below proposed computed-pixel anchors. Do not go back to that.** A
reviewer measured that freezing the anchors to px stops them tracking a window
resize under the component's own 200px staleness guard: 1440x900 shrunk to
1440x760 put Book a Session 24.8px BELOW the fold. CSS `svh` is an identity with
the old `calc(50% + offset)` at every size, not just at mount.

**The handoff below is wrong about MOBILE_CHROME_RESERVE.** It says the reserve
widens the top gap and narrows the bottom one. Measured twice, independently: the
camera is centred, so the reserve moves BOTH gaps by R/2 and cannot skew the
balance at all. It is still 140 and that is deliberate.

Also in that commit, and not in the handoff below: the next-section arrow and the
scroll progress rail were still in the lvh frame. At 140px of chrome the arrow
sat 56px BEHIND Safari's toolbar, so on the screen the bug was reported from, the
arrow being tapped was not on screen. Every svh site carries an `@supports`
guard with the pre-change value as its fallback, because a dropped `bottom` is
`auto` and collapses the header, CTA and arrow to y=0.

`9f3e431` the portal sign-in. The mosaic's row count came from
`window.innerHeight` while the field is `inset:0` in a box that grows with the
form, so the photographs stopped partway down (112px of bare cream at 1280x600,
393px on a landscape phone). **There was never any lazy loading to remove**: zero
IntersectionObservers, one sprite sheet, two image requests. The drift is now
specified in px/s rather than seconds a loop, because the old fixed duration was
8.9 px/s on a phone and 49.3 px/s on a 2560 monitor. It pauses on
`:focus-within`, and `autoFocus` had to come off both password fields or the page
arrives frozen.

**Do not "improve" the field to `justify-content: center`.** It was tried and
reverted: it makes the whole field jump vertically 71px in one frame on every
door switch, because the container's top is its only edge that never moves.

## STILL OPEN, BOTH NEED THE OWNER

1. **The last mosaic row is cut at `height % pitch`**, unchanged from before and
   as thin as 1px at some heights. At 2560x1320 the fix changes nothing at all
   (pixel diff 0 of 2,662,400) and he sees the same 15px slice. If that slice is
   what he meant by "half a row", the fix is to size the tiles so a whole number
   of rows divides the box, which makes tile size a function of the viewport.
   He has been asked.
2. **The portal fails WCAG 2.2.2 (Pause, Stop, Hide)**, Level A: the drift is
   automatic, runs over five seconds, and there is no control on the page.
   `prefers-reduced-motion` is honoured but an OS setting is not a page
   mechanism. Options ranked in the session notes; the tasteful one is a
   CTAButton ghost toggle on the offramp line.

Verification tooling worth reusing lives in
`/private/tmp/claude-501/-Users-alexgerzon-Documents-Projects-VeronicaWebsite/0bb7a690-9429-43d5-ad47-358461d2239d/scratchpad/`
(v3-previews has the before/after set). Note: `svh` and `lvh` are EQUAL in
headless Chrome, so iOS chrome cannot be measured, only emulated. And do not use
`git stash` when several agents share the tree; use `git worktree`.

---

# Handoff, 2026-09-28


Read this block first. Sections 1 to 5 below it are the 2026-09-24 handoff and
are still the source of truth for WhatsApp. **Section 1 (THE FOOTER) is CLOSED**,
shipped in `a91d6e7` / `1bcbc32`. Section 2 and 3 (WhatsApp) are still live and
still correct.

Two issues are open, both on the homepage hero, both diagnosed and **neither one
written**. The working tree is clean. Nothing is deployed. Last commit is
`5e7406e`.

---

## A. THE ARROW LANDS HALF A HEADING TOO LOW  (do this one first, it is 1 line)

**Symptom, his words:** clicking the little down arrow at the end of the hero
takes you to the Where to Begin section, but the "Where to Begin" text itself is
cut in half by the header. He called it "a literal matter of pixels" and has been
putting it off.

**Cause, read off the source, not guessed:**

`scrollPastHero` in `src/components/HeroSection.tsx` (~line 615) scrolls to
`el.offsetTop + el.offsetHeight`, which is the exact top edge of the next
section. The public navbar is `position: fixed` and 72px tall
(`SITE_HEADER_H`, `src/components/siteHeader.ts:66`), so it covers the top 72px
of whatever you land on. `HomeChapters` opens with `pt={{ base: 12, md: 16 }}`,
which is 48px on mobile (`src/components/HomeChapters.tsx:144`), and the
"Where to Begin" eyebrow is the very next thing
(`src/components/HomeChapters.tsx:150`). 72 minus 48 leaves 24px of the heading
behind the navbar. That is the half-cut heading.

**Fix:**

```ts
window.scrollTo({
  top: el.offsetTop + el.offsetHeight - SITE_HEADER_H - 16,
  behavior: 'smooth',
});
```

Import `SITE_HEADER_H` from `./siteHeader`. Do NOT reuse HeroSection's own local
`NAVBAR_HEIGHT = 72`. They agree today, but `siteHeader.ts` is the file that is
kept true, and its own comment records that the real header is 68px at 320 and
70px at exactly 992.

**Check two things before shipping it:**
1. Confirm `HomeChapters` really is what follows the hero (`src/pages/Home.tsx:131`)
   and that nothing else calls `scrollPastHero`.
2. `scroll-margin-top` on the section is the other way to do this. It is the
   wrong one here: nothing reaches that section by hash, this is a single
   programmatic call, and putting the offset in the caller keeps `HomeChapters`
   from having to know the navbar exists.

---

## B. THE HERO COMPOSITION ENDS TOO LOW ON A PHONE  (the real work)

**Symptom, his words:** at the end of the hero animation, when the camera has
fully zoomed out and the text has found its place, the whole thing sits too far
down. "We have PLENTY of space up top." Screenshot was an iPhone 17 Pro Max in
Safari with the URL bar and the bottom toolbar both fully expanded. In it, the
gap between the sticky site header and the VERONIKA GERZON eyebrow is roughly
three times the gap between the Book a Session brackets and the toolbar.

He said "still", so this has been attempted before. See `fcf3425`
("The hero fits the screen it is actually on") and `b4d520f` ("Lift hero
bottom-edge UI above mobile browser chrome").

### The defect

The hero's entire composition (header, camera, CTA) is positioned against `50%`
of a sticky box whose height is `100lvh`, while every size budget in
`computeCameraSize` is computed against a **measured `svh`** (`measureSvh()`,
line ~157).

`lvh` is the viewport with the browser chrome HIDDEN. `svh` is the viewport with
it SHOWING. On a desktop the two are the same number, so nothing shows there.
On iOS Safari with the toolbar up, `lvh - svh` is exactly the chrome, and the
composition's centre therefore renders `(lvh - svh) / 2` below the centre of the
strip he can actually see.

**And the existing compensation makes it worse, not better.** `MOBILE_CHROME_RESERVE = 140`
only shrinks the camera. But the header is anchored to
`cameraCentre - finalHeight/2 - CAMERA_GAP` and the CTA to
`cameraCentre + finalHeight/2 + footerGap`, so shrinking the camera pushes the
header DOWN and pulls the CTA UP. The reserve widens the top gap and narrows the
bottom gap, which is the exact imbalance he is complaining about.

### The arithmetic, worked (vw 440, phone portrait, assuming svh 816)

- `headerReserved` = NAVBAR_HEIGHT 72 + SAFE_BUFFER 16 + HEADER_CONTENT_BASE 120 = **208**
- `footerGap` = 56 (FOOTER_GAP_PORTRAIT), `chromeReserve` = 140
- `camAspect` = 833/1135 = 0.734
- `fullAvailableH` = 816 - 208 - 100 - 24 - 56 - 140 = 288, so `extractFooter` is false
- `final` = 211, `finalHeight` = 288, `verticalShiftPx` = 0
- Camera centre renders at `lvh/2` = **478**, not at `svh/2` = 408
- header top = 478 - 144 - 24 - 120 = **190**, so the gap below the navbar is **118px**
- CTA bottom = 478 + 144 + 56 + 84 = **762**, so the gap to the visible bottom (816) is **54px**

118 above against 54 below. That is the screenshot.

**This is a model, not a measurement. Validate it before you trust it.** The svh
of 816 is my estimate, not a reading off his device.

### The fix I was about to write

Anchor the three absolutely positioned children to the measured `svh` instead of
`50%`. `vh` here is `size`'s input, which is already the measured svh.

- header: `bottom={`calc(50% + ${headerBottomOffset}px)`}` becomes
  `bottom={`calc(100% - ${vh / 2 - headerBottomOffset}px)`}` (the parent is
  `100lvh`, so `100%` is lvh)
- camera: `top="50%"` becomes `top={`${vh / 2}px`}`
- footer: `top={`calc(50% + ${footerTopOffset}px)`}` becomes
  `top={`${vh / 2 + footerTopOffset}px`}`

On every desktop `svh === lvh`, so all three are arithmetically identical to
today and nothing there can move. That is worth asserting in the verification.

Anchors are at roughly lines **731** (header), **771** (camera) and **816**
(footer).

### The design question you must answer out loud, not skip

You cannot be centred in both `svh` and `lvh` without `dvh`, and `dvh` was
deliberately removed in `b8e24fd` because it relayouts on every chrome retract
and that is the glitchy redraw. So pick one and say why:

- **Anchor on `svh`.** Correct when the toolbar is up, which is his screenshot.
  About `(lvh - svh)/2` high when it is hidden. The failure mode is cosmetic:
  extra air at the bottom, which is where the "there is more below" cue already
  lives.
- **Anchor on `lvh`** (today). Correct when hidden, too low when up. The failure
  mode is functional: the CTA drifts toward and eventually behind the toolbar.
  That bug has already shipped once on this site, see the `FINAL_WIDTH_MIN`
  comment at line ~381 about the missing call to action on an iPhone 13 mini.

**My recommendation is `svh`**, because a cosmetic failure beats a functional
one, and because the state he photographed is the state that is currently wrong.

**If you take it, re-derive `MOBILE_CHROME_RESERVE` (140).** Once the anchor is
correct that constant is doing the job a second time and will make the camera
needlessly small. It probably wants to come down toward `DESKTOP_CUE_RESERVE`
(104), which is just the cue's own room. Do not simply delete it: the next-cue
button still sits at `bottom: 84px` on mobile and still has to clear the toolbar.

### What I had NOT done, so you are not misled

- **No measurement of any kind.** Everything above is arithmetic read off the
  source. I could not reproduce iOS chrome in headless Chrome because `svh`
  equals `lvh` there.
- **Tooling:** there is no `puppeteer` in this repo and you should not add one.
  `puppeteer-core` and `devtools-protocol` are already installed at
  `/private/tmp/claude-501/-Users-alexgerzon-Documents-Projects-VeronicaWebsite/33b8bd1e-ae3a-4b29-be4c-b081221e4971/scratchpad/node_modules`,
  and Chrome is at `/Applications/Google Chrome.app`.
- **Suggested validation:** replicate `computeCameraSize` in Node, confirm it
  predicts the positions headless Chrome actually measures at a few widths where
  `svh === lvh`, and only then trust it. To simulate iOS the one honest lever is
  to force a smaller `vh` into the component (stub `measureSvh`) and check the
  rendered anchors move by the predicted amount. Then sweep a device matrix with
  the toolbar both up and down and report, for each, the gap from navbar bottom
  to eyebrow top and the gap from CTA bottom to visible bottom, before and after.
- Devices that matter: iPhone SE 375x667, iPhone 13 mini 375x812, iPhone 15
  430x932, iPhone 17 Pro Max 440x956, iPad 820x1180, desktop 1280x800 and
  1440x900. Landscape phone too, because that is the `extractFooter` branch and
  it takes a different path through the same function.

### Files

`src/components/HeroSection.tsx` only, 1095 lines. Constants at 100 to 145,
`computeCameraSize` at 328, the scroll choreography at 500 to 560, the anchors
in the render at 731 / 771 / 816.

---

## C. STILL OPEN FROM BEFORE (not touched, not urgent)

- **WhatsApp export to `result.json`.** Blocked on the SSD being reconnected.
  Toolchain verified still installed (`wtsexporter 0.13.0`, `iphone_backup_decrypt`,
  `gonogo.py`). See sections 2 and 3 below, they are unchanged and still right.
- **Verify the 15 Pro Max backup** before he wipes that phone. `Info.plist`
  confirms a Last Backup Date of 2026-09-26 10:45:48. The deeper manifest check
  needs a keychain approval dialog that an agent cannot click.
- **Regenerate `favicon.ico` and `apple-touch-icon.png`** from the new gold mark.
  They are still grey, and they are binaries, so `scripts/gen-icons.mjs`.
- **Second copy of the 946 GiB backup.** It exists on one external SSD only.
- Flagged but never requested: engagement journal posts do not appear on the
  Weddings page, `src/pages/Weddings.tsx:279` filters on `session_type === 'wedding'`.

---

## D. SHIPPED SINCE THE 2026-09-24 HANDOFF (do not redo)

- `bd4fa4d` price review clause for bookings more than a year out, plus
  `scripts/check-price-review.mjs` as a fifth build gate
- `782084e` logo and monogram moved to gold after a brand audit found the site
  86% warm
- `a91d6e7` / `1bcbc32` the footer, closed
- `c6f9d8d` journal card text uses the full width
- `7491986` Engagement added as a journal post type
- `f3b89c1` the gallery action bar stops covering the footer
- `5e7406e` admin preview of a client's full portal. Zero client-facing files
  changed, verified as a diff fact. **Nobody has seen it render**, the admin
  panel needs a login.

---

## E. HOUSE RULES THAT KEEP BITING

- **No em dashes or en dashes**, in replies to him and in any copy the site
  sends to clients. Comma, colon, parentheses or two sentences.
- **Reuse `CTAButton` and the existing treatments.** Do not hand-roll a Box.
- **Verify which component actually renders the URL** before fixing a UI bug.
  Do not guess from the name.
- **He wants preview screenshots of the REAL build**, not a mock, before a push.
- Assert the subject exists before asserting anything about it. `[].every()`
  passes and has produced green suites that verified nothing.

# Handoff, 2026-09-24

Two threads are live: **the footer** and **WhatsApp**. Everything else this
session is shipped, pushed and green.

`main` is clean at `fe829c1`. `npm run build` passes, all ten gates.

---

## 1. THE FOOTER

**Canvas: https://claude.ai/artifact/R1H2UN9FDoxBwDXXHQCey8**

Alex rejected a first set of fifteen footers outright ("I still dont like ANY
footers"), and the diagnosis stuck: they were one recipe (wordmark + three
circle icons + three legal links + copyright) rearranged fifteen times. Not
one had an idea.

He then picked a direction and gave three constraints, verbatim:

> "I think i'm closer to number 02? But working in the logo somwehre and still
> making the widgets/icons for contact a bit cooler looking while still
> minimalistic."

The published fifteen all descend from that 02, all use the REAL logo files,
and run 150px to 240px tall:

| | | |
|---|---|---|
| 01 Mark, then contact | 06 Avatar bubble | 11 The side door |
| 02 One rail | 07 Clasp and beads | 12 Signed rail (ink) |
| 03 Signed capsule | 08 Full stop | 13 The cut lockup |
| 04 One sentence | 09 Threaded mark | 14 Letterhead line |
| 05 Signed off | 10 Frame one | 15 Wordmark and rule |

**HE HAS NOT PICKED ONE YET.** That is the only open item. When he does, the
work is porting that board into `src/components/Footer.tsx`.

### The insight the whole set is built on

`public/assets/images/logo-mark.svg` is a glyph inside a hairline circle. The
live footer's three social icons are 44px circles with a hairline ring and a
glyph inside. **They have been imitating the logo for months, badly**, at a
different weight and with no relationship to it. Several boards exploit that;
several delete the rings entirely, because "cooler but still minimal" is
usually subtraction.

### The real defect in the live footer

Three 20px icon targets in a 44px world. Every link in every board is >= 44px.
Also: Chakra drops a Stack's `gap` when `divider` is present, which is why the
legal row lost its leading and stranded a bullet. Nothing in the new set uses
divider dots.

### Research behind it (~270 real sites, do not redo)

- **At the top of photography the footer is nearly empty.** Jose Villa: 97px,
  one copyright line. Nadav Kander: 86px, three links. Rinko Kawauchi: a
  copyright and an up arrow. Chris Burkard ships the stock SmugMug footer
  including "Report Content". The elaborate footers belong to people selling
  presets, not photographs.
- **Film's visual language is completely unclaimed.** 87 industry pages grepped
  for sprocket, contact sheet, rebate, test strip, grey card, frame number:
  zero hits in footers.
- **Not one of 21 peer photographers links a client gallery from the footer.**
  Vero has `/portal`. Board 11 "The side door" is the only one that uses it.
- The sticky-footer-reveal that Awwwards ranks first is essentially never
  shipped. Tutorial genre, not practice.
- Burned vocabulary: "find your way around" ships in three Davey & Krista
  templates and With Grace and Gold's.

### Tooling (scratchpad, all working)

- `m/build-footers.mjs <boards.json> <outdir> <assetsdir>` assembles boards +
  `canvas.json`. `CANVAS_TITLE` / `CANVAS_NOTES` env vars set the canvas text.
- `m/shot-f2.mjs <projectdir> <shotsdir>` renders and audits every board.
  **Mutation tested six ways** (20px tap, em dash, gold-on-white, missing image,
  460px content in a 390px board, unparseable script): catches all six.
- `m/grid.mjs <shotsdir> <out.png> <cols>` builds a contact sheet.
- `m/inkvar.mjs` measures whether a photo shows through a masked wordmark, by
  stroke-interior luminance spread.
- Source of truth for the boards: `scratchpad/f2-boards.json`. Edit there and
  rebuild, never edit the built `.dc.html`.

**Two harness bugs fixed during the audit, do not reintroduce:**
1. The contrast check stopped at the first non-transparent background instead
   of compositing alpha. A 3.5% cream wash over ink scored pale type at 1.60:1
   when the truth was ~9:1, failing a correct board.
2. Overflow used `document.scrollWidth`, but the board wrapper is
   `overflow:hidden`, so 460px of content inside a 390px board was silently
   clipped and passed. It now asks elements where they actually are.

---

## 2. WHATSAPP

### Where he is, exactly

Meta app `vero-photography-feed`, App ID `1554856973310778`. It is a **use-case
app**, so there is no "Add product"; he used **Add use cases**. It now carries
both "Managing posts and content on Instagram" (live, carrying real DMs, do not
touch) and "Chat with customers on WhatsApp" (just added).

**Nothing is configured yet. No env vars set. The webhook is deployed and
inert**, answering `500 {"error":"Not configured"}`, which is the correct state.

### The code, already built and deployed

- `api/inbox/_whatsapp-webhook.ts` : GET verification handshake, HMAC over the
  RAW body via `raw-body`, persist-first-ack-fast, idempotent on
  `external_message_id`. Handles `smb_message_echoes` as outbound, which is the
  one coexistence-specific thing most people get wrong.
- `api/_whatsapp-send.ts` : per-phone-number endpoint, surfaces `131047`
  (24h window closed) and `131026` (not on WhatsApp) as 422 not 502.
- `api/admin/_whatsapp-status.ts` + the Integrations card: four env vars split
  into Receiving and Sending, webhook URL with a copy button.
- Deliberately **no auto-reply**, unlike Instagram.

Four env vars, none set: `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
Webhook URL: `https://vero.photography/api/inbox/whatsapp-webhook`.
A verify token was already given to him:
`vero-wa-hook-9f2c7b41ae6d4835bc10e77a2df5`.

### THE DECISION, researched hard, do not relitigate

Her number `+1 (570) 909-5707` is on the WhatsApp Business app with **thousands
of chats over about five years**. Alex balked, correctly, at deleting it.

**Meta's own migration page, verbatim:**

> "To use an existing WhatsApp Business app phone number with Cloud API, you
> must either delete your account, **or onboard to the platform using a partner
> who supports business app number onboarding**" ... and by that route "you will
> be able to use both the WhatsApp Business app and the partner's app
> concurrently, and **your messaging history will be preserved**."

That second route is **Coexistence**. Meta gates it: *"You must already be a
Solution Partner or Tech Provider."* Being the app's own developer does **not**
exempt you (verified; one self-hoster reached the QR scan in development mode
and it failed until he became a Tech Provider).

**ROUTES, ranked as the research landed:**

1. **Become your own Tech Provider.** Free, non-destructive, submittable while
   the app is in development mode. Business Verification, then App Review on
   `whatsapp_business_messaging` + `whatsapp_business_management`, then a step
   nobody documents: Use cases > Connect with your customers on WhatsApp >
   Customize > Become a partner > Become a Tech Provider > Independent Tech
   Provider. A prototype plus two screen recordings is enough. **3 to 6 weeks.**
2. **360dialog Coexistence.** EUR 49/month, days not weeks. He owns the WABA. He
   sets his own webhook, and `smb_message_echoes` arrives in raw Cloud API
   shape, so the parsing is unchanged. Two edits: sender posts to
   `waba-v2.360dialog.io/messages` with a `D360-API-KEY` header; signature
   moves from `X-Hub-Signature-256`/app secret to `x-360dialog-signature`.
3. **NEVER delete.** And the reason is worse than it looks: **deleting the
   account also deletes the Google/iCloud backup.** Meta's migration page says
   back up first; WhatsApp's delete page says deletion deletes the backup.
   Follow both literally and you end with nothing.

**Why 1 over 2 despite the weeks:** provider lock-in is the worst failure mode
in the whole corpus. Meta binds a partner and a credit line at the PHONE NUMBER
level; error `#2655093` strands numbers at a departed BSP for weeks, the block
follows the number across WABAs, deleting the WABA does not clear it. 360dialog
has a Trustpilot case of exactly this from July 2026.

**A correction already issued to him:** I recommended WhatsApp's in-app **Change
Number** trick (move her history to a new number, freeing the published one).
**Retracted.** Nobody has ever reported doing it (roughly fifteen targeted
searches, zero first-hand reports), and the end state is bad anyway: her chats
end up frozen on a number no client has, while the number clients message has
no app behind it. Do not re-propose it.

### Known instability, September 2026

- 12 Sep: a Tech Provider with 100+ coexistence clients reported Meta
  auto-disconnecting them for two weeks.
- 16 Sep: another reported Embedded Signup silently dropping the coexistence
  option and rejecting active Business App numbers with `#2494064`, on a config
  that worked on 1 Sep.
- **Embedded Signup v2 and v3 die 15 October 2026.** Anything built targets v4.
- The portfolio greyout: "This business portfolio owns [YourApp]." Four
  independent reports. Fix is a SECOND business portfolio, confirmed twice.
  **Create it before onboarding**, it is free and ten minutes, and it keeps the
  live Instagram integration out of the blast radius.

### What Coexistence actually gives you

Not her archive. **At most 180 days of 1:1 text, media only 14 days back, no
groups, no reply context**, in a one-shot 24-hour window, opt-in from inside her
app. What it buys is that nothing is destroyed and her app keeps working.

### Code changes coexistence will need (not yet written)

- `_whatsapp-webhook.ts` reads only `value.messages` and `message_echoes`, so it
  would ack the 180-day history and throw it away. Needs `history` and
  `smb_app_state_sync` handling, plus `account_update` subscribed.
- `POST /{phone_number_id}/register` must not be fatal: on a coexistence number
  it returns *"Register endpoint is not available for SMB businesses."*

---

## 3. WHAT HE IS DOING RIGHT NOW

### Step A: prove the pipeline on Meta's free test number

Safe, reversible, touches nothing of hers. He has the ten steps. They prove the
webhook, the signature check, the sender, the env vars and the Vercel deploy.
**They prove nothing about her number or her history**, and passing them does
not remove the need to back up.

### Step B: get her history into a file he holds

Insurance, not a prerequisite. Coexistence destroys nothing; the risk being
insured against is getting stuck three weeks in and being tempted to delete.

**Her phone is an iPhone. His Mac: macOS 15.5, internal 1 TB APFS, ~100 GiB
free, and it has NEVER made a local device backup** (no `MobileSync/Backup`
folder, which makes the symlink route cleaner than the usual write-ups).
`~/Library/Application Support/MobileSync` returns `Operation not permitted`:
Terminal needs Full Disk Access first. He has a 2 TB external SSD with
600-700 GB of another phone's backup already on it.

**A full 13-step iPhone procedure is written** and in the workflow output at
`tasks/wgn3ip2gd.output` (`result.guide.iphone`). Its key move is **step 9, a
30-second GO/NO-GO** that answers the whole question before investing hours:
decrypt the backup manifest and look for domain
`AppDomainGroup-group.net.whatsapp.WhatsAppSMB.shared` (SMB = Business; plain
`net.whatsapp.WhatsApp.shared` is the consumer app). Four or five figure file
count = GO.

**Traps, all verified:**
- **Never tap "Back Up Now" / «Создать резервную копию».** iCloud holds exactly
  one backup, overwritten in place, no version history. That tap destroyed ten
  years of someone's chats.
- **With E2E encrypted backup ON, WhatsApp keeps the chat files out of the
  device backup entirely.** Confirmed by the exporter's maintainer in a
  controlled A/B test and reproduced independently. If it is on, turn it off
  only AFTER a backup copy is safe, then take a fresh backup.
- **iOS 26.3.1**: open GitHub issue 203 reports Business data absent from the
  device backup while consumer WhatsApp from the same backup extracts fine.
  Six months, no maintainer reply, corroborated on Apple Support Communities.
- `--business` is mandatory on the exporter or it silently reads the consumer
  app's file ids and looks empty.
- `pip install iphone_backup_decrypt` installs the WRONG project. Use
  `git+https://github.com/KnugiHK/iphone_backup_decrypt`.
- System Python is 3.9.6; the exporter 0.13.0 needs >= 3.10 and pip silently
  resolves to 0.12.1 instead of failing. Use a brew python3.13 venv.
- Verify against `result.json`, not the HTML. HTML loses chats silently
  (duplicate contact names overwrite each other, empty chats skipped).
- **exFAT will corrupt a Finder backup.** APFS or Mac OS Extended only.
- If a backup is interrupted by a full disk, the standard internet fix is
  "delete the Backup folder", which on his SSD would take the other phone's
  600-700 GB with it. Delete only the UDID subfolder whose `Info.plist` names
  her phone.
- **There is a tool that claims to "import" an export back into WhatsApp. It
  drives WhatsApp Web and RE-SENDS every message.** Pointed at her threads it
  would blast five years of old messages at thousands of real clients. Never.

### THE FOUR FACTS HE OWES YOU

Asked for, not yet answered. He tried to send a screenshot and it was too large
for me to read, so ask for these as text:

1. **Версия iOS** (if it starts with 26.3, stop and go to iMazing instead)
2. **Медиафайлы WhatsApp**, from inside the app
3. **WhatsApp Business** size from Настройки > Основные > Хранилище iPhone
4. `diskutil info /Volumes/<SSD> | grep "File System Personality"`

Plus one he reads himself: **is End-to-end encrypted backup On or Off**, from
WhatsApp Business > Настройки > Чаты > Резервная копия чатов. Read it, do not
tap anything on that screen.

### Her phone is in RUSSIAN. Verified strings, do not translate from English

| English | Russian | note |
|---|---|---|
| Settings | Настройки | |
| General | Основные | not «Общие» |
| About | Об этом устройстве | |
| Software Version | **Версия iOS** | renamed in iOS 16; «Версия ПО» is the stale label most guides still print |
| Storage and data | **Данные и хранилище** | **REVERSED** from English. Not «Хранилище и данные» |
| Manage storage | Управление хранилищем | |
| iPhone Storage | Хранилище iPhone | |
| Software Update | Обновление ПО | the row she must NOT tap |

On iOS 26 the back button on the About screen is a bare chevron with no word,
not «Назад». In March 2026 WhatsApp for iOS replaced the bottom-right Settings
gear with a "You" tab using the profile photo as its icon; the Russian label for
it could not be found and it is unconfirmed whether Business shipped it, so any
message to her should offer both entry points.

---

## 4. SHIPPED THIS SESSION (done, pushed, do not redo)

- **`fe829c1` Search stops putting strangers above clients.** `external_user_id`
  was substring-matched in the top NAME tier, so searching "450" returned two
  Instagram strangers whose 16-digit IDs contain 450, above the booking that
  quoted $450. Now exact-match only. Separately, promotional and personal
  results sort below everything regardless of rank and collapse behind the same
  disclosure the conversation list uses. Verified through the shipped handler
  against production, read only.
- **`5b29338` Three things the assistant got wrong on one booking.**
  (a) `"4 o'clock"` parsed to null, so the form looked at a thread with no time
  and applied BOTH fallbacks: 5:00 PM to 6:00 PM, two numbers nobody said. Now
  reads clock words in both languages, infers the half of the day on a
  documented daylight convention, and **says on screen that it guessed**.
  `scripts/check-time-prefill.mjs`, 28 cases, in the build.
  (b) A conditional price ("$400 here, or $450 two hours away") is not a
  revision; the summariser's "use the MOST RECENT" rule had no notion of it.
  (c) Chat clutter: the model asked "shall I send this?" after every revision,
  and a blocked send printed six lines of model-facing instructions. Now asks
  once, and the block shows one sentence **only when she was expecting a send**
  (`sendish` on `SendApproval`, 65 cases in `check-send-gate`).
- **`cf34728` The gallery header stops wasting two thousand pixels.** On
  `/portal/pass` an empty desktop rail with `ml="auto"` ate the row and pinned
  the section menu to the right edge of a 2560px header. Proven safe by diffing
  a geometry snapshot before and after: **20 of 28 states byte-identical**, and
  the 8 that moved are the two that had the bug.
  `npm run check:portal-header` (not in the build, needs Chrome; exits non-zero
  rather than skipping).

## 5. HOUSE RULES THAT BIT THIS SESSION

- **No em or en dashes**, in replies to Alex and in anything the site sends.
- Answer factual questions by **querying production read-only**
  (`POSTGRES_URL` in `.env.local`), not by reasoning. It settled the $400/$450
  question and the "will she see the revised total" question outright.
- **Mutation-test every guard.** Two suites this session reported green while
  measuring the wrong thing until they were deliberately broken.
- Alex is blunt and time-poor. Lead with the answer.
