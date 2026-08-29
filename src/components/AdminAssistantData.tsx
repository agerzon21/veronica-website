import {
  Box, Flex, VStack, HStack, Text, Icon, Input, Textarea, Select, Spinner,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter,
  Button, useToast, Switch, FormControl, FormLabel, InputGroup, InputLeftElement,
  Badge, Stack,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { FaSearch, FaPlus, FaTrash, FaEdit, FaMagic, FaHandPaper, FaLock } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import { useAdminLang } from '../i18n/admin';

/**
 * "Data" panel of the Assistant tab — a redesigned view of the
 * ai_context knowledge base.
 *
 * The old version was a dense form-per-row grid that Alex called
 * intimidating. This one is card-based:
 *   - Facts prominent (large-ish content text is the primary read)
 *   - Category as a small header, not a heavy container
 *   - "Chatbot" pill on rows the AI assistant wrote (so Vero can
 *     spot her recent auto-changes)
 *   - Search bar at top for keyword filtering across all categories
 *   - Empty categories don't render at all — no noise
 *   - Editing is a clean modal, not inline-in-place
 *
 * All CRUD reuses the existing /api/admin/context-* endpoints; the
 * only backend change is that they now return `source` too.
 */

interface Props {
  adminPassword: string;
}

interface ContextEntry {
  id: string;
  category: string;
  label: string;
  content: string;
  active: boolean;
  source: 'manual' | 'chatbot';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const AdminAssistantData = ({ adminPassword }: Props) => {
  const { t } = useAdminLang();
  const [entries, setEntries] = useState<ContextEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ContextEntry | 'new' | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/context-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // The /api/admin/context-list endpoint returns the row list
        // under the key `contexts` (matches its original shape from
        // the old messaging-only UI). Falling back to `entries` in
        // case anyone ever adds an alias — cheap, keeps this
        // robust to server-side renames.
        setEntries(data.contexts ?? data.entries ?? []);
      } else {
        setError(data.error || t.assistantData.loadFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  }, [adminPassword, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter first, then group. Categories with no matching rows
  // are hidden entirely (rather than showing an empty header).
  const grouped = useMemo(() => {
    if (!entries) return [] as Array<{ category: string; rows: ContextEntry[] }>;
    const q = search.trim().toLowerCase();
    const filtered = q
      ? entries.filter((e) => {
          const hay = `${e.category} ${e.label} ${e.content}`.toLowerCase();
          return hay.includes(q);
        })
      : entries;
    const map = new Map<string, ContextEntry[]>();
    for (const e of filtered) {
      if (!map.has(e.category)) map.set(e.category, []);
      map.get(e.category)!.push(e);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, rows]) => ({ category, rows }));
  }, [entries, search]);

  const chatbotCount = (entries ?? []).filter((e) => e.source === 'chatbot').length;

  return (
    <Box maxW="1000px" mx="auto" px={{ base: 0, md: 0 }}>
      <BuiltInBehaviorCard />

      {/* Toolbar — stacks on mobile so search gets full width + Add
          fact becomes a proper full-width primary CTA rather than a
          tiny pill orphaned to the right. */}
      <Stack
        direction={{ base: 'column', md: 'row' }}
        gap={3}
        align={{ base: 'stretch', md: 'center' }}
        mb={5}
      >
        <InputGroup size={{ base: 'lg', md: 'md' } as any} maxW={{ base: '100%', md: '360px' }} flex={1}>
          <InputLeftElement pointerEvents="none">
            <Icon as={FaSearch} color="gray.400" boxSize={3.5} />
          </InputLeftElement>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.assistantData.searchPlaceholder}
            bg="white"
            // 16px on mobile prevents iOS Safari zoom on focus.
            fontSize={{ base: 'md', md: 'sm' } as any}
            borderColor="gray.300"
            _hover={{ borderColor: 'gray.400' }}
            _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
          />
        </InputGroup>
        <CTAButton
          onClick={() => setEditing('new')}
          icon={FaPlus}
          variant="solid"
          size="sm"
          fullWidth={{ base: true, md: false }}
        >
          {t.assistantData.addFact}
        </CTAButton>
      </Stack>

      {/* Meta strip: total + chatbot count */}
      {entries && entries.length > 0 && (
        <Flex mb={4} align="center" gap={3} fontSize="xs" color="gray.500" fontWeight="300">
          <Text>{t.assistantData.factsCount(entries.length)}</Text>
          {chatbotCount > 0 && (
            <>
              <Text>·</Text>
              <HStack spacing={1.5}>
                <Icon as={FaMagic} boxSize={2.5} color="brand.accent" />
                <Text>{t.assistantData.chatbotAddedCount(chatbotCount)}</Text>
              </HStack>
            </>
          )}
        </Flex>
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
      ) : !entries || entries.length === 0 ? (
        <EmptyState onAdd={() => setEditing('new')} />
      ) : grouped.length === 0 ? (
        <Box textAlign="center" py={12} color="gray.400" fontSize="sm">
          {t.assistantData.noSearchMatch(search)}
        </Box>
      ) : (
        <VStack align="stretch" spacing={6}>
          {grouped.map(({ category, rows }) => (
            <Box key={category}>
              <Text
                fontSize={{ base: 'xs', md: '2xs' }}
                fontWeight="600"
                letterSpacing={{ base: '0.15em', md: '0.2em' }}
                textTransform="uppercase"
                color="brand.accentText"
                mb={2}
              >
                {category.replace(/_/g, ' ')}
              </Text>
              <VStack align="stretch" spacing={2}>
                {rows.map((e) => (
                  <FactCard key={e.id} entry={e} onEdit={() => setEditing(e)} />
                ))}
              </VStack>
            </Box>
          ))}
        </VStack>
      )}

      {editing && (
        <EditModal
          entry={editing === 'new' ? null : editing}
          existingCategories={[...new Set((entries ?? []).map((e) => e.category))].sort()}
          adminPassword={adminPassword}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast({ title: t.common.saved, status: 'success', duration: 1500 });
            void load();
          }}
          onDeleted={() => {
            setEditing(null);
            toast({ title: t.common.deleted, status: 'success', duration: 1500 });
            void load();
          }}
        />
      )}
    </Box>
  );
};

