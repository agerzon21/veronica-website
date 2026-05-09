# Project notes for Claude / AI agents

## Photos data model

The gallery is driven by a single CSV: [src/data/photos.csv](src/data/photos.csv).
There is no inline image data anywhere else — Gallery, IndividualPhoto, and the
prerender script all read this file (directly or via [src/data/photos.ts](src/data/photos.ts)).

### CSV columns

| Column | Notes |
|---|---|
| `filename` | Slug-based filename, e.g. `sunset-palm-tree-portrait.webp`. The slug (filename minus `.webp`) is also the URL slug at `/photo/<category>/<slug>`. |
| `category` | One of `portraits`, `weddings`, `family`, `maternity` (gallery), or `site` (non-gallery assets like `home-cta-bg`). |
| `alt` | Short, descriptive alt text. Screen-reader-friendly. |
| `title` | Page title without the suffix — `\| Vero Photography` is auto-appended in [photos.ts](src/data/photos.ts). |
| `description` | 1–2 sentences. Used for meta description, OG tags, and body copy. |
| `keywords` | Comma-separated, drawn from the canonical vocabulary below. |
| `status` | `new` = needs the frankenstein pass. `done` = finalized. |

A row is **rendered in the gallery** only if `category` is one of the four gallery categories AND `title` is non-empty. Empty-title rows act as silent placeholders (e.g. for photos awaiting metadata from Veronika).

### Filename convention

`<slug>.webp` where `<slug>` matches the URL id. One identifier across the whole system. No Cloudinary hashes, no Russian characters, no random suffixes. When adding a new photo, derive the slug from the title.

### Folder layout

Photos are stored in category subdirectories under `public/assets/photos/`:

```
public/assets/photos/
  portraits/
  weddings/
  family/
  maternity/
  site/         ← non-gallery assets (page backgrounds, etc.)
```

The CSV's `filename` column is **just the slug** (e.g. `sunset-palm-tree-portrait.webp`) — the category subdirectory is composed at runtime by [photos.ts](src/data/photos.ts) as `/assets/photos/<category>/<filename>`.

**New photos arrive in the parent `public/assets/photos/` root**, not in a subdir — Veronika dumps them there with their original camera filenames. The agent task moves them into the right subdir as part of the frankenstein pass (see below).

---

## "Frankenstein the new photos" — the agent task

When the user asks to "frankenstein the new photos," "process the new photos," "redo the new entries," or similar:

### What to do

1. Read [src/data/photos.csv](src/data/photos.csv).
2. Find every row where `status = new`. The file for each is currently sitting in `public/assets/photos/` (the root, not a subdirectory) under whatever original filename Veronika gave it (e.g. `IMG_4567.webp`, `_C6C1234.webp`).
3. For each one:
   a. **Generate a slug** from the description (kebab-case, descriptive, 2–5 words, e.g. `sunset-palm-tree-portrait`).
   b. **Standardize the populated fields** AND **fill in any missing fields** by deriving them from whatever Veronika did write. Final state for every field:
      - **alt** — short, descriptive, screen-reader-friendly. No marketing fluff.
      - **title** — concise, no `| Vero Photography` (auto-appended). No location names.
      - **description** — 1–2 sentences max. Tone: warm but understated. No generic adjectives like "stunning," "captivating," "beautiful." No locations.
      - **keywords** — pull from the canonical vocabulary (see below). Aim for 5–8 keywords. Always include the category as the first keyword.
   c. **Move the file**: `public/assets/photos/<original-filename>.webp` → `public/assets/photos/<category>/<slug>.webp`.
   d. **Update the CSV row**: replace the `filename` cell with the new slug filename, fill in the standardized fields, set `status = done`.
4. Write the CSV back. Do not touch rows with `status = done`.
5. Build and verify (`npm run build`).

For larger batches, write a one-shot Node script that drives the CSV rewrite and emits a shell script for the file moves. See git history for examples of this pattern.

### Filling in missing fields

The expected case is that Veronika writes *some* content (often `alt` or `description`) but leaves other fields empty. Your job is to standardize what's there and derive the rest:

- If only `alt` is filled → write `title` and `description` from the alt text, then generate keywords from the visual content described.
- If only `description` is filled → write a shorter `alt` from it, derive a `title`, generate keywords.
- If `keywords` are missing → always generate them. Pull from the canonical vocab based on what the alt/title/description describe.
- If `title` is missing → derive from alt/description. Keep it short (3–7 words ideal).

