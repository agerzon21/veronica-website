import {
  Box, VStack, HStack, Text, Flex, Icon, Badge, useToast, Spinner, IconButton,
  Textarea, Select, Stack,
} from '@chakra-ui/react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  FaSyncAlt, FaTrash, FaEnvelope, FaCalendarAlt, FaMapMarkerAlt,
  FaCamera, FaReply, FaUser, FaChevronRight,
} from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import MobileSheetModal, { MobileSheetFooter } from './ui/MobileSheetModal';
import ConfirmDialog from './ui/ConfirmDialog';
import { useAdminLang } from '../i18n/admin';

/**
 * "Leads" tab in /admin — every submission from the public contact form.
 *
 * Lives in the Comms/Inbox group alongside Messages + Assistant since the
 * shape of the work is the same ("inbound thing that needs a reply +
 * status tracking"), just email-driven rather than IG DM-driven.
 *
 * Read-mostly UI: the form fields (name, email, shoot_type, preferred_date,
 * location, message) are immutable — the submitter wrote them, we don't
 * edit their words. Only three fields are editable from the admin panel:
 * status (new → contacted → replied → booked / ghosted / spam), an internal
 * notes field, and the `contacted_at` timestamp (auto-set the first time
 * Vero flips status to contacted or replied).
 *
 * Reply flow: no in-app compose. Vero already gets a Resend notification
 * for every new lead with reply-to = the lead's email, so hitting Reply
 * in Gmail is the natural path. The editor modal exposes a mailto: button
 * as a shortcut when she's inside the admin panel.
 *
 * Available to BOTH admin (Vero) and super (Alex). Delete is superadmin-
 * gated on both UI and API (leads-delete requires super). Status flips +
 * notes edits stay on the admin tier — Vero's daily workflow.
 */

interface Props {
  adminPassword: string;
  adminLevel: 'admin' | 'super';
}

// Keep this list in sync with ALLOWED_STATUSES in api/admin/_leads-update.ts.
const STATUS_VALUES = [
  'new',
  'contacted',
  'replied',
  'booked',
  'ghosted',
  'spam',
] as const;
type LeadStatus = (typeof STATUS_VALUES)[number];

