import { Box, VStack, HStack, Text, Input, Select, Checkbox, Flex, Icon, Badge, Textarea, SimpleGrid, Stack, IconButton } from '@chakra-ui/react';
import { fmtAdminDateTime } from '../utils/adminDate';
import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react';
import FaCheck from '../icons/fa/FaCheck';
import FaExternalLinkAlt from '../icons/fa/FaExternalLinkAlt';
import FaTrash from '../icons/fa/FaTrash';
import CTAButton from './ui/CTAButton';
import AdminBackButton from './ui/AdminBackButton';
import {
  CONTRACT_TEMPLATES,
  CONTRACT_TYPE_ORDER,
  OPTIONAL_CLAUSES,
  extractVariableKeys,
  isContractTemplateKey,
  requiredVariablesFor,
  type ContractTemplateSpec,
} from '../data/contract-template';
import { useAdminLang } from '../i18n/admin';
import { appleMapsLink, googleDirectionsLink, wazeLink } from '../data/travel-fee';
import { travelCopy } from './travelCopy';

interface Props {
  portalId: string;
  adminPassword: string;
  adminLevel: 'admin' | 'super';
  onBack: () => void;
}

interface PortalDetail {
  id: string;
  mode: 'simple' | 'full';
  session_type: string | null;
  partner_1_full_name: string | null;
  partner_2_full_name: string | null;
  client_display_name: string | null;
  client_email: string | null;
  event_date: string | null;
  gallery_password: string;
  /**
   * Short-lived HMAC from the admin endpoint, appended to the preview link so
   * Vero can see an undelivered gallery. Null when the signing secret is not
   * configured, in which case the preview simply behaves like a client's.
   */
  gallery_preview_token?: string | null;
  gallery_enabled: boolean;
  drive_url: string | null;
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_template_key: string;
  contract_variables: Record<string, string> | null;
  contract_signed_at: string | null;
  contract_signed_pdf_available: boolean;
  contract_total_amount: number | null;
  contract_retainer_amount: number | null;
  paid_to_date: number;
  /**
   * Sum of the charges added after the booking (extra time, costs paid on the
   * day). Owed on top of contract_total_amount, so every balance on this
   * screen is total + charges_total - paid_to_date, never total - paid.
   */
  charges_total: number;
  setup_token: string | null;
  invite_email_id: string | null;
  invite_sent_at: string | null;
  client_has_password: boolean;
}

interface PaymentEntry {
  id: string;
  amount: number;
  method: string | null;
  note: string | null;
  paid_at: string;
}

/** A charge reason, as stored. The table CHECKs these same three values. */
type ChargeReason = 'overtime' | 'expense' | 'other';

interface ChargeEntry {
  id: string;
  amount: number;
  // Widened to string because it arrives from the database, and a value this
  // bundle predates should still render rather than crash the screen.
  reason: string;
  note: string | null;
  charged_at: string;
}

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  // Treat the date part as UTC so a 'YYYY-MM-DD' (or midnight-UTC ISO)
  // doesn't slide back a day in the viewer's local timezone.
  const datePart = iso.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

const formatMoney = (amount: number | null): string => {
  if (amount === null || amount === undefined) return '—';
  return `$${amount.toFixed(0)}`;
};

/**
 * CONTRACT_TEMPLATES lookup that cannot fall through to Object.prototype.
 *
 * The registry is a plain object and these keys come out of the database, so a
 * bare CONTRACT_TEMPLATES[key] answers 'constructor' and 'toString' with
 * something truthy: a row filed as 'constructor' rendered its type as "Object",
 * and the variable editor below would have handed extractVariableKeys an
 * undefined template and thrown the whole screen away. _portal-update.ts guards
 * the identical trap on the way in (see the hasOwnProperty note at its template
 * check), so guard it the same way on the way out.
 */
const templateSpecFor = (key: string | null | undefined): ContractTemplateSpec | undefined =>
  key && isContractTemplateKey(key) ? CONTRACT_TEMPLATES[key] : undefined;

// Contract/session type keys ('wedding', 'other') are storage values, not
// labels, and 'other' in particular reads like a bug on screen. Unknown keys fall
// through unchanged rather than rendering blank: a row pointing at a type we
// no longer recognise should still say what it points at.
const typeLabel = (key: string | null): string => {
  if (!key) return '';
  return templateSpecFor(key)?.name ?? key;
};

/**
 * The shape a session label is stored in: lowercase, hyphenated.
 *
 * Every other place that writes this column already does this. The create
 * form runs it on each keystroke of Session Label, and SessionTypePicker's
 * Custom box runs the identical transform for gallery-only rows. This screen
 * was the one that did not, so the same shoot could be filed as
 * "Newborn Shoot" from here and "newborn-shoot" from there, and the Clients
 * list, the calendar and the heading above all print the column raw.
 *
 * Live on every keystroke, like the create form, which is why the edge hyphens
 * a half-typed word leaves behind ("newborn ") come off separately on save
 * rather than fighting the cursor while she types.
 */
const sessionLabelSlug = (raw: string): string => raw.toLowerCase().replace(/\s+/g, '-');
const cleanSessionLabel = (raw: string): string =>
  sessionLabelSlug(raw.trim()).replace(/^-+|-+$/g, '');

/**
 * Every variable any type treats as a clause switch.
 *
 * OPTIONAL_CLAUSES alone is not the answer: maternity_clauses_enabled is never
 * offered as a choice, so it lives only in the maternity spec's
 * defaultVariables. Anything in here is a 'yes' / '' flag and must never reach
 * a text input, because pruneEmptyOptionalSections reads any non-blank string
 * as "clause on".
 */
const ALL_CLAUSE_KEYS = new Set<string>([
  ...Object.keys(OPTIONAL_CLAUSES),
  ...CONTRACT_TYPE_ORDER.flatMap((key) =>
    Object.keys(CONTRACT_TEMPLATES[key].defaultVariables ?? {}),
  ),
]);

/**
 * Who on this screen is holding work that has not been written down yet.
 *
 * Every editable thing here keeps its own draft in its own component and only
 * posts on an explicit Save: the Drive URL, the gallery password, the session
 * type, the five Details boxes, the client password override, the payment
 * composer, the charge composer and the two dozen contract variables. Back was
 * a plain onBack(), so every one of those drafts went in the bin without a
 * word. On the contract editor that is twenty minutes of typing, and the only
 * signal anything had happened was that the boxes were empty again when she
 * came back.
 *
 * A context rather than props because the alternative is threading a callback
 * through ten call sites and two levels of nesting, which is the kind of change
 * a redesign of this screen would have to unpick. A sub-form calls
 * useDirtyFlag next to the state it is describing, and moving that sub-form
 * somewhere else on the page moves its dirty reporting with it.
 *
 * The flag is DIRTY, not FOCUSED: every caller passes its own existing
 * "differs from what is stored" test, the same one that already decides
 * whether the Save button is on screen. A warning that fired merely because a
 * box had been clicked into would be dismissed unread within a day, and then
 * the real one would be too.
 */
type DirtyMark = (key: string, label: string | null) => void;
const DirtyCtx = createContext<DirtyMark | null>(null);

/**
 * Report one sub-form's unsaved state, under a name Vero would recognise.
 *
 * The key is a useId, so an instance is identified by being itself rather than
 * by a label that is translated and, in the case of the gallery password and
 * the account password, very nearly duplicated. The cleanup clears the entry
 * on unmount, which is what keeps a field that stops rendering (the contract
 * editor disappearing the moment a contract is signed) from leaving a
 * permanent warning behind.
 */
function useDirtyFlag(dirty: boolean, label: string) {
  const mark = useContext(DirtyCtx);
  const key = useId();
  useEffect(() => {
    mark?.(key, dirty ? label : null);
    return () => mark?.(key, null);
  }, [mark, key, dirty, label]);
}

const daysUntil = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
};

