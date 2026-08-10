import {
  Box, VStack, HStack, Text, Flex, Icon, Badge, useToast, Spinner, Wrap, IconButton,
} from '@chakra-ui/react';
import { useEffect, useState, type MouseEvent } from 'react';
import { FaPlus, FaSyncAlt, FaBookOpen, FaExternalLinkAlt, FaEdit } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import AdminJournalEditor from './AdminJournalEditor';
import { useAdminLang } from '../i18n/admin';

/**
 * "Journal" tab in /admin — the entry point for creating + managing
 * weekly recap posts.
 *
 * Two internal views:
 *   - 'list'    → post table + New button
 *   - 'editor'  → create/edit form (id present = edit, absent = create)
 *
 * Kept as an internal state machine (not routed via Admin.tsx's
 * top-level view state) so navigating between tabs doesn't lose
 * the editor session mid-write.
 *
 * Available to BOTH admin (Vero) and super (Alex) — journal editing
 * is Vero-facing work. Only delete is superadmin-gated (on the API
 * side).
 */

interface Props {
  adminPassword: string;
  adminLevel: 'admin' | 'super';
}

export interface JournalPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string | null;
  session_type: string | null;
  tags: string[];
  status: 'draft' | 'published';
  published_at: string | null;
  updated_at: string;
  created_at: string;
  drive_folder_url: string | null;
}

type View =
  | { kind: 'list' }
  | { kind: 'editor'; id: string | null };

const AdminJournal = ({ adminPassword, adminLevel }: Props) => {
  const { t } = useAdminLang();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [posts, setPosts] = useState<JournalPostSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const loadPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/journal-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPosts(data.posts);
      } else {
        setError(data.error || t.journal.loadFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view.kind === 'list') void loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword, view.kind]);

  const handleEditorSaved = (message?: string) => {
    if (message) toast({ title: message, status: 'success', duration: 3000, isClosable: true });
    setView({ kind: 'list' });
  };

  if (view.kind === 'editor') {
    return (
      <AdminJournalEditor
        adminPassword={adminPassword}
        adminLevel={adminLevel}
        postId={view.id}
        onCancel={() => setView({ kind: 'list' })}
        onSaved={handleEditorSaved}
      />
    );
  }

  return (
    <Box maxW="1200px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Header — title on the left with kicker + count, primary CTA
          (+ New) inline to the right on every breakpoint. Refresh sits
          as an icon-only round button next to New so both actions stay
          reachable with a thumb. */}
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
            {t.journal.tabTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {posts ? t.journal.postCount(posts.length) : t.journal.subtitleEmpty}
          </Text>
        </VStack>

        <HStack spacing={2} flexShrink={0}>
          <IconButton
            aria-label={t.journal.refreshAria}
            icon={<Icon as={FaSyncAlt} boxSize={4} />}
            onClick={loadPosts}
            variant="ghost"
            size="md"
            minW="44px"
            minH="44px"
            color="gray.500"
            _hover={{ color: '#c9a96e' }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          />
          <CTAButton
            onClick={() => setView({ kind: 'editor', id: null })}
            icon={FaPlus}
            variant="solid"
            size="sm"
          >
            <Box as="span" display={{ base: 'none', sm: 'inline' }}>{t.journal.newPost}</Box>
            <Box as="span" display={{ base: 'inline', sm: 'none' }}>{t.journal.newPostShort}</Box>
          </CTAButton>
        </HStack>
      </Flex>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="#c9a96e" />
        </Flex>
      ) : !posts || posts.length === 0 ? (
        <EmptyState onNew={() => setView({ kind: 'editor', id: null })} />
      ) : (
        <VStack spacing={3} align="stretch">
          {posts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              onEdit={() => setView({ kind: 'editor', id: post.id })}
            />
          ))}
        </VStack>
      )}
    </Box>
  );
};

