import { Box, VStack, HStack, Text, Input, Flex, Icon, Badge, Textarea } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaCheck, FaTrash } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

interface Props {
  portalId: string;
  adminPassword: string;
  onBack: () => void;
}

interface PortalDetail {
  id: string;
  mode: 'simple' | 'full';
  session_type: string | null;
  client_display_name: string | null;
  client_email: string | null;
  event_date: string | null;
  gallery_password: string;
  gallery_enabled: boolean;
  drive_url: string | null;
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_signed_at: string | null;
  contract_signed_pdf_available: boolean;
  contract_total_amount: number | null;
  contract_retainer_amount: number | null;
  paid_to_date: number;
  setup_token: string | null;
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
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

const AdminClientDetail = ({ portalId, adminPassword, onBack }: Props) => {
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
        setError(data.error || `Server error (${res.status})`);
      }
    } catch {
      setError('Could not reach the server.');
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
      setError(data.error || `Server error (${res.status})`);
      return false;
    } catch {
      setError('Could not reach the server.');
      return false;
    } finally {
      setSavingField(null);
    }
  };

  const markDelivered = async () => {
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
        setError(data.error || `Server error (${res.status})`);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSavingField(null);
    }
  };

  if (loading && !portal) {
    return (
      <Box maxW="900px" mx="auto" textAlign="center" py={20}>
        <Text color="gray.500">Loading…</Text>
      </Box>
    );
  }

  if (!portal) {
    return (
      <Box maxW="900px" mx="auto">
        <BackLink onBack={onBack} />
        <Text color="red.500" mt={6}>{error || 'Could not load this portal.'}</Text>
      </Box>
    );
  }

  const balanceRemaining =
    portal.contract_total_amount !== null
      ? Math.max(portal.contract_total_amount - portal.paid_to_date, 0)
      : null;
  const galleryDaysLeft = daysUntil(portal.gallery_expires_at);

  return (
    <Box maxW="900px" mx="auto">
      <BackLink onBack={onBack} />

      <VStack align="flex-start" spacing={2} mb={6}>
        <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="#c9a96e">
          {portal.session_type ?? 'Client'}
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          {portal.client_display_name || portal.client_email || '(unnamed)'}
        </Text>
        <HStack spacing={2} flexWrap="wrap">
          {portal.client_email && <Text fontSize="sm" color="gray.500">{portal.client_email}</Text>}
          {portal.event_date && <Text fontSize="sm" color="gray.500">· {formatDate(portal.event_date)}</Text>}
          {portal.mode === 'simple' && (
            <Badge fontSize="2xs" colorScheme="gray" variant="subtle">Gallery-only</Badge>
          )}
          {portal.setup_token && (
            <Badge fontSize="2xs" colorScheme="orange" variant="subtle">Invite pending</Badge>
          )}
        </HStack>
      </VStack>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="sm" p={3} mb={4}>
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {/* ─── Gallery section ─── */}
      <Section title="Photo Gallery">
        <VStack align="stretch" spacing={4}>
          <InlineField
            label="Google Drive URL"
            value={portal.drive_url ?? ''}
            placeholder="https://drive.google.com/drive/folders/..."
            helpText="Paste the share URL of the gallery folder."
            saving={savingField === 'drive_url'}
            onSave={(v) => patch({ drive_url: v }, 'drive_url')}
          />

          <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
            <Box>
              <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                Delivery Status
              </Text>
              {portal.gallery_delivered_at ? (
                <HStack spacing={3}>
                  <Badge colorScheme="green" variant="subtle" fontSize="xs">
                    Delivered {formatDate(portal.gallery_delivered_at)}
                  </Badge>
                  {portal.gallery_expires_at && (
                    <Text fontSize="sm" color={galleryDaysLeft !== null && galleryDaysLeft < 7 ? 'orange.600' : 'gray.600'}>
                      {galleryDaysLeft !== null && galleryDaysLeft >= 0
                        ? `${galleryDaysLeft} day${galleryDaysLeft === 1 ? '' : 's'} remaining`
                        : 'Expired'}
                    </Text>
                  )}
                </HStack>
              ) : (
                <Badge colorScheme="gray" variant="subtle" fontSize="xs">
                  Not delivered yet
                </Badge>
              )}
            </Box>
            {!portal.gallery_delivered_at && portal.drive_url && (
              <CTAButton
                onClick={markDelivered}
                variant="solid"
                size="sm"
                isLoading={savingField === 'deliver'}
                loadingText="Delivering..."
              >
                Mark as Delivered
              </CTAButton>
            )}
          </Flex>
        </VStack>
      </Section>

      {/* ─── Gallery Pass section ─── */}
      <Section title="Gallery Pass">
        <VStack align="stretch" spacing={4}>
          <InlineField
            label="Password"
            value={portal.gallery_password}
            helpText="The password guests use at /portal/pass to view photos."
            saving={savingField === 'gallery_password'}
            onSave={(v) => patch({ gallery_password: v }, 'gallery_password')}
          />
          <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
            <Box>
              <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                Access
              </Text>
              <Text fontSize="sm" color={portal.gallery_enabled ? 'green.600' : 'gray.500'}>
                {portal.gallery_enabled ? 'Enabled' : 'Disabled'}
              </Text>
            </Box>
            <CTAButton
              onClick={() => patch({ gallery_enabled: !portal.gallery_enabled }, 'gallery_enabled')}
              variant="outline"
              size="sm"
              isLoading={savingField === 'gallery_enabled'}
            >
              {portal.gallery_enabled ? 'Disable' : 'Enable'}
            </CTAButton>
          </Flex>
        </VStack>
      </Section>

      {/* ─── Contract section (full-mode only) ─── */}
      {portal.mode === 'full' && (
        <Section title="Contract">
          <VStack align="stretch" spacing={3}>
            <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
              <Box>
                <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                  Status
                </Text>
                <ContractBadge status={portal.contract_status} signedAt={portal.contract_signed_at} />
              </Box>
            </Flex>
          </VStack>
        </Section>
      )}

      {/* ─── Payments section. Surfaces whenever a total is on the
            books — full-mode portals always have one; simple-mode rows
            have one only when Vero entered totals at creation. ─── */}
      {portal.contract_total_amount !== null && (
        <Section title="Payments">
          <VStack align="stretch" spacing={5}>
            <HStack spacing={6} fontSize="sm">
              <Stat label="Total" value={formatMoney(portal.contract_total_amount)} />
              <Stat label="Paid" value={formatMoney(portal.paid_to_date)} />
              <Stat label="Remaining" value={formatMoney(balanceRemaining)} emphasize={balanceRemaining !== null && balanceRemaining > 0} />
            </HStack>

            <AddPaymentForm portalId={portalId} adminPassword={adminPassword} onAdded={reload} />

            {payments.length > 0 && (
              <Box>
                <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={2}>
                  History
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
      <Section title="Details">
        <VStack align="stretch" spacing={4}>
          <InlineField
            label="Display Name"
            value={portal.client_display_name ?? ''}
            helpText="What we'll greet them by in the portal."
            saving={savingField === 'client_display_name'}
            onSave={(v) => patch({ client_display_name: v }, 'client_display_name')}
          />
          {portal.mode === 'full' && (
            <InlineField
              label="Client Email"
              value={portal.client_email ?? ''}
              saving={savingField === 'client_email'}
              onSave={(v) => patch({ client_email: v }, 'client_email')}
            />
          )}
          <InlineField
            label="Event Date"
            type="date"
            value={portal.event_date ?? ''}
            saving={savingField === 'event_date'}
            onSave={(v) => patch({ event_date: v }, 'event_date')}
          />
          <InlineField
            label="Session Type"
            value={portal.session_type ?? ''}
            saving={savingField === 'session_type'}
            onSave={(v) => patch({ session_type: v }, 'session_type')}
          />
        </VStack>
      </Section>
    </Box>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <Flex align="center" mb={6} gap={3}>
      <Box
        as="button"
        type="button"
        onClick={onBack}
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
        sx={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Icon as={FaArrowLeft} boxSize={3} />
        Back to dashboard
      </Box>
    </Flex>
  );
}

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
      <Text fontSize="2xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em">
        {label}
      </Text>
      <Text fontSize="lg" fontWeight={emphasize ? '500' : '300'} color={emphasize ? 'gray.800' : 'gray.600'}>
        {value}
      </Text>
    </VStack>
  );
}

function ContractBadge({ status, signedAt }: { status: string; signedAt: string | null }) {
  if (status === 'signed' && signedAt) {
    return (
      <HStack>
        <Badge colorScheme="green" variant="subtle">Signed</Badge>
        <Text fontSize="sm" color="gray.600">on {formatDate(signedAt)}</Text>
      </HStack>
    );
  }
  if (status === 'pending') return <Badge colorScheme="orange" variant="subtle">Pending signature</Badge>;
  if (status === 'void') return <Badge colorScheme="red" variant="subtle">Void</Badge>;
  return <Badge colorScheme="gray" variant="subtle">N/A</Badge>;
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
      <Text fontSize="2xs" fontWeight="500" color="#c9a96e" letterSpacing="0.2em" textTransform="uppercase" mb={2}>
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
          borderColor={dirty ? '#c9a96e' : 'gray.300'}
          color="gray.800"
          fontSize="sm"
          borderRadius="sm"
          _hover={{ borderColor: dirty ? '#c9a96e' : 'gray.400' }}
          _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
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
            loadingText="Saving..."
          >
            Save
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
      setErr('Enter a positive amount.');
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
        setErr(data.error || `Server error (${res.status}).`);
      }
    } catch {
      setErr('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box bg="gray.50" borderRadius="sm" border="1px solid" borderColor="gray.200" p={4}>
      <Text fontSize="xs" color="gray.500" letterSpacing="0.15em" textTransform="uppercase" mb={3}>
        Log a Payment
      </Text>
      <VStack align="stretch" spacing={3}>
        <HStack spacing={3} align="flex-start" flexWrap="wrap">
          <Box flex="1" minW="100px">
            <Text fontSize="2xs" color="gray.500" mb={1}>Amount (USD)</Text>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              h="36px"
              bg="white"
              fontSize="sm"
              borderRadius="sm"
              _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
            />
          </Box>
          <Box flex="1" minW="140px">
            <Text fontSize="2xs" color="gray.500" mb={1}>Method</Text>
            <Input
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="Zelle / Cash / Venmo..."
              h="36px"
              bg="white"
              fontSize="sm"
              borderRadius="sm"
              _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
            />
          </Box>
          <Box flex="1" minW="140px">
            <Text fontSize="2xs" color="gray.500" mb={1}>Date</Text>
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              h="36px"
              bg="white"
              fontSize="sm"
              borderRadius="sm"
              _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
            />
          </Box>
        </HStack>
        <Box>
          <Text fontSize="2xs" color="gray.500" mb={1}>Note (optional)</Text>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Retainer received"
            rows={2}
            bg="white"
            fontSize="sm"
            focusBorderColor="#c9a96e"
          />
        </Box>
        {err && <Text fontSize="sm" color="red.500">{err}</Text>}
        <CTAButton onClick={submit} variant="solid" size="sm" isLoading={submitting} loadingText="Saving...">
          Add Payment
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
            Cancel
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
            {submitting ? 'Deleting...' : 'Confirm delete'}
          </Box>
        </HStack>
      ) : (
        <Box
          as="button"
          onClick={() => setConfirming(true)}
          fontSize="xs"
          color="gray.400"
          _hover={{ color: 'red.500' }}
          cursor="pointer"
          bg="transparent"
          border="none"
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Icon as={FaTrash} boxSize={3} />
        </Box>
      )}
    </Flex>
  );
}

export default AdminClientDetail;