export interface LeadRow {
  id: string;
  name: string;
  email: string;
  shoot_type: string | null;
  preferred_date: string | null;
  location: string | null;
  message: string | null;
  status: LeadStatus;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Editor is either closed or opened on an existing row. No "create" mode —
// leads only ever come in via the public form.
type EditorState = null | { lead: LeadRow };

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

const AdminLeads = ({ adminPassword, adminLevel }: Props) => {
  const { t } = useAdminLang();
  const [items, setItems] = useState<LeadRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [confirmDelete, setConfirmDelete] = useState<LeadRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/leads-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(data.leads);
      } else {
        setError(data.error || t.leads.loadFailed(res.status));
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

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/leads-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: confirmDelete.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: t.leads.leadDeleted,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        setConfirmDelete(null);
        await loadItems();
      } else {
        toast({
          title: data.error || t.leads.deleteFailed(res.status),
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

  const handleEditorSaved = async (updated: LeadRow) => {
    // Optimistically merge the returned row into the list so the card
    // reflects the new status/notes without another round-trip.
    setItems((cur) =>
      cur ? cur.map((r) => (r.id === updated.id ? updated : r)) : cur,
    );
    setEditor(null);
    toast({
      title: t.leadsEditor.leadSaved,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  // Summary counts for the subtitle line. "N new" is the most useful
  // signal — everything else is background.
  const newCount = items ? items.filter((r) => r.status === 'new').length : 0;

  return (
    <Box maxW="1200px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Header — same shape as AdminReviews (kicker + H1 + subtitle +
          refresh IconButton). No "+ New" CTA because leads only arrive
          via the public form. */}
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
            {t.leads.tabTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {items === null
              ? t.leads.subtitleEmpty
              : items.length === 0
                ? t.leads.subtitleEmpty
                : newCount > 0
                  ? t.leads.subtitleWithNew(items.length, newCount)
                  : t.leads.leadCount(items.length)}
          </Text>
        </VStack>

        <HStack spacing={2} flexShrink={0}>
          <IconButton
            aria-label={t.leads.refreshAria}
            icon={<Icon as={FaSyncAlt} boxSize={4} />}
            onClick={loadItems}
            variant="ghost"
            size="md"
            minW="44px"
            minH="44px"
            color="gray.500"
            _hover={{ color: 'brand.accent' }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          />
        </HStack>
      </Flex>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="brand.accent" />
        </Flex>
      ) : !items || items.length === 0 ? (
        <EmptyState />
      ) : (
        <VStack spacing={3} align="stretch">
          {items.map((row) => (
            <LeadCard
              key={row.id}
              row={row}
              onEdit={() => setEditor({ lead: row })}
            />
          ))}
        </VStack>
      )}

      {editor !== null && (
        <LeadEditorModal
          key={editor.lead.id}
          isOpen
          onClose={() => setEditor(null)}
          adminPassword={adminPassword}
          adminLevel={adminLevel}
          lead={editor.lead}
          onSaved={handleEditorSaved}
          onRequestDelete={
            adminLevel === 'super'
              ? () => {
                  const r = editor.lead;
                  setEditor(null);
                  setConfirmDelete(r);
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        title={t.leadsEditor.deleteConfirmTitle}
        body={confirmDelete ? t.leadsEditor.deleteConfirmBody(confirmDelete.name) : ''}
        confirmLabel={t.leadsEditor.deleteLead}
        cancelLabel={t.common.cancel}
        danger
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
      />
    </Box>
  );
};

// ── Row card ───────────────────────────────────────────────────────
function LeadCard({
  row,
  onEdit,
}: {
  row: LeadRow;
  onEdit: () => void;
}) {
  const { t } = useAdminLang();
  const initials = getInitials(row.name);
  const messagePreview = (row.message || '').trim();
  const isNew = row.status === 'new';

  return (
    <Box
      as="button"
      type="button"
      onClick={onEdit}
      textAlign="left"
      w="100%"
      bg="white"
      border="1px solid"
      borderColor={isNew ? 'brand.accentBorder' : 'gray.200'}
      borderRadius="sm"
      p={{ base: 4, md: 5 }}
      _hover={{ borderColor: 'brand.accent' }}
      transition="all 0.15s"
      cursor="pointer"
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Flex align="flex-start" gap={4} wrap={{ base: 'wrap', md: 'nowrap' }}>
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
            {initials}
          </Text>
        </Flex>

        <VStack align="flex-start" spacing={1.5} flex={1} minW={0}>
          <HStack spacing={2} wrap="wrap">
            <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="600" color="gray.800">
              {row.name || t.leads.unnamedLead}
            </Text>
            <StatusBadge status={row.status} />
          </HStack>

          <HStack spacing={2} wrap="wrap" fontSize="xs" color="gray.500" fontWeight="300">
            <Text>{row.email}</Text>
            {row.shoot_type && (
              <>
                <Text>·</Text>
                <Text>{row.shoot_type}</Text>
              </>
            )}
            {row.preferred_date && (
              <>
                <Text>·</Text>
                <Text>{formatDate(row.preferred_date)}</Text>
              </>
            )}
          </HStack>

          {messagePreview && (
            <Text
              fontSize="sm"
              color="gray.700"
              fontWeight="300"
              noOfLines={2}
              w="100%"
              lineHeight="1.6"
            >
              {messagePreview}
            </Text>
          )}

          <Text fontSize="xs" color="gray.400" fontWeight="300" pt={0.5}>
            {formatRelative(row.created_at)}
          </Text>
        </VStack>

        {/* Visual "drill in" affordance. Was previously a real Edit
            CTAButton inside this same card <button>, which is invalid
            HTML (button-in-button — flagged by adversarial review, was
            triggering React validateDOMNesting warnings and confusing
            screen readers). The whole card is already clickable + has
            a hover state, so the chevron is enough visual signal that
            tapping opens the detail sheet. Same treatment as an iOS
            table-view row. Aria-hidden because the card itself is the
            interactive element being announced. */}
        <Flex
          align="center"
          alignSelf="center"
          flexShrink={0}
          color="gray.300"
          aria-hidden
        >
          <Icon as={FaChevronRight} boxSize={3} />
        </Flex>
      </Flex>
    </Box>
  );
}

// ── Editor modal ───────────────────────────────────────────────────
function LeadEditorModal({
  isOpen,
  onClose,
  adminPassword,
  adminLevel,
  lead,
  onSaved,
  onRequestDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  adminPassword: string;
  adminLevel: 'admin' | 'super';
  lead: LeadRow;
  onSaved: (updated: LeadRow) => void;
  onRequestDelete?: () => void;
}) {
  const { t } = useAdminLang();
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Normalize the current form state to compare against what the
  // server sent us. Notes get trimmed here the same way the server
  // will normalize them on save — so leading/trailing whitespace in
  // the input doesn't fake-out the dirty check.
  const normalizedNotes = notes.trim() || null;
  const dirtyStatus = status !== lead.status;
  const dirtyNotes = normalizedNotes !== (lead.notes ?? null);

  // If Vero flips status past 'new' (i.e. she has actually done something
  // about this lead) and contacted_at hasn't been set yet, stamp NOW()
  // server-side so we have an "acted at" timestamp for later analytics
  // ("average lead response time"). Once set, we don't overwrite it —
  // and the server-side COALESCE guard in _leads-update.ts enforces
  // that invariant on the race case.
  const shouldStampContactedAt =
    !lead.contacted_at &&
    status !== 'new' &&
    status !== 'spam';

  const dirty = dirtyStatus || dirtyNotes;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Send ONLY the fields the user actually changed. The server's
      // COALESCE / CASE-WHEN-provided branches then leave the untouched
      // fields alone — so two tabs racing (Tab A flips status, Tab B
      // adds notes) both commit their intended edit without stomping
      // the other's field. Without this, we send both fields on every
      // save and the later tab reverts whatever the earlier one
      // changed (last-writer-wins on the fields the later tab didn't
      // know about).
      const payload: Record<string, unknown> = {
        password: adminPassword,
        id: lead.id,
      };
      if (dirtyStatus) payload.status = status;
      if (dirtyNotes) payload.notes = normalizedNotes;
      if (shouldStampContactedAt) payload.contacted_at = 'now';

      const res = await fetch('/api/admin/leads-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success && data.lead) {
        onSaved(data.lead as LeadRow);
      } else {
        setError(data.error || t.leads.saveFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  // mailto: subject mirrors the auto-reply subject line so Gmail threads
  // together (subject-based threading — RFC 5322 References would be
  // cleaner but the customer's mail client won't have that header on the
  // outbound reply since we're not composing in-app).
  const mailtoHref = buildMailto(lead);

  return (
    <MobileSheetModal
      isOpen={isOpen}
      onClose={onClose}
      title={t.leadsEditor.editTitle}
      desktopSize="lg"
      // Lock the modal while a save is in flight. Otherwise Esc /
      // overlay-tap dismisses the editor mid-request but the parent
      // still gets an onSaved callback + toast when the fetch resolves,
      // which is confusing ("I cancelled that — why did it save?").
      // Buttons in the footer are also isDisabled={saving}, so this
      // just closes the last two dismiss vectors.
      closeOnOverlayClick={!saving}
      closeOnEsc={!saving}
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
            isDisabled={!dirty || saving}
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

        {/* Header block — who + when + status. Not editable; that's the
            submitter's identity. */}
        <Box
          bg="brand.surface"
          border="1px solid"
          borderColor="brand.accentBorder"
          borderRadius="sm"
          p={{ base: 4, md: 5 }}
        >
          <Flex align="flex-start" gap={3} mb={3}>
            <Flex
              boxSize={{ base: '44px', md: '48px' }}
              borderRadius="full"
              bg="white"
              border="1px solid"
              borderColor="brand.accentBorder"
              align="center"
              justify="center"
              flexShrink={0}
            >
              <Text fontSize="sm" fontWeight="500" color="brand.accentText">
                {getInitials(lead.name)}
              </Text>
            </Flex>
            <VStack align="flex-start" spacing={0.5} flex={1} minW={0}>
              <HStack spacing={2} wrap="wrap">
                <Text fontSize="md" fontWeight="600" color="gray.800">
                  {lead.name}
                </Text>
                <StatusBadge status={lead.status} />
              </HStack>
              <Text fontSize="xs" color="gray.600" fontWeight="300">
                {formatDateTime(lead.created_at)}
              </Text>
            </VStack>
          </Flex>

          {/* Quick contact / mailto shortcut. mailto: opens Vero's default
              mail client with the lead's address pre-filled + a subject
              line that matches the auto-reply for Gmail threading. */}
          <Box
            as="a"
            href={mailtoHref}
            display="inline-flex"
            alignItems="center"
            gap={2}
            px={3}
            py={2}
            bg="white"
            border="1px solid"
            borderColor="brand.accent"
            color="#8f7239"
            fontSize="xs"
            fontWeight="500"
            borderRadius="sm"
            textDecoration="none"
            _hover={{ bg: 'brand.accent', color: 'white' }}
            transition="all 0.15s"
          >
            <Icon as={FaReply} boxSize={3} />
            {t.leadsEditor.replyViaEmail}
          </Box>
        </Box>

        {/* Immutable submitter fields. Rendered as a small definition
            list rather than form inputs so it's visually clear these are
            "the record" and not editable. */}
        <VStack spacing={0} align="stretch" bg="white" border="1px solid" borderColor="gray.200" borderRadius="sm">
          <DetailRow icon={FaEnvelope} label={t.leadsEditor.emailLabel} value={
            <Box
              as="a"
              href={`mailto:${lead.email}`}
              color="brand.accentText"
              textDecoration="none"
              _hover={{ textDecoration: 'underline' }}
            >
              {lead.email}
            </Box>
          } />
          {lead.shoot_type && (
            <DetailRow icon={FaCamera} label={t.leadsEditor.shootTypeLabel} value={lead.shoot_type} />
          )}
          {lead.preferred_date && (
            <DetailRow icon={FaCalendarAlt} label={t.leadsEditor.preferredDateLabel} value={formatDate(lead.preferred_date)} />
          )}
          {lead.location && (
            <DetailRow icon={FaMapMarkerAlt} label={t.leadsEditor.locationLabel} value={lead.location} />
          )}
        </VStack>

        {/* Message body — indented like a quoted email, preserves line
            breaks. Still immutable. */}
        {lead.message && (
          <Field label={t.leadsEditor.messageLabel}>
            <Box
              borderLeft="3px solid"
              borderLeftColor="#d8d8d8"
              pl={4}
              py={2}
              color="gray.700"
              fontSize="sm"
              fontStyle="italic"
              lineHeight="1.7"
              whiteSpace="pre-wrap"
              wordBreak="break-word"
            >
              {lead.message}
            </Box>
          </Field>
        )}

        {/* Editable region. */}
        <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
          <Field label={t.leadsEditor.statusLabel} flex={1}>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as LeadStatus)}
              {...inputStyles}
            >
              {STATUS_VALUES.map((s) => (
                <option key={s} value={s}>{t.leadsEditor.statusOption[s]}</option>
              ))}
            </Select>
          </Field>
          <Field
            label={t.leadsEditor.contactedAtLabel}
            help={
              lead.contacted_at
                ? t.leadsEditor.contactedAtHelpSet(formatDateTime(lead.contacted_at))
                : shouldStampContactedAt
                  ? t.leadsEditor.contactedAtHelpWillStamp
                  : t.leadsEditor.contactedAtHelpUnset
            }
            flex={1}
          >
            <Box
              px={3}
              py={2}
              bg="gray.50"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="sm"
              fontSize={{ base: 'md', md: 'sm' }}
              color={lead.contacted_at ? 'gray.700' : 'gray.400'}
              minH="40px"
              display="flex"
              alignItems="center"
            >
              {lead.contacted_at
                ? formatDateTime(lead.contacted_at)
                : t.leadsEditor.notContactedYet}
            </Box>
          </Field>
        </Stack>

        <Field label={t.leadsEditor.notesLabel} help={t.leadsEditor.notesHelp}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.leadsEditor.notesPlaceholder}
            rows={4}
            {...inputStyles}
          />
        </Field>

        {/* Danger zone — superadmin-only, mirrors AdminReviewsEditor
            + AdminJournalEditor. */}
        {adminLevel === 'super' && onRequestDelete && (
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
              {t.leadsEditor.dangerZone}
            </Text>
            <Text fontSize="xs" color="gray.700" fontWeight="300" mb={4} lineHeight="1.6">
              {t.leadsEditor.dangerZoneBody}
            </Text>
            <CTAButton
              onClick={onRequestDelete}
              icon={FaTrash}
              variant="outline"
              size="sm"
              isDisabled={saving}
            >
              {t.leadsEditor.deleteLead}
            </CTAButton>
          </Box>
        )}
      </VStack>
    </MobileSheetModal>
  );
}

// ── Presentational helpers ─────────────────────────────────────────
function DetailRow({
  icon,
  label,
  value,
}: {
  icon: typeof FaEnvelope;
  label: string;
  value: ReactNode;
}) {
  return (
    <Flex
      align="center"
      gap={3}
      px={{ base: 3, md: 4 }}
      py={3}
      borderBottom="1px solid"
      borderBottomColor="gray.100"
      _last={{ borderBottom: 'none' }}
    >
      <Icon as={icon} boxSize={3.5} color="gray.400" flexShrink={0} />
      <Text
        fontSize="xs"
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing="0.1em"
        color="gray.500"
        w={{ base: '90px', md: '110px' }}
        flexShrink={0}
      >
        {label}
      </Text>
      <Box fontSize={{ base: 'sm', md: 'sm' }} color="gray.800" flex={1} minW={0} wordBreak="break-word">
        {value}
      </Box>
    </Flex>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const { t } = useAdminLang();
  const config: Record<LeadStatus, { bg: string; color: string; borderColor: string }> = {
    new:       { bg: 'brand.surface',  color: '#8f7239',  borderColor: 'brand.accentBorder' },
    contacted: { bg: '#eef4fb',  color: '#3067b0',  borderColor: '#c2d8ef' },
    replied:   { bg: '#eef4fb',  color: '#3067b0',  borderColor: '#c2d8ef' },
    booked:    { bg: '#e6f4ea',  color: '#1e7a3c',  borderColor: '#a8d8b6' },
    ghosted:   { bg: 'gray.100', color: 'gray.600', borderColor: 'transparent' },
    spam:      { bg: 'red.50',   color: 'red.700',  borderColor: 'red.200' },
  };
  const c = config[status];
  return (
    <Badge
      bg={c.bg}
      color={c.color}
      border="1px solid"
      borderColor={c.borderColor}
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="500"
      letterSpacing={{ base: '0.15em', md: '0.1em' }}
      textTransform="uppercase"
      px={2}
      py={0.5}
      borderRadius="sm"
    >
      {t.leadsEditor.statusOption[status]}
    </Badge>
  );
}

function Field({
  label,
  help,
  flex,
  children,
}: {
  label: string;
  help?: string;
  flex?: number;
  children: ReactNode;
}) {
  return (
    <Box flex={flex} w="100%">
      <Text
        fontSize={{ base: 'xs', md: '2xs' }}
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing={{ base: '0.15em', md: '0.22em' }}
        color="brand.accent"
        mb={1.5}
      >
        {label}
      </Text>
      {children}
      {help && (
        <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1.5} lineHeight="1.5">
          {help}
        </Text>
      )}
    </Box>
  );
}

function EmptyState() {
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
        <Icon as={FaUser} boxSize={7} />
      </Flex>
      <Text fontSize="md" fontWeight="500" color="gray.800" mb={2}>
        {t.leads.emptyTitle}
      </Text>
      <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="380px" mx="auto" lineHeight="1.7">
        {t.leads.emptyDescription}
      </Text>
    </Box>
  );
}

// ── Small utils ─────────────────────────────────────────────────────
function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Note: preferred_date is stored as TEXT (not DATE) so it can be an ISO
// timestamp, a YYYY-MM-DD, or free text. Try to parse; fall back to raw.
function formatDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Coarse-grained relative time. Precise-to-the-minute isn't the point on
// a lead card — "3 days ago" vs "2 days ago" is enough. For anything
// older than a month we show the actual date instead.
function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const nowMs = Date.now();
  const diff = Math.max(0, nowMs - d.getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? 'hr' : 'hrs'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ${day === 1 ? 'day' : 'days'} ago`;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function buildMailto(lead: LeadRow): string {
  const subject = `Re: Your ${lead.shoot_type || 'Photography'} Inquiry`;
  // Per RFC 6068 the address must NOT be percent-encoded (the '@'
  // separator has to stay literal, and email local-parts are already
  // valid mailto chars), and hfield values must use %20 for spaces —
  // NOT '+' (URLSearchParams' form-urlencoded convention). Gmail iOS
  // in particular decodes '+' as a literal '+' in the subject, which
  // would give us "Re:+Your+Portrait+Session+Inquiry" and break
  // Gmail's subject-based threading against the earlier auto-reply.
  return `mailto:${lead.email}?subject=${encodeURIComponent(subject)}`;
}

export default AdminLeads;
