import {
  Box, VStack, HStack, Stack, Text, Flex, Icon, Input, Textarea, Select, Spinner, useToast,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { FaSave, FaTrash, FaExternalLinkAlt } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import AdminBackButton from './ui/AdminBackButton';
import { useAdminLang } from '../i18n/admin';

/**
 * Journal post editor — create + edit share this one form. When
 * `postId` is null → create mode (submits to journal-create). When
 * set → edit mode (loads via journal-detail on mount, submits to
 * journal-update).
 *
 * Photo workflow: Vero uploads a post's 5–15 photos to a Google Drive
 * folder (same workflow she already uses for client galleries) and
 * pastes the folder's shareable link. The public post endpoint lists
 * the folder at request time, so she can add/remove photos in Drive
 * without republishing.
 *
 * Delete is only shown to superadmin — matches the API's requireSuper
 * gate on journal-delete so the button doesn't appear-but-not-work
 * for Vero.
 */

interface Props {
  adminPassword: string;
  adminLevel: 'admin' | 'super';
  postId: string | null;
  onCancel: () => void;
  onSaved: (message?: string) => void;
}

interface PostForm {
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  // Alt text for the cover photo — which is now automatically the
  // first photo in the Drive folder. No separate cover URL field.
  cover_image_alt: string;
  drive_folder_url: string;
  session_type: string;
  tags: string; // comma-separated in the input, split on save
  status: 'draft' | 'published';
  // Event date as YYYY-MM-DD (native <input type="date"> value).
  // Backend normalizes this to noon UTC so the calendar day is
  // consistent across timezones. Empty string means "use publish
  // default" — NOW on first publish, preserve on subsequent saves.
  published_at: string;
}

const EMPTY_FORM: PostForm = {
  slug: '',
  title: '',
  excerpt: '',
  body_markdown: '',
  cover_image_alt: '',
  drive_folder_url: '',
  session_type: '',
  tags: '',
  status: 'draft',
  published_at: '',
};

const AdminJournalEditor = ({ adminPassword, adminLevel, postId, onCancel, onSaved }: Props) => {
  const { t } = useAdminLang();
  const [form, setForm] = useState<PostForm>(EMPTY_FORM);

  // Session-type option list. Values (portrait/wedding/…) stay English
  // — they're the on-the-wire enum. Only the labels translate.
  const sessionOptions = [
    { value: '',           label: t.journalEditor.sessionOptionNone },
    { value: 'wedding',    label: t.journalEditor.sessionOptionWedding },
    { value: 'portrait',   label: t.journalEditor.sessionOptionPortrait },
    { value: 'family',     label: t.journalEditor.sessionOptionFamily },
    { value: 'maternity',  label: t.journalEditor.sessionOptionMaternity },
  ];
  const [loading, setLoading] = useState(postId !== null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingSlug, setExistingSlug] = useState<string | null>(null);
  const toast = useToast();

  // In edit mode, load the post's current fields on mount so the
  // form pre-populates with what Vero last saved.
  useEffect(() => {
    if (postId === null) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/admin/journal-detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword, id: postId }),
        });
        const data = await res.json();
        if (res.ok && data.success && data.post) {
          const p = data.post;
          setForm({
            slug: p.slug ?? '',
            title: p.title ?? '',
            excerpt: p.excerpt ?? '',
            body_markdown: p.body_markdown ?? '',
            cover_image_alt: p.cover_image_alt ?? '',
            drive_folder_url: p.drive_folder_url ?? '',
            session_type: p.session_type ?? '',
            tags: Array.isArray(p.tags) ? p.tags.join(', ') : '',
            status: p.status === 'published' ? 'published' : 'draft',
            // Convert stored ISO timestamp back to YYYY-MM-DD for the
            // date input. Null / empty means no explicit date yet.
            published_at: p.published_at ? isoToDateInput(p.published_at) : '',
          });
          setExistingSlug(p.slug ?? null);
        } else {
          setError(data.error || t.journalEditor.couldNotLoadPost);
        }
      } catch {
        setError(t.common.couldNotReach);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, adminPassword]);

  const update = <K extends keyof PostForm>(key: K, value: PostForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async (statusOverride?: 'draft' | 'published') => {
    setSaving(true);
    setError(null);
    const payload = {
      password: adminPassword,
      ...(postId ? { id: postId } : {}),
      slug: form.slug,
      title: form.title,
      excerpt: form.excerpt,
      body_markdown: form.body_markdown,
      cover_image_alt: form.cover_image_alt,
      drive_folder_url: form.drive_folder_url.trim() || null,
      session_type: form.session_type || null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
      status: statusOverride ?? form.status,
      published_at: form.published_at || null,
    };
    try {
      const endpoint = postId ? '/api/admin/journal-update' : '/api/admin/journal-create';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onSaved(postId ? t.journalEditor.postSaved : t.journalEditor.postCreated);
      } else {
        setError(data.error || t.journalEditor.saveFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!postId) return;
    if (!confirm(t.journalEditor.deleteConfirm)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/journal-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: postId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.journalEditor.postDeleted, status: 'success', duration: 3000 });
        onSaved();
      } else {
        setError(data.error || t.journalEditor.deleteFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Flex justify="center" py={16}>
        <Spinner color="brand.accent" />
      </Flex>
    );
  }

  return (
    <Box maxW="900px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Top bar — back link + title + save actions */}
      <Flex align="center" justify="space-between" mb={6} wrap="wrap" gap={3}>
        <AdminBackButton onClick={onCancel} label={t.journal.backToPosts} />

        {/* Both CTAs sit side-by-side on every breakpoint. On mobile
            the shorter labels ("Draft" / "Publish") fit inside two 44px
            buttons in a row; on desktop we swap in the full labels
            for clarity ("Save Draft" / "Save & Republish"). Compact
            side-by-side reads as a natural primary+secondary pair
            without the vertical space stacked columns would eat. */}
        <HStack spacing={2}>
          <CTAButton
            onClick={() => handleSave('draft')}
            variant="outline"
            size="sm"
            isLoading={saving}
            loadingText="…"
          >
            <Box as="span" display={{ base: 'inline', md: 'none' }}>{t.journal.saveDraftShort}</Box>
            <Box as="span" display={{ base: 'none', md: 'inline' }}>{t.journal.saveDraft}</Box>
          </CTAButton>
          <CTAButton
            onClick={() => handleSave('published')}
            icon={FaSave}
            variant="solid"
            size="sm"
            isLoading={saving}
            loadingText="…"
          >
            <Box as="span" display={{ base: 'inline', md: 'none' }}>
              {form.status === 'published' ? t.journalEditor.republishShort : t.journal.publish}
            </Box>
            <Box as="span" display={{ base: 'none', md: 'inline' }}>
              {form.status === 'published' ? t.journal.republish : t.journal.publish}
            </Box>
          </CTAButton>
        </HStack>
      </Flex>

      <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0} mb={2}>
        {postId ? t.journal.editorEditTitle : t.journal.editorNewTitle}
      </Text>
      {existingSlug && form.status === 'published' && (
        <HStack fontSize="xs" color="gray.500" mb={6} spacing={2}>
          <Text>{t.journal.liveAt}</Text>
          {/* Long slugs used to blow out the horizontal box on narrow
              phones; overflowWrap:anywhere lets the link break mid-slug
              so the row stays inside the viewport. */}
          <Box
            as="a"
            href={`/journal/${existingSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            color="brand.accent"
            display="inline-flex"
            alignItems="center"
            gap={1}
            _hover={{ textDecoration: 'underline' }}
            sx={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}
          >
            /journal/{existingSlug}
            <Icon as={FaExternalLinkAlt} boxSize={2.5} />
          </Box>
        </HStack>
      )}

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      <VStack spacing={5} align="stretch">
        <Field label={t.journalEditor.titleLabel} required>
          <Input
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder={t.journalEditor.titlePlaceholder}
            {...inputStyles}
          />
        </Field>

        <Field
          label={t.journalEditor.slugLabel}
          help={
            form.slug
              ? t.journalEditor.slugHelpUrl(form.slug)
              : t.journalEditor.slugHelpAuto
          }
        >
          <Input
            value={form.slug}
            onChange={(e) => update('slug', e.target.value)}
            placeholder={t.journalEditor.slugPlaceholder}
            {...inputStyles}
          />
        </Field>

        <Field
          label={t.journalEditor.eventDateLabel}
          help={t.journalEditor.eventDateHelp}
        >
          <Input
            type="date"
            value={form.published_at}
            onChange={(e) => update('published_at', e.target.value)}
            max={todayDateInput()}
            maxW="240px"
            {...inputStyles}
          />
        </Field>

        <Field label={t.journalEditor.excerptLabel} help={t.journalEditor.excerptHelp}>
          <Textarea
            value={form.excerpt}
            onChange={(e) => update('excerpt', e.target.value)}
            placeholder={t.journalEditor.excerptPlaceholder}
            rows={2}
            {...inputStyles}
          />
        </Field>

        <Field label={t.journalEditor.bodyLabel} help={t.journalEditor.bodyHelp}>
          <Textarea
            value={form.body_markdown}
            onChange={(e) => update('body_markdown', e.target.value)}
            placeholder={t.journalEditor.bodyPlaceholder}
            rows={10}
            {...inputStyles}
            fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
            // Keep monospace, but bump to md on mobile so iOS Safari
            // doesn't zoom the page when this Textarea gains focus.
            fontSize={{ base: 'md', md: 'sm' }}
          />
        </Field>

        {/* Drive folder — the single source of photos for this post.
            First photo (by filename) becomes the cover; the rest form
            the gallery. Vero controls order by prefixing filenames
            (01_, 02_, 03_…) in Drive. */}
        <Field
          label={t.journalEditor.driveFolderLabel}
          help={t.journalEditor.driveFolderHelp}
        >
          <Input
            value={form.drive_folder_url}
            onChange={(e) => update('drive_folder_url', e.target.value)}
            placeholder={t.journalEditor.driveFolderPlaceholder}
            {...inputStyles}
          />
        </Field>

        <Field
          label={t.journalEditor.coverAltLabel}
          help={t.journalEditor.coverAltHelp}
        >
          <Input
            value={form.cover_image_alt}
            onChange={(e) => update('cover_image_alt', e.target.value)}
            placeholder={t.journalEditor.coverAltPlaceholder}
            {...inputStyles}
          />
        </Field>

        {/* Session type + tags row — side by side on desktop, stacked on
            phones so each field gets full width (the tags input in
            particular gets very cramped at 2/3 of a phone screen). */}
        <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
          <Field label={t.journalEditor.sessionTypeLabel} flex={1}>
            <Select
              value={form.session_type}
              onChange={(e) => update('session_type', e.target.value)}
              {...inputStyles}
            >
              {sessionOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>

          <Field label={t.journalEditor.tagsLabel} help={t.journalEditor.tagsHelp} flex={2}>
            <Input
              value={form.tags}
              onChange={(e) => update('tags', e.target.value)}
              placeholder={t.journalEditor.tagsPlaceholder}
              {...inputStyles}
            />
          </Field>
        </Stack>

        {/* Danger zone — superadmin-only, mirrors client detail page */}
        {postId && adminLevel === 'super' && (
          <Box
            mt={8}
            p={5}
            bg="red.50"
            border="1px solid"
            borderColor="red.200"
            borderRadius="sm"
          >
            <Text
              fontSize={{ base: 'xs', md: '2xs' }}
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing={{ base: '0.15em', md: '0.22em' }}
              color="red.700"
              mb={2}
            >
              {t.journalEditor.dangerZone}
            </Text>
            <Text fontSize="xs" color="gray.700" fontWeight="300" mb={4} lineHeight="1.6">
              {t.journalEditor.dangerZoneBody}
            </Text>
            <CTAButton
              onClick={handleDelete}
              icon={FaTrash}
              variant="outline"
              size="sm"
              isLoading={deleting}
              loadingText={t.journalEditor.deleting}
            >
              {t.journalEditor.deletePost}
            </CTAButton>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

// Common input styling so all form fields feel of a piece with the
// rest of admin's cards.
// Responsive fontSize: 'md' on mobile prevents iOS Safari from zooming
// the viewport when an input gains focus (Safari only zooms if the
// field's computed font-size is <16px). On desktop we keep the compact
// 'sm' so the form doesn't look chunky.
const inputStyles = {
  bg: 'white',
  borderColor: 'gray.300',
  fontSize: { base: 'md', md: 'sm' },
  _hover: { borderColor: 'gray.400' },
  _focus: {
    borderColor: 'brand.accent',
    boxShadow: '0 0 0 1px #c9a96e',
  },
} as const;

function Field({
  label,
  help,
  required,
  flex,
  children,
}: {
  label: string;
  help?: string;
  required?: boolean;
  flex?: number;
  children: React.ReactNode;
}) {
  return (
    <Box flex={flex}>
      <Flex align="baseline" gap={2} mb={1.5}>
        <Text
          fontSize={{ base: 'xs', md: '2xs' }}
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing={{ base: '0.15em', md: '0.22em' }}
          color="brand.accent"
        >
          {label}
          {required && (
            <Text as="span" color="red.500" ml={1}>*</Text>
          )}
        </Text>
      </Flex>
      {children}
      {help && (
        <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1.5} lineHeight="1.5">
          {help}
        </Text>
      )}
    </Box>
  );
}

/**
 * Convert a stored ISO timestamp back to the YYYY-MM-DD shape that
 * <input type="date"> requires. We use the UTC date parts so posts
 * saved as noon UTC (see api/admin/_journal-shared.ts) round-trip
 * to the same calendar day the user picked, regardless of the
 * admin's local timezone.
 */
function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Today's date in YYYY-MM-DD (local zone) — used as the max on the
 * date picker so Vero can't accidentally schedule into the future.
 */
function todayDateInput(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default AdminJournalEditor;
