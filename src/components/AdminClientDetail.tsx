import { Box, VStack, HStack, Text, Input, Flex, Icon, Badge, Textarea, SimpleGrid, Stack, IconButton } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { FaCheck, FaTrash, FaExternalLinkAlt } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import AdminBackButton from './ui/AdminBackButton';
import { CONTRACT_TEMPLATES, extractVariableKeys } from '../data/contract-template';
import { useAdminLang } from '../i18n/admin';

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
  setup_token: string | null;
  client_has_password: boolean;
}

interface PaymentEntry {
  id: string;
  amount: number;
  method: string | null;
  note: string | null;
  paid_at: string;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingField, setSavingField] = useState<string | null>(null);

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

  const markDelivered = async () => {
    // Soft guardrail: warn if there's an outstanding balance. We don't
    // block delivery because there are legitimate edge cases (cash
    // hand-off at the shoot, comp gifts, payment plans not tracked in
    // here yet). But she's much more likely to FORGET to log a payment
    // than to genuinely want to deliver unpaid, so confirm first.
    if (
      portal &&
      portal.contract_total_amount !== null &&
      portal.paid_to_date < portal.contract_total_amount
    ) {
      const remaining = portal.contract_total_amount - portal.paid_to_date;
      const ok = window.confirm(
        t.clientDetail.outstandingConfirm(
          `$${remaining.toFixed(0)}`,
          `$${portal.paid_to_date.toFixed(0)}`,
          `$${portal.contract_total_amount.toFixed(0)}`,
        ),
      );
      if (!ok) return;
    }
    setSavingField('deliver');
    setError('');
    try {
      const res = await fetch('/api/admin/portal-deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: portalId }),
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

  const balanceRemaining =
    portal.contract_total_amount !== null
      ? Math.max(portal.contract_total_amount - portal.paid_to_date, 0)
      : null;
  const galleryDaysLeft = daysUntil(portal.gallery_expires_at);

  return (
    <Box maxW="900px" mx="auto" px={{ base: 0, md: 0 }}>
      <AdminBackButton onClick={onBack} label={t.common.back} />

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
                href={`/portal/pass?password=${encodeURIComponent(portal.gallery_password)}`}
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
            {!portal.gallery_delivered_at && portal.drive_url && (
              <Box w={{ base: '100%', md: 'auto' }}>
                <CTAButton
                  onClick={markDelivered}
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
                <ContractBadge status={portal.contract_status} signedAt={portal.contract_signed_at} />
              </Box>
              {portal.contract_status === 'signed' && portal.contract_signed_pdf_available && (
                <Box w={{ base: '100%', md: 'auto' }}>
                  <ViewSignedPdfButton portalId={portalId} adminPassword={adminPassword} />
                </Box>
              )}
            </Stack>

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
            {/* 3-up stat row. On mobile the columns stay side-by-side but
                spacing shrinks so 3 numbers fit without wrapping. */}
            <SimpleGrid columns={3} spacing={{ base: 3, md: 6 }} fontSize="sm">
              <Stat label={t.clientDetail.statTotal} value={formatMoney(portal.contract_total_amount)} />
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
          <InlineField
            label={t.clientDetail.sessionTypeLabel}
            value={portal.session_type ?? ''}
            saving={savingField === 'session_type'}
            onSave={(v) => patch({ session_type: v }, 'session_type')}
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
  saving,
  onSave,
}: {
  label: string;
  value: string;
  helpText?: string;
  type?: 'text' | 'date';
  placeholder?: string;
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

  const dirty = touched && draft !== value;

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
            setDraft(e.target.value);
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

  const del = async () => {
    setSubmitting(true);
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
      if (res.ok && data.success) onDeleted();
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return (
    <Flex
      justify="space-between"
      align="center"
      bg="white"
      border="1px solid"
      borderColor="gray.100"
      borderRadius="sm"
      px={3}
      py={2.5}
      gap={3}
    >
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
        <HStack spacing={2}>
          <Box as="button" onClick={() => setConfirming(false)} fontSize="xs" color="gray.500" cursor="pointer" bg="transparent" border="none">
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
            disabled={submitting}
          >
            {submitting ? t.clientDetail.deleting : t.clientDetail.confirmDelete}
          </Box>
        </HStack>
      ) : (
        // Delete icon needs a real 44×44 tap target on mobile — a bare 12px
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

  // Resync local form state if a parent reload pulled in fresh variables.
  useEffect(() => {
    setVars(portal.contract_variables ?? {});
  }, [portal.contract_variables]);

  // Combine the variables already saved on the portal with every
  // {{var}} reference in the current template. That way:
  //  - Existing variables show up populated (so she can edit typos).
  //  - Variables added to the template AFTER this portal was created
  //    (e.g. responsible_party_name) show up as empty fields so she
  //    can fill them in without having to recreate the portal.
  const templateSpec = CONTRACT_TEMPLATES[portal.contract_template_key];
  const templateKeys = templateSpec ? extractVariableKeys(templateSpec.template) : [];
  const keys = Array.from(new Set([...Object.keys(vars), ...templateKeys])).sort();

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

  if (keys.length === 0) {
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
          onClick={() => setOpen((o) => !o)}
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
          {keys.map((k) => {
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
          {message && (
            <Text fontSize="xs" color={message.kind === 'ok' ? 'green.600' : 'red.500'}>
              {message.text}
            </Text>
          )}
          <CTAButton
            onClick={handleSave}
            variant="solid"
            size="sm"
            isLoading={saving}
            loadingText={t.clientDetail.saving}
          >
            {t.clientDetail.saveContractChanges}
          </CTAButton>
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