function FactCard({ entry, onEdit }: { entry: ContextEntry; onEdit: () => void }) {
  const { t } = useAdminLang();
  const inactive = !entry.active;
  return (
    <Box
      as="button"
      type="button"
      onClick={onEdit}
      textAlign="left"
      w="100%"
      bg="white"
      border="1px solid"
      borderColor={inactive ? 'gray.200' : 'gray.200'}
      borderRadius="sm"
      p={{ base: 3, md: 4 }}
      cursor="pointer"
      transition="all 0.12s"
      _hover={{
        borderColor: 'brand.accent',
        boxShadow: '0 2px 8px -4px rgba(201, 169, 110, 0.35)',
      }}
      opacity={inactive ? 0.6 : 1}
      minH={{ base: '72px', md: 'auto' }}
      _active={{ borderColor: 'brand.accent', bg: 'brand.surface' }}
      sx={{
        WebkitTapHighlightColor: 'transparent',
        // Hover only on real pointer devices so mobile taps don't stick.
        '@media (hover: hover)': {
          _hover: {
            borderColor: 'brand.accent',
            boxShadow: '0 2px 8px -4px rgba(201, 169, 110, 0.35)',
          },
        },
      }}
    >
      <Flex justify="space-between" align="flex-start" gap={3}>
        <VStack align="flex-start" spacing={1} flex={1} minW={0}>
          <HStack spacing={2} wrap="wrap">
            <Text fontSize={{ base: 'sm', md: 'xs' }} fontWeight="500" color="gray.500" textTransform="capitalize">
              {entry.label}
            </Text>
            {entry.source === 'chatbot' && (
              <Badge
                bg="rgba(201, 169, 110, 0.15)"
                color="brand.accentText"
                fontSize="2xs"
                fontWeight="600"
                letterSpacing="0.06em"
                textTransform="uppercase"
                px={1.5}
                py={0}
                borderRadius="sm"
                display="inline-flex"
                alignItems="center"
                gap={1}
              >
                <Icon as={FaMagic} boxSize={2.5} />
                {t.assistantData.chatbotBadge}
              </Badge>
            )}
            {inactive && (
              <Badge fontSize="2xs" colorScheme="gray" textTransform="uppercase" px={1.5}>
                {t.assistantData.inactiveBadge}
              </Badge>
            )}
          </HStack>
          <Text fontSize={{ base: 'md', md: 'md' }} color="gray.800" lineHeight="1.55" whiteSpace="pre-wrap">
            {entry.content}
          </Text>
        </VStack>
        <Icon as={FaEdit} color="gray.300" boxSize={{ base: 4, md: 3 }} mt={1} flexShrink={0} />
      </Flex>
    </Box>
  );
}