const AdminClientDetail = ({ portalId, adminPassword, adminLevel, onBack }: Props) => {
  const { t } = useAdminLang();
  const [portal, setPortal] = useState<PortalDetail | null>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [charges, setCharges] = useState<ChargeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingField, setSavingField] = useState<string | null>(null);
  // Two-step confirm for delivering with money outstanding. Same inline
  // pattern as the delete confirmations further down this file (there is no
  // modal component in here), so the warning stays on the page next to the
  // amounts it is talking about.
  const [unpaidConfirm, setUnpaidConfirm] = useState(false);

  // Names of the things currently holding unsaved work, keyed by the reporting
  // instance. Object.values comes back in insertion order, and effects run
  // child-first in tree order, so the list reads roughly top to bottom down the
  // page rather than in whatever order React felt like.
  const [dirtyLabels, setDirtyLabels] = useState<Record<string, string>>({});
  const markDirty = useCallback<DirtyMark>((key, label) => {
    setDirtyLabels((prev) => {
      if (label === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      // Bail on an unchanged label so a sub-form re-rendering on every
      // keystroke does not re-render the whole screen with it.
      if (prev[key] === label) return prev;
      return { ...prev, [key]: label };
    });
  }, []);
  const unsavedNames = Object.values(dirtyLabels);
  const hasUnsaved = unsavedNames.length > 0;
  // Two-step leave confirmation, same inline shape as the unpaid-delivery
  // panel above and the delete confirmations below.
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  // Saving the last dirty field while the leave panel is open takes the panel
  // down with it. Without this the flag stayed true, and the NEXT character
  // typed anywhere on the screen would have popped the warning open again on
  // its own, with nobody having pressed Back. That is the false alarm this
  // whole guard is supposed to avoid.
  useEffect(() => {
    if (!hasUnsaved) setLeaveConfirm(false);
  }, [hasUnsaved]);

  /**
   * The same guard for the browser's own back gesture, a reload, and closing
   * the tab.
   *
   * The admin panel holds its current screen in React state (Admin.tsx's
   * `view`) and never touches history, so a swipe back or a Back press does
   * not return to the Clients list: it leaves /admin altogether and throws the
   * whole SPA away, drafts included. Nothing in the page can intercept that
   * after the fact, and the only in-app way to try would be to push a
   * synthetic history entry when this screen mounts, which changes how the
   * entire admin shell navigates and would not survive the redesign this
   * screen is queued for.
   *
   * beforeunload is the one mechanism that covers all three, it is the
   * browser's own dialog rather than a modal component this file does not
   * have, and it is registered ONLY while something is actually unsaved, so a
   * clean visit never sees it.
   *
   * Known gap, same one recorded in AdminAssistantChat: iOS Safari does not
   * reliably fire beforeunload on a pull to refresh. The answer there is a
   * per-keystroke draft store, which on this screen would mean persisting
   * every field on the page and is a redesign-sized change, so it is not
   * attempted here.
   */
  useEffect(() => {
    if (!hasUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome ignores preventDefault alone on some versions and wants a
      // returnValue set; the string itself is never shown any more.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved]);

  const handleBack = () => {
    if (hasUnsaved) {
      setLeaveConfirm(true);
      return;
    }
    onBack();
  };

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/portal-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: portalId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPortal(data.portal);
        setPayments(data.payments);
        setCharges(data.charges ?? []);
      } else {
        setError(data.error || t.clientDetail.serverErrorStatus(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalId]);

  const patch = async (patch: Record<string, unknown>, label: string): Promise<boolean> => {
    setSavingField(label);
    setError('');
    try {
      const res = await fetch('/api/admin/portal-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: portalId, patch }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await reload();
        return true;
      }
      setError(data.error || t.clientDetail.serverErrorStatus(res.status));
      return false;
    } catch {
      setError(t.common.couldNotReach);
      return false;
    } finally {
      setSavingField(null);
    }
  };

  const markDelivered = async (confirmUnpaid = false) => {
    // Soft guard rail: stop and show the outstanding balance first. We don't
    // block delivery because there are legitimate edge cases (cash
    // hand-off at the shoot, comp gifts, payment plans not tracked in
    // here yet). But she's much more likely to FORGET to log a payment
    // than to genuinely want to deliver unpaid, so confirm first.
    //
    // This matters more than it used to: since the gallery gate landed,
    // this button is what actually releases the photos to the client, so
    // the confirmation is the last step before they can see them.
    //
    // The condition here is deliberately WIDER than the server's, which only
    // refuses on a SIGNED contract. Anything the server would refuse is
    // already confirmed by the time we post, so a 409 surprise is impossible.
    //
    // Charges count towards what is owed, same as the server's check does:
    // delivering over an unpaid parking expense is the same mistake as
    // delivering over an unpaid balance.
    if (
      !confirmUnpaid &&
      portal &&
      portal.contract_total_amount !== null &&
      portal.paid_to_date < portal.contract_total_amount + (portal.charges_total ?? 0)
    ) {
      setUnpaidConfirm(true);
      return;
    }
    setUnpaidConfirm(false);
    setSavingField('deliver');
    setError('');
    try {
      const res = await fetch('/api/admin/portal-deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: portalId, confirmUnpaid }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await reload();
      } else {
        setError(data.error || t.clientDetail.serverErrorStatus(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSavingField(null);
    }
  };

  if (loading && !portal) {
    return (
      <Box maxW="900px" mx="auto" px={{ base: 0, md: 0 }} textAlign="center" py={20}>
        <Text color="gray.500">{t.common.loading}</Text>
      </Box>
    );
  }

  if (!portal) {
    return (
      <Box maxW="900px" mx="auto" px={{ base: 0, md: 0 }}>
        <AdminBackButton onClick={onBack} label={t.common.back} />
        <Text color="red.500" mt={6}>{error || t.clientDetail.couldNotLoad}</Text>
      </Box>
    );
  }

  // The one place this screen decides what is owed:
  //   contract total + charges added after the booking - paid to date.
  const chargesTotal = portal.charges_total ?? 0;
  const amountOwed =
    portal.contract_total_amount !== null ? portal.contract_total_amount + chargesTotal : null;
  const balanceRemaining =
    amountOwed !== null ? Math.max(amountOwed - portal.paid_to_date, 0) : null;
  const galleryDaysLeft = daysUntil(portal.gallery_expires_at);

  return (
    <DirtyCtx.Provider value={markDirty}>
    <Box maxW="900px" mx="auto" px={{ base: 0, md: 0 }}>
      <AdminBackButton onClick={handleBack} label={t.common.back} />

      {/* Sits directly under Back, where the press that raised it happened,
          and names what is at stake: "unsaved changes" on its own would send
          her hunting down a page of collapsed sections for whichever box she
          had been typing in. */}
      {leaveConfirm && hasUnsaved && (
        <Box bg="orange.50" border="1px solid" borderColor="orange.200" borderRadius="sm" p={4} mt={2} mb={4}>
          <Text fontSize="sm" fontWeight="500" color="orange.800" mb={1}>
            {t.clientDetail.unsavedHeading}
          </Text>
          <Text fontSize="sm" color="orange.900" fontWeight="300" mb={4}>
            {t.clientDetail.unsavedBody(unsavedNames.join(', '))}
          </Text>
          {/* column-reverse on mobile keeps the destructive action off the top
              of the tap zone, same as the Danger Zone and the unpaid panel. */}
          <Stack direction={{ base: 'column-reverse', md: 'row' }} spacing={2}>
            <CTAButton onClick={() => setLeaveConfirm(false)} variant="ghost" size="sm">
              {t.clientDetail.unsavedStay}
            </CTAButton>
            <CTAButton onClick={onBack} variant="danger" size="sm">
              {t.clientDetail.unsavedLeave}
            </CTAButton>
          </Stack>
        </Box>
      )}

      <VStack align="flex-start" spacing={2} mb={6}>
        <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="brand.accent">
          {/* Session type comes from user input via a fixed enum; the
              value itself is UI-visible copy that stays English on the
              wire, so only the fallback needs translating. */}
          {portal.session_type ?? t.clientDetail.kickerFallback}
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          {portal.client_display_name || portal.client_email || t.clientDetail.unnamed}
        </Text>
        <HStack spacing={2} flexWrap="wrap">
          {portal.client_email && <Text fontSize="sm" color="gray.500">{portal.client_email}</Text>}
          {portal.event_date && <Text fontSize="sm" color="gray.500">· {formatDate(portal.event_date)}</Text>}
          {portal.mode === 'simple' && (
            <Badge fontSize="2xs" colorScheme="gray" variant="subtle">{t.clientDetail.badgeGalleryOnly}</Badge>
          )}
          {portal.setup_token && (
            <Badge fontSize="2xs" colorScheme="orange" variant="subtle">{t.clientDetail.badgeInvitePending}</Badge>
          )}
        </HStack>
      </VStack>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="sm" p={3} mb={4}>
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {/* ─── Gallery section ─── */}
      <Section title={t.clientDetail.sectionPhotoGallery}>
        <VStack align="stretch" spacing={4}>
          <InlineField
            label={t.clientDetail.driveUrlLabel}
            value={portal.drive_url ?? ''}
            placeholder={t.clientDetail.driveUrlPlaceholder}
            helpText={t.clientDetail.driveUrlHelp}
            saving={savingField === 'drive_url'}
            onSave={(v) => patch({ drive_url: v }, 'drive_url')}
          />

          {/* Once the gallery URL is set, surface the client-facing
              delivery link — /portal/pass with the password encoded —
              so Vero can verify the actual surface her clients see,
              not the raw Drive folder. */}
          {portal.drive_url && (
            <Flex align="center" gap={2} wrap="wrap">
              <CTAButton
                href={
                  `/portal/pass?password=${encodeURIComponent(portal.gallery_password)}` +
                  // Undelivered galleries are withheld from the client, so
                  // without this the preview would show Vero the withheld
                  // notice instead of the gallery she is about to release.
                  (portal.gallery_preview_token
                    ? `&preview=${encodeURIComponent(portal.gallery_preview_token)}`
                    : '')
                }
                variant="outline"
                size="sm"
              >
                <Icon as={FaExternalLinkAlt} boxSize={3} mr={2} />
                {t.clientDetail.previewClientGallery}
              </CTAButton>
              <Text fontSize="xs" color="gray.500" fontWeight="300">
                {t.clientDetail.previewClientGalleryHint}
              </Text>
            </Flex>
          )}

          {/* Status label + primary CTA — stacks on mobile so the CTA
              spans full-width instead of orphaning under a wrapped label. */}
          <Stack
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'stretch', md: 'center' }}
            justify={{ base: 'flex-start', md: 'space-between' }}
            spacing={{ base: 3, md: 4 }}
          >
            <Box>
              <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                {t.clientDetail.deliveryStatus}
              </Text>
              {portal.gallery_delivered_at ? (
                <HStack spacing={3}>
                  <Badge colorScheme="green" variant="subtle" fontSize="xs">
                    {t.clientDetail.deliveredOn(formatDate(portal.gallery_delivered_at))}
                  </Badge>
                  {portal.gallery_expires_at && (
                    <Text fontSize="sm" color={galleryDaysLeft !== null && galleryDaysLeft < 7 ? 'orange.600' : 'gray.600'}>
                      {galleryDaysLeft !== null && galleryDaysLeft >= 0
                        ? t.clientDetail.daysRemaining(galleryDaysLeft)
                        : t.clientDetail.expired}
                    </Text>
                  )}
                </HStack>
              ) : (
                <Badge colorScheme="gray" variant="subtle" fontSize="xs">
                  {t.clientDetail.notDelivered}
                </Badge>
              )}
            </Box>
            {!portal.gallery_delivered_at && portal.drive_url && !unpaidConfirm && (
              <Box w={{ base: '100%', md: 'auto' }}>
                <CTAButton
                  // Arrow, not a bare reference: markDelivered's first
                  // parameter is confirmUnpaid, and handing it the click
                  // event straight would make every press a truthy
                  // "deliver anyway" and skip the guard rail entirely.
                  onClick={() => markDelivered()}
                  variant="solid"
                  size="sm"
                  isLoading={savingField === 'deliver'}
                  loadingText={t.clientDetail.delivering}
                  fullWidth={{ base: true, md: false }}
                >
                  {t.clientDetail.markAsDelivered}
                </CTAButton>
              </Box>
            )}
          </Stack>

          {/* Outstanding-balance confirmation. Replaces the button rather
              than sitting beside it, so the only way past it is to read it:
              delivering is what releases the photos to the client now, not
              just an email. Override stays available on purpose. */}
          {unpaidConfirm && balanceRemaining !== null && amountOwed !== null && (
            <Box bg="orange.50" border="1px solid" borderColor="orange.200" borderRadius="sm" p={4}>
              <Text fontSize="sm" fontWeight="500" color="orange.800" mb={1}>
                {t.clientDetail.outstandingHeading}
              </Text>
              <Text fontSize="sm" color="orange.900" fontWeight="300" mb={4}>
                {/* The third number is what is owed in total, charges
                    included, so it matches the Remaining stat below. */}
                {t.clientDetail.outstandingBody(
                  formatMoney(balanceRemaining),
                  formatMoney(portal.paid_to_date),
                  formatMoney(amountOwed),
                )}
              </Text>
              {/* column-reverse on mobile keeps the consequential action off
                  the top of the tap zone, same as the Danger Zone below. */}
              <Stack direction={{ base: 'column-reverse', md: 'row' }} spacing={2}>
                <CTAButton onClick={() => setUnpaidConfirm(false)} variant="ghost" size="sm">
                  {t.common.cancel}
                </CTAButton>
                <CTAButton
                  onClick={() => markDelivered(true)}
                  variant="solid"
                  size="sm"
                  isLoading={savingField === 'deliver'}
                  loadingText={t.clientDetail.delivering}
                >
                  {t.clientDetail.deliverAnyway}
                </CTAButton>
              </Stack>
            </Box>
          )}
        </VStack>
      </Section>

      {/* ─── Gallery Pass section ─── */}
      <Section title={t.clientDetail.sectionGalleryPass}>
        <VStack align="stretch" spacing={4}>
          <InlineField
            label={t.clientDetail.passwordLabel}
            value={portal.gallery_password}
            helpText={t.clientDetail.passwordHelp}
            saving={savingField === 'gallery_password'}
            onSave={(v) => patch({ gallery_password: v }, 'gallery_password')}
          />
          {/* Access label + toggle — stacks on mobile so the toggle CTA
              takes full row width rather than orphaning. */}
          <Stack
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'stretch', md: 'center' }}
            justify={{ base: 'flex-start', md: 'space-between' }}
            spacing={{ base: 3, md: 4 }}
          >
            <Box>
              <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                {t.clientDetail.access}
              </Text>
              <Text fontSize="sm" color={portal.gallery_enabled ? 'green.600' : 'gray.500'}>
                {portal.gallery_enabled ? t.clientDetail.enabled : t.clientDetail.disabled}
              </Text>
            </Box>
            <Box w={{ base: '100%', md: 'auto' }}>
              <CTAButton
                onClick={() => patch({ gallery_enabled: !portal.gallery_enabled }, 'gallery_enabled')}
                variant="outline"
                size="sm"
                isLoading={savingField === 'gallery_enabled'}
                fullWidth={{ base: true, md: false }}
              >
                {portal.gallery_enabled ? t.clientDetail.disable : t.clientDetail.enable}
              </CTAButton>
            </Box>
          </Stack>
        </VStack>
      </Section>

      {/* ─── Account (full-mode only): onboarding status + tech-support
            actions. Resend invite if they haven't finished welcome,
            override password if they have. ─── */}
      {portal.mode === 'full' && (
        <AccountSection
          portal={portal}
          adminPassword={adminPassword}
          onChanged={reload}
        />
      )}

      {/* ─── Contract section (full-mode only) ─── */}
      {portal.mode === 'full' && (
        <Section title={t.clientDetail.sectionContract}>
          <VStack align="stretch" spacing={3}>
            {/* Status label + signed-PDF CTA — same stacking pattern so
                the "View Signed Copy" button doesn't orphan below. */}
            <Stack
              direction={{ base: 'column', md: 'row' }}
              align={{ base: 'stretch', md: 'center' }}
              justify={{ base: 'flex-start', md: 'space-between' }}
              spacing={{ base: 3, md: 4 }}
            >
              <Box>
                <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                  {t.clientDetail.status}
                </Text>
                {/* There are six contract types now, and each one is worded
                    differently. "Pending signature" on its own no longer says
                    WHICH contract is pending, so the type rides next to the
                    status instead of only being visible inside the PDF. */}
                <HStack spacing={2} flexWrap="wrap">
                  <ContractBadge status={portal.contract_status} signedAt={portal.contract_signed_at} />
                  <Badge colorScheme="gray" variant="outline" fontSize="2xs">
                    {typeLabel(portal.contract_template_key)}
                  </Badge>
                </HStack>
              </Box>
              {portal.contract_status === 'signed' && portal.contract_signed_pdf_available && (
                <Box w={{ base: '100%', md: 'auto' }}>
                  <ViewSignedPdfButton portalId={portalId} adminPassword={adminPassword} />
                </Box>
              )}
            </Stack>

            {/* The session type is a label (the kicker above, the Clients list,
                the calendar). The contract type is what the contract was
                actually rendered from. The two are written together now, but
                rows predating that, and rows whose label was edited by hand,
                can still disagree, and a page whose heading reads "portrait"
                while it quietly holds a wedding contract is the worst version
                of this. Saying so beats hoping nobody looks. */}
            {portal.contract_status === 'pending' &&
              portal.session_type &&
              portal.session_type !== portal.contract_template_key &&
              // Other / Custom is the one type whose label is SUPPOSED to
              // differ: the create form files the booking under whatever Vero
              // typed in Session Label ("newborn", "branding") while the
              // contract renders from the generic session template. Without
              // this, every Other booking accused itself of a mismatch and
              // told her to overwrite the label that made it an Other booking.
              !templateSpecFor(portal.contract_template_key)?.allowsCustomLabel && (
                <Box p={3} bg="yellow.50" border="1px solid" borderColor="yellow.200" borderRadius="sm">
                  <Text fontSize="xs" color="yellow.800">
                    {/* "filed under X" rather than "a X shoot": the label is a
                        raw stored word, and "a engagement shoot" is what the
                        article version prints for half of them. */}
                    {t.clientDetail.typeMismatchWarning(
                      portal.session_type,
                      typeLabel(portal.contract_template_key),
                    )}
                  </Text>
                </Box>
              )}

            {/* Where the shoot is, and one tap to navigate there. Sits in the
                Contract section because that is where the address lives, and
                it shows for a SIGNED contract too: the day she actually needs
                to drive there is long after signing. */}
            <SessionLocationLinks address={portal.contract_variables?.event_location ?? ''} />

            {/* While the contract is pending, expose the same variable
                fields that were used at creation. Saving re-renders the
                contract body. Once signed, the contract is frozen and
                this block disappears (the signed PDF link lives in the
                client portal view itself). */}
            {portal.contract_status === 'pending' && (
              <EditContractVariables
                portal={portal}
                adminPassword={adminPassword}
                onSaved={reload}
              />
            )}
          </VStack>
        </Section>
      )}

      {/* ─── Payments section. Surfaces whenever a total is on the
            books — full-mode portals always have one; simple-mode rows
            have one only when Vero entered totals at creation. ─── */}
      {portal.contract_total_amount !== null && (
        <Section title={t.clientDetail.sectionPayments}>
          <VStack align="stretch" spacing={5}>
            {/* 3-up stat row, 4-up once something has been charged. On mobile
                the columns stay side-by-side but spacing shrinks so the
                numbers fit without wrapping, which is why a fourth one drops
                to a 2x2 there rather than squeezing onto one row. */}
            <SimpleGrid
              columns={{ base: chargesTotal > 0 ? 2 : 3, md: chargesTotal > 0 ? 4 : 3 }}
              spacing={{ base: 3, md: 6 }}
              fontSize="sm"
            >
              <Stat label={t.clientDetail.statTotal} value={formatMoney(portal.contract_total_amount)} />
              {chargesTotal > 0 && (
                <Stat label={t.clientDetail.statCharges} value={formatMoney(chargesTotal)} />
              )}
              <Stat label={t.clientDetail.statPaid} value={formatMoney(portal.paid_to_date)} />
              <Stat label={t.clientDetail.statRemaining} value={formatMoney(balanceRemaining)} emphasize={balanceRemaining !== null && balanceRemaining > 0} />
            </SimpleGrid>

            <AddPaymentForm portalId={portalId} adminPassword={adminPassword} onAdded={reload} />

            {payments.length > 0 && (
              <Box>
                <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={2}>
                  {t.clientDetail.history}
                </Text>
                <VStack align="stretch" spacing={2}>
                  {payments.map((p) => (
                    <PaymentRow
                      key={p.id}
                      entry={p}
                      portalId={portalId}
                      adminPassword={adminPassword}
                      onDeleted={reload}
                    />
                  ))}
                </VStack>
              </Box>
            )}

            {/* Charges: money owed rather than money in, so it sits below the
                payment log with its own form and its own list. Every line here
                is printed in the client's portal with its reason and note. */}
            <AddChargeForm portalId={portalId} adminPassword={adminPassword} onAdded={reload} />

            {charges.length > 0 && (
              <Box>
                <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={2}>
                  {t.clientDetail.chargesHistory}
                </Text>
                <VStack align="stretch" spacing={2}>
                  {charges.map((c) => (
                    <ChargeRow
                      key={c.id}
                      entry={c}
                      portalId={portalId}
                      adminPassword={adminPassword}
                      onDeleted={reload}
                    />
                  ))}
                </VStack>
              </Box>
            )}
          </VStack>
        </Section>
      )}

      {/* ─── Editable details (admin can correct typos etc.) ─── */}
      <Section title={t.clientDetail.sectionDetails}>
        <VStack align="stretch" spacing={4}>
          <InlineField
            label={t.clientDetail.displayNameLabel}
            value={portal.client_display_name ?? ''}
            helpText={t.clientDetail.displayNameHelp}
            saving={savingField === 'client_display_name'}
            onSave={(v) => patch({ client_display_name: v }, 'client_display_name')}
          />
          <InlineField
            label={t.clientDetail.clientEmailLabel}
            value={portal.client_email ?? ''}
            helpText={
              portal.mode === 'simple'
                ? t.clientDetail.clientEmailHelpSimple
                : undefined
            }
            saving={savingField === 'client_email'}
            onSave={(v) => patch({ client_email: v }, 'client_email')}
          />
          <InlineField
            label={t.clientDetail.eventDateLabel}
            type="date"
            value={portal.event_date ?? ''}
            saving={savingField === 'event_date'}
            onSave={(v) => patch({ event_date: v }, 'event_date')}
          />
          {/* The field decides which columns it is writing and hands the patch
              over whole, because the two are not always the same value: an
              Other booking is filed under Vero's own word ("newborn") while its
              contract renders from the 'other' template. Sending
              contract_template_key on a row with no pending contract is refused
              server-side, so a gallery-only row sends the label alone and the
              type field it never used stays at its default. */}
          <SessionTypeField
            portal={portal}
            saving={savingField === 'session_type'}
            onSave={(next) => patch(next, 'session_type')}
          />
          {/* Total + Retainer let her retro-fit old gallery-only rows
              with bookkeeping. Once a total is set, the Payments
              section above starts surfacing. Frozen on signed full
              contracts (server enforces). */}
          <InlineField
            label={t.clientDetail.totalAmountLabel}
            type="text"
            value={portal.contract_total_amount?.toString() ?? ''}
            placeholder="0"
            helpText={t.clientDetail.totalAmountHelp}
            saving={savingField === 'contract_total_amount'}
            onSave={(v) =>
              patch(
                { contract_total_amount: v.trim() === '' ? null : Number(v) },
                'contract_total_amount',
              )
            }
          />
          <InlineField
            label={t.clientDetail.retainerLabel}
            type="text"
            value={portal.contract_retainer_amount?.toString() ?? ''}
            placeholder="0"
            helpText={t.clientDetail.retainerHelp}
            saving={savingField === 'contract_retainer_amount'}
            onSave={(v) =>
              patch(
                { contract_retainer_amount: v.trim() === '' ? null : Number(v) },
                'contract_retainer_amount',
              )
            }
          />
        </VStack>
      </Section>

      {/* ─── Danger zone (super-admin only) ─── */}
      {adminLevel === 'super' && (
        <DangerZone portalId={portalId} adminPassword={adminPassword} onDeleted={onBack} />
      )}
    </Box>
    </DirtyCtx.Provider>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────
// (BackLink removed — replaced by shared <AdminBackButton /> at call sites.)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" px={{ base: 5, md: 7 }} py={{ base: 5, md: 6 }} mb={5}>
      <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500" mb={4}>
        {title}
      </Text>
      {children}
    </Box>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <VStack align="flex-start" spacing={0.5}>
      <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.400" textTransform="uppercase" letterSpacing={{ base: '0.15em', md: '0.15em' }}>
        {label}
      </Text>
      <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight={emphasize ? '500' : '300'} color={emphasize ? 'gray.800' : 'gray.600'}>
        {value}
      </Text>
    </VStack>
  );
}

/**
 * Live delivery state of the invite email, looked up on demand.
 *
 * Not polled: by the time anyone is on this screen the send is minutes or
 * days old and the answer is settled, so one lookup when the section renders
 * is enough. `/api/email-status` needs no auth because a Resend id is already
 * unguessable, which is why this can be a plain fetch.
 */
function InviteDelivery({ emailId, sentAt }: { emailId: string; sentAt: string | null }) {
  const { t, lang } = useAdminLang();
  const [state, setState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/email-status?id=${encodeURIComponent(emailId)}`);
        const data = await res.json();
        if (!cancelled) setState(data?.status ?? 'unknown');
      } catch {
        if (!cancelled) setState('unknown');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [emailId]);

  if (!state) return null;
  const bad = ['bounced', 'complained', 'failed', 'canceled', 'suppressed'].includes(state);
  const good = ['delivered', 'delivery_delayed', 'opened', 'clicked'].includes(state);
  return (
    <Text fontSize="2xs" color={bad ? 'red.600' : good ? 'green.600' : 'gray.500'} mt={1}>
      {t.clientDetail.inviteEmailState(state)}
      {sentAt ? ` · ${fmtAdminDateTime(sentAt, lang)}` : ''}
    </Text>
  );
}

function ContractBadge({ status, signedAt }: { status: string; signedAt: string | null }) {
  const { t } = useAdminLang();
  if (status === 'signed' && signedAt) {
    return (
      <HStack>
        <Badge colorScheme="green" variant="subtle">{t.clientDetail.contractSigned}</Badge>
        <Text fontSize="sm" color="gray.600">{t.clientDetail.contractSignedOn(formatDate(signedAt))}</Text>
      </HStack>
    );
  }
  if (status === 'pending') return <Badge colorScheme="orange" variant="subtle">{t.clientDetail.contractPending}</Badge>;
  if (status === 'void') return <Badge colorScheme="red" variant="subtle">{t.clientDetail.contractVoid}</Badge>;
  return <Badge colorScheme="gray" variant="subtle">{t.clientDetail.contractNA}</Badge>;
}

// Inline editable field — keeps its own draft state so saves only happen
// on blur/save, not every keystroke.
function InlineField({
  label,
  value,
  helpText,
  type = 'text',
  placeholder,
  normalize,
  saving,
  onSave,
}: {
  label: string;
  value: string;
  helpText?: string;
  type?: 'text' | 'date';
  placeholder?: string;
  // Applied to what she types, before it reaches the draft. Only the session
  // label uses it, so that a label typed here comes out in the same shape as
  // one typed on either create screen. Normalising on save instead would leave
  // the box showing text the database does not hold.
  normalize?: (v: string) => string;
  saving?: boolean;
  onSave: (v: string) => Promise<boolean | void>;
}) {
  const { t } = useAdminLang();
  const [draft, setDraft] = useState(value);
  const [touched, setTouched] = useState(false);

  // Resync local draft when the canonical value changes (e.g. after a reload).
  useEffect(() => {
    setDraft(value);
    setTouched(false);
  }, [value]);

  // Compare like against like. `draft` is re-normalized on every keystroke, so
  // comparing it to the RAW stored value makes a legacy label permanently
  // dirty: a stored `Newborn Shoot` against a draft the box re-slugs to
  // `newborn-shoot` can never be typed back into agreement, which would leave
  // the Back warning and the beforeunload veto armed forever with nothing
  // actually unsaved. Normalize the seed for the COMPARISON only, never for
  // what the box displays on arrival.
  const dirty = touched && draft !== (normalize ? normalize(value) : value);
  // The same test the Save button uses, so the leave warning and the visible
  // Save button can never disagree about whether this box is holding anything.
  useDirtyFlag(dirty, label);

  return (
    <Box>
      <Text fontSize={{ base: 'xs', md: '2xs' }} fontWeight="500" color="brand.accent" letterSpacing={{ base: '0.15em', md: '0.2em' }} textTransform="uppercase" mb={2}>
        {label}
      </Text>
      <Flex gap={2} align="stretch">
        <Input
          type={type}
          value={draft}
          onChange={(e) => {
            setDraft(normalize ? normalize(e.target.value) : e.target.value);
            setTouched(true);
          }}
          placeholder={placeholder}
          h="44px"
          bg="white"
          border="1px solid"
          borderColor={dirty ? 'brand.accent' : 'gray.300'}
          color="gray.800"
          // iOS Safari zooms on focus for any input <16px. Bump to md
          // (16px) on mobile, keep sm (14px) desktop-side.
          fontSize={{ base: 'md', sm: 'sm' }}
          borderRadius="sm"
          _hover={{ borderColor: dirty ? 'brand.accent' : 'gray.400' }}
          _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
        />
        {dirty && (
          <CTAButton
            onClick={async () => {
              const ok = await onSave(draft);
              if (ok !== false) setTouched(false);
            }}
            variant="solid"
            size="sm"
            isLoading={saving}
            loadingText={t.clientDetail.saving}
          >
            {t.common.save}
          </CTAButton>
        )}
      </Flex>
      {helpText && (
        <Text fontSize="xs" color="gray.500" mt={1.5} fontWeight="300">
          {helpText}
        </Text>
      )}
    </Box>
  );
}

/**
 * Session type, picked from the contract types instead of typed by hand.
 *
 * Free text was survivable while there was one contract. With six, "famliy" on
 * one row and "family" on the next is the difference between a Clients list you
 * can read at a glance and a pile of strings, and nothing lined the label up
 * with the contract the client was being asked to sign.
 *
 * While a contract is pending this writes BOTH columns, the label and the
 * contract type, the same way the creation form sets them together. The server
 * re-renders the contract body into the new type, so the alternative Vero used
 * to have (void the portal, re-create it, re-send the invite) is gone. Once the
 * contract is signed the server refuses the change, so the field goes read-only
 * here rather than offering a choice that comes back as a 409.
 *
 * On a gallery-only row the contract type column holds an untouched default and
 * means nothing, and there is no pending contract to re-render, so that case
 * stays the free-text label box it always was. The gallery-only create screen
 * still writes anything SessionTypePicker offers into this column (newborn,
 * anniversary, boudoir, and a Custom box on top of those), and a screen that
 * can only spell six words could not correct one of them.
 *
 * The list is the contract-type registry, but a stored key we no longer
 * recognise is kept as an option, so opening this screen on an older row does
 * not quietly relabel it on the next save.
 *
 * Other / Custom gets a Session Label box of its own next to the select. The
 * select binds to the TEMPLATE key, so on an Other booking filed as 'newborn'
 * it reads "Other / Custom" and the word 'newborn' appeared nowhere: the first
 * save wrote the template key back over it and the only record of what the
 * shoot actually was went with it. The label box is that record, and it is the
 * same box the create form shows for the same reason.
 */
function SessionTypeField({
  portal,
  saving,
  onSave,
}: {
  portal: PortalDetail;
  saving?: boolean;
  onSave: (patch: {
    session_type: string;
    contract_template_key?: string;
  }) => Promise<boolean | void>;
}) {
  const { t } = useAdminLang();
  // While the contract is pending the contract type is the authoritative
  // answer, because that is what the client is actually being asked to sign.
  // Everywhere else the label is all there is.
  const editsContractType = portal.mode === 'full' && portal.contract_status === 'pending';
  const storedLabel = portal.session_type ?? '';
  const current = editsContractType ? portal.contract_template_key : storedLabel;
  // A label that is only the template key is not a label. Rows saved before the
  // label box existed hold 'other' in that column, and echoing it into the box
  // would make Vero delete the word "other" by hand before she could type the
  // real one. Same seeding rule the create form uses.
  const seedLabel = isContractTemplateKey(storedLabel) ? '' : storedLabel;
  const [draft, setDraft] = useState(current);
  // Kept across a change of type on purpose: picking Portrait, thinking better
  // of it and picking Other again must not lose the word she already typed.
  const [labelDraft, setLabelDraft] = useState(seedLabel);

  // Resync the local draft when a reload brings a fresh value in, same as
  // InlineField above.
  useEffect(() => {
    setDraft(current);
  }, [current]);
  useEffect(() => {
    setLabelDraft(seedLabel);
  }, [seedLabel]);

  // Only the type whose spec says so gets a second box. Everything else files
  // itself under the template key, exactly as the create form does, so there is
  // no second picker to keep in agreement with the contract.
  const wantsCustomLabel = Boolean(templateSpecFor(draft)?.allowsCustomLabel);
  // A blank label falls back to the template key rather than writing an empty
  // string, the same way the create form does: a row with no label loses its
  // badge on the Clients list and on the calendar entirely.
  const nextLabel = wantsCustomLabel ? cleanSessionLabel(labelDraft) || draft : draft;
  // Compare what WOULD be saved against what IS stored, each normalized the
  // same way. Comparing the raw strings looks like it protects a legacy label
  // such as "Newborn Shoot" from reading as dirty on arrival, but it does the
  // opposite the moment she types: the box slugs live, so one keystroke plus
  // Backspace leaves "newborn-shoot" against a stored "Newborn Shoot" and
  // retyping the stored words cannot clear it, because they slug again. That
  // was merely a stale Save button before; useDirtyFlag turns it into a leave
  // warning and a beforeunload veto that cannot be dismissed. Arrival is still
  // clean because both sides normalize to the same string.
  //
  // Computed up here, above the two early returns below, only because a hook
  // reads it: the other two branches render an InlineField, which reports its
  // own unsaved state, and neither of them can move this select's draft, so
  // editsContractType keeps this instance from claiming their work as well.
  const dirty =
    draft !== current ||
    (wantsCustomLabel && cleanSessionLabel(labelDraft) !== cleanSessionLabel(seedLabel));
  useDirtyFlag(editsContractType && dirty, t.clientDetail.sessionTypeLabel);

  const label = (
    <Text
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="500"
      color="brand.accent"
      letterSpacing={{ base: '0.15em', md: '0.2em' }}
      textTransform="uppercase"
      mb={2}
    >
      {t.clientDetail.sessionTypeLabel}
    </Text>
  );

  // Once the contract is signed the TYPE is frozen, because re-rendering the
  // body would rewrite a document the client has already read, and the server
  // refuses a changed contract_template_key on a signed row. The filing label
  // is not part of that document: it is the kicker above, the Clients list and
  // the calendar, and _portal-update.ts patches session_type unconditionally at
  // any status. Locking both meant a typo in a label on a signed booking could
  // only be fixed in the database, so only the type is read-only here.
  if (portal.contract_status === 'signed') {
    return (
      <Box>
        {label}
        <Text fontSize="sm" color="gray.600">
          {typeLabel(portal.contract_template_key) || t.clientDetail.typeNotSet}
        </Text>
        <Text fontSize="xs" color="gray.500" mt={1.5} fontWeight="300">
          {t.clientDetail.contractTypeLocked}
        </Text>
        <Box mt={4}>
          <InlineField
            label={t.clientDetail.sessionLabelLabel}
            value={storedLabel}
            helpText={t.clientDetail.sessionLabelHelpSigned}
            normalize={sessionLabelSlug}
            saving={saving}
            onSave={(v) => onSave({ session_type: cleanSessionLabel(v) || portal.contract_template_key })}
          />
        </Box>
      </Box>
    );
  }

  // With no pending contract there is no contract type to drive, and this
  // column goes back to being the free text both create screens still write
  // into it: AdminNewGalleryOnly files gallery-only rows through
  // SessionTypePicker, whose standard chips include newborn, anniversary and
  // boudoir, on top of a Custom box for anything else. A six-option select
  // here could keep such a label but never write one, so this was the only
  // screen in the app that could not spell what the screen that created the
  // row had just written: a gallery row filed as 'newborn' could not be
  // corrected to 'boudoir' at all.
  if (!editsContractType) {
    return (
      <InlineField
        label={t.clientDetail.sessionTypeLabel}
        value={storedLabel}
        helpText={t.clientDetail.sessionLabelHelp}
        normalize={sessionLabelSlug}
        saving={saving}
        onSave={(v) => onSave({ session_type: cleanSessionLabel(v) })}
      />
    );
  }

  const knownTypes: readonly string[] = CONTRACT_TYPE_ORDER;
  const options = current && !knownTypes.includes(current) ? [current, ...knownTypes] : knownTypes;

  return (
    <Box>
      {label}
      {/* Type, label and Save is three controls, and three controls sharing one
          row on a phone leaves each of them about a third of 375px. Only the
          Other type has the middle one, so only that case stacks. */}
      <Flex
        gap={2}
        align="stretch"
        direction={wantsCustomLabel ? { base: 'column', sm: 'row' } : 'row'}
      >
        <Select
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // Nothing on the row yet: without a blank option the browser shows
          // the first type as though it had already been chosen.
          placeholder={current === '' ? t.clientDetail.typeNotSet : undefined}
          h="44px"
          bg="white"
          color="gray.800"
          borderColor={dirty ? 'brand.accent' : 'gray.300'}
          // iOS Safari zooms on focus for any control under 16px, so mobile
          // stays at md and desktop drops to sm. Same as InlineField.
          fontSize={{ base: 'md', sm: 'sm' }}
          borderRadius="sm"
          focusBorderColor="brand.accent"
        >
          {options.map((k) => (
            <option key={k} value={k}>
              {typeLabel(k)}
            </option>
          ))}
        </Select>
        {wantsCustomLabel && (
          <Input
            value={labelDraft}
            // Slugged live, the same way the create form slugs the same box, so
            // one shoot is filed under one string wherever it was typed.
            onChange={(e) => setLabelDraft(sessionLabelSlug(e.target.value))}
            placeholder={t.clientDetail.sessionLabelPlaceholder}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            h="44px"
            bg="white"
            border="1px solid"
            borderColor={dirty ? 'brand.accent' : 'gray.300'}
            color="gray.800"
            fontSize={{ base: 'md', sm: 'sm' }}
            borderRadius="sm"
            _hover={{ borderColor: dirty ? 'brand.accent' : 'gray.400' }}
            _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
          />
        )}
        {dirty && (
          <CTAButton
            onClick={async () => {
              const ok = await onSave({
                session_type: nextLabel,
                contract_template_key: draft,
              });
              // A select has no half-typed state to preserve, so a refused save
              // snaps back to what is actually stored instead of leaving a
              // choice on screen that was never written. The server refuses a
              // type whose required fields are blank (maternity with no due
              // date, Other with no scope) and says which, and that message
              // surfaces in the error box at the top of the page.
              if (ok === false) {
                setDraft(current);
                setLabelDraft(seedLabel);
              }
            }}
            variant="solid"
            size="sm"
            isLoading={saving}
            loadingText={t.clientDetail.saving}
          >
            {t.common.save}
          </CTAButton>
        )}
      </Flex>
      <Text fontSize="xs" color="gray.500" mt={1.5} fontWeight="300">
        {wantsCustomLabel
          ? t.clientDetail.sessionTypeHelpCustom
          : t.clientDetail.sessionTypeHelpStandard}
      </Text>
    </Box>
  );
}

function AddPaymentForm({
  portalId,
  adminPassword,
  onAdded,
}: {
  portalId: string;
  adminPassword: string;
  onAdded: () => void;
}) {
  const { t } = useAdminLang();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // Anything typed into any of the four boxes counts. There is nothing stored
  // to compare against here, so "not empty" IS the unsaved test: a composer
  // with an amount in it is a payment that has not been logged.
  useDirtyFlag(
    amount.trim() !== '' || method.trim() !== '' || note.trim() !== '' || paidAt !== '',
    t.clientDetail.unsavedPaymentDraft,
  );

  const reset = () => {
    setAmount('');
    setMethod('');
    setNote('');
    setPaidAt('');
  };

  const submit = async () => {
    setErr('');
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setErr(t.clientDetail.enterPositiveAmount);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/payment-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          id: portalId,
          action: 'add',
          amount: n,
          method: method.trim() || null,
          note: note.trim() || null,
          paid_at: paidAt || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        reset();
        onAdded();
      } else {
        // Dict entry returns the phrase without a trailing period; append
        // it here so the visible copy matches the original.
        setErr(data.error || `${t.clientDetail.serverErrorStatus(res.status)}.`);
      }
    } catch {
      setErr(t.common.couldNotReach);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box bg="gray.50" borderRadius="sm" border="1px solid" borderColor="gray.200" p={4}>
      <Text fontSize="xs" color="gray.500" letterSpacing="0.15em" textTransform="uppercase" mb={3}>
        {t.clientDetail.logAPayment}
      </Text>
      <VStack align="stretch" spacing={3}>
        {/* Amount / Method / Date stack vertically on phones so labels stay
            legible and each 44px-tall input has room to breathe. */}
        <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3}>
          <Box>
            <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" mb={1}>{t.clientDetail.amountLabel}</Text>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              h={{ base: '44px', sm: '36px' }}
              bg="white"
              fontSize={{ base: 'md', sm: 'sm' }}
              borderRadius="sm"
              _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
            />
          </Box>
          <Box>
            <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" mb={1}>{t.clientDetail.methodLabel}</Text>
            <Input
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder={t.clientDetail.methodPlaceholder}
              h={{ base: '44px', sm: '36px' }}
              bg="white"
              fontSize={{ base: 'md', sm: 'sm' }}
              borderRadius="sm"
              _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
            />
          </Box>
          <Box>
            <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" mb={1}>{t.clientDetail.dateLabel}</Text>
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              h={{ base: '44px', sm: '36px' }}
              bg="white"
              fontSize={{ base: 'md', sm: 'sm' }}
              borderRadius="sm"
              _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
            />
          </Box>
        </SimpleGrid>
        <Box>
          <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" mb={1}>{t.clientDetail.noteLabel}</Text>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.clientDetail.notePlaceholder}
            rows={2}
            bg="white"
            fontSize={{ base: 'md', sm: 'sm' }}
            focusBorderColor="brand.accent"
          />
        </Box>
        {err && <Text fontSize="sm" color="red.500">{err}</Text>}
        <CTAButton onClick={submit} variant="solid" size="sm" isLoading={submitting} loadingText={t.clientDetail.saving}>
          {t.clientDetail.addPayment}
        </CTAButton>
      </VStack>
    </Box>
  );
}

function PaymentRow({
  entry,
  portalId,
  adminPassword,
  onDeleted,
}: {
  entry: PaymentEntry;
  portalId: string;
  adminPassword: string;
  onDeleted: () => void;
}) {
  const { t } = useAdminLang();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  /**
   * A refused delete used to say nothing at all.
   *
   * There was no else branch and no catch: a 500, a stale session or a dropped
   * connection all ended in the same finally, which put the row back exactly
   * as it was and closed the confirmation. The row is still there, the total
   * has not moved and no message appeared, so the only available reading is
   * that the press did not register, and the next thing anyone does is press
   * it again. If the delete had in fact gone through and only the response was
   * lost, the second press hits an entry that is already gone.
   *
   * So it reports like the sub-forms above rather than the page-level red box
   * at the top: that box belongs to reload, patch and markDelivered, it lives
   * a full screen away from these rows, and a failure there is about the whole
   * portal rather than about one line of the payment log.
   *
   * The confirmation deliberately stays open on a failure, so the message and
   * the button that produced it are on screen together and a retry is one
   * press. It closes on success, along with the row itself.
   */
  const del = async () => {
    setSubmitting(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/payment-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          id: portalId,
          action: 'delete',
          entry_id: entry.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConfirming(false);
        onDeleted();
      } else {
        setErr(data.error || `${t.clientDetail.serverErrorStatus(res.status)}.`);
      }
    } catch {
      setErr(t.common.couldNotReach);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.100"
      borderRadius="sm"
      px={3}
      py={2.5}
    >
      <Flex justify="space-between" align="center" gap={3} flexWrap="wrap">
        <Box flex="1" minW={0}>
          <HStack spacing={2}>
            <Icon as={FaCheck} color="green.500" boxSize={2.5} />
            <Text fontSize="sm" fontWeight="500" color="gray.800">
              ${entry.amount.toFixed(0)}
            </Text>
            {entry.method && (
              <Text fontSize="sm" color="gray.500">· {entry.method}</Text>
            )}
            <Text fontSize="sm" color="gray.400">· {formatDate(entry.paid_at)}</Text>
          </HStack>
          {entry.note && (
            <Text fontSize="xs" color="gray.500" mt={0.5}>{entry.note}</Text>
          )}
        </Box>
      {confirming ? (
        // Full width on a phone so it drops to its own line. The pair is
        // nowrap and holds about 190px, which on a 320px screen left the text
        // column beside it 18px wide: the note rendered one or two glyphs per
        // line. Wrapping gives the amount, the note and the date the whole
        // first line and costs nothing above md, where the row still reads as
        // one line. Both controls carry a real 44px target on touch, matching
        // the trash button they replace, because the destructive one is the
        // last control on this screen that should be hard to hit accurately.
        <HStack
          spacing={2}
          w={{ base: '100%', md: 'auto' }}
          justify="flex-end"
          flexShrink={0}
        >
          <Box
            as="button"
            onClick={() => { setErr(''); setConfirming(false); }}
            fontSize="xs"
            color="gray.500"
            cursor="pointer"
            bg="transparent"
            border="none"
            px={2}
            minH={{ base: '44px', md: 'auto' }}
          >
            {t.common.cancel}
          </Box>
          <Box
            as="button"
            onClick={del}
            fontSize="xs"
            color="red.600"
            cursor="pointer"
            bg="transparent"
            border="none"
            px={2}
            minH={{ base: '44px', md: 'auto' }}
            disabled={submitting}
          >
            {submitting ? t.clientDetail.deleting : t.clientDetail.confirmDelete}
          </Box>
        </HStack>
      ) : (
        // Delete icon needs a real 44x44 tap target on mobile. A bare 12px
        // icon inside a hair-thin Box was impossible to hit reliably.
        <IconButton
          aria-label={t.clientDetail.deletePaymentAria}
          onClick={() => setConfirming(true)}
          icon={<Icon as={FaTrash} boxSize={3} />}
          variant="ghost"
          size="sm"
          minW={{ base: '44px', md: 'auto' }}
          minH={{ base: '44px', md: 'auto' }}
          color="gray.400"
          _hover={{ color: 'red.500', bg: 'transparent' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        />
      )}
      </Flex>
      {/* BELOW the flex row, at full row width, not inside the text column.
          Sharing that column with the confirm pair squeezes it to ~18px on a
          320px screen, and the Russian message (the admin's default language)
          shreds into one Cyrillic character per line. This is the one sentence
          the user has to be able to read, so it gets the whole row. */}
      {err && (
        <Text fontSize="xs" color="red.500" mt={1.5}>{err}</Text>
      )}
    </Box>
  );
}

/**
 * Add a charge: extra time, or a cost paid on the day.
 *
 * Shaped like AddPaymentForm above on purpose, with two differences that
 * matter. The reason is a picker rather than free text, because it is a
 * checked column and it is the label the client reads. And the note is
 * required: the reason alone tells the client "Expense", which explains
 * nothing, while "Parking at the venue" is a receipt they can agree with.
 * The placeholder changes with the reason so there is always an example of
 * the right shape of answer on screen.
 */
function AddChargeForm({
  portalId,
  adminPassword,
  onAdded,
}: {
  portalId: string;
  adminPassword: string;
  onAdded: () => void;
}) {
  const { t } = useAdminLang();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<ChargeReason>('overtime');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // The reason is deliberately not part of this: it arrives pre-picked at
  // 'overtime', so counting it would make a glance at the dropdown look like
  // typed work and raise the warning on a screen nobody had written on.
  useDirtyFlag(
    amount.trim() !== '' || note.trim() !== '',
    t.clientDetail.unsavedChargeDraft,
  );

  const submit = async () => {
    setErr('');
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setErr(t.clientDetail.enterPositiveAmount);
      return;
    }
    if (!note.trim()) {
      setErr(t.clientDetail.chargeNoteRequired);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/payment-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          id: portalId,
          action: 'add-charge',
          amount: n,
          reason,
          note: note.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAmount('');
        setNote('');
        setReason('overtime');
        onAdded();
      } else {
        setErr(data.error || `${t.clientDetail.serverErrorStatus(res.status)}.`);
      }
    } catch {
      setErr(t.common.couldNotReach);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box bg="gray.50" borderRadius="sm" border="1px solid" borderColor="gray.200" p={4}>
      <Text fontSize="xs" color="gray.500" letterSpacing="0.15em" textTransform="uppercase" mb={1}>
        {t.clientDetail.addACharge}
      </Text>
      <Text fontSize="xs" color="gray.500" fontWeight="300" mb={3}>
        {t.clientDetail.addAChargeHelp}
      </Text>
      <VStack align="stretch" spacing={3}>
        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
          <Box>
            <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" mb={1}>{t.clientDetail.amountLabel}</Text>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              h={{ base: '44px', sm: '36px' }}
              bg="white"
              fontSize={{ base: 'md', sm: 'sm' }}
              borderRadius="sm"
              _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
            />
          </Box>
          <Box>
            <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" mb={1}>{t.clientDetail.reasonLabel}</Text>
            <Select
              value={reason}
              onChange={(e) => setReason(e.target.value as ChargeReason)}
              h={{ base: '44px', sm: '36px' }}
              bg="white"
              fontSize={{ base: 'md', sm: 'sm' }}
              borderRadius="sm"
              focusBorderColor="brand.accent"
            >
              <option value="overtime">{t.clientDetail.reasonOvertime}</option>
              <option value="expense">{t.clientDetail.reasonExpense}</option>
              <option value="other">{t.clientDetail.reasonOther}</option>
            </Select>
          </Box>
        </SimpleGrid>
        <Box>
          <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" mb={1}>{t.clientDetail.chargeNoteLabel}</Text>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.clientDetail.chargeNotePlaceholder[reason]}
            h={{ base: '44px', sm: '36px' }}
            bg="white"
            fontSize={{ base: 'md', sm: 'sm' }}
            borderRadius="sm"
            _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
          />
          <Text fontSize="xs" color="gray.500" mt={1.5} fontWeight="300">
            {t.clientDetail.chargeNoteHelp}
          </Text>
        </Box>
        {err && <Text fontSize="sm" color="red.500">{err}</Text>}
        <CTAButton onClick={submit} variant="solid" size="sm" isLoading={submitting} loadingText={t.clientDetail.saving}>
          {t.clientDetail.addCharge}
        </CTAButton>
      </VStack>
    </Box>
  );
}

/**
 * One charge, deletable. Undoing a charge is a delete rather than a negative
 * correction, so this row is the only way back out, which is why it carries
 * the same two-step confirm PaymentRow does.
 */
function ChargeRow({
  entry,
  portalId,
  adminPassword,
  onDeleted,
}: {
  entry: ChargeEntry;
  portalId: string;
  adminPassword: string;
  onDeleted: () => void;
}) {
  const { t } = useAdminLang();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // A reason this bundle does not recognise falls through to the generic
  // label rather than rendering the raw storage value at Vero.
  const reasonLabel =
    entry.reason === 'overtime'
      ? t.clientDetail.reasonOvertime
      : entry.reason === 'expense'
        ? t.clientDetail.reasonExpense
        : t.clientDetail.reasonOther;

  // Carried the identical silent-failure bug as PaymentRow above, for the
  // identical reason: it was written by copying that handler. Same treatment,
  // and the stakes are marginally higher here, because a charge is money the
  // client is being asked for and every line is printed in their own portal.
  const del = async () => {
    setSubmitting(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/payment-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          id: portalId,
          action: 'delete-charge',
          charge_id: entry.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConfirming(false);
        onDeleted();
      } else {
        setErr(data.error || `${t.clientDetail.serverErrorStatus(res.status)}.`);
      }
    } catch {
      setErr(t.common.couldNotReach);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.100"
      borderRadius="sm"
      px={3}
      py={2.5}
    >
      <Flex justify="space-between" align="center" gap={3} flexWrap="wrap">
        <Box flex="1" minW={0}>
          <HStack spacing={2} flexWrap="wrap">
            <Text fontSize="sm" fontWeight="500" color="gray.800">
              +${entry.amount.toFixed(0)}
            </Text>
            <Text fontSize="sm" color="gray.500">· {reasonLabel}</Text>
            <Text fontSize="sm" color="gray.400">· {formatDate(entry.charged_at)}</Text>
          </HStack>
          {entry.note && (
            <Text fontSize="xs" color="gray.500" mt={0.5}>{entry.note}</Text>
          )}
        </Box>
      {confirming ? (
        // Same wrap and the same 44px targets as the payment row above, and
        // for the same measured reason.
        <HStack
          spacing={2}
          w={{ base: '100%', md: 'auto' }}
          justify="flex-end"
          flexShrink={0}
        >
          <Box
            as="button"
            onClick={() => { setErr(''); setConfirming(false); }}
            fontSize="xs"
            color="gray.500"
            cursor="pointer"
            bg="transparent"
            border="none"
            px={2}
            minH={{ base: '44px', md: 'auto' }}
          >
            {t.common.cancel}
          </Box>
          <Box
            as="button"
            onClick={del}
            fontSize="xs"
            color="red.600"
            cursor="pointer"
            bg="transparent"
            border="none"
            px={2}
            minH={{ base: '44px', md: 'auto' }}
            disabled={submitting}
          >
            {submitting ? t.clientDetail.deleting : t.clientDetail.confirmDelete}
          </Box>
        </HStack>
      ) : (
        <IconButton
          aria-label={t.clientDetail.deleteChargeAria}
          onClick={() => setConfirming(true)}
          icon={<Icon as={FaTrash} boxSize={3} />}
          variant="ghost"
          size="sm"
          minW={{ base: '44px', md: 'auto' }}
          minH={{ base: '44px', md: 'auto' }}
          color="gray.400"
          _hover={{ color: 'red.500', bg: 'transparent' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        />
      )}
      </Flex>
      {/* Same placement as the payment row: below the flex row at full width,
          so the Russian message stays readable at 320px. */}
      {err && (
        <Text fontSize="xs" color="red.500" mt={1.5}>{err}</Text>
      )}
    </Box>
  );
}

/**
 * Onboarding status + technical-support actions for full-mode portals.
 * Shows whether the client has completed welcome (set a password) or
 * is still pending an invite. Provides:
 *   - Resend invite (regenerates setup_token, sends a fresh email)
 *   - Manual password override (for clients who lost their password)
 */
function AccountSection({
  portal,
  adminPassword,
  onChanged,
}: {
  portal: PortalDetail;
  adminPassword: string;
  onChanged: () => void;
}) {
  const { t } = useAdminLang();
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [overridePassword, setOverridePassword] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Closing the panel with Cancel leaves the typed password in state, and it
  // is posted if she reopens and saves, so the panel being open is part of the
  // test rather than the whole of it being a fresh box.
  useDirtyFlag(overrideOpen && overridePassword !== '', t.clientDetail.unsavedClientPassword);

  const handleResend = async () => {
    setResending(true);
    setResendMessage(null);
    try {
      const res = await fetch('/api/admin/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: portal.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // client_email is user data — pass it into the dict function as-is.
        setResendMessage({ kind: 'ok', text: t.clientDetail.inviteResent(portal.client_email ?? '') });
        onChanged();
      } else {
        setResendMessage({ kind: 'err', text: data.error || `${t.clientDetail.serverErrorStatus(res.status)}.` });
      }
    } catch {
      setResendMessage({ kind: 'err', text: t.common.couldNotReach });
    } finally {
      setResending(false);
    }
  };

  const handleOverride = async () => {
    setOverrideMessage(null);
    if (overridePassword.length < 6) {
      setOverrideMessage({ kind: 'err', text: t.clientDetail.passwordTooShort });
      return;
    }
    setOverriding(true);
    try {
      const res = await fetch('/api/admin/portal-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          id: portal.id,
          patch: { set_client_password: overridePassword },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOverrideMessage({
          kind: 'ok',
          text: t.clientDetail.passwordSetOk,
        });
        setOverridePassword('');
        setOverrideOpen(false);
        onChanged();
      } else {
        setOverrideMessage({ kind: 'err', text: data.error || `${t.clientDetail.serverErrorStatus(res.status)}.` });
      }
    } catch {
      setOverrideMessage({ kind: 'err', text: t.common.couldNotReach });
    } finally {
      setOverriding(false);
    }
  };

  return (
    <Section title={t.clientDetail.sectionAccount}>
      <VStack align="stretch" spacing={4}>
        {/* Account status + Resend Invite — stacks on mobile so the CTA
            spans full width and doesn't orphan under the badge. */}
        <Stack
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'stretch', md: 'center' }}
          justify={{ base: 'flex-start', md: 'space-between' }}
          spacing={{ base: 3, md: 4 }}
        >
          <Box>
            <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
              {t.clientDetail.status}
            </Text>
            {portal.client_has_password ? (
              <Badge colorScheme="green" variant="subtle" fontSize="xs">{t.clientDetail.accountActive}</Badge>
            ) : portal.setup_token ? (
              <Badge colorScheme="orange" variant="subtle" fontSize="xs">{t.clientDetail.accountInvitePending}</Badge>
            ) : (
              <Badge colorScheme="gray" variant="subtle" fontSize="xs">{t.clientDetail.noAccount}</Badge>
            )}
            {/* "Invite pending" alone cannot tell a client who is slow from a
                client who never got the email. This asks Resend what actually
                happened to it, which is only possible now that the id is
                stored rather than living for a few seconds in a browser tab. */}
            {!portal.client_has_password && portal.invite_email_id && (
              <InviteDelivery emailId={portal.invite_email_id} sentAt={portal.invite_sent_at} />
            )}
          </Box>
          {!portal.client_has_password && (
            <Box w={{ base: '100%', md: 'auto' }}>
              <CTAButton
                onClick={handleResend}
                variant="outline"
                size="sm"
                isLoading={resending}
                loadingText={t.clientDetail.sending}
                fullWidth={{ base: true, md: false }}
              >
                {t.clientDetail.resendInvite}
              </CTAButton>
            </Box>
          )}
        </Stack>

        {resendMessage && (
          <Text fontSize="xs" color={resendMessage.kind === 'ok' ? 'green.600' : 'red.500'}>
            {resendMessage.text}
          </Text>
        )}

        {/* Password override — for when the client lost their password.
            Always available (even before they finish onboarding) because
            we can use it to "complete onboarding on their behalf" too. */}
        <Box>
          {/* Password label/help + Set-Password toggle — same stacking
              pattern so the CTA drops below the multi-line copy on
              mobile rather than getting shoved into an unreadable column. */}
          <Stack
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'stretch', md: 'center' }}
            justify={{ base: 'flex-start', md: 'space-between' }}
            spacing={{ base: 3, md: 4 }}
          >
            <Box>
              <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                {t.clientDetail.passwordLabel}
              </Text>
              <Text fontSize="sm" color="gray.600" fontWeight="300">
                {t.clientDetail.accountPasswordHelp}
              </Text>
            </Box>
            <Box w={{ base: '100%', md: 'auto' }}>
              <CTAButton
                onClick={() => setOverrideOpen((o) => !o)}
                variant="outline"
                size="sm"
                fullWidth={{ base: true, md: false }}
              >
                {overrideOpen ? t.common.cancel : t.clientDetail.setPassword}
              </CTAButton>
            </Box>
          </Stack>
          {overrideOpen && (
            <Flex gap={2} mt={3} align="stretch" direction={{ base: 'column', sm: 'row' }}>
              <Input
                type="text"
                value={overridePassword}
                onChange={(e) => setOverridePassword(e.target.value)}
                placeholder={t.clientDetail.passwordMinPlaceholder}
                h={{ base: '44px', sm: '40px' }}
                bg="white"
                fontSize={{ base: 'md', sm: 'sm' }}
                _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
              />
              <CTAButton
                onClick={handleOverride}
                variant="solid"
                size="sm"
                isLoading={overriding}
                loadingText={t.clientDetail.saving}
              >
                {t.common.save}
              </CTAButton>
            </Flex>
          )}
          {overrideMessage && (
            <Text fontSize="xs" color={overrideMessage.kind === 'ok' ? 'green.600' : 'red.500'} mt={2}>
              {overrideMessage.text}
            </Text>
          )}
        </Box>
      </VStack>
    </Section>
  );
}

/**
 * Editable form of the same contract variables that were collected at
 * portal-creation time. Shown only while contract_status === 'pending';
 * once signed, the contract body is frozen and this disappears.
 *
 * Saving re-renders the contract template with the new variables and
 * persists the new body so the client sees the updated text on their
 * next portal load.
 *
 * Field keys must match the variable names used in the contract
 * template — they round-trip into and out of contract_variables.
 */
/**
 * The session address, and one tap into whichever map app she prefers.
 *
 * ALL THREE LINKS ARE BUILT IN THE BROWSER, AND THAT IS SAFE, because all
 * three carry a DESTINATION ONLY. Waze and Apple Maps take nothing else, and
 * the Google link here is deliberately the no-origin form, which makes Maps
 * route from wherever she is standing. That is the right behaviour for this
 * screen: the question on the day is "get me there from here", not "how far is
 * this from base".
 *
 * The one link that does carry an origin is the look it up button on the new
 * client form, and that one is built server side in api/admin/_travel-link.ts
 * because the origin is a home address and this bundle is public. Nothing on
 * this screen ever passes a second argument to googleDirectionsLink.
 *
 * Renders nothing at all when there is no address, rather than three dead
 * buttons that open a map of nowhere.
 */
function SessionLocationLinks({ address }: { address: string }) {
  const { lang } = useAdminLang();
  const tv = travelCopy(lang);
  const trimmed = address.trim();
  if (!trimmed) return null;

  const targets: Array<{ label: string; href: string }> = [
    { label: tv.waze, href: wazeLink(trimmed) },
    { label: tv.googleMaps, href: googleDirectionsLink(trimmed) },
    { label: tv.appleMaps, href: appleMapsLink(trimmed) },
  ];

  return (
    <Box mt={3} pt={3} borderTop="1px solid" borderColor="gray.100">
      <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
        {tv.navHeading}
      </Text>
      <Text fontSize="sm" color="gray.700" fontWeight="300" mb={3}>
        {trimmed}
      </Text>
      <Stack direction={{ base: 'column', md: 'row' }} spacing={2}>
        {targets.map((target) => (
          <CTAButton
            key={target.label}
            href={target.href}
            newTab
            variant="outline"
            size="sm"
            icon={FaExternalLinkAlt}
            fullWidth={{ base: true, md: false }}
          >
            {target.label}
          </CTAButton>
        ))}
      </Stack>
    </Box>
  );
}

function EditContractVariables({
  portal,
  adminPassword,
  onSaved,
}: {
  portal: PortalDetail;
  adminPassword: string;
  onSaved: () => void;
}) {
  const { t } = useAdminLang();
  const [open, setOpen] = useState(false);
  const [vars, setVars] = useState<Record<string, string>>(portal.contract_variables ?? {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // Second step of the save, see the panel at the bottom of this component.
  const [confirmSave, setConfirmSave] = useState(false);

  // Resync local form state if a parent reload pulled in fresh variables.
  useEffect(() => {
    setVars(portal.contract_variables ?? {});
  }, [portal.contract_variables]);

  /**
   * Which variables differ from what is stored, compared by VALUE.
   *
   * Every reload hands this component a brand new contract_variables object,
   * so an identity check would call the form dirty on arrival and the leave
   * warning would fire on a screen she had only looked at. The union of both
   * key sets covers a field the template added after this portal was created:
   * it renders blank, is absent from `vars` until she types in it, and must
   * not count until she does.
   *
   * Reported even while the panel is collapsed, because Hide does not throw
   * the draft away: the typing is still sitting in state waiting for a Save.
   */
  const savedVars = portal.contract_variables ?? {};
  const changedCount = Array.from(
    new Set([...Object.keys(savedVars), ...Object.keys(vars)]),
  ).filter((k) => (vars[k] ?? '') !== (savedVars[k] ?? '')).length;
  useDirtyFlag(changedCount > 0, t.clientDetail.unsavedContractFields(changedCount));

  /**
   * Label and help text for one clause switch.
   *
   * The create form's dictionary first, because Vero's panel runs in Russian
   * and the two screens flip the same flags, then OPTIONAL_CLAUSES as the
   * English fallback for a clause added to a spec before it was translated,
   * and the raw flag name last. Duplicating this wording here instead would
   * mean two screens describing the same contract clause differently.
   *
   * maternity_clauses_enabled is in the dictionary but not in OPTIONAL_CLAUSES:
   * its type forces it on, so it has never been a checkbox on the create form,
   * and this screen is the only one that prints it.
   */
  const clauseCopy = (key: string): { label: string; help: string } => {
    const translated = (
      t.newClient.clauses as Record<string, { label: string; help: string } | undefined>
    )[key];
    const registry: { label: string; helpText: string } | undefined = OPTIONAL_CLAUSES[key];
    return {
      label: translated?.label ?? registry?.label ?? key,
      help: translated?.help ?? registry?.helpText ?? '',
    };
  };

  // Combine the variables already saved on the portal with every
  // {{var}} reference in the current template. That way:
  //  - Existing variables show up populated (so she can edit typos).
  //  - Variables added to the template AFTER this portal was created
  //    (e.g. responsible_party_name) show up as empty fields so she
  //    can fill them in without having to recreate the portal.
  const templateSpec = templateSpecFor(portal.contract_template_key);
  const templateKeys = templateSpec ? extractVariableKeys(templateSpec.template) : [];

  // extractVariableKeys only finds {{tokens}}, and the clause switches are not
  // tokens: a clause is named in its section's require list and nowhere in the
  // text itself. So without this they surface here only when the creation form
  // happened to save one, which is backwards. The clauses are exactly how the
  // six types differ, and a clause Vero cannot switch on for a pending contract
  // is a clause that silently never reaches the client.
  //
  // They are checkboxes and never text boxes. pruneEmptyOptionalSections keeps
  // a section when its flag is ANY non-blank string, so the word "no" typed
  // into minors_clause_enabled switched the clause ON, and on a pending wedding
  // a single character typed into two_camera_enabled added the two-camera
  // clause to a contract waiting to be signed. A checkbox writes 'yes' or ''
  // and nothing else.
  const offeredClauses = templateSpec?.optionalClauses ?? [];
  // Forced on by the type itself (family always carries the minor and illness
  // clauses), so they are stated, not offered: the server merges them back in
  // under whatever is posted, and a box that appears to clear them would be
  // lying about what the client is going to sign.
  const forcedClauses = Object.keys(templateSpec?.defaultVariables ?? {});
  // Flags left behind by a type this portal used to be. Shown ONLY when they
  // are already on, so they can be switched off and never switched on: the five
  // session types share one body, so a maternity portal changed to portrait
  // keeps printing MATERNITY SESSION GUIDELINES until somebody clears the flag,
  // and nothing else on this screen can reach it. Read from the SAVED
  // variables, not the draft, so a row does not vanish under her finger the
  // moment she unticks it.
  const strandedClauses = Object.entries(portal.contract_variables ?? {})
    .filter(
      ([k, v]) =>
        ALL_CLAUSE_KEYS.has(k) &&
        typeof v === 'string' &&
        v.trim().length > 0 &&
        !offeredClauses.includes(k) &&
        !forcedClauses.includes(k),
    )
    .map(([k]) => k);

  // This portal's own type, not every type's. Listing all six put due_date and
  // session_scope rows on a pending WEDDING, where neither appears in the
  // template: typing in them did nothing visible and wrote dead keys into
  // contract_variables, and wedding is the one type that must look exactly as
  // it always has. requiredVariablesFor stays in the union because a required
  // field is not guaranteed to be a {{token}}; every one of them is today, so
  // this adds no row to any type and changes nothing for wedding.
  //
  // Switching a pending WEDDING straight to maternity or Other is still
  // refused server-side for the field it has never collected. The way through
  // is one hop: the five session types share a single body, so any of them
  // exposes due_date and session_scope here, and wedding to portrait to
  // maternity gets there without re-creating the client.
  const ownRequiredKeys = requiredVariablesFor(portal.contract_template_key);
  // Clause flags are never free text, whichever list they came from.
  const valueKeys = Array.from(
    new Set([...Object.keys(vars), ...templateKeys, ...ownRequiredKeys]),
  )
    .filter((k) => !ALL_CLAUSE_KEYS.has(k))
    .sort();
  const clauseRows = [
    ...forcedClauses.map((key) => ({ key, kind: 'forced' as const })),
    ...offeredClauses.map((key) => ({ key, kind: 'offered' as const })),
    ...strandedClauses.map((key) => ({ key, kind: 'stranded' as const })),
  ];

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/portal-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          id: portal.id,
          patch: { contract_variables: vars },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ kind: 'ok', text: t.clientDetail.contractUpdatedOk });
        setConfirmSave(false);
        onSaved();
      } else {
        setMessage({ kind: 'err', text: data.error || `${t.clientDetail.serverErrorStatus(res.status)}.` });
      }
    } catch {
      setMessage({ kind: 'err', text: t.common.couldNotReach });
    } finally {
      setSaving(false);
    }
  };

  if (valueKeys.length === 0 && clauseRows.length === 0) {
    // No keys in vars AND no template keys (would only happen if the
    // template key on this portal is unknown). Direct edit fallback.
    return (
      <Box mt={3} p={3} bg="yellow.50" border="1px solid" borderColor="yellow.200" borderRadius="sm">
        <Text fontSize="xs" color="yellow.800">
          {t.clientDetail.editContractUnknownTemplate}
        </Text>
      </Box>
    );
  }

  return (
    <Box mt={3} pt={3} borderTop="1px solid" borderColor="gray.100">
      <Flex justify="space-between" align="center" mb={2} wrap="wrap" gap={2}>
        <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em">
          {t.clientDetail.editContractTitle}
        </Text>
        <Box
          as="button"
          type="button"
          onClick={() => {
            // Hide packs the confirmation away with the fields it belongs to.
            // Left standing, it would be the first thing on screen the next
            // time she opened the panel, asking her to agree to a rewrite she
            // had not asked for yet.
            setConfirmSave(false);
            setOpen((o) => !o);
          }}
          fontSize="xs"
          letterSpacing="0.15em"
          textTransform="uppercase"
          color="brand.accent"
          bg="transparent"
          border="none"
          cursor="pointer"
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {open ? t.clientDetail.editContractHide : t.clientDetail.editContractEditFields}
        </Box>
      </Flex>
      <Text fontSize="xs" color="gray.500" mb={3} fontWeight="300">
        {t.clientDetail.editContractHint}
      </Text>

      {open && (
        <VStack align="stretch" spacing={3}>
          {valueKeys.map((k) => {
            const value = vars[k] ?? '';
            const isLong = value.length > 80 || k === 'additional_notes';
            return (
              <Box key={k}>
                <Text fontSize={{ base: 'xs', md: '2xs' }} color="brand.accent" letterSpacing="0.15em" textTransform="uppercase" mb={1}>
                  {k}
                </Text>
                {isLong ? (
                  <Textarea
                    value={value}
                    onChange={(e) => setVars((v) => ({ ...v, [k]: e.target.value }))}
                    rows={3}
                    bg="white"
                    fontSize={{ base: 'md', sm: 'sm' }}
                    focusBorderColor="brand.accent"
                  />
                ) : (
                  <Input
                    value={value}
                    onChange={(e) => setVars((v) => ({ ...v, [k]: e.target.value }))}
                    h={{ base: '44px', sm: '38px' }}
                    bg="white"
                    fontSize={{ base: 'md', sm: 'sm' }}
                    _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
                  />
                )}
              </Box>
            );
          })}

          {clauseRows.length > 0 && (
            <Box pt={2} borderTop="1px solid" borderColor="gray.100">
              <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.400" letterSpacing="0.15em" textTransform="uppercase" mb={1}>
                {t.clientDetail.contractClauses}
              </Text>
              <Text fontSize="xs" color="gray.500" mb={3} fontWeight="300">
                {t.clientDetail.contractClausesHint}
              </Text>
              <VStack align="stretch" spacing={3}>
                {clauseRows.map(({ key, kind }) => {
                  const copy = clauseCopy(key);
                  // The pruner's own test, so the box says exactly what the
                  // rendered contract is going to do. A forced clause reads as
                  // on whatever is stored, because the server merges the type's
                  // default back in underneath whatever this form posts.
                  const on = kind === 'forced' || (vars[key] ?? '').trim().length > 0;
                  return (
                    <Checkbox
                      key={key}
                      isChecked={on}
                      isReadOnly={kind === 'forced'}
                      onChange={(e) => {
                        // isReadOnly already swallows this for a forced clause.
                        // Belt and braces anyway: the two clauses that are
                        // forced on by default are the minor and illness ones
                        // on a family booking, and those are exactly the two
                        // nobody notices are missing until they matter.
                        if (kind === 'forced') return;
                        setVars((v) => ({ ...v, [key]: e.target.checked ? 'yes' : '' }));
                      }}
                      colorScheme="yellow"
                      alignItems="flex-start"
                    >
                      <Box>
                        <Text fontSize="sm" color="gray.700" fontWeight="500">
                          {copy.label}
                        </Text>
                        <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1} lineHeight="1.5">
                          {copy.help}
                        </Text>
                        {kind === 'forced' && (
                          <Text fontSize="xs" color="gray.400" fontWeight="300" mt={1}>
                            {t.clientDetail.clauseAlwaysOn(
                              typeLabel(portal.contract_template_key),
                            )}
                          </Text>
                        )}
                        {kind === 'stranded' && (
                          <Text fontSize="xs" color="orange.600" fontWeight="300" mt={1}>
                            {t.clientDetail.clauseStranded}
                          </Text>
                        )}
                      </Box>
                    </Checkbox>
                  );
                })}
              </VStack>
            </Box>
          )}

          {message && (
            <Text fontSize="xs" color={message.kind === 'ok' ? 'green.600' : 'red.500'}>
              {message.text}
            </Text>
          )}

          {/* One press used to write all two dozen fields back and rebuild the
              contract body from the template, with nothing said first and no
              way back afterwards.

              The exposure is smaller than it looks, and the confirmation is
              sized to match. This whole component renders only while
              contract_status is 'pending' (see the call site in the Contract
              section), and _portal-update.ts skips the re-render entirely on a
              frozen row, so a SIGNED contract cannot be rewritten from here by
              any route: there is no editor on screen, and the post would be
              ignored if there were. Nobody has agreed to this document yet.

              What is left is still worth stopping for. The client may well
              have opened the contract already, the post REPLACES
              contract_variables wholesale rather than merging, and the body is
              re-rendered from the current template, so this is the screen's
              only irreversible save. So: one extra press, and a line that says
              how many fields are going and what happens to the client's copy.
              Inline and two-step like every other confirmation in this file,
              because there is no modal or toast anywhere in it. */}
          {confirmSave ? (
            <Box bg="orange.50" border="1px solid" borderColor="orange.200" borderRadius="sm" p={4}>
              <Text fontSize="sm" fontWeight="500" color="orange.800" mb={1}>
                {t.clientDetail.contractSaveConfirmHeading}
              </Text>
              <Text fontSize="sm" color="orange.900" fontWeight="300" mb={4}>
                {/* Every field on the form, not just the edited ones: all of
                    them are posted, and the body is rebuilt from all of
                    them. */}
                {t.clientDetail.contractSaveConfirmBody(valueKeys.length + clauseRows.length)}
              </Text>
              <Stack direction={{ base: 'column-reverse', md: 'row' }} spacing={2}>
                <CTAButton onClick={() => setConfirmSave(false)} variant="ghost" size="sm">
                  {t.common.cancel}
                </CTAButton>
                <CTAButton
                  onClick={handleSave}
                  variant="solid"
                  size="sm"
                  isLoading={saving}
                  loadingText={t.clientDetail.saving}
                >
                  {t.clientDetail.contractSaveConfirmCta}
                </CTAButton>
              </Stack>
            </Box>
          ) : (
            <CTAButton
              onClick={() => {
                setMessage(null);
                setConfirmSave(true);
              }}
              variant="solid"
              size="sm"
            >
              {t.clientDetail.saveContractChanges}
            </CTAButton>
          )}
        </VStack>
      )}
    </Box>
  );
}

/**
 * "View Signed Copy" button for admin. Fetches the signed PDF via the
 * admin-auth'd /api/admin/portal-pdf endpoint (mirror of the
 * client's portal/download-contract) and opens it in a new tab.
 *
 * Lets Vero pull a contract up without digging through email.
 */
function ViewSignedPdfButton({
  portalId,
  adminPassword,
}: {
  portalId: string;
  adminPassword: string;
}) {
  const { t } = useAdminLang();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  const handleView = async () => {
    setError('');
    setOpening(true);
    try {
      const res = await fetch('/api/admin/portal-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: portalId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || t.clientDetail.couldNotOpenStatus(res.status));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error('[admin-portal-pdf] network error:', err);
      setError(t.common.couldNotReach);
    } finally {
      setOpening(false);
    }
  };

  return (
    <Box>
      <CTAButton
        onClick={handleView}
        variant="outline"
        size="sm"
        isLoading={opening}
        loadingText={t.clientDetail.opening}
      >
        {t.clientDetail.viewSignedCopy}
      </CTAButton>
      {error && (
        <Text fontSize="xs" color="red.500" mt={1}>
          {error}
        </Text>
      )}
    </Box>
  );
}

/**
 * Hard-delete button. Only rendered when the logged-in admin is at
 * 'super' level (separate password). Two-click confirmation so a
 * stray click doesn't nuke the row + payment history + signed
 * contract reference all at once.
 */
function DangerZone({
  portalId,
  adminPassword,
  onDeleted,
}: {
  portalId: string;
  adminPassword: string;
  onDeleted: () => void;
}) {
  const { t } = useAdminLang();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const doDelete = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/portal-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: portalId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onDeleted();
      } else {
        setError(data.error || `${t.clientDetail.serverErrorStatus(res.status)}.`);
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="red.100"
      borderRadius="md"
      px={{ base: 5, md: 7 }}
      py={{ base: 5, md: 6 }}
      mt={2}
    >
      <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="red.500" mb={4}>
        {t.clientDetail.sectionDangerZone}
      </Text>
      <Text fontSize="sm" color="gray.600" mb={4} fontWeight="300">
        {t.clientDetail.dangerZoneBody}
      </Text>
      {!confirming && (
        <CTAButton onClick={() => setConfirming(true)} variant="outline" size="sm">
          <Icon as={FaTrash} boxSize={3} mr={2} />
          {t.clientDetail.deleteThisPortal}
        </CTAButton>
      )}
      {confirming && (
        // column-reverse on mobile keeps the destructive action visually
        // separate from the safe (Cancel) action — Cancel ends up first
        // in reading order but Confirm sits on top of the tap zone.
        <Stack direction={{ base: 'column-reverse', md: 'row' }} spacing={2}>
          <CTAButton onClick={() => setConfirming(false)} variant="ghost" size="sm">
            {t.common.cancel}
          </CTAButton>
          <CTAButton
            onClick={doDelete}
            variant="danger"
            size="sm"
            isLoading={submitting}
            loadingText={t.clientDetail.deleting}
          >
            {t.clientDetail.confirmDelete}
          </CTAButton>
        </Stack>
      )}
      {error && (
        <Text fontSize="sm" color="red.500" mt={3}>
          {error}
        </Text>
      )}
    </Box>
  );
}

export default AdminClientDetail;
