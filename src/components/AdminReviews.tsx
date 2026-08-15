import {
  Box, VStack, HStack, Text, Flex, Icon, Badge, useToast, Spinner, Wrap, IconButton,
  Switch, Input, Textarea, Select, Stack,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  FaPlus, FaSyncAlt, FaStar, FaEdit, FaTrash, FaGoogle, FaYelp,
  FaInstagram, FaEnvelope, FaUser,
} from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import MobileSheetModal, { MobileSheetFooter } from './ui/MobileSheetModal';
import ConfirmDialog from './ui/ConfirmDialog';
import { useAdminLang } from '../i18n/admin';

/**
 * "Reviews" tab in /admin — manage the testimonials that show up on the
 * public site (home page's Google Reviews section). Lives alongside
 * Journal + Gallery under the Studio group.
 *
 * List view with inline Featured / Visible switches on each card, an
 * icon-only Delete on each row (super-only), and an Edit CTA that
 * opens a MobileSheetModal editor. Delete flow uses the shared
 * ConfirmDialog primitive rather than window.confirm so the touch
 * targets are big on mobile.
 *
 * Available to BOTH admin (Vero) and super (Alex) — reviews are
 * photography-adjacent work. Only Delete is superadmin-gated on the
 * UI side, matching the API's requireSuper gate on reviews-delete.
 */

interface Props {
  adminPassword: string;
  adminLevel: 'admin' | 'super';
}

type Source = 'google' | 'yelp' | 'instagram' | 'email' | 'manual';

export interface ReviewRow {
  id: string;
  author_name: string;
  author_photo_url: string | null;
  rating: number;
  publish_date: string | null;
  source: Source;
  featured: boolean;
  visible: boolean;
  text: string;
}

interface FormState {
  author_name: string;
  author_photo_url: string;
  rating: number;
  publish_date: string;
  source: Source;
  featured: boolean;
  visible: boolean;
  text: string;
}

const EMPTY_FORM: FormState = {
  author_name: '',
  author_photo_url: '',
  rating: 5,
  publish_date: '',
  source: 'manual',
  featured: false,
  visible: true,
  text: '',
};

// Editor is either closed, opened for create, or opened on an existing row.
type EditorState = null | { mode: 'create' } | { mode: 'edit'; review: ReviewRow };

// Shared input styling — mirrors AdminJournalEditor's inputStyles. The
// { base: 'md', md: 'sm' } fontSize bump on mobile prevents iOS Safari
// from zooming the viewport when a field gains focus.
const inputStyles = {
  bg: 'white',
  borderColor: 'gray.300',
  fontSize: { base: 'md', md: 'sm' },
  _hover: { borderColor: 'gray.400' },
  _focus: {
    borderColor: '#c9a96e',
    boxShadow: '0 0 0 1px #c9a96e',
  },
} as const;