function PostRow({
  post,
  onEdit,
}: {
  post: JournalPostSummary;
  onEdit: () => void;
}) {
  const { t } = useAdminLang();
  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    // The entire card is a button on every breakpoint — on mobile the Edit
    // CTA is hidden (redundant tap target on a small screen), so the card
    // itself must be the tappable surface. textAlign="left" keeps the
    // multi-line meta reading naturally instead of centered.
    <Flex
      as="button"
      onClick={onEdit}
      textAlign="left"
      w="100%"
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      p={{ base: 4, md: 5 }}
      align="center"
      gap={4}
      _hover={{ borderColor: '#c9a96e', transform: 'translateY(-1px)' }}
      transition="all 0.15s"
      cursor="pointer"
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Cover thumb — falls back to a placeholder icon block if
          no cover set yet */}
      <Box
        w={{ base: '56px', md: '72px' }}
        h={{ base: '56px', md: '72px' }}
        flexShrink={0}
        bg={post.cover_image_url ? 'transparent' : '#fdf9f0'}
        borderRadius="sm"
        overflow="hidden"
        display="flex"
        alignItems="center"
        justifyContent="center"
        border={post.cover_image_url ? 'none' : '1px solid'}
        borderColor="#e8d9a8"
      >
        {post.cover_image_url ? (
          <Box
            as="img"
            src={post.cover_image_url}
            alt=""
            w="100%"
            h="100%"
            objectFit="cover"
          />
        ) : (
          <Icon as={FaBookOpen} color="#c9a96e" boxSize={5} />
        )}
      </Box>

      {/* Meta column */}
      <VStack align="flex-start" spacing={1} flex={1} minW={0}>
        <HStack spacing={2} wrap="wrap">
          <StatusBadge status={post.status} />
          {post.session_type && (
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
              {/* session_type is user-authored / DB data — not translated */}
              {post.session_type}
            </Badge>
          )}
        </HStack>
        <Text
          fontSize={{ base: 'sm', md: 'md' }}
          fontWeight="500"
          color="gray.800"
          noOfLines={1}
          w="100%"
        >
          {post.title}
        </Text>
        {post.excerpt && (
          <Text fontSize="xs" color="gray.500" fontWeight="300" noOfLines={1} w="100%">
            {post.excerpt}
          </Text>
        )}
        {/* Wrap (not HStack) so on narrow mobile the "Photos linked · Updated…"
            bits break to a second line instead of overflowing the card */}
        <Wrap spacing={3} color="gray.500" fontWeight="300">
          <Text fontSize={{ base: 'xs', md: '2xs' }} color={post.drive_folder_url ? 'gray.500' : 'orange.600'}>
            {post.drive_folder_url ? t.journal.photosLinked : t.journal.noPhotosYet}
          </Text>
          <Text fontSize={{ base: 'xs', md: '2xs' }}>·</Text>
          <Text fontSize={{ base: 'xs', md: '2xs' }}>
            {post.status === 'published' && post.published_at
              ? t.journal.publishedOn(formatDate(post.published_at))
              : t.journal.updatedOn(formatDate(post.updated_at))}
          </Text>
        </Wrap>
      </VStack>

      {/* Actions — the whole card triggers Edit, so:
           - View is an icon-only link with stopPropagation so tapping it
             opens the live page instead of the editor.
           - Edit CTA is desktop-only; on mobile the card IS the button. */}
      <HStack spacing={2} flexShrink={0}>
        {post.status === 'published' && (
          <Box
            as="a"
            href={`/journal/${post.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.journal.openLivePageAria}
            onClick={(e: MouseEvent) => e.stopPropagation()}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            color="gray.500"
            _hover={{ color: '#c9a96e' }}
            minW={{ base: '44px', md: 'auto' }}
            minH={{ base: '44px', md: 'auto' }}
            px={2}
            py={1}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Icon as={FaExternalLinkAlt} boxSize={3.5} />
          </Box>
        )}
        <Box display={{ base: 'none', md: 'inline-flex' }}>
          <CTAButton onClick={onEdit} icon={FaEdit} variant="outline" size="sm">
            {t.common.edit}
          </CTAButton>
        </Box>
      </HStack>
    </Flex>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  const { t } = useAdminLang();
  const config = {
    draft:     { bg: 'gray.100',  color: 'gray.600',  label: t.journal.statusDraft },
    published: { bg: 'green.100', color: 'green.700', label: t.journal.statusPublished },
  }[status];
  return (
    <Badge
      bg={config.bg}
      color={config.color}
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="500"
      letterSpacing={{ base: '0.15em', md: '0.1em' }}
      textTransform="uppercase"
      px={2}
      py={0.5}
      borderRadius="sm"
    >
      {config.label}
    </Badge>
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
        <Icon as={FaBookOpen} boxSize={7} />
      </Flex>
      <Text fontSize="md" fontWeight="500" color="gray.800" mb={2}>
        {t.journal.emptyTitle}
      </Text>
      <Text fontSize="sm" color="gray.500" fontWeight="300" mb={6} maxW="380px" mx="auto" lineHeight="1.7">
        {t.journal.emptyDescription}
      </Text>
      <CTAButton onClick={onNew} icon={FaPlus} variant="solid" size="sm">
        {t.journal.newPost}
      </CTAButton>
    </Box>
  );
}

export default AdminJournal;
