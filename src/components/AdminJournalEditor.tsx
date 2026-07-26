import {
  Box, VStack, HStack, Text, Flex, Icon, Input, Textarea, Select, Spinner, useToast,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaSave, FaTrash, FaPlus, FaGripVertical, FaTimes, FaExternalLinkAlt } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

/**
 * Journal post editor — create + edit share this one form. When
 * `postId` is null → create mode (submits to journal-create). When
 * set → edit mode (loads via journal-detail on mount, submits to
 * journal-update).
 *
 * Photo management is URL-based for MVP: Vero pastes Google Drive
 * "shareable link" URLs (or any direct-image URL) into a growable
 * list. Session 3 replaces this with a proper picker (Drive folder
 * → auto-populate), but the URL list is enough to start writing
 * real posts.
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

interface PhotoDraft {
  url: string;
  alt: string;
  caption: string;
}

interface PostForm {
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  cover_image_url: string;
  cover_image_alt: string;
  photos: PhotoDraft[];
  session_type: string;
  tags: string; // comma-separated in the input, split on save
  status: 'draft' | 'published';
}

const EMPTY_FORM: PostForm = {
  slug: '',
  title: '',
  excerpt: '',
  body_markdown: '',
  cover_image_url: '',
  cover_image_alt: '',
  photos: [],
  session_type: '',
  tags: '',
  status: 'draft',
};

const SESSION_OPTIONS = [
  { value: '',           label: '— (none)' },
  { value: 'wedding',    label: 'Wedding' },
  { value: 'portrait',   label: 'Portrait' },
  { value: 'family',     label: 'Family' },
  { value: 'maternity',  label: 'Maternity' },
];

const AdminJournalEditor = ({ adminPassword, adminLevel, postId, onCancel, onSaved }: Props) => {
  const [form, setForm] = useState<PostForm>(EMPTY_FORM);
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
            cover_image_url: p.cover_image_url ?? '',
            cover_image_alt: p.cover_image_alt ?? '',
            photos: Array.isArray(p.photos)
              ? p.photos.map((ph: { url?: string; alt?: string; caption?: string }) => ({
                  url: ph.url ?? '',
                  alt: ph.alt ?? '',
                  caption: ph.caption ?? '',
                }))
              : [],
            session_type: p.session_type ?? '',
            tags: Array.isArray(p.tags) ? p.tags.join(', ') : '',
            status: p.status === 'published' ? 'published' : 'draft',
          });
          setExistingSlug(p.slug ?? null);
        } else {
          setError(data.error || 'Could not load the post.');
        }
      } catch {
        setError('Could not reach the server.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, adminPassword]);

  const update = <K extends keyof PostForm>(key: K, value: PostForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updatePhoto = (index: number, patch: Partial<PhotoDraft>) =>
    setForm((f) => ({
      ...f,
      photos: f.photos.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));

  const addPhoto = () =>
    setForm((f) => ({ ...f, photos: [...f.photos, { url: '', alt: '', caption: '' }] }));

  const removePhoto = (index: number) =>
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== index) }));

  const movePhoto = (index: number, dir: -1 | 1) => {
    setForm((f) => {
      const next = [...f.photos];
      const swap = index + dir;
      if (swap < 0 || swap >= next.length) return f;
      [next[index], next[swap]] = [next[swap], next[index]];
      return { ...f, photos: next };
    });
  };

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
      cover_image_url: form.cover_image_url,
      cover_image_alt: form.cover_image_alt,
      photos: form.photos.filter((p) => p.url.trim()),
      session_type: form.session_type || null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
      status: statusOverride ?? form.status,
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
        onSaved(postId ? 'Post saved' : 'Post created');
      } else {
        setError(data.error || `Save failed (${res.status})`);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!postId) return;
    if (!confirm('Delete this post? This cannot be undone.')) return;
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
        toast({ title: 'Post deleted', status: 'success', duration: 3000 });
        onSaved();
      } else {
        setError(data.error || `Delete failed (${res.status})`);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Flex justify="center" py={16}>
        <Spinner color="#c9a96e" />
      </Flex>
    );
  }

  return (
    <Box maxW="900px" mx="auto">
      {/* Top bar — back link + title + save actions */}
      <Flex align="center" justify="space-between" mb={6} wrap="wrap" gap={3}>
        <Box
          as="button"
          type="button"
          onClick={onCancel}
          display="inline-flex"
          alignItems="center"
          gap={2}
          fontSize="xs"
          letterSpacing="0.2em"
          textTransform="uppercase"
          color="gray.500"
          _hover={{ color: '#c9a96e' }}
          bg="transparent"
          border="none"
          cursor="pointer"
          px={2}
          py={1}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Icon as={FaArrowLeft} boxSize={3} />
          Back to posts
        </Box>

        <HStack spacing={3}>
          <CTAButton
            onClick={() => handleSave('draft')}
            variant="outline"
            size="sm"
            isLoading={saving}
            loadingText="Saving..."
          >
            Save Draft
          </CTAButton>
          <CTAButton
            onClick={() => handleSave('published')}
            icon={FaSave}
            variant="solid"
            size="sm"
            isLoading={saving}
            loadingText="Publishing..."
          >
            {form.status === 'published' ? 'Save & Republish' : 'Publish'}
          </CTAButton>
        </HStack>
      </Flex>

      <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0} mb={2}>
        {postId ? 'Edit post' : 'New post'}
      </Text>
      {existingSlug && form.status === 'published' && (
        <HStack fontSize="xs" color="gray.500" mb={6} spacing={2}>
          <Text>Live at</Text>
          <Box
            as="a"
            href={`/journal/${existingSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            color="#c9a96e"
            display="inline-flex"
            alignItems="center"
            gap={1}
            _hover={{ textDecoration: 'underline' }}
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
        <Field label="Title" required>
          <Input
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="A summer wedding on the north shore"
            {...inputStyles}
          />
        </Field>

        <Field
          label="Slug"
          help={
            form.slug
              ? `URL: vero.photography/journal/${form.slug}`
              : 'Leave blank to auto-generate from the title'
          }
        >
          <Input
            value={form.slug}
            onChange={(e) => update('slug', e.target.value)}
            placeholder="auto-generated-from-title"
            {...inputStyles}
          />
        </Field>

        <Field label="Excerpt" help="Short teaser shown in card previews and as SEO description (~1–2 sentences)">
          <Textarea
            value={form.excerpt}
            onChange={(e) => update('excerpt', e.target.value)}
            placeholder="One or two sentences that pull the reader in."
            rows={2}
            {...inputStyles}
          />
        </Field>

        <Field label="Body" help="Full write-up. Markdown supported (rendered in session 3 — displays as-is for now).">
          <Textarea
            value={form.body_markdown}
            onChange={(e) => update('body_markdown', e.target.value)}
            placeholder="Tell the story — how the day unfolded, favorite moments, whatever you want."
            rows={10}
            {...inputStyles}
            fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
            fontSize="sm"
          />
        </Field>

        <Field label="Cover image URL" help="The featured image (og:image + top of the post page). Usually one of the photos below.">
          <Input
            value={form.cover_image_url}
            onChange={(e) => update('cover_image_url', e.target.value)}
            placeholder="https://drive.google.com/... or /assets/photos/..."
            {...inputStyles}
          />
        </Field>
        {form.cover_image_url && (
          <Field label="Cover image alt text">
            <Input
              value={form.cover_image_alt}
              onChange={(e) => update('cover_image_alt', e.target.value)}
              placeholder="Bride and groom under an oak tree at sunset"
              {...inputStyles}
            />
          </Field>
        )}

        {/* Photos list */}
        <Box>
          <Flex align="center" justify="space-between" mb={2}>
            <Text
              fontSize="2xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.22em"
              color="#c9a96e"
            >
              Photos
            </Text>
            <CTAButton onClick={addPhoto} icon={FaPlus} variant="outline" size="sm">
              Add photo
            </CTAButton>
          </Flex>
          <Text fontSize="xs" color="gray.500" fontWeight="300" mb={3} lineHeight="1.6">
            Paste image URLs (Drive shareable link, direct URL, or /assets path). Order here = order on the published page.
          </Text>
          {form.photos.length === 0 ? (
            <Box
              bg="gray.50"
              border="1px dashed"
              borderColor="gray.300"
              borderRadius="sm"
              py={8}
              px={4}
              textAlign="center"
            >
              <Text fontSize="sm" color="gray.500" fontWeight="300">
                No photos yet — click "Add photo" to start.
              </Text>
            </Box>
          ) : (
            <VStack spacing={2} align="stretch">
              {form.photos.map((photo, i) => (
                <PhotoRow
                  key={i}
                  index={i}
                  photo={photo}
                  isFirst={i === 0}
                  isLast={i === form.photos.length - 1}
                  onChange={(patch) => updatePhoto(i, patch)}
                  onRemove={() => removePhoto(i)}
                  onMoveUp={() => movePhoto(i, -1)}
                  onMoveDown={() => movePhoto(i, 1)}
                />
              ))}
            </VStack>
          )}
        </Box>

        {/* Session type + tags row */}
        <HStack spacing={4} align="flex-start">
          <Field label="Session type" flex={1}>
            <Select
              value={form.session_type}
              onChange={(e) => update('session_type', e.target.value)}
              {...inputStyles}
            >
              {SESSION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Tags" help="Comma-separated" flex={2}>
            <Input
              value={form.tags}
              onChange={(e) => update('tags', e.target.value)}
              placeholder="outdoor, sunset, north-shore"
              {...inputStyles}
            />
          </Field>
        </HStack>

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
              fontSize="2xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.22em"
              color="red.700"
              mb={2}
            >
              Danger zone
            </Text>
            <Text fontSize="xs" color="gray.700" fontWeight="300" mb={4} lineHeight="1.6">
              Deleting a post removes it permanently. No undo — including
              the body, tags, and photo URL list. Cover image + photo
              files themselves are not touched (they live in Drive/etc).
            </Text>
            <CTAButton
              onClick={handleDelete}
              icon={FaTrash}
              variant="outline"
              size="sm"
              isLoading={deleting}
              loadingText="Deleting..."
            >
              Delete post
            </CTAButton>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

// Common input styling so all form fields feel of a piece with the
// rest of admin's cards.
const inputStyles = {
  bg: 'white',
  borderColor: 'gray.300',
  fontSize: 'sm',
  _hover: { borderColor: 'gray.400' },
  _focus: {
    borderColor: '#c9a96e',
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
          fontSize="2xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.22em"
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

function PhotoRow({
  index,
  photo,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  photo: PhotoDraft;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<PhotoDraft>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <Flex
      align="flex-start"
      gap={3}
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      p={3}
    >
      {/* Reorder handles */}
      <VStack spacing={0} flexShrink={0} align="center" pt={1}>
        <Text fontSize="2xs" color="gray.400" fontWeight="500">{index + 1}</Text>
        <Icon as={FaGripVertical} boxSize={3} color="gray.300" my={0.5} />
        <Box
          as="button"
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          fontSize="2xs"
          color={isFirst ? 'gray.300' : 'gray.500'}
          cursor={isFirst ? 'not-allowed' : 'pointer'}
          bg="transparent"
          border="none"
          _hover={{ color: isFirst ? 'gray.300' : '#c9a96e' }}
          px={1}
          py={0.5}
        >▲</Box>
        <Box
          as="button"
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          fontSize="2xs"
          color={isLast ? 'gray.300' : 'gray.500'}
          cursor={isLast ? 'not-allowed' : 'pointer'}
          bg="transparent"
          border="none"
          _hover={{ color: isLast ? 'gray.300' : '#c9a96e' }}
          px={1}
          py={0.5}
        >▼</Box>
      </VStack>

      {/* Thumbnail preview */}
      {photo.url ? (
        <Box
          w="56px"
          h="56px"
          flexShrink={0}
          bg="gray.100"
          borderRadius="sm"
          overflow="hidden"
        >
          <Box as="img" src={photo.url} alt="" w="100%" h="100%" objectFit="cover" />
        </Box>
      ) : (
        <Box
          w="56px"
          h="56px"
          flexShrink={0}
          bg="gray.50"
          border="1px dashed"
          borderColor="gray.300"
          borderRadius="sm"
        />
      )}

      {/* URL + alt + caption inputs */}
      <VStack flex={1} minW={0} spacing={2} align="stretch">
        <Input
          value={photo.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="Image URL"
          size="sm"
          {...inputStyles}
        />
        <HStack spacing={2}>
          <Input
            value={photo.alt}
            onChange={(e) => onChange({ alt: e.target.value })}
            placeholder="Alt text (accessibility)"
            size="sm"
            {...inputStyles}
          />
          <Input
            value={photo.caption}
            onChange={(e) => onChange({ caption: e.target.value })}
            placeholder="Caption (optional)"
            size="sm"
            {...inputStyles}
          />
        </HStack>
      </VStack>

      {/* Remove button */}
      <Box
        as="button"
        type="button"
        onClick={onRemove}
        flexShrink={0}
        color="gray.400"
        _hover={{ color: 'red.500' }}
        p={2}
        bg="transparent"
        border="none"
        cursor="pointer"
        aria-label="Remove photo"
      >
        <Icon as={FaTimes} boxSize={3.5} />
      </Box>
    </Flex>
  );
}

export default AdminJournalEditor;
