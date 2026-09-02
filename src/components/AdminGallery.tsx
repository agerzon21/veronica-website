import {
  Box, VStack, HStack, Text, Flex, Icon, Badge, Image, Spinner, useToast,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, Input, Textarea, Select, Switch, Button,
  SimpleGrid, Stack,
} from '@chakra-ui/react';
import { useEffect, useState, useCallback } from 'react';
import {
  FaSyncAlt, FaEdit, FaTrash, FaExternalLinkAlt, FaImage, FaExclamationTriangle,
  FaGoogleDrive, FaCog, FaCheckSquare, FaCheck,
} from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import RebuildSiteButton from './ui/RebuildSiteButton';
import ConfirmDialog from './ui/ConfirmDialog';
import { useAdminLang } from '../i18n/admin';

/**
 * "Gallery" tab in /admin — table of every photo in the public
 * gallery, with the sync-now trigger and per-row editing.
 *
 * The sync cron drops new photos here as drafts. Vero reviews the
 * AI-generated metadata (title / alt / description / keywords),
 * tweaks anything she wants, and flips them to published. That's
 * the "human in the loop" checkpoint before a new photo goes live.
 *
 * Editing goes through a modal (not inline) so slow-typing on a
 * description doesn't accidentally save mid-word.
 */

type Category = 'portraits' | 'weddings' | 'family' | 'maternity';
const CATEGORIES: readonly Category[] = ['portraits', 'weddings', 'family', 'maternity'];

interface Props {
  adminPassword: string;
  adminLevel: 'admin' | 'super';
}

interface GalleryRow {
  id: string;
  slug: string;
  category: Category;
  drive_file_id: string;
  drive_filename: string;
  title: string;
  alt: string;
  description: string;
  keywords: string[];
  width: number | null;
  height: number | null;
  status: 'draft' | 'published';
  sort_order: number;
  published_at: string | null;
  drive_seen_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  preview_url: string;
}

interface SyncResult {
  driveFilesSeen: number;
  inserted: number;
  insertedSlugs: string[];
  restored: number;
  softDeleted: number;
  refreshed: number;
  remainingNewNextRun: number;
  deployTriggered: boolean;
  insertFailures: Array<{ file: string; error: string }>;
}

type CategoryFilter = 'all' | Category;
type StatusFilter = 'all' | 'draft' | 'published';

interface GallerySettings {
  folderId: string;
  folderIdSource: 'db' | 'env' | 'none';
}

