import {
  Box, VStack, HStack, Text, Flex, Icon, Input, Textarea, Switch, Badge, Spinner, useToast,
} from '@chakra-ui/react';
import { useEffect, useState, useCallback } from 'react';
import {
  FaRobot, FaPlus, FaTrash, FaSyncAlt, FaSave, FaEdit, FaCheck, FaTimes,
} from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

/**
 * "Assistant" tab in /admin — lets Vero edit the knowledge base
 * that shapes her AI assistant's replies. Every row in ai_context
 * (identity, tone, services, delivery, response_time, contact,
 * booking_bridge, website_cta, escalation_wrap_up, or any custom
 * category Vero adds) is editable / toggleable / deletable here.
 *
 * The safety rails (never quote prices, never affirm dates, never
 * make style recommendations) are hardcoded in api/_ai-reply.ts and
 * NOT editable via this UI — those are the guardrails, not the
 * content.
 *
 * UX: categories rendered as sectioned cards, each with its entries
 * and a per-section "+ Add entry" button. Each entry is edit-in-place
 * (inline forms), with an active switch to enable/disable without
 * deleting. Categories aren't hardcoded server-side — Vero can add
 * new ones by typing a new category name when creating an entry.
 *
 * Available to admin (Vero) and super (Alex). This is Vero's tool
 * to shape her own assistant's voice.
 */

interface Props {
  adminPassword: string;
}

export interface ContextEntry {
  id: string;
  category: string;
  label: string;
  content: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Human-friendly category descriptions shown above each section.
// Only used for display; the actual category string is whatever's
// in the DB. If Vero adds a custom category we don't have a
// description for, we render the raw category name.
const CATEGORY_META: Record<string, { title: string; description: string }> = {
  identity: {
    title: 'Identity',
    description: "The assistant's name and how it introduces itself in its first reply of a conversation.",
  },
  tone: {
    title: 'Tone',
    description: "How the assistant should sound — warmth, formality, emojis, first names, response length.",
  },
  services: {
    title: 'Services',
    description: 'What Vero offers and her general style. The assistant cites these when a customer asks what she does.',
  },
  delivery: {
    title: 'Delivery',
    description: 'How long clients typically wait for their galleries after a session.',
  },
  response_time: {
    title: 'Response time',
    description: 'How quickly Vero personally responds to new inquiries. Sets customer expectations.',
  },
  contact: {
    title: 'Contact channels',
    description: 'Alternate ways customers can reach Vero (email, contact form, etc.).',
  },
  booking_bridge: {
    title: 'Booking / pricing bridge',
    description: "The exact message the assistant sends when a customer asks about pricing, dates, or making a booking — instead of trying to answer itself. Only the first active entry is used.",
  },
  website_cta: {
    title: 'Website nudge',
    description: 'A natural mid-conversation mention of vero.photography. The assistant weaves it in after the conversation has warmed up.',
  },
  escalation_wrap_up: {
    title: 'Wrap-up handoff',
    description: "Sent when the assistant decides it has gathered enough for Vero to follow up personally. Only the first active entry is used.",
  },
  faq: {
    title: 'FAQs',
    description: 'Common questions + Vero-approved answers the assistant can cite. Add as many as you like.',
  },
};

// Preferred order for rendering — categories not listed appear
// alphabetically at the bottom.
const CATEGORY_ORDER = [
  'identity',
  'tone',
  'services',
  'delivery',
  'response_time',
  'contact',
  'booking_bridge',
  'website_cta',
  'escalation_wrap_up',
  'faq',
];

const AdminAssistant = ({ adminPassword }: Props) => {
  const [entries, setEntries] = useState<ContextEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const loadEntries = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const res = await fetch('/api/admin/context-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEntries(data.contexts);
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
    void loadEntries();
  }, [loadEntries]);

  const grouped = groupByCategory(entries ?? []);

