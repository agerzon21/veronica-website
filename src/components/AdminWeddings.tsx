import {
  Box, VStack, HStack, Text, Flex, Icon, Badge, useToast, Spinner, IconButton,
  Switch, Input, Textarea, Select, Stack,
} from '@chakra-ui/react';
import { useEffect, useState, type ReactNode } from 'react';
import FaBookOpen from '../icons/fa/FaBookOpen';
import FaChevronDown from '../icons/fa/FaChevronDown';
import FaChevronLeft from '../icons/fa/FaChevronLeft';
import FaChevronRight from '../icons/fa/FaChevronRight';
import FaChevronUp from '../icons/fa/FaChevronUp';
import FaEdit from '../icons/fa/FaEdit';
import FaImage from '../icons/fa/FaImage';
import FaPlus from '../icons/fa/FaPlus';
import FaSyncAlt from '../icons/fa/FaSyncAlt';
import FaTimes from '../icons/fa/FaTimes';
import FaTrash from '../icons/fa/FaTrash';
import FaUserFriends from '../icons/fa/FaUserFriends';
import CTAButton from './ui/CTAButton';
import MobileSheetModal, { MobileSheetFooter } from './ui/MobileSheetModal';
import ConfirmDialog from './ui/ConfirmDialog';
import { useAdminLang } from '../i18n/admin';

/**
 * "Weddings" tab in /admin — everything the weddings page needs, in
 * four stacked cards (the Studio-group layout language):
 *
 *   1. Page photos — six pinned hero links + the Drive sprinkle-pool
 *      folder. Saved together via weddings-settings.
 *   2. From the Journal — the ordered featured-post list (max 6) for
 *      the page's slideshow, picked from published journal posts; each
 *      entry carries two focal-point anchors (big stage + thumbnail
 *      strip) so cover crops stop cutting faces. Saved via
 *      weddings-settings.
 *   3. Selected work — the ordered clickable mosaic (max 8), picked
 *      from published wedding gallery photos; each links to its
 *      /photo/weddings/<slug> page. Saved via weddings-settings.
 *   4. Recommended vendors — full CRUD following AdminReviews: list +
 *      inline Active toggle + MobileSheetModal editor + super-only
 *      delete behind ConfirmDialog.
 *
 * Available to BOTH admin (Vero) and super (Alex) — weddings-page
 * curation is photography-adjacent work. Only vendor Delete is
 * super-gated, matching the API's requireSuper on weddings-vendors-delete.
 */

interface Props {
  adminPassword: string;
  adminLevel: 'admin' | 'super';
}

const MAX_HEROES = 6;
const MAX_FEATURED = 6;
const MAX_SELECTED_WORK = 8;
// Add-picker page size — Alex refuses to scroll a 97-row list.
const PICKER_PAGE_SIZE = 10;

// CSS object-position keywords the focus selects may use. Mirrors the
// FOCUS_VALUES allowlist in api/_weddings-page.ts — values land in a
// style attribute on the public page, so only these nine are legal.
const FOCUS_VALUES = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'left top',
  'right top',
  'left bottom',
  'right bottom',
] as const;
type FocusValue = (typeof FOCUS_VALUES)[number];

// CSS value → i18n label key for the two focus selects. Kept as one
// ordered list so both dropdowns render identically.
const FOCUS_OPTIONS = [
  { value: 'center', key: 'center' },
  { value: 'top', key: 'top' },
  { value: 'bottom', key: 'bottom' },
  { value: 'left', key: 'left' },
  { value: 'right', key: 'right' },
  { value: 'left top', key: 'leftTop' },
  { value: 'right top', key: 'rightTop' },
  { value: 'left bottom', key: 'leftBottom' },
  { value: 'right bottom', key: 'rightBottom' },
] as const;

// One featured journal entry: which post, plus where its cover anchors
// in the slideshow's big stage and in the thumbnail strip.
interface FeaturedEntry {
  slug: string;
  focusStage: FocusValue;
  focusThumb: FocusValue;
}

const asFocus = (v: unknown): FocusValue =>
  typeof v === 'string' && (FOCUS_VALUES as readonly string[]).includes(v)
    ? (v as FocusValue)
    : 'center';

/** Defensive parse of the settings `featured` array into typed entries. */
function parseFeaturedEntries(input: unknown): FeaturedEntry[] {
  if (!Array.isArray(input)) return [];
  const out: FeaturedEntry[] = [];
  for (const item of input) {
    const slug =
      item && typeof item === 'object' && typeof (item as { slug?: unknown }).slug === 'string'
        ? ((item as { slug: string }).slug || '').trim()
        : '';
    if (!slug) continue;
    out.push({
      slug,
      focusStage: asFocus((item as { focusStage?: unknown }).focusStage),
      focusThumb: asFocus((item as { focusThumb?: unknown }).focusThumb),
    });
  }
  return out;
}

interface WeddingsSettings {
  heroes: string[];
  folderId: string;
  featured: FeaturedEntry[];
  selectedWork: string[];
}

// Public gallery/list shape (the fields this card uses; the endpoint
// returns more). `url` is served locally — usable as a thumb directly.
interface GalleryPhotoRow {
  slug: string;
  url: string;
  alt: string;
  title: string;
}

interface JournalPostRow {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  published_at: string | null;
  cover_image_url: string | null;
}

// The list endpoint returns snake_case DB columns; the upsert endpoint
// takes camelCase keys. VendorRow is the wire shape we read; the
// payload helper below maps it for writes.
export interface VendorRow {
  id: string;
  name: string;
  category: string;
  blurb: string | null;
  website_url: string | null;
  instagram: string | null;
  photo_url: string | null;
  sort_order: number;
  active: boolean;
}

interface VendorForm {
  name: string;
  category: string;
  blurb: string;
  websiteUrl: string;
  instagram: string;
  photoUrl: string;
  sortOrder: string;
  active: boolean;
}

const EMPTY_VENDOR_FORM: VendorForm = {
  name: '',
  category: '',
  blurb: '',
  websiteUrl: '',
  instagram: '',
  photoUrl: '',
  sortOrder: '0',
  active: true,
};