const AdminReviews = ({ adminPassword, adminLevel }: Props) => {
  const { t } = useAdminLang();
  const [items, setItems] = useState<ReviewRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReviewRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reviews-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(data.reviews);
      } else {
        setError(data.error || t.reviews.loadFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword]);

  // Inline toggle for visible / featured — roundtrips the whole review
  // through the upsert endpoint (the same one the modal editor uses).
  // Optimistic: flip local state first, roll back on failure so the
  // switch feels instant even on slow connections.
  const toggleFlag = async (
    row: ReviewRow,
    field: 'visible' | 'featured',
    value: boolean,
  ) => {
    const prev = items;
    setItems((cur) =>
      cur ? cur.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)) : cur,
    );
    try {
      const res = await fetch('/api/admin/reviews-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          review: { ...row, [field]: value },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setItems(prev);
        toast({
          title: data.error || t.reviews.saveFailed(res.status),
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch {
      setItems(prev);
      toast({
        title: t.common.couldNotReach,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/reviews-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: confirmDelete.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: t.reviews.reviewDeleted,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        setConfirmDelete(null);
        await loadItems();
      } else {
        toast({
          title: data.error || t.reviews.deleteFailed(res.status),
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch {
      toast({
        title: t.common.couldNotReach,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleEditorSaved = async (message: string) => {
    setEditor(null);
    toast({ title: message, status: 'success', duration: 3000, isClosable: true });
    await loadItems();
  };

  return (
    <Box maxW="1200px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Header — same layout as AdminJournal so Studio-group tabs feel
          uniform: gold kicker, thin H1, count subtitle, icon-only Refresh
          + primary "+ New" CTA. */}
      <Flex align="flex-end" justify="space-between" mb={{ base: 5, md: 8 }} gap={3}>
        <VStack align="flex-start" spacing={1} minW={0}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            {t.common.adminKicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
            {t.reviews.tabTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {items ? t.reviews.reviewCount(items.length) : t.reviews.subtitleEmpty}
          </Text>
        </VStack>

        <HStack spacing={2} flexShrink={0}>
          <IconButton
            aria-label={t.reviews.refreshAria}
            icon={<Icon as={FaSyncAlt} boxSize={4} />}
            onClick={loadItems}
            variant="ghost"
            size="md"
            minW="44px"
            minH="44px"
            color="gray.500"
            _hover={{ color: '#c9a96e' }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          />
          <CTAButton
            onClick={() => setEditor({ mode: 'create' })}
            icon={FaPlus}
            variant="solid"
            size="sm"
          >
            <Box as="span" display={{ base: 'none', sm: 'inline' }}>{t.reviews.newReview}</Box>
            <Box as="span" display={{ base: 'inline', sm: 'none' }}>{t.reviews.newReviewShort}</Box>
          </CTAButton>
        </HStack>
      </Flex>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {/* Google Aggregate card — the "5.0 · 15 reviews" badge on the
          public home page. Lives above the review list because it's a
          persistent site-wide setting, not a moderation queue item. */}
      <Box mb={{ base: 5, md: 6 }}>
        <GoogleAggregateCard adminPassword={adminPassword} />
      </Box>

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="#c9a96e" />
        </Flex>
      ) : !items || items.length === 0 ? (
        <EmptyState onNew={() => setEditor({ mode: 'create' })} />
      ) : (
        <VStack spacing={3} align="stretch">
          {items.map((row) => (
            <ReviewCard
              key={row.id}
              row={row}
              adminLevel={adminLevel}
              onEdit={() => setEditor({ mode: 'edit', review: row })}
              onDelete={() => setConfirmDelete(row)}
              onToggle={(field, value) => void toggleFlag(row, field, value)}
            />
          ))}
        </VStack>
      )}

      {/* Editor modal — key-ed by the current editor state so switching
          from create → edit → different edit always remounts with fresh
          form state seeded from the right row. */}
      {editor !== null && (
        <ReviewEditorModal
          key={editor.mode === 'edit' ? editor.review.id : 'create'}
          isOpen
          onClose={() => setEditor(null)}
          adminPassword={adminPassword}
          adminLevel={adminLevel}
          review={editor.mode === 'edit' ? editor.review : null}
          onSaved={handleEditorSaved}
          onRequestDelete={
            editor.mode === 'edit'
              ? () => {
                  const r = editor.review;
                  setEditor(null);
                  setConfirmDelete(r);
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        title={t.reviewsEditor.deleteConfirmTitle}
        body={confirmDelete ? t.reviewsEditor.deleteConfirmBody(confirmDelete.author_name) : ''}
        confirmLabel={t.reviewsEditor.deleteReview}
        cancelLabel={t.common.cancel}
        danger
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
      />
    </Box>
  );
};

// ── Google Aggregate card ──────────────────────────────────────────
// A compact editor for the two system_state scalars that drive the
// "5.0 · 15 reviews on Google" badge on the home page. Save is only
// enabled when both fields are valid AND dirty — nudges the admin
// toward "leave it alone unless something actually changed."
function GoogleAggregateCard({ adminPassword }: { adminPassword: string }) {
  const { t } = useAdminLang();
  const toast = useToast();
  const [ratingInput, setRatingInput] = useState('');
  const [countInput, setCountInput] = useState('');
  const [initialRating, setInitialRating] = useState('');
  const [initialCount, setInitialCount] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Empty body (past the password) → read path; the server
        // distinguishes read vs. update by the absence of rating/count.
        const res = await fetch('/api/admin/reviews-aggregate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) {
          const r = typeof data.rating === 'string' ? data.rating : '';
          const c = typeof data.count === 'number' ? String(data.count) : '';
          setRatingInput(r);
          setCountInput(c);
          setInitialRating(r);
          setInitialCount(c);
          setUpdatedAt(typeof data.updated_at === 'string' ? data.updated_at : null);
        } else {
          setError(data.error || t.reviews.loadFailed(res.status));
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
  }, [adminPassword, t]);

  // Validation mirrors the server-side rules so the Save button state
  // can react instantly without a round-trip. If either side of the
  // pair is invalid, Save is disabled.
  const ratingValid = /^[0-5](\.\d)?$/.test(ratingInput.trim());
  const countValid = /^\d+$/.test(countInput.trim());
  const dirty =
    ratingInput.trim() !== initialRating.trim() ||
    countInput.trim() !== initialCount.trim();
  const canSave = ratingValid && countValid && dirty && !saving;

  // Human-friendly timestamp — formatted client-side so the browser
  // locale wins, matching how the review-card publish_date renders.
  const updatedLabel = useMemo(() => {
    if (!updatedAt) return t.reviews.aggregateNeverUpdated;
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return t.reviews.aggregateNeverUpdated;
    return t.reviews.aggregateUpdatedAt(
      d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    );
  }, [updatedAt, t]);

  const handleSave = async () => {
    if (!ratingValid) {
      setError(t.reviews.aggregateInvalidRating);
      return;
    }
    if (!countValid) {
      setError(t.reviews.aggregateInvalidCount);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reviews-aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          rating: ratingInput.trim(),
          count: Number(countInput.trim()),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const r = typeof data.rating === 'string' ? data.rating : ratingInput.trim();
        const c =
          typeof data.count === 'number' ? String(data.count) : countInput.trim();
        setRatingInput(r);
        setCountInput(c);
        setInitialRating(r);
        setInitialCount(c);
        setUpdatedAt(typeof data.updated_at === 'string' ? data.updated_at : null);
        toast({
          title: t.reviews.aggregateSaved,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        setError(data.error || t.reviews.aggregateSaveFailed);
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      p={{ base: 4, md: 5 }}
    >
      <Flex align="flex-start" gap={3} mb={3}>
        <Flex
          boxSize={{ base: '40px', md: '44px' }}
          borderRadius="full"
          bg="#fdf9f0"
          border="1px solid"
          borderColor="#e8d9a8"
          align="center"
          justify="center"
          flexShrink={0}
        >
          <Icon as={FaGoogle} boxSize={4} color="#c9a96e" />
        </Flex>
        <VStack align="flex-start" spacing={1} flex={1} minW={0}>
          <Text
            fontSize={{ base: 'xs', md: '2xs' }}
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing={{ base: '0.15em', md: '0.22em' }}
            color="#c9a96e"
          >
            {t.reviews.aggregateTitle}
          </Text>
          <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.5">
            {t.reviews.aggregateSubtitle}
          </Text>
        </VStack>
      </Flex>

      {loading ? (
        <Flex justify="center" py={4}>
          <Spinner size="sm" color="#c9a96e" />
        </Flex>
      ) : (
        <>
          {error && (
            <Box
              bg="red.50"
              border="1px solid"
              borderColor="red.200"
              p={2.5}
              mb={3}
              borderRadius="sm"
            >
              <Text fontSize="xs" color="red.700">{error}</Text>
            </Box>
          )}

          <Stack direction={{ base: 'column', sm: 'row' }} spacing={3} align="flex-end">
            <Box flex={1} w="100%">
              <Text
                fontSize={{ base: 'xs', md: '2xs' }}
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing={{ base: '0.15em', md: '0.22em' }}
                color="gray.600"
                mb={1.5}
              >
                {t.reviews.aggregateRatingLabel}
              </Text>
              <Input
                value={ratingInput}
                onChange={(e) => setRatingInput(e.target.value)}
                placeholder="5.0"
                inputMode="decimal"
                // A short input matches the value's actual footprint
                // and stops the row from collapsing weirdly on desktop.
                maxLength={3}
                isInvalid={ratingInput !== '' && !ratingValid}
                {...inputStyles}
              />
            </Box>
            <Box flex={1} w="100%">
              <Text
                fontSize={{ base: 'xs', md: '2xs' }}
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing={{ base: '0.15em', md: '0.22em' }}
                color="gray.600"
                mb={1.5}
              >
                {t.reviews.aggregateCountLabel}
              </Text>
              <Input
                value={countInput}
                onChange={(e) => setCountInput(e.target.value)}
                placeholder="15"
                inputMode="numeric"
                isInvalid={countInput !== '' && !countValid}
                {...inputStyles}
              />
            </Box>
            <CTAButton
              onClick={handleSave}
              variant="solid"
              size="sm"
              isDisabled={!canSave}
              isLoading={saving}
              loadingText={t.common.saving}
            >
              {t.common.save}
            </CTAButton>
          </Stack>

          <Text fontSize="xs" color="gray.400" fontWeight="300" mt={3}>
            {updatedLabel}
          </Text>
        </>
      )}
    </Box>
  );
}

// ── Row card ───────────────────────────────────────────────────────
function ReviewCard({
  row,
  adminLevel,
  onEdit,
  onDelete,
  onToggle,
}: {
  row: ReviewRow;
  adminLevel: 'admin' | 'super';
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (field: 'visible' | 'featured', value: boolean) => void;
}) {
  const { t } = useAdminLang();

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      p={{ base: 4, md: 5 }}
      _hover={{ borderColor: '#c9a96e' }}
      transition="all 0.15s"
    >
      <Flex align="flex-start" gap={4} wrap={{ base: 'wrap', md: 'nowrap' }}>
        <AuthorAvatar review={row} />

        <VStack align="flex-start" spacing={1.5} flex={1} minW={0}>
          <HStack spacing={2} wrap="wrap">
            <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="600" color="gray.800">
              {row.author_name || t.reviews.unnamedAuthor}
            </Text>
            <SourceBadge source={row.source} />
            {row.featured && <Chip label={t.reviews.featured} tone="gold" />}
            {!row.visible && <Chip label={t.reviews.hidden} tone="gray" />}
          </HStack>

          <HStack spacing={3} align="center">
            <StarRow rating={row.rating} />
            {row.publish_date && (
              <Text fontSize="xs" color="gray.500" fontWeight="300">
                {formatDate(row.publish_date)}
              </Text>
            )}
          </HStack>

          {row.text && (
            <Text
              fontSize="sm"
              color="gray.700"
              fontWeight="300"
              noOfLines={2}
              w="100%"
              lineHeight="1.6"
            >
              {row.text}
            </Text>
          )}

          {/* Inline switches — always thumb-reachable so Vero can flip
              a review's visibility without opening the modal. */}
          <Wrap spacing={4} pt={1}>
            <HStack spacing={2}>
              <Switch
                isChecked={row.visible}
                onChange={(e) => onToggle('visible', e.target.checked)}
                colorScheme="yellow"
                size="sm"
                aria-label={t.reviews.visible}
              />
              <Text fontSize="xs" color={row.visible ? 'gray.700' : 'gray.400'}>
                {t.reviews.visible}
              </Text>
            </HStack>
            <HStack spacing={2}>
              <Switch
                isChecked={row.featured}
                onChange={(e) => onToggle('featured', e.target.checked)}
                colorScheme="yellow"
                size="sm"
                aria-label={t.reviews.featured}
              />
              <Text fontSize="xs" color={row.featured ? 'gray.700' : 'gray.400'}>
                {t.reviews.featured}
              </Text>
            </HStack>
          </Wrap>
        </VStack>

        {/* Actions — Edit CTA on every breakpoint (matches AdminGallery
            behavior, which also always shows the edit button); trash
            icon only visible to super. */}
        <HStack spacing={2} flexShrink={0} align="flex-start">
          <CTAButton onClick={onEdit} icon={FaEdit} variant="outline" size="sm">
            <Box as="span" display={{ base: 'none', md: 'inline' }}>{t.common.edit}</Box>
          </CTAButton>
          {adminLevel === 'super' && (
            <IconButton
              aria-label={t.reviews.deleteAria}
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

// ── Editor modal ───────────────────────────────────────────────────
function ReviewEditorModal({
  isOpen,
  onClose,
  adminPassword,
  adminLevel,
  review,
  onSaved,
  onRequestDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  adminPassword: string;
  adminLevel: 'admin' | 'super';
  review: ReviewRow | null;
  onSaved: (message: string) => void;
  onRequestDelete?: () => void;
}) {
  const { t } = useAdminLang();
  const [form, setForm] = useState<FormState>(review ? reviewToForm(review) : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = review !== null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.author_name.trim() || !form.text.trim()) {
      setError(t.reviewsEditor.requiredFields);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        password: adminPassword,
        review: {
          ...(review ? { id: review.id } : {}),
          author_name: form.author_name.trim(),
          author_photo_url: form.author_photo_url.trim() || null,
          rating: Math.max(1, Math.min(5, Math.round(form.rating))),
          publish_date: form.publish_date || null,
          source: form.source,
          featured: form.featured,
          visible: form.visible,
          text: form.text.trim(),
        },
      };
      const res = await fetch('/api/admin/reviews-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onSaved(isEdit ? t.reviewsEditor.reviewSaved : t.reviewsEditor.reviewCreated);
      } else {
        setError(data.error || t.reviewsEditor.saveFailed(res.status));
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
      title={isEdit ? t.reviewsEditor.editTitle : t.reviewsEditor.newTitle}
      desktopSize="lg"
      footer={
        <MobileSheetFooter>
          <CTAButton
            onClick={onClose}
            variant="ghost"
            size="sm"
            fullWidth
            isDisabled={saving}
          >
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

        <Field label={t.reviewsEditor.authorNameLabel} required>
          <Input
            value={form.author_name}
            onChange={(e) => update('author_name', e.target.value)}
            placeholder={t.reviewsEditor.authorNamePlaceholder}
            {...inputStyles}
          />
        </Field>

        <Field label={t.reviewsEditor.authorPhotoLabel} help={t.reviewsEditor.authorPhotoHelp}>
          <Input
            value={form.author_photo_url}
            onChange={(e) => update('author_photo_url', e.target.value)}
            placeholder="https://..."
            {...inputStyles}
          />
        </Field>

        <Field label={t.reviewsEditor.ratingLabel}>
          <RatingPicker value={form.rating} onChange={(v) => update('rating', v)} />
        </Field>

        <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
          <Field label={t.reviewsEditor.sourceLabel} flex={1}>
            <Select
              value={form.source}
              onChange={(e) => update('source', e.target.value as Source)}
              {...inputStyles}
            >
              <option value="google">{t.reviewsEditor.sourceGoogle}</option>
              <option value="yelp">{t.reviewsEditor.sourceYelp}</option>
              <option value="instagram">{t.reviewsEditor.sourceInstagram}</option>
              <option value="email">{t.reviewsEditor.sourceEmail}</option>
              <option value="manual">{t.reviewsEditor.sourceManual}</option>
            </Select>
          </Field>
          <Field
            label={t.reviewsEditor.publishDateLabel}
            help={t.reviewsEditor.publishDateHelp}
            flex={1}
          >
            <Input
              type="date"
              value={form.publish_date}
              onChange={(e) => update('publish_date', e.target.value)}
              {...inputStyles}
            />
          </Field>
        </Stack>

        <Field label={t.reviewsEditor.textLabel} required>
          <Textarea
            value={form.text}
            onChange={(e) => update('text', e.target.value)}
            placeholder={t.reviewsEditor.textPlaceholder}
            rows={6}
            {...inputStyles}
          />
        </Field>

        <Stack direction={{ base: 'column', md: 'row' }} spacing={4} pt={1}>
          <ToggleRow
            id="review-editor-visible"
            label={t.reviews.visible}
            help={t.reviewsEditor.visibleHelp}
            isChecked={form.visible}
            onChange={(v) => update('visible', v)}
          />
          <ToggleRow
            id="review-editor-featured"
            label={t.reviews.featured}
            help={t.reviewsEditor.featuredHelp}
            isChecked={form.featured}
            onChange={(v) => update('featured', v)}
          />
        </Stack>

        {/* Danger zone — superadmin-only, mirrors AdminJournalEditor. */}
        {isEdit && adminLevel === 'super' && onRequestDelete && (
          <Box
            mt={4}
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
              {t.reviewsEditor.dangerZone}
            </Text>
            <Text fontSize="xs" color="gray.700" fontWeight="300" mb={4} lineHeight="1.6">
              {t.reviewsEditor.dangerZoneBody}
            </Text>
            <CTAButton
              onClick={onRequestDelete}
              icon={FaTrash}
              variant="outline"
              size="sm"
              isDisabled={saving}
            >
              {t.reviewsEditor.deleteReview}
            </CTAButton>
          </Box>
        )}
      </VStack>
    </MobileSheetModal>
  );
}

// ── Rating picker (clickable row of 5 stars) ────────────────────────
function RatingPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const { t } = useAdminLang();
  return (
    <HStack spacing={1}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Box
          key={n}
          as="button"
          type="button"
          onClick={() => onChange(n)}
          aria-label={t.reviewsEditor.ratingStarAria(n)}
          aria-pressed={n === value}
          minW="44px"
          minH="44px"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          bg="transparent"
          border="none"
          cursor="pointer"
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Icon
            as={FaStar}
            boxSize={6}
            color={n <= value ? '#fbbc04' : 'gray.300'}
            transition="color 0.15s"
          />
        </Box>
      ))}
    </HStack>
  );
}

// ── Field wrapper (mirrors AdminJournalEditor's Field) ──────────────
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
          color="#c9a96e"
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

function ToggleRow({
  id,
  label,
  help,
  isChecked,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  isChecked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <HStack spacing={3} align="flex-start" flex={1}>
      <Switch
        id={id}
        isChecked={isChecked}
        onChange={(e) => onChange(e.target.checked)}
        colorScheme="yellow"
        size="md"
      />
      <Box>
        <Text
          as="label"
          htmlFor={id}
          fontSize="sm"
          fontWeight="500"
          color="gray.700"
          cursor="pointer"
          display="block"
        >
          {label}
        </Text>
        <Text fontSize="xs" color="gray.500" mt={0.5} lineHeight="1.5">
          {help}
        </Text>
      </Box>
    </HStack>
  );
}

// ── Presentational helpers ─────────────────────────────────────────
function Chip({ label, tone }: { label: string; tone: 'gold' | 'gray' }) {
  const config = {
    gold: { bg: '#fdf9f0', color: '#b8964f', borderColor: '#e8d9a8' },
    gray: { bg: 'gray.100', color: 'gray.600', borderColor: 'transparent' },
  }[tone];
  return (
    <Badge
      bg={config.bg}
      color={config.color}
      border="1px solid"
      borderColor={config.borderColor}
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="500"
      letterSpacing={{ base: '0.15em', md: '0.1em' }}
      textTransform="uppercase"
      px={2}
      py={0.5}
      borderRadius="sm"
    >
      {label}
    </Badge>
  );
}

function SourceBadge({ source }: { source: Source }) {
  const { t } = useAdminLang();
  // Source colors are the recognizable brand accents (Google blue, Yelp
  // red, Instagram pink) — everything else defaults to the neutral gray
  // used elsewhere in admin. Kept low-key so the badges don't shout.
  const config = {
    google:    { icon: FaGoogle,    label: t.reviews.sourceGoogle,    color: '#4285f4' },
    yelp:      { icon: FaYelp,      label: t.reviews.sourceYelp,      color: '#d32323' },
    instagram: { icon: FaInstagram, label: t.reviews.sourceInstagram, color: '#c13584' },
    email:     { icon: FaEnvelope,  label: t.reviews.sourceEmail,     color: 'gray.500' },
    manual:    { icon: FaUser,      label: t.reviews.sourceManual,    color: 'gray.500' },
  }[source];
  return (
    <HStack spacing={1.5} align="center">
      <Icon as={config.icon} boxSize={3} color={config.color} />
      <Text
        fontSize="2xs"
        fontWeight="500"
        letterSpacing="0.1em"
        textTransform="uppercase"
        color="gray.500"
      >
        {config.label}
      </Text>
    </HStack>
  );
}

function StarRow({ rating }: { rating: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return (
    <HStack spacing={0.5} aria-label={`${clamped} / 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          as={FaStar}
          boxSize={3.5}
          color={n <= clamped ? '#fbbc04' : 'gray.200'}
        />
      ))}
    </HStack>
  );
}

function AuthorAvatar({ review }: { review: ReviewRow }) {
  const initials = getInitials(review.author_name);
  return review.author_photo_url ? (
    <Box
      as="img"
      src={review.author_photo_url}
      alt=""
      boxSize={{ base: '40px', md: '48px' }}
      borderRadius="full"
      objectFit="cover"
      flexShrink={0}
    />
  ) : (
    <Flex
      boxSize={{ base: '40px', md: '48px' }}
      borderRadius="full"
      bg="#fdf9f0"
      border="1px solid"
      borderColor="#e8d9a8"
      align="center"
      justify="center"
      flexShrink={0}
    >
      <Text fontSize="xs" fontWeight="500" color="#c9a96e" letterSpacing="0.05em">
        {initials}
      </Text>
    </Flex>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  const { t } = useAdminLang();
  return (
    <Box
      bg="white"
      border="1px dashed"
      borderColor="gray.300"
      borderRadius="sm"
      py={16}
      px={6}
      textAlign="center"
    >
      <Flex
        w="72px"
        h="72px"
        mx="auto"
        borderRadius="full"
        bg="#fdf9f0"
        border="1px solid"
        borderColor="#e8d9a8"
        align="center"
        justify="center"
        color="#c9a96e"
        mb={5}
      >
        <Icon as={FaStar} boxSize={7} />
      </Flex>
      <Text fontSize="md" fontWeight="500" color="gray.800" mb={2}>
        {t.reviews.emptyTitle}
      </Text>
      <Text fontSize="sm" color="gray.500" fontWeight="300" mb={6} maxW="380px" mx="auto" lineHeight="1.7">
        {t.reviews.emptyDescription}
      </Text>
      <CTAButton onClick={onNew} icon={FaPlus} variant="solid" size="sm">
        {t.reviews.newReview}
      </CTAButton>
    </Box>
  );
}

// ── Small utils ─────────────────────────────────────────────────────
function reviewToForm(r: ReviewRow): FormState {
  return {
    author_name: r.author_name ?? '',
    author_photo_url: r.author_photo_url ?? '',
    rating: typeof r.rating === 'number' && r.rating > 0 ? r.rating : 5,
    publish_date: r.publish_date ? isoToDateInput(r.publish_date) : '',
    source: r.source ?? 'manual',
    featured: !!r.featured,
    visible: r.visible !== false, // default to true when undefined
    text: r.text ?? '',
  };
}

/**
 * Convert an ISO timestamp (or already-YYYY-MM-DD string) back to the
 * shape <input type="date"> requires. Uses UTC parts to survive
 * timezone drift the same way AdminJournalEditor does.
 */
function isoToDateInput(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default AdminReviews;