const AdminGallery = ({ adminPassword }: Props) => {
  const { t } = useAdminLang();
  const [photos, setPhotos] = useState<GalleryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<GalleryRow | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [settings, setSettings] = useState<GallerySettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toast = useToast();

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/gallery-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, action: 'get' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings({ folderId: data.folderId, folderIdSource: data.folderIdSource });
      }
    } catch {
      // Non-fatal — settings row is a nice-to-have for the header,
      // the photos list still loads without it.
    }
  }, [adminPassword]);

  // Bulk selection. Off by default: the card grid is also how Vero browses,
  // and permanent checkboxes on every card would clutter that.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/gallery-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPhotos(data.photos);
      } else {
        setError(data.error || t.gallery.loadFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  }, [adminPassword, t]);

  useEffect(() => {
    void loadPhotos();
    void loadSettings();
  }, [loadPhotos, loadSettings]);

  const handleSyncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    setLastSync(null);
    try {
      const res = await fetch('/api/admin/gallery-sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLastSync(data as SyncResult);
        toast({
          title: t.gallery.toastSynced(data.inserted, data.softDeleted),
          status: 'success',
          duration: 4000,
          isClosable: true,
        });
        void loadPhotos();
      } else {
        toast({
          title: data.error || t.gallery.toastSyncFailed,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 4000 });
    } finally {
      setSyncing(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  /**
   * Run a bulk op, then reload.
   *
   * Reloads rather than patching local state: recategorising can move a photo
   * out of the active filter and publishing changes the sort, so recomputing
   * from the server is both simpler and correct. The list is a few hundred
   * rows, so the refetch is cheap.
   */
  const runBulk = async (
    op: 'publish' | 'unpublish' | 'recategorize' | 'delete',
    extra: Record<string, unknown> = {},
  ) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/gallery-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, op, ids, ...extra }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title:
            t.gallery.bulkDone(data.affected) +
            (data.skipped > 0 ? t.gallery.bulkSkipped(data.skipped) : ''),
          status: 'success',
          duration: 4000,
          isClosable: true,
        });
        exitSelectMode();
        await loadPhotos();
      } else {
        toast({
          title: res.status === 403 ? t.gallery.bulkSuperOnly : data.error || t.gallery.bulkFailed,
          status: 'error',
          duration: 6000,
          isClosable: true,
        });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setBulkBusy(false);
      setConfirmBulkDelete(false);
    }
  };

  const handleDelete = async (row: GalleryRow) => {
    if (!confirm(t.gallery.confirmDelete(row.title || row.slug))) return;
    try {
      const res = await fetch('/api/admin/gallery-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: row.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.gallery.toastPhotoRemoved, status: 'success', duration: 3000 });
        void loadPhotos();
      } else {
        toast({ title: data.error || t.gallery.toastDeleteFailed, status: 'error', duration: 4000 });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 4000 });
    }
  };

  const filtered = (photos ?? []).filter((p) => {
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  const draftCount = (photos ?? []).filter((p) => p.status === 'draft').length;

  return (
    <Box maxW="1400px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Tab header — title on the left with kicker + count; Settings +
          Sync inline to the right as compact icon-button pair on
          mobile, full-labeled on desktop. Keeps the space above the
          filter/grid tight instead of stacking three chunky rows. */}
      <Flex align="flex-end" justify="space-between" mb={{ base: 4, md: 6 }} gap={3}>
        <VStack align="flex-start" spacing={1} minW={0}>
          <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="brand.accent">
            {t.common.adminKicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
            {t.gallery.tabTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {photos
              ? t.gallery.photoCount(photos.length, draftCount)
              : t.gallery.subtitleEmpty}
          </Text>
        </VStack>
        <HStack spacing={2} flexShrink={0}>
          {/* Icon-only on mobile so the whole action pair fits inline
              with the title. Aria-labels preserve semantics. */}
          <CTAButton
            onClick={() => setSettingsOpen(true)}
            icon={FaCog}
            variant="outline"
            size="sm"
            aria-label={t.gallery.ariaSettings}
          >
            <Box as="span" display={{ base: 'none', md: 'inline' }}>{t.gallery.settings}</Box>
          </CTAButton>
          <CTAButton
            onClick={handleSyncNow}
            icon={FaSyncAlt}
            variant="outline"
            size="sm"
            isLoading={syncing}
            loadingText={t.gallery.syncing}
            isDisabled={settings?.folderIdSource === 'none'}
            aria-label={t.gallery.ariaSyncFromDrive}
          >
            <Box as="span" display={{ base: 'none', md: 'inline' }}>{t.gallery.syncFromDrive}</Box>
          </CTAButton>
        </HStack>
      </Flex>

      {/* Publishing photos writes to the database; the pages search engines
          read are a build-time snapshot, so gallery edits do not reach them
          until a rebuild. Nothing in the gallery flow triggers one — the
          nightly Drive sync does, but a publish/unpublish/delete made here
          does not. This row is where that becomes visible: it reports what is
          waiting and is the only prompt to finish the job.
          Its own row, not the header cluster above — that Flex gives the
          title column minW={0} against a flexShrink={0} button group, so a
          third control there collapses the heading on phones. */}
      <Box mb={{ base: 4, md: 6 }}>
        <RebuildSiteButton adminPassword={adminPassword} compact />
      </Box>

      {/* Drive-connection status row. Prominent "Set up" prompt when
          no folder is configured yet, subtle "connected" indicator
          once it is. Clicking either opens the settings modal. */}
      {settings && settings.folderIdSource === 'none' ? (
        <Box
          mb={4}
          bg="orange.50"
          border="1px solid"
          borderColor="orange.200"
          borderRadius="sm"
          p={4}
        >
          <HStack spacing={3} align="flex-start">
            <Icon as={FaExclamationTriangle} color="orange.500" boxSize={4} mt={0.5} />
            <VStack align="flex-start" spacing={2} flex={1}>
              <Text fontSize="sm" fontWeight="500" color="orange.800">
                {t.gallery.driveNotConnectedTitle}
              </Text>
              <Text fontSize="xs" color="orange.700" lineHeight="1.6">
                {t.gallery.driveNotConnectedBody}
              </Text>
              <CTAButton
                onClick={() => setSettingsOpen(true)}
                icon={FaGoogleDrive}
                variant="solid"
                size="sm"
              >
                {t.gallery.setUpDrive}
              </CTAButton>
            </VStack>
          </HStack>
        </Box>
      ) : settings && (
        <Flex
          mb={4}
          gap={2}
          align="center"
          fontSize="xs"
          color="gray.500"
          fontWeight="300"
        >
          <Icon as={FaGoogleDrive} boxSize={3} color="brand.accent" />
          <Text>
            {t.gallery.connectedToDrive}
            {settings.folderIdSource === 'env' && t.gallery.connectedViaEnv}
          </Text>
        </Flex>
      )}

      {/* Sync-result banner (transient — dismisses on next sync or reload) */}
      {lastSync && (
        <Box
          mb={4}
          bg="rgba(56, 161, 105, 0.08)"
          border="1px solid"
          borderColor="green.200"
          borderRadius="sm"
          px={4}
          py={3}
        >
          <Text fontSize="xs" color="green.800" fontWeight="500" lineHeight="1.6">
            {t.gallery.syncSummaryHead(lastSync.driveFilesSeen, lastSync.inserted)}
            {lastSync.restored > 0 && t.gallery.syncSummaryRestored(lastSync.restored)}
            {lastSync.softDeleted > 0 && t.gallery.syncSummaryRemoved(lastSync.softDeleted)}
            {lastSync.remainingNewNextRun > 0 && t.gallery.syncSummaryPending(lastSync.remainingNewNextRun)}
            {lastSync.deployTriggered && t.gallery.syncSummaryRedeploy}
          </Text>
          {lastSync.insertFailures.length > 0 && (
            <VStack align="flex-start" spacing={0.5} mt={2}>
              <HStack spacing={1.5} color="orange.700">
                <Icon as={FaExclamationTriangle} boxSize={3} />
                <Text fontSize="xs" fontWeight="500">
                  {t.gallery.filesFailed(lastSync.insertFailures.length)}
                </Text>
              </HStack>
              {lastSync.insertFailures.slice(0, 5).map((f, i) => (
                <Text key={i} fontSize="2xs" color="gray.600">
                  {f.file} — {f.error}
                </Text>
              ))}
            </VStack>
          )}
        </Box>
      )}

      {/* Filters — two Selects side by side on every breakpoint (each
          takes 50% on mobile, capped width on desktop). Count sits
          below on its own compact line. */}
      <VStack align="stretch" mb={4} spacing={2}>
        <HStack spacing={2}>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
            size={{ base: 'md', md: 'sm' } as any}
            fontSize={{ base: 'md', md: 'sm' } as any}
            flex={1}
            maxW={{ base: '100%', md: '200px' }}
            bg="white"
          >
            <option value="all">{t.gallery.allCategories}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t.gallery.categoryNames[c]}</option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            size={{ base: 'md', md: 'sm' } as any}
            fontSize={{ base: 'md', md: 'sm' } as any}
            flex={1}
            maxW={{ base: '100%', md: '200px' }}
            bg="white"
          >
            <option value="all">{t.gallery.allStatuses}</option>
            <option value="draft">{t.gallery.statusDraft}</option>
            <option value="published">{t.gallery.statusPublished}</option>
          </Select>
        </HStack>
        <HStack justify="space-between" w="100%" flexWrap="wrap" gap={2}>
          <Text fontSize="xs" color="gray.500">
            {t.gallery.resultsCount(filtered.length, photos?.length ?? 0)}
          </Text>
          {(photos?.length ?? 0) > 0 && (
            <HStack spacing={2}>
              {selectMode && filtered.length > 0 && (
                <CTAButton
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    // "All shown" means the current filter, not the whole
                    // library — selecting 227 photos behind a Drafts filter
                    // would be a nasty surprise.
                    setSelectedIds(new Set(filtered.map((r) => r.id)))
                  }
                >
                  {t.gallery.bulkSelectAll}
                </CTAButton>
              )}
              <CTAButton
                variant={selectMode ? 'outline' : 'ghost'}
                size="sm"
                icon={selectMode ? undefined : FaCheckSquare}
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              >
                {selectMode ? t.gallery.bulkCancel : t.gallery.bulkSelect}
              </CTAButton>
            </HStack>
          )}
        </HStack>
      </VStack>

      {/* Drafts-waiting callout. New photos arrive as drafts and are invisible
          on the public site until published, which is easy to miss when the
          only signal is a number in the subtitle. One tap filters to drafts and
          turns on select mode, so publishing a batch is: tap here, Select all
          shown, Publish. */}
      {!loading && draftCount > 0 && !(statusFilter === 'draft' && selectMode) && (
        <Box
          mb={4}
          bg="brand.surfaceSunken"
          border="1px solid"
          borderColor="brand.accentBorder"
          borderRadius="sm"
          p={4}
        >
          <Stack
            direction={{ base: 'column', md: 'row' }}
            spacing={3}
            align={{ base: 'stretch', md: 'center' }}
            justify="space-between"
          >
            <Box minW={0}>
              <Text fontSize="sm" fontWeight="500" color="gray.800">
                {t.gallery.draftsWaitingTitle(draftCount)}
              </Text>
              <Text fontSize="xs" color="gray.600" fontWeight="300" mt={0.5}>
                {t.gallery.draftsWaitingBody}
              </Text>
            </Box>
            <Box flexShrink={0}>
              <CTAButton
                variant="solid"
                size="sm"
                onClick={() => {
                  setStatusFilter('draft');
                  setCategoryFilter('all');
                  setSelectMode(true);
                  setSelectedIds(new Set());
                }}
              >
                {t.gallery.draftsWaitingAction}
              </CTAButton>
            </Box>
          </Stack>
        </Box>
      )}

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="brand.accent" />
        </Flex>
      ) : filtered.length === 0 ? (
        <EmptyState hasAny={(photos?.length ?? 0) > 0} />
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={{ base: 3, md: 4 }}>
          {filtered.map((row) => (
            <PhotoCard
              key={row.id}
              row={row}
              selectMode={selectMode}
              selected={selectedIds.has(row.id)}
              onToggleSelected={() => toggleSelected(row.id)}
              onEdit={() => setEditing(row)}
              onDelete={() => handleDelete(row)}
            />
          ))}
        </SimpleGrid>
      )}

      {/* Sticky bulk bar. Only present when something is selected, so it never
          covers content during ordinary browsing. Sits above the mobile bottom
          nav rather than behind it. */}
      {selectMode && selectedIds.size > 0 && (
        <Box
          position="fixed"
          bottom={{ base: '72px', md: 6 }}
          left={{ base: 2, md: '50%' }}
          right={{ base: 2, md: 'auto' }}
          transform={{ base: 'none', md: 'translateX(-50%)' }}
          zIndex={20}
          bg="white"
          border="1px solid"
          borderColor="brand.accentBorder"
          borderRadius="md"
          boxShadow="lg"
          px={{ base: 3, md: 4 }}
          py={3}
        >
          <Stack
            direction={{ base: 'column', md: 'row' }}
            spacing={{ base: 2, md: 3 }}
            align={{ base: 'stretch', md: 'center' }}
          >
            <Text fontSize="sm" fontWeight="500" color="gray.800" whiteSpace="nowrap">
              {t.gallery.bulkSelected(selectedIds.size)}
            </Text>

            <HStack spacing={2} flexWrap="wrap">
              <CTAButton
                variant="solid" size="sm"
                isLoading={bulkBusy}
                onClick={() => void runBulk('publish')}
              >
                {t.gallery.bulkPublish}
              </CTAButton>
              <CTAButton
                variant="outline" size="sm"
                isDisabled={bulkBusy}
                onClick={() => void runBulk('unpublish')}
              >
                {t.gallery.bulkUnpublish}
              </CTAButton>
              <Select
                size="sm"
                borderRadius="sm"
                maxW="150px"
                value=""
                isDisabled={bulkBusy}
                onChange={(e) => {
                  if (e.target.value) void runBulk('recategorize', { category: e.target.value });
                }}
              >
                <option value="">{t.gallery.bulkMoveTo}</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t.gallery.categoryNames[c]}</option>
                ))}
              </Select>
              <CTAButton
                variant="danger" size="sm"
                isDisabled={bulkBusy}
                onClick={() => setConfirmBulkDelete(true)}
              >
                {t.gallery.bulkDelete}
              </CTAButton>
              <CTAButton variant="ghost" size="sm" isDisabled={bulkBusy} onClick={exitSelectMode}>
                {t.gallery.bulkClear}
              </CTAButton>
            </HStack>
          </Stack>
        </Box>
      )}

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        title={t.gallery.bulkDeleteTitle(selectedIds.size)}
        body={t.gallery.bulkDeleteBody}
        confirmLabel={t.gallery.bulkDeleteConfirm}
        cancelLabel={t.gallery.bulkCancel}
        danger
        isLoading={bulkBusy}
        onConfirm={() => void runBulk('delete')}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Edit modal */}
      {editing && (
        <EditModal
          row={editing}
          adminPassword={adminPassword}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void loadPhotos();
          }}
        />
      )}

      {/* Settings modal */}
      {settingsOpen && settings && (
        <SettingsModal
          currentFolderId={settings.folderId}
          currentSource={settings.folderIdSource}
          adminPassword={adminPassword}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            void loadSettings();
          }}
        />
      )}
    </Box>
  );
};

