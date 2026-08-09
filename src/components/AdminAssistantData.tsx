import {
  Box, Flex, VStack, HStack, Text, Icon, Input, Textarea, Select, Spinner,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter,
  Button, useToast, Switch, FormControl, FormLabel, InputGroup, InputLeftElement,
  Badge,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { FaSearch, FaPlus, FaTrash, FaEdit, FaMagic, FaHandPaper } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

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
        setEntries(data.entries);
      } else {
        setError(data.error || `Load failed (${res.status})`);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [adminPassword]);

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
    <Box maxW="1000px" mx="auto">
      {/* Toolbar */}
      <Flex gap={3} align="center" wrap="wrap" mb={5}>
        <InputGroup size="md" maxW="360px" flex={1}>
          <InputLeftElement pointerEvents="none">
            <Icon as={FaSearch} color="gray.400" boxSize={3} />
          </InputLeftElement>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search facts by keyword…"
            bg="white"
            borderColor="gray.300"
            _hover={{ borderColor: 'gray.400' }}
            _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
          />
        </InputGroup>
        <CTAButton onClick={() => setEditing('new')} icon={FaPlus} variant="solid" size="sm">
          Add fact
        </CTAButton>
      </Flex>

      {/* Meta strip: total + chatbot count */}
      {entries && entries.length > 0 && (
        <Flex mb={4} align="center" gap={3} fontSize="xs" color="gray.500" fontWeight="300">
          <Text>{entries.length} facts</Text>
          {chatbotCount > 0 && (
            <>
              <Text>·</Text>
              <HStack spacing={1.5}>
                <Icon as={FaMagic} boxSize={2.5} color="#c9a96e" />
                <Text>{chatbotCount} added by chatbot</Text>
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
          <Spinner color="#c9a96e" />
        </Flex>
      ) : !entries || entries.length === 0 ? (
        <EmptyState onAdd={() => setEditing('new')} />
      ) : grouped.length === 0 ? (
        <Box textAlign="center" py={12} color="gray.400" fontSize="sm">
          No facts match "{search}".
        </Box>
      ) : (
        <VStack align="stretch" spacing={6}>
          {grouped.map(({ category, rows }) => (
            <Box key={category}>
              <Text
                fontSize="2xs"
                fontWeight="600"
                letterSpacing="0.2em"
                textTransform="uppercase"
                color="#8a6e35"
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
            toast({ title: 'Saved', status: 'success', duration: 1500 });
            void load();
          }}
          onDeleted={() => {
            setEditing(null);
            toast({ title: 'Deleted', status: 'success', duration: 1500 });
            void load();
          }}
        />
      )}
    </Box>
  );
};

function FactCard({ entry, onEdit }: { entry: ContextEntry; onEdit: () => void }) {
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
        borderColor: '#c9a96e',
        boxShadow: '0 2px 8px -4px rgba(201, 169, 110, 0.35)',
      }}
      opacity={inactive ? 0.6 : 1}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Flex justify="space-between" align="flex-start" gap={3}>
        <VStack align="flex-start" spacing={1} flex={1} minW={0}>
          <HStack spacing={2} wrap="wrap">
            <Text fontSize="xs" fontWeight="500" color="gray.500" textTransform="capitalize">
              {entry.label}
            </Text>
            {entry.source === 'chatbot' && (
              <Badge
                bg="rgba(201, 169, 110, 0.15)"
                color="#8a6e35"
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
                Chatbot
              </Badge>
            )}
            {inactive && (
              <Badge fontSize="2xs" colorScheme="gray" textTransform="uppercase" px={1.5}>
                Inactive
              </Badge>
            )}
          </HStack>
          <Text fontSize="md" color="gray.800" lineHeight="1.55" whiteSpace="pre-wrap">
            {entry.content}
          </Text>
        </VStack>
        <Icon as={FaEdit} color="gray.300" boxSize={3} mt={1} flexShrink={0} />
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
      setSaveError('Category, label, and content are all required.');
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
        setSaveError(data.error || `Save failed (${res.status})`);
      }
    } catch {
      setSaveError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entry || !confirm(`Delete "${entry.label}"?`)) return;
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
        toast({ title: data.error || 'Delete failed', status: 'error', duration: 3000 });
      }
    } catch {
      toast({ title: 'Could not reach the server', status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader fontSize="md" fontWeight="500" color="gray.800">
          {isNew ? 'Add a fact' : 'Edit fact'}
          {!isNew && entry?.source === 'chatbot' && (
            <Badge
              ml={2}
              bg="rgba(201, 169, 110, 0.15)"
              color="#8a6e35"
              fontSize="2xs"
              fontWeight="600"
              letterSpacing="0.06em"
              textTransform="uppercase"
              px={1.5}
              py={0}
            >
              <Icon as={FaMagic} boxSize={2.5} mr={1} />
              Chatbot
            </Badge>
          )}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                Category
              </FormLabel>
              <HStack>
                {!useCustom ? (
                  <Select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    size="sm"
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
                    placeholder="new_category_name"
                    size="sm"
                    bg="white"
                    fontFamily="mono"
                  />
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setUseCustom(!useCustom)}
                  flexShrink={0}
                >
                  {useCustom ? 'Pick existing' : 'New category'}
                </Button>
              </HStack>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                Label
              </FormLabel>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Short name for this fact"
                size="sm"
                bg="white"
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                Content
              </FormLabel>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="The actual fact / rule / info. English."
                rows={5}
                size="sm"
                bg="white"
              />
            </FormControl>

            <FormControl display="flex" alignItems="center">
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={0} mr={2}>
                Active
              </FormLabel>
              <Switch
                isChecked={active}
                onChange={(e) => setActive(e.target.checked)}
                colorScheme="yellow"
                size="sm"
              />
              <Text fontSize="2xs" color="gray.500" ml={2}>
                {active ? 'Used by customer replies' : 'Hidden from customer replies'}
              </Text>
            </FormControl>

            {saveError && <Text fontSize="xs" color="red.600">{saveError}</Text>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          {!isNew && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              isDisabled={saving}
              color="red.500"
              leftIcon={<Icon as={FaTrash} boxSize={3} />}
              mr="auto"
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} isDisabled={saving}>
            Cancel
          </Button>
          <CTAButton onClick={handleSave} variant="solid" size="sm" isLoading={saving} loadingText="Saving…">
            Save
          </CTAButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
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
        <Icon as={FaHandPaper} boxSize={7} />
      </Flex>
      <Text as="h2" fontSize="md" fontWeight="500" color="gray.800" mb={2}>
        The knowledge base is empty
      </Text>
      <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="380px" mx="auto" lineHeight="1.7">
        Facts you add here are what the customer-facing AI uses to reply
        to DMs. Add manually, or head to the Chat tab and let the
        assistant help you fill it in.
      </Text>
      <Box pt={5}>
        <CTAButton onClick={onAdd} icon={FaPlus} variant="outline" size="sm">
          Add your first fact
        </CTAButton>
      </Box>
    </Box>
  );
}

export default AdminAssistantData;
