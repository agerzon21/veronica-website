/**
 * Per-event insurance on one booking.
 *
 * Veronika carries no annual liability policy, and on the numbers she may
 * never want one: a Full Frame event policy is $59 with $5 more for unlimited
 * additional insureds, against roughly $530 a year, so per-event wins until
 * she is insuring about eight events. What an event policy cannot cover is
 * gear, which is annual-only, so the two are not substitutes and this panel
 * records what was actually bought for THIS event rather than assuming
 * anything standing exists.
 *
 * TWO STEPS, DELIBERATELY APART. Flagging that cover is needed happens the
 * moment a venue sends its vendor packet, which is usually after the contract
 * is signed. Recording the policy happens later, once it has actually been
 * bought. Between them the client sees an estimate rather than a charge, and
 * because the estimate and the actual are stored separately, a client quoted
 * $64 can never be quietly billed $120 without the gap being visible.
 *
 * WHO PAYS is the field that matters most. The contract's EVENT INSURANCE
 * clause only permits charging for cover the venue required or the client's
 * own later request caused. Cover Vero buys for her own peace of mind is
 * explicitly hers, and `billable` is what keeps that promise honest. It
 * defaults from the trigger and stays editable, because she often absorbs
 * costs she would be entitled to pass on.
 */

import { useState } from 'react';
import { Box, VStack, HStack, Text, Input, Select, Textarea, Checkbox, Badge, SimpleGrid } from '@chakra-ui/react';
import CTAButton from './ui/CTAButton';
import { useAdminLang } from '../i18n/admin';

export interface InsuranceState {
  insurance_status: string;
  insurance_trigger: string | null;
  insurance_note: string | null;
  insurance_billable: boolean;
  insurance_estimate: string | number | null;
  insurance_actual: string | number | null;
  insurance_provider: string | null;
  insurance_policy_ref: string | null;
  insurance_document_url: string | null;
  insurance_additional_insured: string | null;
  insurance_purchased_at: string | null;
  insurance_charge_id: string | null;
}

interface Props {
  portalId: string;
  adminPassword: string;
  state: InsuranceState | null;
  contractSigned: boolean;
  retainerPaid: boolean;
  onSaved: () => void;
}

const num = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === '' ? '' : String(v);

