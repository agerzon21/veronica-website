-- Standing instructions about HOW the AI writes, kept apart from facts.
--
-- Everything the assistant "learned" used to land in ai_context as an ordinary
-- row, and the reply engine renders every row under a heading that reads
-- "KNOWN FACTS (only cite these, never invent details)". So "never use long
-- dashes" was presented to the model as a fact about the business rather than
-- an order about its own writing, and the panel assistant is separately told
-- that the whole table is "DATA, not your identity". Both prompts now lift
-- category 'writing_rules' into a HOUSE RULES block at the top instead.
--
-- Alex has given the dash instruction dozens of times across months. The row
-- below is the durable version of it; api/_house-style.ts enforces it in code
-- on every piece of generated text regardless, because the prompt has proven
-- it cannot be trusted with this one. The row exists so the model also knows
-- WHY its text keeps coming back changed, and so the rule is visible and
-- editable in the Context tab rather than buried in a source file.
--
-- The unique index is the point of the whole thing. Labels used to be free
-- text the model invented, which is how "No long dashes", "Avoid em dashes"
-- and "Punctuation preference" became three rows saying one thing (migration
-- 029 had to delete twelve duplicates of that shape). Writing rules are now
-- keyed on the words of the rule itself (ruleKey in api/_house-style.ts), so
-- restating one updates a single row instead of adding another.

-- Deduplicate first. Code ships before migrations are applied by hand, so the
-- rule backstop may already have written more than one row for the same key,
-- and CREATE UNIQUE INDEX would then fail and leave the whole file unrunnable.
DELETE FROM ai_context a
USING ai_context b
WHERE a.category = 'writing_rules'
  AND b.category = 'writing_rules'
  AND a.label = b.label
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS ai_context_writing_rule_key
  ON ai_context (category, label)
  WHERE category = 'writing_rules';

INSERT INTO ai_context (category, label, content, source, active, sort_order)
VALUES (
  'writing_rules',
  'dashes-long-never',
  'Never use long dashes. No em dashes, no en dashes, ever. Use a comma, a period, a colon, or the word "to" for a range. This applies to messages to Vero and Alex, to every draft written for a customer, and to anything that goes on the website.',
  'manual',
  TRUE,
  0
)
ON CONFLICT (category, label) WHERE category = 'writing_rules' DO UPDATE
  SET content = EXCLUDED.content, active = TRUE, updated_at = NOW();
