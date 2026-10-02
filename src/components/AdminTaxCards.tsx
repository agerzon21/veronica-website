/**
 * The sales tax cards, moved out of Integrations into the Taxes page
 * (AdminTax.tsx): the PA licence with its quarterly returns, and the report of
 * what goes on each return. Unchanged apart from their address; Integrations
 * keeps a one-line pointer here.
 */

import { Box, VStack, HStack, Text, Badge, Input, Flex, Select } from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';
import CTAButton from './ui/CTAButton';
import { useAdminLang } from '../i18n/admin';
import type { SalesTaxMode } from '../data/sales-tax';
import { easternToday } from '../data/tax-calendar';

/**
 * The PA sales tax licence.
 *
 * Photography is taxable in Pennsylvania whether the photographs arrive as
 * prints or as a download link (61 Pa. Code 32.37), so selling shoots to PA
 * clients requires a Sales, Use and Hotel Occupancy Tax licence. It costs
 * nothing and it lapses after five years, which is precisely the interval
 * that guarantees nobody remembers it: long enough that the confirmation
 * email is unfindable, short enough to matter.
 *
 * Tracked here for the same reason the Instagram token is, and with the same
 * status vocabulary, so one glance at this screen reads the same way for
 * both. The renewal itself is automatic and free, but only while every return
 * has been filed, which is the part worth saying out loud: a licence lapses
 * because returns were missed, not because a renewal was.
 */
interface LicenseState {
  status: 'fresh' | 'aging' | 'overdue' | 'expired' | 'unknown';
  daysUntilExpiry?: number;
  license: {
    numberLast4: string;
    issuedAt: string;
    expiresAt: string;
    state: string;
    note?: string;
    lastFiledPeriod?: string;
  } | null;
  filing?: {
    lastFiled: string | null;
    nextPeriod: string;
    nextDueDate: string;
    nextPeriodEnds: string;
    nextPeriodEnded: boolean;
    daysUntilFiling: number;
    state: 'open' | 'due' | 'overdue';
  };
}

/**
 * The quarters a return could already have been filed for, newest first:
 * every one that has ended, back to the start of last year, plus the saved
 * one if it is older still.
 */
function endedQuarters(saved: string): string[] {
  const [y, m] = easternToday().split('-').map(Number);
  let year = y;
  let q = Math.floor((m - 1) / 3); // the quarter before the current one
  if (q === 0) {
    year -= 1;
    q = 4;
  }
  const out: string[] = [];
  while (year >= y - 1) {
    out.push(`${year}-Q${q}`);
    q -= 1;
    if (q === 0) {
      year -= 1;
      q = 4;
    }
  }
  if (saved && !out.includes(saved)) out.push(saved);
  return out;
}

interface TaxQuarter {
  key: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  dueDate: string;
  grossSales: number;
  taxableSales: number;
  tax: number;
  lines: Array<{ date: string; booking: string; amount: number; mode: SalesTaxMode; sale: number; tax: number }>;
}

/** Cents only when there are some: "$3,855", "$165.30". */
const usd = (n: number): string =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: Math.round(Math.abs(n) * 100) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Pennsylvania sales tax by quarter: the three numbers each myPATH return
 * asks for, and the payments behind them (api/admin/_sales-tax-report.ts).
 *
 * Below the licence card on purpose. That card says WHEN the next return is
 * due; this one says WHAT goes on it. Each quarter opens up into its payments,
 * because a tax figure nobody can check line by line is not one to file.
 */