type VendorEditorState = null | { mode: 'create' } | { mode: 'edit'; vendor: VendorRow };

// Shared input styling — mirrors AdminReviews / AdminJournalEditor. The
// { base: 'md', md: 'sm' } fontSize bump prevents iOS Safari from
// zooming the viewport when a field gains focus.
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

/**
 * Client-side preview transform for Drive file links. The API
 * normalizes on read for the public page; this is only so the admin
 * sees a thumbnail immediately after pasting.
 */
function toPreviewUrl(raw: string): string {
  const m = raw.match(/\/file\/d\/([\w-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
  return raw;
}

const AdminWeddings = ({ adminPassword, adminLevel }: Props) => {
  const { t } = useAdminLang();
  const [settings, setSettings] = useState<WeddingsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/weddings-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, action: 'get' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings({
          heroes: Array.isArray(data.heroes) ? data.heroes : [],
          folderId: typeof data.folderId === 'string' ? data.folderId : '',
          featured: parseFeaturedEntries(data.featured),
          selectedWork: Array.isArray(data.selectedWork) ? data.selectedWork : [],
        });
      } else {
        setError(data.error || t.weddings.loadFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword]);

  return (
    <Box maxW="1200px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Header — same layout as AdminJournal/AdminReviews so the
          Studio-group tabs feel uniform: gold kicker, thin H1, subtitle,
          icon-only Refresh. */}
      <Flex align="flex-end" justify="space-between" mb={{ base: 5, md: 8 }} gap={3}>
        <VStack align="flex-start" spacing={1} minW={0}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="brand.accent"
          >
            {t.common.adminKicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
            {t.weddings.tabTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {t.weddings.subtitle}
          </Text>
        </VStack>

        <IconButton
          aria-label={t.weddings.refreshAria}
          icon={<Icon as={FaSyncAlt} boxSize={4} />}
          onClick={loadSettings}
          variant="ghost"
          size="md"
          minW="44px"
          minH="44px"
          color="gray.500"
          _hover={{ color: 'brand.accent' }}
          flexShrink={0}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        />
      </Flex>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {loading || !settings ? (
        <Flex justify="center" py={16}>
          <Spinner color="brand.accent" />
        </Flex>
      ) : (
        // Cards mount fresh each time settings finish loading, so Refresh
        // re-seeds every card's local state from the server truth.
        <VStack spacing={{ base: 5, md: 6 }} align="stretch">
          <PhotosCard
            adminPassword={adminPassword}
            initialHeroes={settings.heroes}
            initialFolderId={settings.folderId}
          />
          <JournalCard
            adminPassword={adminPassword}
            initialFeatured={settings.featured}
          />
          <SelectedWorkCard
            adminPassword={adminPassword}
            initialSelected={settings.selectedWork}
          />
          <VendorsCard adminPassword={adminPassword} adminLevel={adminLevel} />
        </VStack>
      )}
    </Box>
  );
};

// ── Card 1: Page photos ────────────────────────────────────────────
function PhotosCard({
  adminPassword,
  initialHeroes,
  initialFolderId,
}: {
  adminPassword: string;
  initialHeroes: string[];
  initialFolderId: string;
}) {
  const { t } = useAdminLang();
  const toast = useToast();
  const [heroes, setHeroes] = useState<string[]>(() => {
    const arr = initialHeroes.slice(0, MAX_HEROES);
    while (arr.length < MAX_HEROES) arr.push('');
    return arr;
  });
  const [folderInput, setFolderInput] = useState(initialFolderId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setHero = (index: number, value: string) =>
    setHeroes((cur) => cur.map((h, i) => (i === index ? value : h)));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/weddings-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          action: 'set',
          heroes: heroes.map((h) => h.trim()).filter(Boolean),
          folderId: folderInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.weddings.photosSaved, status: 'success', duration: 3000, isClosable: true });
      } else {
        setError(data.error || t.weddings.saveFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title={t.weddings.photosTitle} subtitle={t.weddings.photosSubtitle}>
      {error && <ErrorBox message={error} />}

      <VStack spacing={2.5} align="stretch">
        {heroes.map((value, i) => (
          <Flex key={i} align="center" gap={3}>
            <Text
              w={{ base: '56px', md: '72px' }}
              flexShrink={0}
              fontSize={{ base: 'xs', md: '2xs' }}
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing={{ base: '0.1em', md: '0.15em' }}
              color="gray.600"
            >
              {t.weddings.heroLabel(i + 1)}
            </Text>
            <Input
              value={value}
              onChange={(e) => setHero(i, e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
              {...inputStyles}
            />
            {value.trim() !== '' && <UrlThumb url={value.trim()} />}
          </Flex>
        ))}
      </VStack>
      <Text fontSize="xs" color="gray.500" fontWeight="300" mt={2} lineHeight="1.5">
        {t.weddings.heroesHelp}
      </Text>

      <Box mt={5}>
        <Field label={t.weddings.folderLabel} help={t.weddings.folderHelp}>
          <Input
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            fontFamily="mono"
            {...inputStyles}
          />
        </Field>
      </Box>

      <Flex justify="flex-end" mt={4}>
        <CTAButton
          onClick={handleSave}
          variant="solid"
          size="sm"
          isLoading={saving}
          loadingText={t.common.saving}
        >
          {t.common.save}
        </CTAButton>
      </Flex>
    </SectionCard>
  );
}

/**
 * Small square preview beside a URL input. Hides itself entirely when
 * the URL doesn't load — the input is the source of truth, the thumb
 * is just feedback that the paste worked.
 */
function UrlThumb({ url }: { url: string }) {
  const src = toPreviewUrl(url);
  // Track WHICH src failed so editing the URL retries automatically.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return null;
  return (
    <Box
      as="img"
      src={src}
      alt=""
      boxSize={{ base: '44px', md: '48px' }}
      objectFit="cover"
      borderRadius="sm"
      border="1px solid"
      borderColor="gray.200"
      flexShrink={0}
      onError={() => setFailedSrc(src)}
    />
  );
}

// ── Card 2: From the Journal ───────────────────────────────────────
function JournalCard({
  adminPassword,
  initialFeatured,
}: {
  adminPassword: string;
  initialFeatured: FeaturedEntry[];
}) {
  const { t } = useAdminLang();
  const toast = useToast();
  const [posts, setPosts] = useState<JournalPostRow[] | null>(null);
  const [entries, setEntries] = useState<FeaturedEntry[]>(
    initialFeatured.slice(0, MAX_FEATURED),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/journal-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) {
          const published = (data.posts as JournalPostRow[]).filter(
            (p) => p.status === 'published',
          );
          setPosts(published);
        } else {
          setError(data.error || t.weddings.loadFailed(res.status));
        }
      } catch {
        if (!cancelled) setError(t.common.couldNotReach);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword]);

  const move = (index: number, delta: -1 | 1) =>
    setEntries((cur) => {
      const target = index + delta;
      if (target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (slug: string) => setEntries((cur) => cur.filter((e) => e.slug !== slug));

  // Adding via the picker creates a centered entry — Vero adjusts the
  // two anchors afterwards only when a crop actually cuts something.
  const add = (slug: string) =>
    setEntries((cur) =>
      cur.length >= MAX_FEATURED || cur.some((e) => e.slug === slug)
        ? cur
        : [...cur, { slug, focusStage: 'center', focusThumb: 'center' }],
    );

  const setFocus = (slug: string, field: 'focusStage' | 'focusThumb', value: FocusValue) =>
    setEntries((cur) => cur.map((e) => (e.slug === slug ? { ...e, [field]: value } : e)));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/weddings-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          action: 'set',
          // Full objects, in display order — the API validates each
          // focus value against its FOCUS_VALUES allowlist.
          featured: entries,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.weddings.featuredSaved, status: 'success', duration: 3000, isClosable: true });
      } else {
        setError(data.error || t.weddings.saveFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  const bySlug = new Map((posts ?? []).map((p) => [p.slug, p]));
  const available = (posts ?? []).filter((p) => !entries.some((e) => e.slug === p.slug));
  const atCap = entries.length >= MAX_FEATURED;

  return (
    <SectionCard
      title={t.weddings.journalTitle}
      subtitle={t.weddings.journalSubtitle}
      headerRight={
        <Badge
          bg="brand.surface"
          color="brand.accentText"
          border="1px solid"
          borderColor="brand.accentBorder"
          fontSize={{ base: 'xs', md: '2xs' }}
          fontWeight="500"
          letterSpacing="0.1em"
          px={2}
          py={0.5}
          borderRadius="sm"
        >
          {t.weddings.featuredCount(entries.length, MAX_FEATURED)}
        </Badge>
      }
    >
      {/* What the two focus selects are for — sits above the list so
          the controls below explain themselves. */}
      <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.6" mb={4}>
        {t.weddings.focusHelp}
      </Text>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <Flex justify="center" py={6}>
          <Spinner size="sm" color="brand.accent" />
        </Flex>
      ) : (
        <>
          {/* Featured list — ordered; a slug whose post got unpublished
              or deleted still renders (as "unavailable") so it can be
              removed rather than silently lingering in settings. */}
          {entries.length === 0 ? (
            <Text fontSize="sm" color="gray.500" fontWeight="300" py={2}>
              {t.weddings.featuredEmpty}
            </Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {entries.map((entry, i) => {
                const post = bySlug.get(entry.slug);
                return (
                  <Flex
                    key={entry.slug}
                    align="flex-start"
                    gap={3}
                    bg="gray.50"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="sm"
                    p={2}
                  >
                    <PostThumb coverUrl={post?.cover_image_url ?? null} />
                    <Box flex={1} minW={0}>
                      <Text
                        fontSize="sm"
                        fontWeight="500"
                        color={post ? 'gray.800' : 'orange.600'}
                        noOfLines={1}
                        pt={1}
                      >
                        {post ? post.title : t.weddings.unavailablePost(entry.slug)}
                      </Text>
                      {/* The two focal-point anchors — side by side when
                          there's room, stacked under the title on narrow
                          widths so the row never overflows. */}
                      <Stack
                        direction={{ base: 'column', sm: 'row' }}
                        spacing={{ base: 1.5, sm: 4 }}
                        mt={1.5}
                      >
                        <FocusSelect
                          label={t.weddings.focusStageLabel}
                          value={entry.focusStage}
                          onChange={(v) => setFocus(entry.slug, 'focusStage', v)}
                        />
                        <FocusSelect
                          label={t.weddings.focusThumbLabel}
                          value={entry.focusThumb}
                          onChange={(v) => setFocus(entry.slug, 'focusThumb', v)}
                        />
                      </Stack>
                    </Box>
                    <HStack spacing={0} flexShrink={0}>
                      <IconButton
                        aria-label={t.weddings.moveUpAria}
                        icon={<Icon as={FaChevronUp} boxSize={3} />}
                        onClick={() => move(i, -1)}
                        isDisabled={i === 0}
                        variant="ghost"
                        size="sm"
                        minW="40px"
                        minH="40px"
                        color="gray.500"
                        _hover={{ color: 'brand.accent' }}
                        sx={{ WebkitTapHighlightColor: 'transparent' }}
                      />
                      <IconButton
                        aria-label={t.weddings.moveDownAria}
                        icon={<Icon as={FaChevronDown} boxSize={3} />}
                        onClick={() => move(i, 1)}
                        isDisabled={i === entries.length - 1}
                        variant="ghost"
                        size="sm"
                        minW="40px"
                        minH="40px"
                        color="gray.500"
                        _hover={{ color: 'brand.accent' }}
                        sx={{ WebkitTapHighlightColor: 'transparent' }}
                      />
                      <IconButton
                        aria-label={t.weddings.removeAria}
                        icon={<Icon as={FaTimes} boxSize={3.5} />}
                        onClick={() => remove(entry.slug)}
                        variant="ghost"
                        size="sm"
                        minW="40px"
                        minH="40px"
                        color="red.500"
                        _hover={{ bg: 'red.50', color: 'red.600' }}
                        sx={{ WebkitTapHighlightColor: 'transparent' }}
                      />
                    </HStack>
                  </Flex>
                );
              })}
            </VStack>
          )}

          {/* Add picker — the published posts not yet featured. */}
          <SearchableAddPicker
            heading={t.weddings.addHeading}
            sourceIsEmpty={posts !== null && posts.length === 0}
            sourceEmptyLabel={t.weddings.noPublishedPosts}
            allAddedLabel={t.weddings.allPostsAdded}
            atCap={atCap}
            capLabel={t.weddings.maxReached}
            addAria={t.weddings.addAria}
            items={available.map((post) => ({
              slug: post.slug,
              title: post.title || post.slug,
              thumb: <PostThumb coverUrl={post.cover_image_url} />,
            }))}
            onAdd={add}
          />

          <Flex justify="flex-end" mt={4}>
            <CTAButton
              onClick={handleSave}
              variant="solid"
              size="sm"
              isLoading={saving}
              loadingText={t.common.saving}
            >
              {t.common.save}
            </CTAButton>
          </Flex>
        </>
      )}
    </SectionCard>
  );
}

// One labeled focal-point dropdown. Compact on purpose — a pair of
// these sits inside every featured row.
function FocusSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FocusValue;
  onChange: (v: FocusValue) => void;
}) {
  const { t } = useAdminLang();
  return (
    <HStack spacing={1.5} align="center">
      <Text
        fontSize="2xs"
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing="0.1em"
        color="gray.500"
        whiteSpace="nowrap"
      >
        {label}
      </Text>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value as FocusValue)}
        aria-label={label}
        size={{ base: 'md', md: 'sm' } as any}
        maxW="160px"
        {...inputStyles}
      >
        {FOCUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t.weddings.focusOptions[opt.key]}
          </option>
        ))}
      </Select>
    </HStack>
  );
}