/**
 * Settings modal — currently just the Drive folder ID. Kept as a
 * separate modal (not inline) because it's a rare operation and
 * clutters the header otherwise. Room to grow (auto-publish
 * toggle, sync-schedule override, etc.) without bloating the tab.
 */
function SettingsModal({
  currentFolderId,
  currentSource,
  adminPassword,
  onClose,
  onSaved,
}: {
  currentFolderId: string;
  currentSource: 'db' | 'env' | 'none';
  adminPassword: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useAdminLang();
  const [folderInput, setFolderInput] = useState(currentFolderId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const toast = useToast();

  const handleSave = async () => {
    if (!folderInput.trim()) {
      setSaveError(t.gallery.pasteFolderError);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/gallery-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          action: 'set',
          folderId: folderInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.common.saved, status: 'success', duration: 2000 });
        onSaved();
      } else {
        setSaveError(data.error || t.gallery.saveFailed(res.status));
      }
    } catch {
      setSaveError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size={{ base: 'full', md: 'lg' } as any}
      isCentered={{ base: false, md: true } as any}
      motionPreset="slideInBottom"
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent
        borderRadius={{ base: 0, md: 'md' }}
        mx={{ base: 0, md: 4 }}
        my={{ base: 0, md: 'auto' }}
        maxH={{ base: '100dvh', md: 'auto' }}
      >
        <ModalHeader fontSize="md" fontWeight="500" color="gray.800">
          {t.gallery.settingsModalTitle}
        </ModalHeader>
        <ModalCloseButton size={{ base: 'lg', md: 'md' } as any} top={{ base: 3, md: 2 }} right={{ base: 3, md: 2 }} />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                {t.gallery.driveFolderLabel}
              </FormLabel>
              <Input
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                size={{ base: 'md', md: 'sm' } as any}
                fontSize={{ base: 'md', md: 'sm' } as any}
                fontFamily="mono"
                bg="white"
              />
              <Text fontSize="2xs" color="gray.500" mt={2} lineHeight="1.6">
                {t.gallery.driveFolderHelp}
              </Text>
            </FormControl>

            {currentSource === 'env' && (
              <Box
                bg="blue.50"
                border="1px solid"
                borderColor="blue.200"
                borderRadius="sm"
                px={3}
                py={2}
              >
                <Text fontSize="xs" color="blue.800" lineHeight="1.6">
                  {t.gallery.envLegacyNotice}
                </Text>
              </Box>
            )}

            {saveError && (
              <Text fontSize="xs" color="red.600">{saveError}</Text>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" size="sm" onClick={onClose} isDisabled={saving}>
            {t.common.cancel}
          </Button>
          <CTAButton
            onClick={handleSave}
            variant="solid"
            size="sm"
            isLoading={saving}
            loadingText={t.common.saving}
          >
            {t.common.save}
          </CTAButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * One photo card in the grid — thumbnail, metadata, action buttons.
 * Draft photos get a prominent "Draft" badge and a bordered
 * highlight so they visually pull for review.
 */
function PhotoCard({
  row,
  selectMode,
  selected,
  onToggleSelected,
  onEdit,
  onDelete,
}: {
  row: GalleryRow;
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useAdminLang();
  const isDraft = row.status === 'draft';
  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor={
        selected ? 'brand.accent' : isDraft ? 'rgba(201, 169, 110, 0.5)' : 'gray.200'
      }
      // A selected card reads as selected from the border and tint alone, so
      // the state survives scrolling past the checkbox on a narrow screen.
      boxShadow={selected ? '0 0 0 2px rgba(201,169,110,0.45)' : undefined}
      borderRadius="sm"
      overflow="hidden"
      transition="all 0.15s"
      _hover={{ borderColor: 'brand.accent', boxShadow: '0 4px 12px -6px rgba(201,169,110,0.35)' }}
      display="flex"
      flexDirection="column"
    >
      {/* Thumbnail */}
      <Box
        position="relative" pb="66%" bg="gray.100" overflow="hidden"
        // In select mode the whole thumbnail is the hit target — checkbox-sized
        // taps on a phone are miserable.
        onClick={selectMode ? onToggleSelected : undefined}
        cursor={selectMode ? 'pointer' : undefined}
        sx={selectMode ? { WebkitTapHighlightColor: 'transparent' } : undefined}
      >
        {selectMode && (
          <Flex
            position="absolute" top={2} left={2} zIndex={2}
            w="28px" h="28px" borderRadius="sm"
            align="center" justify="center"
            bg={selected ? 'brand.accent' : 'blackAlpha.600'}
            border="2px solid"
            borderColor={selected ? 'brand.accent' : 'whiteAlpha.800'}
            aria-hidden
          >
            {selected && <Icon as={FaCheck} boxSize={3} color="white" />}
          </Flex>
        )}
        <Image
          src={row.preview_url}
          alt={row.alt || row.title || row.slug}
          position="absolute"
          inset={0}
          w="100%"
          h="100%"
          objectFit="cover"
          loading="lazy"
        />
        {isDraft && (
          <Badge
            position="absolute"
            top={2}
            left={2}
            bg="brand.accent"
            color="white"
            fontSize="2xs"
            letterSpacing="0.1em"
            textTransform="uppercase"
            px={2}
            py={0.5}
          >
            {t.gallery.draft}
          </Badge>
        )}
      </Box>

      {/* Meta */}
      <VStack align="stretch" spacing={2} p={3} flex={1}>
        <HStack spacing={2}>
          <Badge fontSize="2xs" colorScheme="gray">
            {t.gallery.categoryNames[row.category]}
          </Badge>
          <Text fontSize="2xs" color="gray.500" fontFamily="mono" noOfLines={1} flex={1}>
            /{row.slug}
          </Text>
        </HStack>
        <Text fontSize="sm" fontWeight="500" color="gray.800" noOfLines={2}>
          {row.title || <Text as="span" color="gray.400" fontStyle="italic">{t.gallery.noTitleYet}</Text>}
        </Text>
        <Text fontSize="xs" color="gray.500" fontWeight="300" noOfLines={2}>
          {row.description || <Text as="span" fontStyle="italic">{t.gallery.noDescription}</Text>}
        </Text>

        {/* Actions — bumped touch targets on mobile so Edit / Open /
            Delete are 44×44 hits with breathing room between them. */}
        <HStack spacing={{ base: 3, md: 2 }} pt={2} mt="auto">
          <Box
            as="button"
            type="button"
            onClick={onEdit}
            flex={1}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            gap={1.5}
            fontSize={{ base: 'sm', md: 'xs' }}
            fontWeight="500"
            color="brand.accentText"
            bg="rgba(201, 169, 110, 0.12)"
            border="1px solid"
            borderColor="rgba(201, 169, 110, 0.4)"
            _hover={{ bg: 'rgba(201, 169, 110, 0.22)', borderColor: 'brand.accent' }}
            _active={{ bg: 'rgba(201, 169, 110, 0.28)' }}
            px={3}
            py={{ base: 3, md: 1.5 }}
            minH={{ base: '44px', md: 'auto' }}
            borderRadius="sm"
            cursor="pointer"
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Icon as={FaEdit} boxSize={{ base: 3.5, md: 2.5 }} />
            {isDraft ? t.gallery.review : t.common.edit}
          </Box>
          {row.status === 'published' && (
            <Box
              as="a"
              href={`/photo/${row.category}/${row.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              w={{ base: '44px', md: '32px' }}
              h={{ base: '44px', md: '32px' }}
              color="gray.500"
              _hover={{ color: 'brand.accent' }}
              _active={{ color: 'brand.accent', bg: 'rgba(201, 169, 110, 0.08)' }}
              cursor="pointer"
              aria-label={t.gallery.ariaOpenLive}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={FaExternalLinkAlt} boxSize={{ base: 4, md: 3 }} />
            </Box>
          )}
          <Box
            as="button"
            type="button"
            onClick={onDelete}
            aria-label={t.gallery.ariaDelete}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            w={{ base: '44px', md: '32px' }}
            h={{ base: '44px', md: '32px' }}
            color="gray.400"
            bg="transparent"
            border="none"
            _hover={{ color: 'red.500' }}
            _active={{ color: 'red.500', bg: 'red.50' }}
            cursor="pointer"
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Icon as={FaTrash} boxSize={{ base: 4, md: 3 }} />
          </Box>
        </HStack>
      </VStack>
    </Box>
  );
}

/**
 * Edit modal — all fields for one row. Save patches the specific
 * fields that changed (server does a COALESCE-based partial update).
 */
function EditModal({
  row,
  adminPassword,
  onClose,
  onSaved,
}: {
  row: GalleryRow;
  adminPassword: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useAdminLang();
  const [slug, setSlug] = useState(row.slug);
  const [title, setTitle] = useState(row.title);
  const [alt, setAlt] = useState(row.alt);
  const [description, setDescription] = useState(row.description);
  const [keywordsText, setKeywordsText] = useState(row.keywords.join(', '));
  const [category, setCategory] = useState<Category>(row.category);
  const [status, setStatus] = useState<'draft' | 'published'>(row.status);
  const [sortOrder, setSortOrder] = useState(row.sort_order);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const toast = useToast();

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const keywords = keywordsText
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const res = await fetch('/api/admin/gallery-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          id: row.id,
          slug,
          title,
          alt,
          description,
          keywords,
          category,
          status,
          sort_order: sortOrder,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.common.saved, status: 'success', duration: 2000 });
        onSaved();
      } else {
        setSaveError(data.error || t.gallery.saveFailed(res.status));
      }
    } catch {
      setSaveError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size={{ base: 'full', md: 'xl' } as any}
      isCentered={{ base: false, md: true } as any}
      motionPreset="slideInBottom"
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent
        borderRadius={{ base: 0, md: 'md' }}
        mx={{ base: 0, md: 4 }}
        my={{ base: 0, md: 'auto' }}
        maxH={{ base: '100dvh', md: 'auto' }}
      >
        <ModalHeader fontSize="md" fontWeight="500" color="gray.800">
          {t.gallery.editPhoto}
        </ModalHeader>
        <ModalCloseButton size={{ base: 'lg', md: 'md' } as any} top={{ base: 3, md: 2 }} right={{ base: 3, md: 2 }} />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Preview */}
            <Box borderRadius="sm" overflow="hidden" bg="gray.100" position="relative" pb="56%">
              <Image
                src={row.preview_url}
                alt={row.alt || row.title || row.slug}
                position="absolute"
                inset={0}
                w="100%"
                h="100%"
                objectFit="contain"
              />
            </Box>

            <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
              <FormControl flex={2}>
                <FormLabel fontSize={{ base: 'sm', md: 'xs' }} fontWeight="500" color="gray.700" mb={1}>{t.gallery.slug}</FormLabel>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  size={{ base: 'md', md: 'sm' } as any}
                  fontSize={{ base: 'md', md: 'sm' } as any}
                  fontFamily="mono"
                  bg="white"
                />
                <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" mt={1}>
                  {t.gallery.liveUrlPrefix} /photo/{category}/{slug}
                </Text>
              </FormControl>
              <FormControl flex={1}>
                <FormLabel fontSize={{ base: 'sm', md: 'xs' }} fontWeight="500" color="gray.700" mb={1}>{t.gallery.category}</FormLabel>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  size={{ base: 'md', md: 'sm' } as any}
                  fontSize={{ base: 'md', md: 'sm' } as any}
                  bg="white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t.gallery.categoryNames[c]}</option>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <FormControl>
              <FormLabel fontSize={{ base: 'sm', md: 'xs' }} fontWeight="500" color="gray.700" mb={1}>{t.gallery.title}</FormLabel>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} size={{ base: 'md', md: 'sm' } as any} fontSize={{ base: 'md', md: 'sm' } as any} bg="white" />
            </FormControl>

            <FormControl>
              <FormLabel fontSize={{ base: 'sm', md: 'xs' }} fontWeight="500" color="gray.700" mb={1}>{t.gallery.alt}</FormLabel>
              <Input value={alt} onChange={(e) => setAlt(e.target.value)} size={{ base: 'md', md: 'sm' } as any} fontSize={{ base: 'md', md: 'sm' } as any} bg="white" />
            </FormControl>

            <FormControl>
              <FormLabel fontSize={{ base: 'sm', md: 'xs' }} fontWeight="500" color="gray.700" mb={1}>{t.gallery.description}</FormLabel>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                size={{ base: 'md', md: 'sm' } as any}
                fontSize={{ base: 'md', md: 'sm' } as any}
                bg="white"
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize={{ base: 'sm', md: 'xs' }} fontWeight="500" color="gray.700" mb={1}>{t.gallery.keywords}</FormLabel>
              <Input
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="weddings, bride, sunset, ..."
                size={{ base: 'md', md: 'sm' } as any}
                fontSize={{ base: 'md', md: 'sm' } as any}
                bg="white"
              />
              <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" mt={1}>
                {t.gallery.keywordsHint}
              </Text>
            </FormControl>

            <Stack direction={{ base: 'column', md: 'row' }} spacing={4}>
              <FormControl>
                <FormLabel fontSize={{ base: 'sm', md: 'xs' }} fontWeight="500" color="gray.700" mb={1}>{t.gallery.published}</FormLabel>
                <HStack>
                  <Switch
                    isChecked={status === 'published'}
                    onChange={(e) => setStatus(e.target.checked ? 'published' : 'draft')}
                    colorScheme="yellow"
                    size={{ base: 'md', md: 'sm' } as any}
                  />
                  <Text fontSize={{ base: 'sm', md: 'xs' }} color={status === 'published' ? 'green.700' : 'orange.700'}>
                    {status === 'published' ? t.gallery.liveOnSite : t.gallery.draftHidden}
                  </Text>
                </HStack>
              </FormControl>
              <FormControl maxW={{ base: '100%', md: '140px' }}>
                <FormLabel fontSize={{ base: 'sm', md: 'xs' }} fontWeight="500" color="gray.700" mb={1}>{t.gallery.sortOverride}</FormLabel>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  size={{ base: 'md', md: 'sm' } as any}
                  fontSize={{ base: 'md', md: 'sm' } as any}
                  bg="white"
                />
              </FormControl>
            </Stack>

            <Box bg="gray.50" borderRadius="sm" px={3} py={2} border="1px solid" borderColor="gray.200">
              <Text fontSize="2xs" color="gray.600" fontWeight="500" letterSpacing="0.08em" textTransform="uppercase" mb={1}>
                {t.gallery.driveSectionLabel}
              </Text>
              <Text fontSize="xs" color="gray.700" fontFamily="mono" wordBreak="break-all">
                {row.drive_filename}
              </Text>
              <Text fontSize="2xs" color="gray.500" mt={1}>
                {t.gallery.driveRenameHint}
              </Text>
            </Box>

            {saveError && (
              <Text fontSize="xs" color="red.600">{saveError}</Text>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter
          pt={3}
          pb={{ base: 'max(env(safe-area-inset-bottom), 16px)', md: 4 }}
          borderTop={{ base: '1px solid', md: 'none' }}
          borderColor={{ base: 'gray.100', md: 'transparent' }}
        >
          <Stack
            direction={{ base: 'column-reverse', md: 'row' }}
            spacing={2}
            w="100%"
            justify={{ base: 'stretch', md: 'flex-end' }}
          >
            <Button
              variant="ghost"
              size={{ base: 'md', md: 'sm' } as any}
              onClick={onClose}
              isDisabled={saving}
              minH={{ base: '44px', md: 'auto' }}
              w={{ base: '100%', md: 'auto' }}
            >
              {t.common.cancel}
            </Button>
            <CTAButton
              onClick={handleSave}
              variant="solid"
              size="sm"
              isLoading={saving}
              loadingText={t.common.saving}
              fullWidth={{ base: true, md: false }}
            >
              {t.common.save}
            </CTAButton>
          </Stack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
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
        bg="brand.surface"
        border="1px solid"
        borderColor="brand.accentBorder"
        align="center"
        justify="center"
        color="brand.accentText"
        mb={5}
      >
        <Icon as={FaImage} boxSize={7} />
      </Flex>
      <Text as="h2" fontSize="md" fontWeight="500" color="gray.800" mb={2}>
        {hasAny ? t.gallery.emptyNoMatchTitle : t.gallery.emptyNoPhotosTitle}
      </Text>
      <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="380px" mx="auto" lineHeight="1.7">
        {hasAny ? t.gallery.emptyNoMatchBody : t.gallery.emptyNoPhotosBody}
      </Text>
    </Box>
  );
}

export default AdminGallery;