  return (
    <Box maxW="1000px" mx="auto">
      {/* Header */}
      <Flex align="flex-end" justify="space-between" mb={6} wrap="wrap" gap={4}>
        <VStack align="flex-start" spacing={1}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            Admin
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
            Assistant
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            Shape how your AI assistant speaks and what it knows.
          </Text>
        </VStack>
        <Box
          as="button"
          type="button"
          onClick={loadEntries}
          display="inline-flex"
          alignItems="center"
          gap={2}
          fontSize="xs"
          letterSpacing="0.2em"
          textTransform="uppercase"
          color="gray.500"
          _hover={{ color: '#c9a96e' }}
          cursor="pointer"
          bg="transparent"
          border="none"
          px={2}
          py={1}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Icon as={FaSyncAlt} boxSize={3} />
          Refresh
        </Box>
      </Flex>

      {/* Explainer card */}
      <Box
        bg="#fdf9f0"
        border="1px solid"
        borderColor="#e8d9a8"
        borderRadius="sm"
        p={4}
        mb={6}
        display="flex"
        gap={3}
        alignItems="flex-start"
      >
        <Icon as={FaRobot} color="#c9a96e" boxSize={4} mt={0.5} flexShrink={0} />
        <Text fontSize="xs" color="gray.700" fontWeight="300" lineHeight="1.7">
          Everything on this page becomes part of your assistant's system prompt. Edit
          any entry to change how it responds. Add new entries for new topics (like
          "custom pricing question I get all the time"). Safety rules (never
          quote prices, never affirm dates, never make style suggestions) are
          built-in and can't be edited here — they protect your bookings from
          AI mistakes.
        </Text>
      </Box>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="#c9a96e" />
        </Flex>
      ) : (
        <VStack spacing={5} align="stretch">
          {orderedCategories(Object.keys(grouped)).map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              entries={grouped[cat] ?? []}
              adminPassword={adminPassword}
              onEntryChange={loadEntries}
              onEntryDelete={loadEntries}
              onEntryCreate={loadEntries}
              toast={toast}
            />
          ))}

          {/* Add-new-category card at the bottom, in case Vero wants
              a topic that doesn't fit an existing category. */}
          <AddNewCategory adminPassword={adminPassword} onCreated={loadEntries} toast={toast} />
        </VStack>
      )}
    </Box>
  );
};

function CategorySection({
  category,
  entries,
  adminPassword,
  onEntryChange,
  onEntryDelete,
  onEntryCreate,
  toast,
}: {
  category: string;
  entries: ContextEntry[];
  adminPassword: string;
  onEntryChange: () => void;
  onEntryDelete: () => void;
  onEntryCreate: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [adding, setAdding] = useState(false);
  const meta = CATEGORY_META[category];

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      overflow="hidden"
    >
      {/* Section header */}
      <Box p={{ base: 4, md: 5 }} borderBottom="1px solid" borderColor="gray.100">
        <Flex align="baseline" gap={3} wrap="wrap">
          <Text
            fontSize="2xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.22em"
            color="#c9a96e"
          >
            Category
          </Text>
          <Text fontSize="md" fontWeight="500" color="gray.800">
            {meta?.title ?? category}
          </Text>
          <Text fontSize="2xs" color="gray.400" fontFamily="'SFMono-Regular', Menlo, Consolas, monospace">
            {category}
          </Text>
        </Flex>
        {meta && (
          <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.6" mt={2}>
            {meta.description}
          </Text>
        )}
      </Box>

      {/* Entries */}
      <VStack spacing={0} align="stretch" divider={<Box h="1px" bg="gray.100" />}>
        {entries.length === 0 && !adding && (
          <Box p={{ base: 4, md: 5 }}>
            <Text fontSize="sm" color="gray.500" fontWeight="300">
              No entries yet in this category.
            </Text>
          </Box>
        )}
        {entries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            adminPassword={adminPassword}
            onChanged={onEntryChange}
            onDeleted={onEntryDelete}
            toast={toast}
          />
        ))}
        {adding && (
          <NewEntryForm
            category={category}
            adminPassword={adminPassword}
            onCancel={() => setAdding(false)}
            onCreated={() => {
              setAdding(false);
              onEntryCreate();
            }}
            toast={toast}
          />
        )}
      </VStack>

      {/* Add button */}
      {!adding && (
        <Box p={{ base: 3, md: 4 }} bg="gray.50" borderTop="1px solid" borderColor="gray.100">
          <CTAButton
            onClick={() => setAdding(true)}
            icon={FaPlus}
            variant="outline"
            size="sm"
          >
            Add entry
          </CTAButton>
        </Box>
      )}
    </Box>
  );
}