// Cover thumb — mirrors AdminJournal's PostRow fallback block.
function PostThumb({ coverUrl }: { coverUrl: string | null }) {
  return (
    <Box
      boxSize={{ base: '40px', md: '44px' }}
      flexShrink={0}
      bg={coverUrl ? 'transparent' : 'brand.surface'}
      borderRadius="sm"
      overflow="hidden"
      display="flex"
      alignItems="center"
      justifyContent="center"
      border={coverUrl ? 'none' : '1px solid'}
      borderColor="brand.accentBorder"
    >
      {coverUrl ? (
        <Box as="img" src={toPreviewUrl(coverUrl)} alt="" w="100%" h="100%" objectFit="cover" />
      ) : (
        <Icon as={FaBookOpen} color="brand.accent" boxSize={4} />
      )}
    </Box>
  );
}

// ── Card 3: Selected work ──────────────────────────────────────────

/**
 * The public gallery suffixes titles with " | Vero Photography" for
 * legacy consumers — strip it for the picker rows; fall back to the
 * slug when a photo has no title at all.
 */
function displayPhotoTitle(photo: GalleryPhotoRow): string {
  const cleaned = (photo.title || '').replace(/\s*\|\s*Vero Photography\s*$/, '').trim();
  return cleaned || photo.slug;
}

