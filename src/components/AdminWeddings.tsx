import {
  Box, VStack, HStack, Text, Flex, Icon, Badge, useToast, Spinner, IconButton,
  Switch, Input, Textarea, Stack,
  Slider, SliderTrack, SliderFilledTrack, SliderThumb,
} from '@chakra-ui/react';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
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
 *   1. Pinned photos — five POSITIONAL slots (three package cards, the
 *      FAQ photo, the quote-section background) that must not reshuffle
 *      per visit, each with a draggable focal point; plus the Drive
 *      folder that feeds the background tapestry. Saved together via
 *      weddings-settings.
 *   2. From the Journal — the ordered featured-post list (max 6) for
 *      the page's slideshow, picked from published journal posts; each
 *      entry carries two drag-set focal points (big stage + thumbnail
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

const MAX_PINNED = 5;
const MAX_FEATURED = 6;
const MAX_SELECTED_WORK = 8;
// Add-picker page size — Alex refuses to scroll a 97-row list.
const PICKER_PAGE_SIZE = 10;

const DEFAULT_FOCUS = '50% 50%';
// Zoom is a plain scale factor. 1 = the whole frame (object-fit cover),
// 3 = tight crop. Server clamps to the same range.
const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.05;

// Focus values are CSS object-position strings — since the drag
// editors, percent pairs like "37% 62%"; the dropdown era's keywords
// ('center', 'left top', ...) still render and still validate
// server-side, so they pass through untouched.
const FOCUS_PERCENT_RE = /^(\d{1,3})% (\d{1,3})%$/;
const LEGACY_FOCUS_KEYWORDS = [
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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Coerce an unknown wire value into a renderable, saveable focus string. */
function normalizeFocus(v: unknown): string {
  if (typeof v !== 'string') return DEFAULT_FOCUS;
  const s = v.trim();
  const m = s.match(FOCUS_PERCENT_RE);
  if (m) return `${Math.min(100, Number(m[1]))}% ${Math.min(100, Number(m[2]))}%`;
  if ((LEGACY_FOCUS_KEYWORDS as readonly string[]).includes(s)) return s;
  return DEFAULT_FOCUS;
}

/**
 * Focus string → numeric pair for the drag math. Legacy keywords start
 * from center — the first drag replaces them with a percent pair.
 */
function parseFocusPercent(focus: string): { x: number; y: number } {
  const m = focus.trim().match(FOCUS_PERCENT_RE);
  if (!m) return { x: 50, y: 50 };
  return { x: Math.min(100, Number(m[1])), y: Math.min(100, Number(m[2])) };
}

/** Coerce an unknown wire value into a usable zoom factor. */
function normalizeZoom(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return DEFAULT_ZOOM;
  return clamp(n, MIN_ZOOM, MAX_ZOOM);
}

// One featured journal entry: which post, plus how its cover is framed
// in the slideshow's big stage and in the thumbnail strip.
interface FeaturedEntry {
  slug: string;
  focusStage: string;
  focusThumb: string;
  zoomStage: number;
  zoomThumb: number;
}

/** Defensive parse of the settings `featured` array into typed entries. */
function parseFeaturedEntries(input: unknown): FeaturedEntry[] {
  if (!Array.isArray(input)) return [];
  const out: FeaturedEntry[] = [];
  for (const item of input) {
    const slug =
      item && typeof item === 'object' && typeof (item as { slug?: unknown }).slug === 'string'
        ? ((item as { slug: string }).slug || '').trim()
        : typeof item === 'string'
          ? item.trim()
          : '';
    if (!slug) continue;
    const obj = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    out.push({
      slug,
      focusStage: normalizeFocus(obj.focusStage),
      focusThumb: normalizeFocus(obj.focusThumb),
      zoomStage: normalizeZoom(obj.zoomStage),
      zoomThumb: normalizeZoom(obj.zoomThumb),
    });
  }
  return out;
}

// One of the five POSITIONAL pinned slots. Empty url = unfilled slot
// that still holds its place (slot index IS the slot's job).
interface PinnedEntry {
  url: string;
  focus: string;
  zoom: number;
}

/** Defensive parse of the settings `pinned` array, padded to 5 slots. */
function parsePinnedEntries(input: unknown): PinnedEntry[] {
  const out: PinnedEntry[] = [];
  if (Array.isArray(input)) {
    for (const item of input.slice(0, MAX_PINNED)) {
      const obj = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
      out.push({
        url: typeof obj.url === 'string' ? obj.url.trim() : typeof item === 'string' ? item.trim() : '',
        focus: normalizeFocus(obj.focus),
        zoom: normalizeZoom(obj.zoom),
      });
    }
  }
  while (out.length < MAX_PINNED) {
    out.push({ url: '', focus: DEFAULT_FOCUS, zoom: DEFAULT_ZOOM });
  }
  return out;
}

// One curated mosaic tile: which gallery photo, plus how it is framed
// in whichever mosaic position it currently occupies.
interface SelectedEntry {
  slug: string;
  focus: string;
  zoom: number;
}

/**
 * Defensive parse of the settings `selectedWork` array. Tolerates the
 * legacy plain-slug array (normalized server-side too) so a stale
 * cached payload can't blank the card.
 */
function parseSelectedEntries(input: unknown): SelectedEntry[] {
  if (!Array.isArray(input)) return [];
  const out: SelectedEntry[] = [];
  for (const item of input) {
    if (typeof item === 'string') {
      const slug = item.trim();
      if (slug) out.push({ slug, focus: DEFAULT_FOCUS, zoom: DEFAULT_ZOOM });
      continue;
    }
    const obj = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const slug = typeof obj.slug === 'string' ? obj.slug.trim() : '';
    if (!slug) continue;
    out.push({ slug, focus: normalizeFocus(obj.focus), zoom: normalizeZoom(obj.zoom) });
  }
  return out;
}

/**
 * The mosaic makes every 5th tile (positions 0 and 5) a large 2-row
 * feature and leaves the rest as small 1-row tiles, so the crop a
 * photo gets depends on where it sits in the order. Reordering
 * re-derives this, which is exactly what the page does.
 */
const isLargeMosaicTile = (index: number) => index % 5 === 0;
const mosaicAspect = (index: number) => (isLargeMosaicTile(index) ? 2 : 1.52);

// Editor aspect ratios per pinned slot: three portrait package cards,
// the FAQ portrait, and the wide quote-section band. Must track how
// the public page actually crops each slot.
const PINNED_SLOT_ASPECTS = [2 / 3, 2 / 3, 2 / 3, 3 / 4, 3 / 1] as const;

interface WeddingsSettings {
  pinned: PinnedEntry[];
  folderId: string;
  featured: FeaturedEntry[];
  selectedWork: SelectedEntry[];
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
          pinned: parsePinnedEntries(data.pinned),
          folderId: typeof data.folderId === 'string' ? data.folderId : '',
          featured: parseFeaturedEntries(data.featured),
          selectedWork: parseSelectedEntries(data.selectedWork),
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
          <PinnedCard
            adminPassword={adminPassword}
            initialPinned={settings.pinned}
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

// ── Card 1: Pinned photos ──────────────────────────────────────────
function PinnedCard({
  adminPassword,
  initialPinned,
  initialFolderId,
}: {
  adminPassword: string;
  initialPinned: PinnedEntry[];
  initialFolderId: string;
}) {
  const { t } = useAdminLang();
  const toast = useToast();
  // Already padded to 5 by parsePinnedEntries; copy defensively anyway.
  const [entries, setEntries] = useState<PinnedEntry[]>(() =>
    parsePinnedEntries(initialPinned),
  );
  const [folderInput, setFolderInput] = useState(initialFolderId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setUrl = (index: number, url: string) =>
    setEntries((cur) => cur.map((e, i) => (i === index ? { ...e, url } : e)));

  const setFocus = (index: number, focus: string) =>
    setEntries((cur) => cur.map((e, i) => (i === index ? { ...e, focus } : e)));

  const setZoom = (index: number, zoom: number) =>
    setEntries((cur) => cur.map((e, i) => (i === index ? { ...e, zoom } : e)));

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
          // All five slots in order — empty urls hold their POSITION
          // (slot index is the slot's job on the page).
          pinned: entries.map((e) => ({ url: e.url.trim(), focus: e.focus, zoom: e.zoom })),
          folderId: folderInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.weddings.pinnedSaved, status: 'success', duration: 3000, isClosable: true });
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
    <SectionCard title={t.weddings.pinnedTitle}>
      {/* What "pinned" means — Alex: these are the photos we DON'T
          want randomized, and they should say so explicitly. */}
      <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.6" mb={4}>
        {t.weddings.pinnedIntro}
      </Text>

      {error && <ErrorBox message={error} />}

      <VStack spacing={5} align="stretch">
        {entries.map((entry, i) => (
          <Box key={i}>
            <Text
              fontSize={{ base: 'xs', md: '2xs' }}
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing={{ base: '0.15em', md: '0.22em' }}
              color="brand.accent"
            >
              {t.weddings.pinnedSlotLabels[i]}
            </Text>
            <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.5" mt={0.5} mb={1.5}>
              {t.weddings.pinnedSlotDescs[i]}
            </Text>
            <Input
              value={entry.url}
              onChange={(e) => setUrl(i, e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
              {...inputStyles}
            />
            {entry.url.trim() !== '' && (
              <Box mt={3}>
                <DragFocusEditor
                  src={toPreviewUrl(entry.url.trim())}
                  aspect={PINNED_SLOT_ASPECTS[i]}
                  focus={entry.focus}
                  onChange={(focus) => setFocus(i, focus)}
                  zoom={entry.zoom}
                  onZoomChange={(zoom) => setZoom(i, zoom)}
                  editorLabel={t.weddings.positionLabel}
                />
              </Box>
            )}
          </Box>
        ))}
      </VStack>

      <Box mt={6}>
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

// ── Drag-to-focus editor (shared by pinned + journal cards) ────────

/**
 * The preview IS the viewport: a box with the real slot's aspect ratio
 * showing the photo object-fit cover at the current focus, scaled by
 * the current zoom around that same focal point (exactly what the
 * public page does). Dragging pans, the slider zooms — what you see in
 * the box is the crop the page renders.
 */
function DragFocusEditor({
  src,
  aspect,
  focus,
  onChange,
  zoom,
  onZoomChange,
  editorLabel,
}: {
  src: string;
  aspect: number;
  focus: string;
  onChange: (focus: string) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  editorLabel: string;
}) {
  const { t } = useAdminLang();
  const [dragging, setDragging] = useState(false);
  // Drag-start snapshot lives in a ref — pointermove math needs it but
  // must not trigger renders itself (onChange already does).
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startFx: number;
    startFy: number;
    width: number;
    height: number;
  } | null>(null);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const { x, y } = parseFocusPercent(focus);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startFx: x,
      startFy: y,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
    setDragging(true);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    // Dragging the photo right shows more of its LEFT side, so the
    // focus percentage moves opposite to the pointer.
    const nx = clamp(d.startFx - ((e.clientX - d.startX) / d.width) * 100, 0, 100);
    const ny = clamp(d.startFy - ((e.clientY - d.startY) / d.height) * 100, 0, 100);
    onChange(`${Math.round(nx)}% ${Math.round(ny)}%`);
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <Box maxW="340px" w="100%">
      <Box
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        w="100%"
        borderRadius="sm"
        overflow="hidden"
        bg="gray.100"
        cursor={dragging ? 'grabbing' : 'grab'}
        sx={{ aspectRatio: String(aspect), touchAction: 'none' }}
      >
        <Box
          as="img"
          src={src}
          alt=""
          draggable={false}
          w="100%"
          h="100%"
          objectFit="cover"
          objectPosition={focus}
          pointerEvents="none"
          // Zoom scales around the focal point, so zooming in keeps
          // whatever was chosen by dragging centred in the frame.
          transform={`scale(${zoom})`}
          transformOrigin={focus}
          sx={{ userSelect: 'none' }}
        />
      </Box>
      <Flex align="center" gap={2} mt={0.5}>
        <Text
          fontSize="2xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.1em"
          color="gray.500"
          whiteSpace="nowrap"
        >
          {editorLabel}
        </Text>
        <Box flex={1} />
        <CTAButton
          onClick={() => {
            onChange(DEFAULT_FOCUS);
            onZoomChange(DEFAULT_ZOOM);
          }}
          variant="ghost"
          size="sm"
        >
          {t.weddings.focusReset}
        </CTAButton>
      </Flex>

      {/* Zoom. Independent of the drag: the slider changes scale only,
          dragging changes the focal point only. */}
      <HStack spacing={3} mt={1}>
        <Text
          fontSize="2xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.1em"
          color="gray.500"
          whiteSpace="nowrap"
        >
          {t.weddings.zoomLabel}
        </Text>
        <Slider
          value={zoom}
          onChange={(v) => onZoomChange(clamp(v, MIN_ZOOM, MAX_ZOOM))}
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          aria-label={t.weddings.zoomLabel}
          flex={1}
          focusThumbOnChange={false}
        >
          <SliderTrack bg="gray.200">
            <SliderFilledTrack bg="brand.accent" />
          </SliderTrack>
          <SliderThumb boxSize={4} borderWidth="1px" borderColor="brand.accentBorder" />
        </Slider>
        <Text fontSize="2xs" color="gray.500" fontWeight="400" minW="34px" textAlign="right">
          {`${zoom.toFixed(1)}x`}
        </Text>
      </HStack>

      <Text fontSize="2xs" color="gray.400" fontWeight="300" lineHeight="1.5">
        {t.weddings.dragHint}
      </Text>
    </Box>
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
        : [
            ...cur,
            {
              slug,
              focusStage: DEFAULT_FOCUS,
              focusThumb: DEFAULT_FOCUS,
              zoomStage: DEFAULT_ZOOM,
              zoomThumb: DEFAULT_ZOOM,
            },
          ],
    );

  const setFocus = (slug: string, field: 'focusStage' | 'focusThumb', value: string) =>
    setEntries((cur) => cur.map((e) => (e.slug === slug ? { ...e, [field]: value } : e)));

  const setZoom = (slug: string, field: 'zoomStage' | 'zoomThumb', value: number) =>
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
          // focus value (percent pair or legacy keyword).
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
      {/* What the drag editors are for — sits above the list so the
          controls below explain themselves. */}
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
              {entries.map((entry, i) => (
                <FeaturedRow
                  key={entry.slug}
                  entry={entry}
                  post={bySlug.get(entry.slug)}
                  isFirst={i === 0}
                  isLast={i === entries.length - 1}
                  onMove={(delta) => move(i, delta)}
                  onRemove={() => remove(entry.slug)}
                  onFocusChange={(field, value) => setFocus(entry.slug, field, value)}
                  onZoomChange={(field, value) => setZoom(entry.slug, field, value)}
                />
              ))}
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

/**
 * One featured slideshow entry: title row with reorder/remove, plus a
 * per-row "Adjust photo position" disclosure hiding the two drag
 * editors — open, a row is ~700px of editors on mobile, so collapsed
 * is the default and the list stays scannable.
 */
function FeaturedRow({
  entry,
  post,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onFocusChange,
  onZoomChange,
}: {
  entry: FeaturedEntry;
  post: JournalPostRow | undefined;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onFocusChange: (field: 'focusStage' | 'focusThumb', value: string) => void;
  onZoomChange: (field: 'zoomStage' | 'zoomThumb', value: number) => void;
}) {
  const { t } = useAdminLang();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const coverSrc = post?.cover_image_url ? toPreviewUrl(post.cover_image_url) : null;

  return (
    <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="sm" p={2}>
      <Flex align="center" gap={3}>
        <PostThumb coverUrl={post?.cover_image_url ?? null} />
        <Text
          flex={1}
          minW={0}
          fontSize="sm"
          fontWeight="500"
          color={post ? 'gray.800' : 'orange.600'}
          noOfLines={1}
        >
          {post ? post.title : t.weddings.unavailablePost(entry.slug)}
        </Text>
        <HStack spacing={0} flexShrink={0}>
          <IconButton
            aria-label={t.weddings.moveUpAria}
            icon={<Icon as={FaChevronUp} boxSize={3} />}
            onClick={() => onMove(-1)}
            isDisabled={isFirst}
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
            onClick={() => onMove(1)}
            isDisabled={isLast}
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
            onClick={onRemove}
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

      {/* No cover, nothing to position — the disclosure only exists
          when there's an image to drag. */}
      {coverSrc && (
        <Box mt={1}>
          <CTAButton
            onClick={() => setAdjustOpen((o) => !o)}
            icon={adjustOpen ? FaChevronUp : FaChevronDown}
            variant="ghost"
            size="sm"
          >
            {t.weddings.adjustPosition}
          </CTAButton>
          {adjustOpen && (
            <Stack
              direction={{ base: 'column', lg: 'row' }}
              spacing={{ base: 4, lg: 6 }}
              mt={2}
              pb={1}
              px={1}
            >
              <DragFocusEditor
                src={coverSrc}
                aspect={1150 / 470}
                focus={entry.focusStage}
                onChange={(v) => onFocusChange('focusStage', v)}
                zoom={entry.zoomStage}
                onZoomChange={(z) => onZoomChange('zoomStage', z)}
                editorLabel={t.weddings.focusStageLabel}
              />
              <DragFocusEditor
                src={coverSrc}
                aspect={2.6}
                focus={entry.focusThumb}
                onChange={(v) => onFocusChange('focusThumb', v)}
                zoom={entry.zoomThumb}
                onZoomChange={(z) => onZoomChange('zoomThumb', z)}
                editorLabel={t.weddings.focusThumbLabel}
              />
            </Stack>
          )}
        </Box>
      )}
    </Box>
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
  initialSelected: SelectedEntry[];
}) {
  const { t } = useAdminLang();
  const toast = useToast();
  const [photos, setPhotos] = useState<GalleryPhotoRow[] | null>(null);
  const [entries, setEntries] = useState<SelectedEntry[]>(
    initialSelected.slice(0, MAX_SELECTED_WORK),
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
    setEntries((cur) => {
      const target = index + delta;
      if (target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (slug: string) => setEntries((cur) => cur.filter((e) => e.slug !== slug));

  const add = (slug: string) =>
    setEntries((cur) =>
      cur.length >= MAX_SELECTED_WORK || cur.some((e) => e.slug === slug)
        ? cur
        : [...cur, { slug, focus: DEFAULT_FOCUS, zoom: DEFAULT_ZOOM }],
    );

  const setFocus = (slug: string, focus: string) =>
    setEntries((cur) => cur.map((e) => (e.slug === slug ? { ...e, focus } : e)));

  const setZoom = (slug: string, zoom: number) =>
    setEntries((cur) => cur.map((e) => (e.slug === slug ? { ...e, zoom } : e)));

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
          // Objects now, in display order — position decides the crop,
          // so order and framing travel together.
          selectedWork: entries,
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
  const available = (photos ?? []).filter((p) => !entries.some((e) => e.slug === p.slug));
  const atCap = entries.length >= MAX_SELECTED_WORK;

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
          {t.weddings.selectedCount(entries.length, MAX_SELECTED_WORK)}
        </Badge>
      }
    >
      {/* Why the crop shape changes as photos move around. */}
      <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.6" mb={4}>
        {t.weddings.mosaicHelp}
      </Text>

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
          {entries.length === 0 ? (
            <Text fontSize="sm" color="gray.500" fontWeight="300" py={2}>
              {t.weddings.selectedEmpty}
            </Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {entries.map((entry, i) => (
                <SelectedRow
                  key={entry.slug}
                  entry={entry}
                  photo={bySlug.get(entry.slug)}
                  index={i}
                  isFirst={i === 0}
                  isLast={i === entries.length - 1}
                  onMove={(delta) => move(i, delta)}
                  onRemove={() => remove(entry.slug)}
                  onFocusChange={(v) => setFocus(entry.slug, v)}
                  onZoomChange={(z) => setZoom(entry.slug, z)}
                />
              ))}
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

/**
 * One mosaic tile: title row with reorder/remove, plus an "Adjust photo
 * position" disclosure holding a single drag editor (same pattern as
 * the journal rows). The editor's aspect follows the tile's CURRENT
 * position, so reordering re-frames the preview the way the live
 * mosaic re-frames the tile.
 */
function SelectedRow({
  entry,
  photo,
  index,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onFocusChange,
  onZoomChange,
}: {
  entry: SelectedEntry;
  photo: GalleryPhotoRow | undefined;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onFocusChange: (value: string) => void;
  onZoomChange: (value: number) => void;
}) {
  const { t } = useAdminLang();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const large = isLargeMosaicTile(index);

  return (
    <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="sm" p={2}>
      <Flex align="center" gap={3}>
        <PhotoThumb url={photo?.url ?? null} />
        <Text
          flex={1}
          minW={0}
          fontSize="sm"
          fontWeight="500"
          color={photo ? 'gray.800' : 'orange.600'}
          noOfLines={1}
        >
          {photo ? displayPhotoTitle(photo) : t.weddings.unavailablePhoto(entry.slug)}
        </Text>
        <HStack spacing={0} flexShrink={0}>
          <IconButton
            aria-label={t.weddings.moveUpAria}
            icon={<Icon as={FaChevronUp} boxSize={3} />}
            onClick={() => onMove(-1)}
            isDisabled={isFirst}
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
            onClick={() => onMove(1)}
            isDisabled={isLast}
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
            onClick={onRemove}
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

      {/* An unavailable slug has no photo to frame — only the row's
          remove button is useful there. */}
      {photo && (
        <Box mt={1}>
          <CTAButton
            onClick={() => setAdjustOpen((o) => !o)}
            icon={adjustOpen ? FaChevronUp : FaChevronDown}
            variant="ghost"
            size="sm"
          >
            {t.weddings.adjustPosition}
          </CTAButton>
          {adjustOpen && (
            <Box mt={2} pb={1} px={1}>
              <DragFocusEditor
                src={photo.url}
                aspect={mosaicAspect(index)}
                focus={entry.focus}
                onChange={onFocusChange}
                zoom={entry.zoom}
                onZoomChange={onZoomChange}
                editorLabel={large ? t.weddings.mosaicLargeLabel : t.weddings.mosaicSmallLabel}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
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