function EditModal({
  entry,
  existingCategories,
  adminPassword,
  onClose,
  onSaved,
  onDeleted,
}: {
  entry: ContextEntry | null;
  existingCategories: string[];
  adminPassword: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { t } = useAdminLang();
  const isNew = entry === null;
  const [category, setCategory] = useState(entry?.category ?? existingCategories[0] ?? '');
  const [customCategory, setCustomCategory] = useState('');
  const [useCustom, setUseCustom] = useState(!isNew && !existingCategories.includes(entry?.category ?? ''));
  const [label, setLabel] = useState(entry?.label ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [active, setActive] = useState(entry?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const toast = useToast();

  const handleSave = async () => {
    const finalCategory = (useCustom ? customCategory : category).trim();
    if (!finalCategory || !label.trim() || !content.trim()) {
      setSaveError(t.assistantData.allFieldsRequired);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const endpoint = isNew ? '/api/admin/context-create' : '/api/admin/context-update';
      const body = isNew
        ? { password: adminPassword, category: finalCategory, label, content, active }
        : { password: adminPassword, id: entry.id, category: finalCategory, label, content, active };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onSaved();
      } else {
        setSaveError(data.error || t.assistantData.saveFailed(res.status));
      }
    } catch {
      setSaveError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entry || !confirm(t.assistantData.deleteConfirm(entry.label))) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/context-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: entry.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onDeleted();
      } else {
        toast({ title: data.error || t.assistantData.deleteFailed, status: 'error', duration: 3000 });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      // Full-screen on mobile so the keyboard doesn't cover the Content
      // textarea and every input hits its 44px+ tap target. Centered
      // dialog on desktop as before.
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
          {isNew ? t.assistantData.addFactModalTitle : t.assistantData.editFactModalTitle}
          {!isNew && entry?.source === 'chatbot' && (
            <Badge
              ml={2}
              bg="rgba(201, 169, 110, 0.15)"
              color="brand.accentText"
              fontSize="2xs"
              fontWeight="600"
              letterSpacing="0.06em"
              textTransform="uppercase"
              px={1.5}
              py={0}
            >
              <Icon as={FaMagic} boxSize={2.5} mr={1} />
              {t.assistantData.chatbotBadge}
            </Badge>
          )}
        </ModalHeader>
        <ModalCloseButton size={{ base: 'lg', md: 'md' } as any} top={{ base: 3, md: 2 }} right={{ base: 3, md: 2 }} />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                {t.assistantData.categoryLabel}
              </FormLabel>
              <Stack direction={{ base: 'column', md: 'row' }} spacing={2}>
                {!useCustom ? (
                  <Select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    size={{ base: 'md', md: 'sm' } as any}
                    fontSize={{ base: 'md', md: 'sm' } as any}
                    bg="white"
                  >
                    {existingCategories.map((c) => (
                      <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder={t.assistantData.newCategoryPlaceholder}
                    size={{ base: 'md', md: 'sm' } as any}
                    fontSize={{ base: 'md', md: 'sm' } as any}
                    bg="white"
                    fontFamily="mono"
                  />
                )}
                <Button
                  size={{ base: 'sm', md: 'xs' } as any}
                  variant="ghost"
                  onClick={() => setUseCustom(!useCustom)}
                  flexShrink={0}
                  minH={{ base: '44px', md: 'auto' }}
                  w={{ base: '100%', md: 'auto' }}
                >
                  {useCustom ? t.assistantData.pickExisting : t.assistantData.newCategoryButton}
                </Button>
              </Stack>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                {t.assistantData.labelLabel}
              </FormLabel>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t.assistantData.labelPlaceholder}
                size={{ base: 'md', md: 'sm' } as any}
                fontSize={{ base: 'md', md: 'sm' } as any}
                bg="white"
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                {t.assistantData.contentLabel}
              </FormLabel>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t.assistantData.contentPlaceholder}
                rows={5}
                size={{ base: 'md', md: 'sm' } as any}
                fontSize={{ base: 'md', md: 'sm' } as any}
                bg="white"
              />
            </FormControl>

            <FormControl display="flex" alignItems="center">
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={0} mr={2}>
                {t.assistantData.activeLabel}
              </FormLabel>
              <Switch
                isChecked={active}
                onChange={(e) => setActive(e.target.checked)}
                colorScheme="yellow"
                size="sm"
              />
              <Text fontSize="2xs" color="gray.500" ml={2}>
                {active ? t.assistantData.usedByReplies : t.assistantData.hiddenFromReplies}
              </Text>
            </FormControl>

            {saveError && <Text fontSize="xs" color="red.600">{saveError}</Text>}
          </VStack>
        </ModalBody>
        <ModalFooter
          pt={3}
          pb={{ base: 'max(env(safe-area-inset-bottom), 16px)', md: 4 }}
          borderTop={{ base: '1px solid', md: 'none' }}
          borderColor={{ base: 'gray.100', md: 'transparent' }}
        >
          {/* Buttons: on mobile they stack full-width with Save on top
              (primary + thumb-reach) → Cancel → Delete. On desktop the
              old layout (Delete floats left, Cancel + Save right). */}
          <Stack
            direction={{ base: 'column-reverse', md: 'row' }}
            spacing={2}
            w="100%"
            align="stretch"
          >
            {!isNew && (
              <Button
                variant="ghost"
                size={{ base: 'md', md: 'sm' } as any}
                onClick={handleDelete}
                isDisabled={saving}
                color="red.500"
                leftIcon={<Icon as={FaTrash} boxSize={3.5} />}
                mr={{ base: 0, md: 'auto' }}
                minH={{ base: '44px', md: 'auto' }}
                w={{ base: '100%', md: 'auto' }}
              >
                {t.common.delete}
              </Button>
            )}
            {/* Spacer that pushes Cancel + Save to the right on desktop,
                but is inert on mobile (Stack column-reverse handles order). */}
            <Box flex={{ base: 0, md: 1 }} display={{ base: 'none', md: 'block' }} />
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

/**
 * Read-only card that surfaces the meta rules baked into the chat
 * endpoint's system prompt — the stuff that isn't stored in
 * ai_context but still shapes every reply. Making it visible here
 * gives Vero a complete picture of what the AI "knows" without her
 * having to trust that we haven't quietly hardcoded anything weird.
 *
 * Not editable because these behaviors live in api/admin/_assistant-
 * chat.ts (safety + language + tool-calling logic). If we ever want
 * to make them tweakable, they'll move into ai_context too and this
 * card goes away.
 *
 * Keep this in sync manually with the buildSystemPrompt() rules on
 * the server — this card lies about behavior if someone edits the
 * endpoint and forgets to update this list.
 */
function BuiltInBehaviorCard() {
  const { t } = useAdminLang();
  const facts = t.assistantData.builtInFacts;
  return (
    <Box
      mb={5}
      p={4}
      bg="linear-gradient(135deg, #fdf9f0 0%, #f5efe4 100%)"
      border="1px solid"
      borderColor="rgba(201, 169, 110, 0.35)"
      borderRadius="sm"
    >
      <HStack spacing={2} mb={2.5}>
        <Icon as={FaLock} boxSize={2.5} color="brand.accentText" />
        <Text
          fontSize="2xs"
          fontWeight="600"
          letterSpacing="0.2em"
          textTransform="uppercase"
          color="brand.accentText"
        >
          {t.assistantData.builtInBehaviorHeader}
        </Text>
        <Badge
          bg="rgba(138, 110, 53, 0.12)"
          color="brand.accentText"
          fontSize="2xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.06em"
          px={1.5}
          py={0}
          borderRadius="sm"
        >
          {t.assistantData.notEditable}
        </Badge>
      </HStack>
      <VStack align="flex-start" spacing={1.5}>
        {facts.map((f) => (
          <HStack key={f} spacing={2} align="flex-start">
            <Text color="brand.accent" mt="1px" fontSize="xs" flexShrink={0}>
              •
            </Text>
            <Text fontSize="xs" color="gray.700" lineHeight="1.6">
              {f}
            </Text>
          </HStack>
        ))}
      </VStack>
      <Text fontSize="2xs" color="gray.500" mt={2.5} fontStyle="italic">
        {t.assistantData.builtInFooter}
      </Text>
    </Box>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
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
        <Icon as={FaHandPaper} boxSize={7} />
      </Flex>
      <Text as="h2" fontSize="md" fontWeight="500" color="gray.800" mb={2}>
        {t.assistantData.emptyTitle}
      </Text>
      <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="380px" mx="auto" lineHeight="1.7">
        {t.assistantData.emptyDescription}
      </Text>
      <Box pt={5}>
        <CTAButton onClick={onAdd} icon={FaPlus} variant="outline" size="sm">
          {t.assistantData.addYourFirstFact}
        </CTAButton>
      </Box>
    </Box>
  );
}

export default AdminAssistantData;