function SelectedWorkCard({
  adminPassword,
  initialSelected,
}: {
  adminPassword: string;
  initialSelected: string[];
}) {
  const { t } = useAdminLang();
  const toast = useToast();
  const [photos, setPhotos] = useState<GalleryPhotoRow[] | null>(null);
  const [order, setOrder] = useState<string[]>(initialSelected.slice(0, MAX_SELECTED_WORK));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Public endpoint — no password. Same data the live mosaic reads.
        const res = await fetch('/api/gallery/list?category=weddings');
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) {
          setPhotos(data.photos as GalleryPhotoRow[]);
        } else {
          setError(data.error || t.weddings.loadFailed(res.status));
        }
      } catch {
        if (!cancelled) setError(t.common.couldNotReach);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (index: number, delta: -1 | 1) =>
    setOrder((cur) => {
      const target = index + delta;
      if (target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (slug: string) => setOrder((cur) => cur.filter((s) => s !== slug));

  const add = (slug: string) =>
    setOrder((cur) =>
      cur.length >= MAX_SELECTED_WORK || cur.includes(slug) ? cur : [...cur, slug],
    );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/weddings-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          action: 'set',
          selectedWork: order,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.weddings.selectedSaved, status: 'success', duration: 3000, isClosable: true });
      } else {
        setError(data.error || t.weddings.saveFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  const bySlug = new Map((photos ?? []).map((p) => [p.slug, p]));
  const available = (photos ?? []).filter((p) => !order.includes(p.slug));
  const atCap = order.length >= MAX_SELECTED_WORK;

  return (
    <SectionCard
      title={t.weddings.selectedWorkTitle}
      subtitle={t.weddings.selectedWorkSubtitle}
      headerRight={
        <Badge
          bg="brand.surface"
          color="brand.accentText"
          border="1px solid"
          borderColor="brand.accentBorder"
          fontSize={{ base: 'xs', md: '2xs' }}
          fontWeight="500"
          letterSpacing="0.1em"
          px={2}
          py={0.5}
          borderRadius="sm"
        >
          {t.weddings.selectedCount(order.length, MAX_SELECTED_WORK)}
        </Badge>
      }
    >
      {error && <ErrorBox message={error} />}

      {loading ? (
        <Flex justify="center" py={6}>
          <Spinner size="sm" color="brand.accent" />
        </Flex>
      ) : (
        <>
          {/* Selection — ordered; a slug whose photo got unpublished or
              recategorized still renders (as "unavailable") so it can be
              removed rather than silently lingering in settings. */}
          {order.length === 0 ? (
            <Text fontSize="sm" color="gray.500" fontWeight="300" py={2}>
              {t.weddings.selectedEmpty}
            </Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {order.map((slug, i) => {
                const photo = bySlug.get(slug);
                return (
                  <Flex
                    key={slug}
                    align="center"
                    gap={3}
                    bg="gray.50"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="sm"
                    p={2}
                  >
                    <PhotoThumb url={photo?.url ?? null} />
                    <Text
                      flex={1}
                      minW={0}
                      fontSize="sm"
                      fontWeight="500"
                      color={photo ? 'gray.800' : 'orange.600'}
                      noOfLines={1}
                    >
                      {photo ? displayPhotoTitle(photo) : t.weddings.unavailablePhoto(slug)}
                    </Text>
                    <HStack spacing={0} flexShrink={0}>
                      <IconButton
                        aria-label={t.weddings.moveUpAria}
                        icon={<Icon as={FaChevronUp} boxSize={3} />}
                        onClick={() => move(i, -1)}
                        isDisabled={i === 0}
                        variant="ghost"
                        size="sm"
                        minW="40px"
                        minH="40px"
                        color="gray.500"
                        _hover={{ color: 'brand.accent' }}
                        sx={{ WebkitTapHighlightColor: 'transparent' }}
                      />
                      <IconButton
                        aria-label={t.weddings.moveDownAria}
                        icon={<Icon as={FaChevronDown} boxSize={3} />}
                        onClick={() => move(i, 1)}
                        isDisabled={i === order.length - 1}
                        variant="ghost"
                        size="sm"
                        minW="40px"
                        minH="40px"
                        color="gray.500"
                        _hover={{ color: 'brand.accent' }}
                        sx={{ WebkitTapHighlightColor: 'transparent' }}
                      />
                      <IconButton
                        aria-label={t.weddings.removeFromSelectionAria}
                        icon={<Icon as={FaTimes} boxSize={3.5} />}
                        onClick={() => remove(slug)}
                        variant="ghost"
                        size="sm"
                        minW="40px"
                        minH="40px"
                        color="red.500"
                        _hover={{ bg: 'red.50', color: 'red.600' }}
                        sx={{ WebkitTapHighlightColor: 'transparent' }}
                      />
                    </HStack>
                  </Flex>
                );
              })}
            </VStack>
          )}

          {/* Add picker — the published wedding photos not yet selected. */}
          <SearchableAddPicker
            heading={t.weddings.addPhotoHeading}
            sourceIsEmpty={photos !== null && photos.length === 0}
            sourceEmptyLabel={t.weddings.noGalleryPhotos}
            allAddedLabel={t.weddings.allPhotosAdded}
            atCap={atCap}
            capLabel={t.weddings.maxReachedPhotos}
            addAria={t.weddings.addPhotoAria}
            items={available.map((photo) => ({
              slug: photo.slug,
              title: displayPhotoTitle(photo),
              thumb: <PhotoThumb url={photo.url} />,
            }))}
            onAdd={add}
          />

          <Flex justify="flex-end" mt={4}>
            <CTAButton
              onClick={handleSave}
              variant="solid"
              size="sm"
              isLoading={saving}
              loadingText={t.common.saving}
            >
              {t.common.save}
            </CTAButton>
          </Flex>
        </>
      )}
    </SectionCard>
  );
}

// Gallery thumb — url is a locally served /assets path; the icon
// placeholder covers the "unavailable slug" row, which has no photo.
function PhotoThumb({ url }: { url: string | null }) {
  return (
    <Box
      boxSize={{ base: '40px', md: '44px' }}
      flexShrink={0}
      bg={url ? 'transparent' : 'brand.surface'}
      borderRadius="sm"
      overflow="hidden"
      display="flex"
      alignItems="center"
      justifyContent="center"
      border={url ? 'none' : '1px solid'}
      borderColor="brand.accentBorder"
    >
      {url ? (
        <Box as="img" src={url} alt="" w="100%" h="100%" objectFit="cover" />
      ) : (
        <Icon as={FaImage} color="brand.accent" boxSize={4} />
      )}
    </Box>
  );
}

// ── Shared searchable add-picker (journal + selected work) ─────────

interface PickerItem {
  slug: string;
  // Display title — already resolved by the caller (slug fallback done
  // upstream) so the search + highlight here match exactly what's shown.
  title: string;
  // Pre-rendered thumbnail node (PostThumb / PhotoThumb) — keeps this
  // component agnostic of where the image comes from.
  thumb: ReactNode;
}

/**
 * The add-list both curation cards share: search box on top,
 * case-insensitive substring filtering against the display title,
 * gold highlight on the matched substring, and 10-per-page
 * pagination so a 97-photo gallery never renders as one wall.
 * In-memory only — the lists are already fully fetched.
 */
function SearchableAddPicker({
  heading,
  items,
  sourceIsEmpty,
  sourceEmptyLabel,
  allAddedLabel,
  atCap,
  capLabel,
  addAria,
  onAdd,
}: {
  heading: string;
  items: PickerItem[];
  // The SOURCE list (before removing already-added items) is empty —
  // "publish something first" beats "everything is already added".
  sourceIsEmpty: boolean;
  sourceEmptyLabel: string;
  allAddedLabel: string;
  atCap: boolean;
  capLabel: string;
  addAria: string;
  onAdd: (slug: string) => void;
}) {
  const { t } = useAdminLang();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((it) => it.title.toLowerCase().includes(q)) : items;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PICKER_PAGE_SIZE));
  // Clamp instead of trusting `page` — adding an item can shrink the
  // list under the current page without any query change.
  const safePage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(
    safePage * PICKER_PAGE_SIZE,
    (safePage + 1) * PICKER_PAGE_SIZE,
  );

  return (
    <Box mt={5}>
      <Text
        fontSize={{ base: 'xs', md: '2xs' }}
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing={{ base: '0.15em', md: '0.22em' }}
        color="brand.accent"
        mb={2}
      >
        {heading}
      </Text>

      {sourceIsEmpty ? (
        <Text fontSize="sm" color="gray.500" fontWeight="300">
          {sourceEmptyLabel}
        </Text>
      ) : items.length === 0 ? (
        <Text fontSize="sm" color="gray.500" fontWeight="300">
          {allAddedLabel}
        </Text>
      ) : (
        <>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={t.weddings.searchPlaceholder}
            aria-label={t.weddings.searchPlaceholder}
            mb={2.5}
            {...inputStyles}
          />

          {atCap && (
            <Text fontSize="xs" color="orange.600" fontWeight="300" mb={2}>
              {capLabel}
            </Text>
          )}

          {filtered.length === 0 ? (
            <Text fontSize="sm" color="gray.500" fontWeight="300">
              {t.weddings.noMatches(query.trim())}
            </Text>
          ) : (
            <>
              <VStack spacing={2} align="stretch">
                {visible.map((item) => (
                  <Flex
                    key={item.slug}
                    align="center"
                    gap={3}
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="sm"
                    p={2}
                    opacity={atCap ? 0.5 : 1}
                  >
                    {item.thumb}
                    <Text flex={1} minW={0} fontSize="sm" fontWeight="300" color="gray.700" noOfLines={1}>
                      {highlightMatches(item.title, query.trim())}
                    </Text>
                    <IconButton
                      aria-label={addAria}
                      icon={<Icon as={FaPlus} boxSize={3.5} />}
                      onClick={() => onAdd(item.slug)}
                      isDisabled={atCap}
                      variant="ghost"
                      size="sm"
                      minW="40px"
                      minH="40px"
                      color="brand.accentText"
                      _hover={{ color: 'brand.accent' }}
                      flexShrink={0}
                      sx={{ WebkitTapHighlightColor: 'transparent' }}
                    />
                  </Flex>
                ))}
              </VStack>

              {totalPages > 1 && (
                <Flex align="center" justify="center" gap={2} mt={3}>
                  <IconButton
                    aria-label={t.weddings.prevPageAria}
                    icon={<Icon as={FaChevronLeft} boxSize={3} />}
                    onClick={() => setPage(Math.max(0, safePage - 1))}
                    isDisabled={safePage === 0}
                    variant="ghost"
                    size="sm"
                    minW="40px"
                    minH="40px"
                    color="gray.500"
                    _hover={{ color: 'brand.accent' }}
                    sx={{ WebkitTapHighlightColor: 'transparent' }}
                  />
                  <Text fontSize="xs" color="gray.500" fontWeight="300" minW="90px" textAlign="center">
                    {t.weddings.pageOf(safePage + 1, totalPages)}
                  </Text>
                  <IconButton
                    aria-label={t.weddings.nextPageAria}
                    icon={<Icon as={FaChevronRight} boxSize={3} />}
                    onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                    isDisabled={safePage >= totalPages - 1}
                    variant="ghost"
                    size="sm"
                    minW="40px"
                    minH="40px"
                    color="gray.500"
                    _hover={{ color: 'brand.accent' }}
                    sx={{ WebkitTapHighlightColor: 'transparent' }}
                  />
                </Flex>
              )}
            </>
          )}
        </>
      )}
    </Box>
  );
}