function EntryRow({
  entry,
  adminPassword,
  onChanged,
  onDeleted,
  toast,
}: {
  entry: ContextEntry;
  adminPassword: string;
  onChanged: () => void;
  onDeleted: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(entry.label);
  const [content, setContent] = useState(entry.content);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleToggleActive = async () => {
    try {
      const res = await fetch('/api/admin/context-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          id: entry.id,
          active: !entry.active,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onChanged();
      } else {
        toast({ title: data.error || 'Update failed', status: 'error', duration: 3000 });
      }
    } catch {
      toast({ title: 'Could not reach the server', status: 'error', duration: 3000 });
    }
  };

  const handleSave = async () => {
    if (!label.trim() || !content.trim()) {
      toast({ title: 'Label and content are required', status: 'warning', duration: 3000 });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/context-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          id: entry.id,
          label: label.trim(),
          content: content.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: 'Saved', status: 'success', duration: 2000 });
        setEditing(false);
        onChanged();
      } else {
        toast({ title: data.error || 'Save failed', status: 'error', duration: 3000 });
      }
    } catch {
      toast({ title: 'Could not reach the server', status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${entry.label}"? This can be recreated from the seed migration if needed.`)) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/context-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: entry.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: 'Deleted', status: 'success', duration: 2000 });
        onDeleted();
      } else {
        toast({ title: data.error || 'Delete failed', status: 'error', duration: 3000 });
      }
    } catch {
      toast({ title: 'Could not reach the server', status: 'error', duration: 3000 });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box p={{ base: 4, md: 5 }} bg={entry.active ? 'white' : 'gray.50'}>
      <Flex justify="space-between" align="flex-start" gap={3} mb={2}>
        <VStack align="flex-start" spacing={0} flex={1} minW={0}>
          {editing ? (
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (Vero-facing name)"
              size="sm"
              fontWeight="500"
              maxW="480px"
              {...inputStyles}
            />
          ) : (
            <Text fontSize="sm" fontWeight="500" color={entry.active ? 'gray.800' : 'gray.500'}>
              {entry.label}
            </Text>
          )}
        </VStack>
        <HStack spacing={2} flexShrink={0}>
          {!entry.active && (
            <Badge
              bg="gray.200"
              color="gray.600"
              fontSize="2xs"
              fontWeight="500"
              letterSpacing="0.08em"
              textTransform="uppercase"
              px={1.5}
              py={0}
              borderRadius="sm"
            >
              Off
            </Badge>
          )}
          <HStack spacing={1}>
            <Text fontSize="2xs" color="gray.500" fontWeight="500">Active</Text>
            <Switch
              isChecked={entry.active}
              onChange={handleToggleActive}
              colorScheme="yellow"
              size="sm"
            />
          </HStack>
        </HStack>
      </Flex>

      {editing ? (
        <>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            {...inputStyles}
          />
          <HStack spacing={3} mt={3}>
            <CTAButton
              onClick={handleSave}
              icon={FaSave}
              variant="solid"
              size="sm"
              isLoading={saving}
              loadingText="Saving..."
            >
              Save
            </CTAButton>
            <Box
              as="button"
              type="button"
              onClick={() => {
                setEditing(false);
                setLabel(entry.label);
                setContent(entry.content);
              }}
              fontSize="xs"
              color="gray.500"
              _hover={{ color: '#c9a96e' }}
              bg="transparent"
              border="none"
              cursor="pointer"
              px={2}
              py={1}
              letterSpacing="0.15em"
              textTransform="uppercase"
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Cancel
            </Box>
          </HStack>
        </>
      ) : (
        <>
          <Text
            fontSize="sm"
            color={entry.active ? 'gray.700' : 'gray.500'}
            fontWeight="300"
            lineHeight="1.7"
            whiteSpace="pre-wrap"
            mb={3}
          >
            {entry.content}
          </Text>
          <HStack spacing={3}>
            <CTAButton
              onClick={() => setEditing(true)}
              icon={FaEdit}
              variant="outline"
              size="sm"
            >
              Edit
            </CTAButton>
            <Box
              as="button"
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              display="inline-flex"
              alignItems="center"
              gap={1.5}
              fontSize="2xs"
              letterSpacing="0.15em"
              textTransform="uppercase"
              color="gray.400"
              _hover={{ color: 'red.500' }}
              bg="transparent"
              border="none"
              cursor="pointer"
              px={2}
              py={1}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={FaTrash} boxSize={2.5} />
              {deleting ? 'Deleting…' : 'Delete'}
            </Box>
          </HStack>
        </>
      )}
    </Box>
  );
}