**Only refuse to process a row if literally every metadata field (alt, title, description, keywords) is empty** — in that case there's nothing to derive from. Leave `status=new` and tell the user which rows need Veronika's input.

This is *standardization*, not fabrication. Deriving keywords from an alt text Veronika wrote is fine. Inventing what's in a photo nobody has described is not.

### Style rules (non-negotiable)

- **No location names** in alt/title/description — not "Punta Cana," not "Scranton," not "Almaty," nothing. Veronika's business should be portable.
- **No generic praise words** — avoid "stunning," "beautiful," "captivating," "vibrant," "joyful," "magical," "enchanting."
- **No people-name references in keywords** — "Monica Bellucci" can appear in a description if it's the photo's literal concept, but never as a keyword.
- **Don't fabricate facts.** If `alt`/`title`/`description` is empty and you can't derive content from the filename or surrounding context, leave the row alone and tell the user — don't make things up.
- **Match the tone of existing `done` rows.** Read 5–10 random `done` rows in the same category before writing.

### Canonical keyword vocabulary

Stick to this list. Add a new keyword only when something genuinely doesn't fit and would be useful for filtering or SEO. Always lowercase, hyphenated for multi-word concepts.

**Subject:** woman, girl, man, boy, couple, family, mother, father, daughter, son, sisters, friends, bride, groom, newlyweds, pregnant, baby, newborn, horse

**Setting:** beach, ocean, forest, park, garden, field, studio, interior, kitchen, mountains, glacier, pier, lighthouse, pool

**Time / Light:** sunset, golden-hour, night, natural-light

**Style / Mood:** black-and-white, portrait, close-up, aerial, collage, artistic, elegant, romantic, playful, intimate, fashion

**Things:** flowers, lotus, sunflowers, palm-trees, swimsuit, dress, rings, bouquet, veil, vintage, tropical, autumn, christmas

**Always include the category** (`portraits`/`weddings`/`family`/`maternity`) as the first keyword.

**Drop these from the canonical list** — they're either redundant or useless for filtering: `pregnant-woman` (just `pregnant`), `wedding-rings` (just `rings`), `lace-dress` / `red-dress` / etc. (just `dress`), `bikini` / `red-bikini` (just `swimsuit`), `photography`, `outdoor`, `nature`, `moments`, `special-day`, `memories`, generic praise.

When introducing a new keyword, prefer concept over description: `palm-trees` is meaningful (location/weather signal) — `green-leaves` is not.

---

## Adding a new photo (Veronika's workflow)

1. Drop the photo file into [public/assets/photos/](public/assets/photos/) — the parent root, **not** a subdirectory. Original camera filename is fine.
2. Open [src/data/photos.csv](src/data/photos.csv) in Google Sheets (`File → Import → Upload → Replace current sheet`).
3. Add a row. Minimum: `filename` (the original filename, with `.webp` extension), `category`, and a `description`. Set `status` to `new`. Other fields can be left blank — the agent will fill them.
4. `File → Download → CSV` and replace the file in the repo.
5. Ask Claude (or another agent) to "frankenstein the new photos" — it'll polish each `status=new` row, generate a proper slug, rename the file, and move it into the matching category subdirectory.

The site picks up changes automatically on next build.

---

## Other things to know

- **Per-page og:image** is wired up everywhere — site-wide default is `contact-bg.webp`, but Home/About/Contact/Gallery/categories/individual photos all override with their own. Don't undo this.
- **Pre-rendering**: [scripts/prerender-photos.mjs](scripts/prerender-photos.mjs) runs after `vite build` and generates one static HTML per gallery photo for SEO crawlers. It also regenerates [dist/sitemap.xml](dist/sitemap.xml). It reads the same CSV directly — keep parser logic in sync with [photos.ts](src/data/photos.ts).
- **Related Photos** on individual photo pages is keyword-similarity-based ([findRelatedPhotos](src/data/photos.ts) in photos.ts). If keywords are sloppy, related photos get sloppy. Take keyword tagging seriously.
- **Keyword chips** on individual photo pages are display-only for now. Not clickable. Don't make them clickable without a separate UX conversation — there's no per-keyword landing page yet.