export function SalesTaxReportCard({ adminPassword }: { adminPassword: string }) {
  const { t, lang } = useAdminLang();
  const [quarters, setQuarters] = useState<TaxQuarter[] | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/sales-tax-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) setQuarters(data.quarters as TaxQuarter[]);
        else setErr(data.error || t.integrations.taxReportFailed);
      } catch {
        if (!cancelled) setErr(t.integrations.taxReportFailed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminPassword, t.integrations.taxReportFailed]);

  const dueLabel = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      p={{ base: 5, md: 7 }}
      mt={6}
    >
      <Text as="h2" fontSize="md" fontWeight="400" color="gray.800" m={0} mb={2}>
        {t.integrations.taxReportTitle}
      </Text>
      <Text fontSize="sm" color="gray.600" mb={4}>
        {t.integrations.taxReportIntro}
      </Text>
      {err && (
        <Text fontSize="sm" color="red.600">
          {err}
        </Text>
      )}
      {quarters && quarters.length === 0 && (
        <Text fontSize="sm" color="gray.500">
          {t.integrations.taxReportNone}
        </Text>
      )}
      <VStack align="stretch" spacing={0}>
        {(quarters ?? []).map((q) => (
          <Box key={q.key} borderTop="1px solid" borderColor="gray.100" py={3}>
            <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} gap={3} wrap="wrap">
              <Box minW={0}>
                <Text fontSize="sm" fontWeight="500" color="gray.800">
                  {t.integrations.taxReportQuarter(q.quarter, q.year)}
                </Text>
                <Text fontSize="xs" color="gray.500">
                  {t.integrations.taxReportDue} {dueLabel(q.dueDate)}
                </Text>
              </Box>
              <CTAButton
                variant="outline"
                size="sm"
                onClick={() => setOpen((o) => (o === q.key ? null : q.key))}
              >
                {open === q.key ? t.integrations.taxReportHide : t.integrations.taxReportShow}
              </CTAButton>
            </Flex>
            <Flex gap={{ base: 4, md: 8 }} mt={2} wrap="wrap" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              <Box>
                <Text fontSize="2xs" color="gray.500" textTransform="uppercase" letterSpacing="0.1em">
                  {t.integrations.taxReportGross}
                </Text>
                <Text fontSize="sm" color="gray.800">{usd(q.grossSales)}</Text>
              </Box>
              <Box>
                <Text fontSize="2xs" color="gray.500" textTransform="uppercase" letterSpacing="0.1em">
                  {t.integrations.taxReportTaxable}
                </Text>
                <Text fontSize="sm" color="gray.800">{usd(q.taxableSales)}</Text>
              </Box>
              <Box>
                <Text fontSize="2xs" color="gray.500" textTransform="uppercase" letterSpacing="0.1em">
                  {t.integrations.taxReportTax}
                </Text>
                <Text fontSize="sm" color="gray.900" fontWeight="600">{usd(q.tax)}</Text>
              </Box>
            </Flex>
            {open === q.key && (
              <VStack align="stretch" spacing={1} mt={3} bg="gray.50" borderRadius="sm" p={3}>
                {q.lines.map((l, i) => (
                  <Flex key={i} justify="space-between" gap={3} fontSize="xs" color="gray.700" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    <Text minW={0} noOfLines={1}>
                      {l.date} · {l.booking}
                    </Text>
                    <Text flexShrink={0} color="gray.500">
                      {usd(l.amount)} · {t.integrations.taxReportModeShort[l.mode]} · {t.integrations.taxReportTax} {usd(l.tax)}
                    </Text>
                  </Flex>
                ))}
              </VStack>
            )}
          </Box>
        ))}
      </VStack>
    </Box>
  );
}