/**
 * Split `text` on case-insensitive occurrences of `query` and wrap the
 * matches in a gold emphasis. Semantic <mark> with the browser's
 * default yellow suppressed — the gold weight carries the highlight.
 */
function highlightMatches(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchAt = lower.indexOf(lowerQuery);
  let key = 0;
  while (matchAt !== -1) {
    if (matchAt > cursor) parts.push(text.slice(cursor, matchAt));
    parts.push(
      <Box
        as="mark"
        key={key++}
        bg="transparent"
        color="brand.accentText"
        fontWeight="600"
      >
        {text.slice(matchAt, matchAt + query.length)}
      </Box>,
    );
    cursor = matchAt + query.length;
    matchAt = lower.indexOf(lowerQuery, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

// ── Card 4: Recommended vendors ────────────────────────────────────

/** Map a wire-shape vendor row to the camelCase upsert payload. */
function vendorPayload(v: VendorRow): Record<string, unknown> {
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    blurb: v.blurb ?? '',
    websiteUrl: v.website_url ?? '',
    instagram: v.instagram ?? '',
    photoUrl: v.photo_url ?? '',
    sortOrder: v.sort_order ?? 0,
    active: v.active,
  };
}

function VendorsCard({
  adminPassword,
  adminLevel,
}: {
  adminPassword: string;
  adminLevel: 'admin' | 'super';
}) {
  const { t } = useAdminLang();
  const toast = useToast();
  const [vendors, setVendors] = useState<VendorRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<VendorEditorState>(null);
  const [confirmDelete, setConfirmDelete] = useState<VendorRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadVendors = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/weddings-vendors-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setVendors(data.vendors);
      } else {
        setError(data.error || t.weddings.loadFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword]);

  // Inline Active toggle — optimistic: flip local state first, roll
  // back on failure (the AdminReviews toggleFlag pattern).
  const toggleActive = async (row: VendorRow, value: boolean) => {
    const prev = vendors;
    setVendors((cur) =>
      cur ? cur.map((v) => (v.id === row.id ? { ...v, active: value } : v)) : cur,
    );
    try {
      const res = await fetch('/api/admin/weddings-vendors-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          vendor: { ...vendorPayload(row), active: value },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setVendors(prev);
        toast({
          title: data.error || t.weddings.saveFailed(res.status),
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch {
      setVendors(prev);
      toast({ title: t.common.couldNotReach, status: 'error', duration: 3000, isClosable: true });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/weddings-vendors-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: confirmDelete.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.weddings.vendorDeleted, status: 'success', duration: 3000, isClosable: true });
        setConfirmDelete(null);
        await loadVendors();
      } else {
        toast({
          title: data.error || t.weddings.deleteFailed(res.status),
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 3000, isClosable: true });
    } finally {
      setDeleting(false);
    }
  };

  const handleEditorSaved = async (message: string) => {
    setEditor(null);
    toast({ title: message, status: 'success', duration: 3000, isClosable: true });
    await loadVendors();
  };

  return (
    <SectionCard
      title={t.weddings.vendorsTitle}
      subtitle={vendors ? t.weddings.vendorCount(vendors.length) : undefined}
      headerRight={
        <CTAButton
          onClick={() => setEditor({ mode: 'create' })}
          icon={FaPlus}
          variant="solid"
          size="sm"
        >
          <Box as="span" display={{ base: 'none', sm: 'inline' }}>{t.weddings.newVendor}</Box>
          <Box as="span" display={{ base: 'inline', sm: 'none' }}>{t.weddings.newVendorShort}</Box>
        </CTAButton>
      }
    >
      <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.6" mb={4}>
        {t.weddings.vendorsNote}
      </Text>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <Flex justify="center" py={6}>
          <Spinner size="sm" color="brand.accent" />
        </Flex>
      ) : !vendors || vendors.length === 0 ? (
        <Box py={8} px={4} textAlign="center">
          <Flex
            w="56px"
            h="56px"
            mx="auto"
            borderRadius="full"
            bg="brand.surface"
            border="1px solid"
            borderColor="brand.accentBorder"
            align="center"
            justify="center"
            color="brand.accentText"
            mb={4}
          >
            <Icon as={FaUserFriends} boxSize={5} />
          </Flex>
          <Text fontSize="md" fontWeight="500" color="gray.800" mb={2}>
            {t.weddings.vendorsEmptyTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="380px" mx="auto" lineHeight="1.7">
            {t.weddings.vendorsEmptyBody}
          </Text>
        </Box>
      ) : (
        <VStack spacing={3} align="stretch">
          {vendors.map((row) => (
            <VendorCardRow
              key={row.id}
              row={row}
              adminLevel={adminLevel}
              onEdit={() => setEditor({ mode: 'edit', vendor: row })}
              onDelete={() => setConfirmDelete(row)}
              onToggleActive={(value) => void toggleActive(row, value)}
            />
          ))}
        </VStack>
      )}

      {/* Editor modal — key-ed so create → edit → different edit always
          remounts with fresh form state (the AdminReviews pattern). */}
      {editor !== null && (
        <VendorEditorModal
          key={editor.mode === 'edit' ? editor.vendor.id : 'create'}
          isOpen
          onClose={() => setEditor(null)}
          adminPassword={adminPassword}
          vendor={editor.mode === 'edit' ? editor.vendor : null}
          onSaved={handleEditorSaved}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        title={t.weddings.deleteConfirmTitle}
        body={confirmDelete ? t.weddings.deleteConfirmBody(confirmDelete.name) : ''}
        confirmLabel={t.weddings.deleteVendor}
        cancelLabel={t.common.cancel}
        danger
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
      />
    </SectionCard>
  );
}

function VendorCardRow({
  row,
  adminLevel,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  row: VendorRow;
  adminLevel: 'admin' | 'super';
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (value: boolean) => void;
}) {
  const { t } = useAdminLang();

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      p={{ base: 3, md: 4 }}
      _hover={{ borderColor: 'brand.accent' }}
      transition="all 0.15s"
    >
      <Flex align="flex-start" gap={3} wrap={{ base: 'wrap', md: 'nowrap' }}>
        <VendorAvatar name={row.name} photoUrl={row.photo_url} />

        <VStack align="flex-start" spacing={1} flex={1} minW={0}>
          <HStack spacing={2} wrap="wrap">
            <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="600" color="gray.800">
              {row.name}
            </Text>
            <Badge
              bg="gray.100"
              color="gray.600"
              fontSize={{ base: 'xs', md: '2xs' }}
              fontWeight="500"
              letterSpacing={{ base: '0.15em', md: '0.1em' }}
              textTransform="uppercase"
              px={2}
              py={0.5}
              borderRadius="sm"
            >
              {/* category is admin-authored DB data — not translated */}
              {row.category}
            </Badge>
            {!row.active && (
              <Badge
                bg="gray.100"
                color="gray.600"
                fontSize={{ base: 'xs', md: '2xs' }}
                fontWeight="500"
                letterSpacing={{ base: '0.15em', md: '0.1em' }}
                textTransform="uppercase"
                px={2}
                py={0.5}
                borderRadius="sm"
              >
                {t.weddings.hiddenBadge}
              </Badge>
            )}
          </HStack>

          {row.blurb && (
            <Text fontSize="sm" color="gray.700" fontWeight="300" noOfLines={2} w="100%" lineHeight="1.6">
              {row.blurb}
            </Text>
          )}

          {/* Inline Active switch — thumb-reachable so Vero can hide a
              vendor without opening the modal. */}
          <HStack spacing={2} pt={1}>
            <Switch
              isChecked={row.active}
              onChange={(e) => onToggleActive(e.target.checked)}
              colorScheme="yellow"
              size="sm"
              aria-label={t.weddings.activeLabel}
            />
            <Text fontSize="xs" color={row.active ? 'gray.700' : 'gray.400'}>
              {t.weddings.activeLabel}
            </Text>
          </HStack>
        </VStack>

        <HStack spacing={2} flexShrink={0} align="flex-start">
          <CTAButton onClick={onEdit} icon={FaEdit} variant="outline" size="sm">
            <Box as="span" display={{ base: 'none', md: 'inline' }}>{t.common.edit}</Box>
          </CTAButton>
          {adminLevel === 'super' && (
            <IconButton
              aria-label={t.weddings.deleteVendorAria}
              icon={<Icon as={FaTrash} boxSize={3.5} />}
              onClick={onDelete}
              variant="ghost"
              size="md"
              minW="44px"
              minH="44px"
              color="red.500"
              _hover={{ bg: 'red.50', color: 'red.600' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            />
          )}
        </HStack>
      </Flex>
    </Box>
  );
}

function VendorAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <Box
        as="img"
        src={toPreviewUrl(photoUrl)}
        alt=""
        boxSize={{ base: '40px', md: '48px' }}
        borderRadius="full"
        objectFit="cover"
        flexShrink={0}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <Flex
      boxSize={{ base: '40px', md: '48px' }}
      borderRadius="full"
      bg="brand.surface"
      border="1px solid"
      borderColor="brand.accentBorder"
      align="center"
      justify="center"
      flexShrink={0}
    >
      <Text fontSize="xs" fontWeight="500" color="brand.accentText" letterSpacing="0.05em">
        {getInitials(name)}
      </Text>
    </Flex>
  );
}

// ── Vendor editor modal ────────────────────────────────────────────
function VendorEditorModal({
  isOpen,
  onClose,
  adminPassword,
  vendor,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  adminPassword: string;
  vendor: VendorRow | null;
  onSaved: (message: string) => void;
}) {
  const { t } = useAdminLang();
  const [form, setForm] = useState<VendorForm>(
    vendor
      ? {
          name: vendor.name ?? '',
          category: vendor.category ?? '',
          blurb: vendor.blurb ?? '',
          websiteUrl: vendor.website_url ?? '',
          instagram: vendor.instagram ?? '',
          photoUrl: vendor.photo_url ?? '',
          sortOrder: String(vendor.sort_order ?? 0),
          active: vendor.active !== false,
        }
      : EMPTY_VENDOR_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = vendor !== null;

  const update = <K extends keyof VendorForm>(key: K, value: VendorForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.category.trim()) {
      setError(t.weddings.requiredFields);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsedSort = Number(form.sortOrder);
      const payload = {
        password: adminPassword,
        // camelCase keys on the wire — the upsert endpoint's contract
        // (the LIST endpoint returns snake_case; don't mix them up).
        vendor: {
          ...(vendor ? { id: vendor.id } : {}),
          name: form.name.trim(),
          category: form.category.trim(),
          blurb: form.blurb.trim(),
          websiteUrl: form.websiteUrl.trim(),
          instagram: form.instagram.trim(),
          photoUrl: form.photoUrl.trim(),
          sortOrder: Number.isFinite(parsedSort) ? Math.trunc(parsedSort) : 0,
          active: form.active,
        },
      };
      const res = await fetch('/api/admin/weddings-vendors-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onSaved(isEdit ? t.weddings.vendorSaved : t.weddings.vendorCreated);
      } else {
        setError(data.error || t.weddings.saveFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileSheetModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? t.weddings.editorEditTitle : t.weddings.editorNewTitle}
      desktopSize="lg"
      footer={
        <MobileSheetFooter>
          <CTAButton onClick={onClose} variant="ghost" size="sm" fullWidth isDisabled={saving}>
            {t.common.cancel}
          </CTAButton>
          <CTAButton
            onClick={handleSave}
            variant="solid"
            size="sm"
            fullWidth
            isLoading={saving}
            loadingText={t.common.saving}
          >
            {t.common.save}
          </CTAButton>
        </MobileSheetFooter>
      }
    >
      <VStack spacing={4} align="stretch">
        {error && (
          <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} borderRadius="sm">
            <Text fontSize="sm" color="red.700">{error}</Text>
          </Box>
        )}

        <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
          <Field label={t.weddings.nameLabel} required flex={1}>
            <Input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={t.weddings.namePlaceholder}
              {...inputStyles}
            />
          </Field>
          <Field label={t.weddings.categoryLabel} required flex={1}>
            <Input
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              placeholder={t.weddings.categoryPlaceholder}
              {...inputStyles}
            />
          </Field>
        </Stack>

        <Field label={t.weddings.blurbLabel}>
          <Textarea
            value={form.blurb}
            onChange={(e) => update('blurb', e.target.value)}
            placeholder={t.weddings.blurbPlaceholder}
            rows={4}
            {...inputStyles}
          />
        </Field>

        <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
          <Field label={t.weddings.websiteLabel} flex={1}>
            <Input
              value={form.websiteUrl}
              onChange={(e) => update('websiteUrl', e.target.value)}
              placeholder="https://..."
              {...inputStyles}
            />
          </Field>
          <Field label={t.weddings.instagramLabel} flex={1}>
            <Input
              value={form.instagram}
              onChange={(e) => update('instagram', e.target.value)}
              placeholder="https://instagram.com/..."
              {...inputStyles}
            />
          </Field>
        </Stack>

        <Field label={t.weddings.photoLabel} help={t.weddings.photoHelp}>
          <Flex align="center" gap={3}>
            <Input
              value={form.photoUrl}
              onChange={(e) => update('photoUrl', e.target.value)}
              placeholder="https://..."
              {...inputStyles}
            />
            {form.photoUrl.trim() !== '' && <UrlThumb url={form.photoUrl.trim()} />}
          </Flex>
        </Field>

        <Stack direction={{ base: 'column', md: 'row' }} spacing={4} align="flex-start">
          <Field label={t.weddings.sortOrderLabel} help={t.weddings.sortOrderHelp} flex={1}>
            <Input
              value={form.sortOrder}
              onChange={(e) => update('sortOrder', e.target.value)}
              inputMode="numeric"
              maxW="120px"
              {...inputStyles}
            />
          </Field>
          <HStack spacing={3} align="flex-start" flex={1} pt={{ base: 0, md: 6 }}>
            <Switch
              id="vendor-editor-active"
              isChecked={form.active}
              onChange={(e) => update('active', e.target.checked)}
              colorScheme="yellow"
              size="md"
            />
            <Box>
              <Text
                as="label"
                htmlFor="vendor-editor-active"
                fontSize="sm"
                fontWeight="500"
                color="gray.700"
                cursor="pointer"
                display="block"
              >
                {t.weddings.activeLabel}
              </Text>
              <Text fontSize="xs" color="gray.500" mt={0.5} lineHeight="1.5">
                {t.weddings.activeHelp}
              </Text>
            </Box>
          </HStack>
        </Stack>
      </VStack>
    </MobileSheetModal>
  );
}

// ── Shared presentational helpers ──────────────────────────────────
function SectionCard({
  title,
  subtitle,
  headerRight,
  children,
}: {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="sm" p={{ base: 4, md: 5 }}>
      <Flex align="flex-start" justify="space-between" gap={3} mb={4}>
        <VStack align="flex-start" spacing={1} minW={0}>
          <Text
            fontSize={{ base: 'xs', md: '2xs' }}
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing={{ base: '0.15em', md: '0.22em' }}
            color="brand.accentText"
          >
            {title}
          </Text>
          {subtitle && (
            <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.5">
              {subtitle}
            </Text>
          )}
        </VStack>
        {headerRight && <Box flexShrink={0}>{headerRight}</Box>}
      </Flex>
      {children}
    </Box>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <Box bg="red.50" border="1px solid" borderColor="red.200" p={2.5} mb={3} borderRadius="sm">
      <Text fontSize="xs" color="red.700">{message}</Text>
    </Box>
  );
}

// ── Field wrapper (mirrors AdminReviews' Field) ────────────────────
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
  children: ReactNode;
}) {
  return (
    <Box flex={flex} w="100%">
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

function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default AdminWeddings;