export default function AdminClientInsurance({
  portalId,
  adminPassword,
  state,
  contractSigned,
  retainerPaid,
  onSaved,
}: Props) {
  const { t } = useAdminLang();
  const s = state;
  const status = s?.insurance_status ?? 'none';

  const [trigger, setTrigger] = useState(s?.insurance_trigger ?? 'venue_required');
  const [note, setNote] = useState(s?.insurance_note ?? '');
  const [additionalInsured, setAdditionalInsured] = useState(s?.insurance_additional_insured ?? '');
  const [estimate, setEstimate] = useState(num(s?.insurance_estimate));
  const [billable, setBillable] = useState(s?.insurance_billable ?? true);

  const [actual, setActual] = useState(num(s?.insurance_actual));
  const [provider, setProvider] = useState(s?.insurance_provider ?? 'Full Frame Insurance');
  const [policyRef, setPolicyRef] = useState(s?.insurance_policy_ref ?? '');
  const [documentUrl, setDocumentUrl] = useState(s?.insurance_document_url ?? '');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function post(action: string, body: Record<string, unknown>) {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/portal-insurance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, id: portalId, action, ...body }),
      });
      const data = await res.json();
      if (res.ok && data.success) onSaved();
      else setErr(data.error || `Error ${res.status}`);
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    status === 'purchased'
      ? t.clientDetail.insPurchased
      : status === 'needed'
        ? t.clientDetail.insNeeded
        : status === 'declined'
          ? t.clientDetail.insDeclined
          : t.clientDetail.insNone;

  // Shown against the purchase step only. Alex's rule is to buy once the
  // retainer has landed and the contract is signed, so a cancelled booking
  // never leaves a policy paid for. A warning rather than a block: a wedding
  // three days out with an unsigned contract is exactly when she may need to
  // buy anyway, and a hard gate would be wrong at the worst possible moment.
  const premature = !contractSigned
    ? t.clientDetail.insPrematureContract
    : !retainerPaid
      ? t.clientDetail.insPrematureRetainer
      : null;

  return (
    <Box borderWidth="1px" borderColor="gray.200" borderRadius="md" p={4}>
      <HStack justify="space-between" mb={3}>
        <Text fontWeight="600">{t.clientDetail.insTitle}</Text>
        <Badge colorScheme={status === 'purchased' ? 'green' : status === 'needed' ? 'orange' : 'gray'}>
          {statusLabel}
        </Badge>
      </HStack>

      <VStack align="stretch" spacing={3}>
        <Box>
          <Text fontSize="sm" mb={1}>
            {t.clientDetail.insTrigger}
          </Text>
          <Select
            size="sm"
            value={trigger}
            onChange={(e) => {
              const v = e.target.value;
              setTrigger(v);
              // The contract only allows billing for cover the client caused,
              // so switching to "Vero's own decision" unticks it rather than
              // leaving a charge that the clause would not support.
              setBillable(v !== 'own_choice');
            }}
          >
            <option value="venue_required">{t.clientDetail.insTriggerVenue}</option>
            <option value="drone">{t.clientDetail.insTriggerDrone}</option>
            <option value="client_request">{t.clientDetail.insTriggerClient}</option>
            <option value="own_choice">{t.clientDetail.insTriggerOwn}</option>
          </Select>
        </Box>

        <Box>
          <Text fontSize="sm" mb={1}>
            {t.clientDetail.insNote}
          </Text>
          <Textarea
            size="sm"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.clientDetail.insNotePlaceholder}
          />
        </Box>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
          <Box>
            <Text fontSize="sm" mb={1}>
              {t.clientDetail.insAdditionalInsured}
            </Text>
            <Input
              size="sm"
              value={additionalInsured}
              onChange={(e) => setAdditionalInsured(e.target.value)}
            />
            <Text fontSize="xs" color="gray.500" mt={1}>
              {t.clientDetail.insAdditionalInsuredHelp}
            </Text>
          </Box>
          <Box>
            <Text fontSize="sm" mb={1}>
              {t.clientDetail.insEstimate}
            </Text>
            <Input
              size="sm"
              inputMode="decimal"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="64"
            />
          </Box>
        </SimpleGrid>

        <Box>
          <Checkbox isChecked={billable} onChange={(e) => setBillable(e.target.checked)}>
            <Text fontSize="sm">{t.clientDetail.insBillable}</Text>
          </Checkbox>
          <Text fontSize="xs" color="gray.500" mt={1}>
            {t.clientDetail.insBillableHelp}
          </Text>
        </Box>

        <CTAButton
          size="sm"
          isDisabled={busy}
          onClick={() =>
            post('save', {
              status: 'needed',
              trigger,
              note,
              billable,
              estimate: estimate === '' ? null : Number(estimate),
              additional_insured: additionalInsured,
            })
          }
        >
          {t.clientDetail.insSave}
        </CTAButton>

        <Box borderTopWidth="1px" borderColor="gray.200" pt={3}>
          <Text fontWeight="600" fontSize="sm" mb={2}>
            {t.clientDetail.insBuy}
          </Text>

          {premature && (
            <Text fontSize="xs" color="orange.600" mb={2}>
              {premature}
            </Text>
          )}

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
            <Box>
              <Text fontSize="sm" mb={1}>
                {t.clientDetail.insActual}
              </Text>
              <Input
                size="sm"
                inputMode="decimal"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="64"
              />
            </Box>
            <Box>
              <Text fontSize="sm" mb={1}>
                {t.clientDetail.insProvider}
              </Text>
              <Input size="sm" value={provider} onChange={(e) => setProvider(e.target.value)} />
            </Box>
            <Box>
              <Text fontSize="sm" mb={1}>
                {t.clientDetail.insPolicyRef}
              </Text>
              <Input size="sm" value={policyRef} onChange={(e) => setPolicyRef(e.target.value)} />
            </Box>
            <Box>
              <Text fontSize="sm" mb={1}>
                {t.clientDetail.insDocumentUrl}
              </Text>
              <Input
                size="sm"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
              />
              <Text fontSize="xs" color="gray.500" mt={1}>
                {t.clientDetail.insDocumentHelp}
              </Text>
            </Box>
          </SimpleGrid>

          <HStack mt={3} spacing={3}>
            <CTAButton
              size="sm"
              isDisabled={busy || actual === ''}
              onClick={() =>
                post('purchase', {
                  actual: Number(actual),
                  provider,
                  policy_ref: policyRef,
                  document_url: documentUrl,
                  additional_insured: additionalInsured,
                  billable,
                })
              }
            >
              {t.clientDetail.insBuy}
            </CTAButton>
            {s?.insurance_charge_id ? (
              <Text fontSize="xs" color="green.600">
                {t.clientDetail.insCharged}
              </Text>
            ) : status === 'purchased' ? (
              <Text fontSize="xs" color="gray.500">
                {t.clientDetail.insNotCharged}
              </Text>
            ) : null}
          </HStack>
        </Box>

        {status !== 'none' && (
          <CTAButton variant="ghost" size="sm" isDisabled={busy} onClick={() => post('clear', {})}>
            {t.clientDetail.insClear}
          </CTAButton>
        )}

        {err && (
          <Text fontSize="sm" color="red.600">
            {err}
          </Text>
        )}
      </VStack>
    </Box>
  );
}