export function SalesTaxLicenseCard({
  adminPassword,
  onChanged,
}: {
  adminPassword: string;
  /** After a save or a "Mark filed", so the Taxes page's deadline list re-reads. */
  onChanged?: () => void;
}) {
  const { t } = useAdminLang();
  const [state, setState] = useState<LicenseState | null>(null);
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [note, setNote] = useState('');
  const [lastFiled, setLastFiled] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/license-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setState(data);
        if (data.license) {
          // Never prefilled from the server: only four digits exist there, and
          // putting them in the edit box invites saving them as the whole number.
          setNumber('');
          setIssuedAt(data.license.issuedAt);
          setNote(data.license.note ?? '');
          setLastFiled(data.license.lastFiledPeriod ?? '');
        }
      }
    } catch {
      /* A card that cannot load is silent, not broken: the rest of the screen still works. */
    }
  }, [adminPassword]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/license-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          action: 'save',
          number,
          issued_at: issuedAt,
          note,
          last_filed_period: lastFiled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setState(data);
        setNumber('');
        setLastFiled(data.license?.lastFiledPeriod ?? '');
        setEditing(false);
        onChanged?.();
      } else {
        setErr(data.error || 'Could not save');
      }
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function markFiled(period: string) {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/license-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, action: 'mark-filed', period }),
      });
      const data = await res.json();
      if (data.success) {
        setState(data);
        setLastFiled(data.license?.lastFiledPeriod ?? '');
        onChanged?.();
      }
      else setErr(data.error || 'Could not save');
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  }

  const lic = state?.license;
  const days = state?.daysUntilExpiry;
  const scheme =
    state?.status === 'fresh'
      ? 'green'
      : state?.status === 'aging'
        ? 'orange'
        : state?.status === 'unknown'
          ? 'gray'
          : 'red';

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      p={{ base: 5, md: 7 }}
      mt={6}
      data-testid="sales-tax-licence-card"
    >
      <HStack justify="space-between" mb={4}>
        <Text as="h2" fontSize="md" fontWeight="400" color="gray.800" m={0}>
          {t.integrations.licTitle}
        </Text>
        {lic && (
          <Badge colorScheme={scheme}>
            {state?.status === 'expired'
              ? t.integrations.licExpired
              : `${days} ${t.integrations.licDaysLeft}`}
          </Badge>
        )}
      </HStack>

      {!lic && !editing && (
        <Text fontSize="sm" color="gray.600" mb={4}>
          {t.integrations.licNone}
        </Text>
      )}

      {lic && !editing && (
        <VStack align="stretch" spacing={1} mb={4}>
          <Text fontSize="sm">
            <strong>{t.integrations.licNumber}:</strong> ••••{lic.numberLast4} ({lic.state})
          </Text>
          <Text fontSize="sm" color="gray.600">
            {t.integrations.licIssued} {lic.issuedAt} · {t.integrations.licExpires} {lic.expiresAt}
          </Text>
          {lic.note && (
            <Text fontSize="sm" color="gray.500">
              {lic.note}
            </Text>
          )}
        </VStack>
      )}

      {editing && (
        <VStack align="stretch" spacing={3} mb={4}>
          <Box>
            <Text fontSize="sm" mb={1}>
              {t.integrations.licNumber}
            </Text>
            <Input
              size="sm"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={lic ? `••••${lic.numberLast4}` : undefined}
            />
            <Text fontSize="xs" color="gray.500" mt={1}>
              {t.integrations.licNumberHelp}
              {lic && ` ${t.integrations.licNumberKeep}`}
            </Text>
          </Box>
          <Box>
            <Text fontSize="sm" mb={1}>
              {t.integrations.licIssued}
            </Text>
            <Input
              size="sm"
              type="date"
              value={issuedAt}
              onChange={(e) => setIssuedAt(e.target.value)}
            />
            {/* Only once there is a date: a dash standing in for a missing
                value is still a dash on a screen Alex reads. */}
            {issuedAt && (
              <Text fontSize="xs" color="gray.500" mt={1}>
                {t.integrations.licExpires}: {`${Number(issuedAt.slice(0, 4)) + 5}${issuedAt.slice(4)}`}
              </Text>
            )}
          </Box>
          <Box>
            <Text as="label" htmlFor="lic-last-filed" fontSize="sm" mb={1} display="block">
              {t.integrations.licLastFiledField}
            </Text>
            <Select id="lic-last-filed" size="sm" value={lastFiled} onChange={(e) => setLastFiled(e.target.value)}>
              <option value="">{t.integrations.licNeverFiled}</option>
              {endedQuarters(lastFiled).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Text fontSize="xs" color="gray.500" mt={1}>
              {t.integrations.licLastFiledHelp}
            </Text>
          </Box>
          <Box>
            <Text fontSize="sm" mb={1}>
              {t.integrations.licNote}
            </Text>
            <Input
              size="sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.integrations.licNotePlaceholder}
            />
          </Box>
          {err && (
            <Text fontSize="sm" color="red.600">
              {err}
            </Text>
          )}
        </VStack>
      )}

      {lic && state?.filing && !editing && (
        <Box borderTopWidth="1px" borderColor="gray.200" pt={3} mb={3}>
          <HStack justify="space-between" mb={2}>
            <Text fontSize="sm" fontWeight="500">
              {t.integrations.licFilingTitle}
            </Text>
            <Badge
              colorScheme={
                state.filing.state === 'overdue'
                  ? 'red'
                  : state.filing.state === 'due'
                    ? 'orange'
                    : 'green'
              }
            >
              {state.filing.state === 'overdue'
                ? t.integrations.licOverdue
                : `${state.filing.daysUntilFiling} ${t.integrations.licDaysLeft}`}
            </Badge>
          </HStack>
          <Text fontSize="sm" color="gray.700">
            {t.integrations.licNextDue}: <strong>{state.filing.nextPeriod}</strong>,{' '}
            {t.integrations.licDueOn} {state.filing.nextDueDate}
          </Text>
          <Text fontSize="sm" color="gray.500" mb={2}>
            {t.integrations.licLastFiled}:{' '}
            {state.filing.lastFiled ?? t.integrations.licNeverFiled}
          </Text>
          {state.filing.nextPeriodEnded ? (
            <CTAButton
              size="sm"
              variant="ghost"
              isDisabled={busy}
              onClick={() => markFiled(state.filing!.nextPeriod)}
            >
              {t.integrations.licMarkFiled} {state.filing.nextPeriod}
            </CTAButton>
          ) : (
            // A quarter still running cannot have been filed, and marking it
            // would stop its reminder emails.
            <Text fontSize="sm" color="gray.500" data-testid="lic-not-ended">
              {t.integrations.licNotEnded(state.filing.nextPeriod, state.filing.nextPeriodEnds)}
            </Text>
          )}
          <Text fontSize="xs" color="gray.500" mt={2}>
            {t.integrations.licQuartersNote}
          </Text>
        </Box>
      )}

      <Text fontSize="xs" color="gray.500" mb={3}>
        {t.integrations.licRenewNote}
      </Text>

      {editing ? (
        <HStack spacing={3}>
          <CTAButton size="sm" isDisabled={busy || (!number && !lic) || !issuedAt} onClick={save}>
            {t.integrations.licSave}
          </CTAButton>
          <CTAButton size="sm" variant="ghost" isDisabled={busy} onClick={() => setEditing(false)}>
            {t.common.cancel}
          </CTAButton>
        </HStack>
      ) : (
        <CTAButton size="sm" onClick={() => setEditing(true)}>
          {lic ? t.common.edit : t.integrations.licSave}
        </CTAButton>
      )}
    </Box>
  );
}