function NewEntryForm({
  category,
  adminPassword,
  onCancel,
  onCreated,
  toast,
}: {
  category: string;
  adminPassword: string;
  onCancel: () => void;
  onCreated: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!label.trim() || !content.trim()) {
      toast({ title: 'Label and content are required', status: 'warning', duration: 3000 });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/context-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          category,
          label: label.trim(),
          content: content.trim(),
          active: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: 'Entry added', status: 'success', duration: 2000 });
        onCreated();
      } else {
        toast({ title: data.error || 'Create failed', status: 'error', duration: 3000 });
      }
    } catch {
      toast({ title: 'Could not reach the server', status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box p={{ base: 4, md: 5 }} bg="#fdf9f0">
      <Text fontSize="2xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.22em" color="#8a6e35" mb={2}>
        New entry
      </Text>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. Voice guidance, Turnaround time)"
        size="sm"
        mb={2}
        {...inputStyles}
      />
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content (this is what the AI sees and cites verbatim)"
        rows={4}
        {...inputStyles}
      />
      <HStack spacing={3} mt={3}>
        <CTAButton
          onClick={handleCreate}
          icon={FaCheck}
          variant="solid"
          size="sm"
          isLoading={saving}
          loadingText="Saving..."
        >
          Add
        </CTAButton>
        <Box
          as="button"
          type="button"
          onClick={onCancel}
          fontSize="xs"
          color="gray.500"
          _hover={{ color: '#c9a96e' }}
          bg="transparent"
          border="none"
          cursor="pointer"
          px={2}
          py={1}
          letterSpacing="0.15em"
          textTransform="uppercase"
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          Cancel
        </Box>
      </HStack>
    </Box>
  );
}

function AddNewCategory({
  adminPassword,
  onCreated,
  toast,
}: {
  adminPassword: string;
  onCreated: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState('');
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!category.trim() || !label.trim() || !content.trim()) {
      toast({ title: 'Category, label, and content are all required', status: 'warning', duration: 3000 });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/context-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          category: normalizeCategory(category),
          label: label.trim(),
          content: content.trim(),
          active: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: 'Category created', status: 'success', duration: 2000 });
        setCategory('');
        setLabel('');
        setContent('');
        setExpanded(false);
        onCreated();
      } else {
        toast({ title: data.error || 'Create failed', status: 'error', duration: 3000 });
      }
    } catch {
      toast({ title: 'Could not reach the server', status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) {
    return (
      <Flex justify="center" pt={2}>
        <CTAButton
          onClick={() => setExpanded(true)}
          icon={FaPlus}
          variant="outline"
          size="sm"
        >
          Add new category
        </CTAButton>
      </Flex>
    );
  }

  return (
    <Box
      bg="white"
      border="1px dashed"
      borderColor="#e8d9a8"
      borderRadius="sm"
      p={{ base: 5, md: 6 }}
    >
      <Text fontSize="2xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.22em" color="#c9a96e" mb={3}>
        New category
      </Text>
      <VStack spacing={3} align="stretch">
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category name (short, lowercase — e.g. faq, travel_policy)"
          size="sm"
          {...inputStyles}
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label for the first entry (e.g. Do you travel out of state?)"
          size="sm"
          {...inputStyles}
        />
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Content (what the AI cites verbatim)"
          rows={4}
          {...inputStyles}
        />
        <HStack spacing={3}>
          <CTAButton
            onClick={handleCreate}
            icon={FaCheck}
            variant="solid"
            size="sm"
            isLoading={saving}
            loadingText="Saving..."
          >
            Create category
          </CTAButton>
          <Box
            as="button"
            type="button"
            onClick={() => {
              setExpanded(false);
              setCategory('');
              setLabel('');
              setContent('');
            }}
            fontSize="xs"
            color="gray.500"
            _hover={{ color: '#c9a96e' }}
            bg="transparent"
            border="none"
            cursor="pointer"
            px={2}
            py={1}
            letterSpacing="0.15em"
            textTransform="uppercase"
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Icon as={FaTimes} boxSize={2.5} mr={1} />
            Cancel
          </Box>
        </HStack>
      </VStack>
    </Box>
  );
}

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

// ── Helpers ────────────────────────────────────────────────────

function groupByCategory(entries: ContextEntry[]): Record<string, ContextEntry[]> {
  const out: Record<string, ContextEntry[]> = {};
  for (const e of entries) {
    if (!out[e.category]) out[e.category] = [];
    out[e.category].push(e);
  }
  return out;
}

function orderedCategories(categories: string[]): string[] {
  const known = CATEGORY_ORDER.filter((c) => categories.includes(c));
  const unknown = categories.filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...known, ...unknown];
}

function normalizeCategory(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export default AdminAssistant;
