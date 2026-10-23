/**
 * Several sessions booked together as a package (2026-10-22).
 *
 * Vero fills in the first session in the ordinary New Client form and presses
 * "+ Add another session". This screen then holds the package: the sessions so
 * far, the discount (dollars or percent), each session's regular price,
 * package price and retainer, and a fresh New Client form for the next
 * session with the client's details already in it. Every session is the
 * exact request that form builds and validates; this screen only sets each
 * one's package price, then creates them in order through the same endpoint.
 * The first one sends the client's invite; the rest join the same login
 * quietly (api/portal/_account.ts), so the client gets one email.
 */

import { Box, Flex, HStack, Input, Text, VStack } from '@chakra-ui/react';
import { useState } from 'react';
import CTAButton from './ui/CTAButton';
import AdminBackButton from './ui/AdminBackButton';
import AdminNewClient, { type PackageEntry, type SameClientSeed } from './AdminNewClient';
import { useAdminLang } from '../i18n/admin';
import { splitPackage, type DiscountMode } from '../data/package';
import { suggestedRetainer } from '../data/retainer';
import { fmtAdminDate } from '../utils/adminDate';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const cap = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export default function AdminNewPackage({
  adminPassword,
  first,
  onCancel,
  onCreated,
}: {
  adminPassword: string;
  first: PackageEntry;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { t, lang } = useAdminLang();
  const [sessions, setSessions] = useState<PackageEntry[]>([first]);
  const [mode, setMode] = useState<DiscountMode>('usd');
  const [discount, setDiscount] = useState('');
  const [formOpen, setFormOpen] = useState(true);
  const [formKey, setFormKey] = useState(1);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');

  const b = first.body as Record<string, string | null>;
  const seed: SameClientSeed = {
    label: String(b.client_display_name ?? ''),
    fullName: (b.partner_1_full_name as string | null) ?? null,
    partnerFullName: (b.partner_2_full_name as string | null) ?? null,
    email: (b.client_email as string | null) ?? null,
    phone: (b.client_phone as string | null) ?? null,
  };

  const split = splitPackage(sessions.map((s) => s.summary.regular), mode, parseFloat(discount) || 0);
  const saving = split.regularTotal - split.packageTotal;
  const pct = split.regularTotal ? (Math.round((saving / split.regularTotal) * 1000) / 10).toString() : '0';

  const create = async () => {
    if (sessions.length < 2) {
      setError(t.newPackage.needTwo);
      return;
    }
    setError('');
    const packageId = uuid();
    const titles = sessions.map((s) => s.summary.title).filter(Boolean);
    const usedPasswords = new Set<string>();
    for (let i = 0; i < sessions.length; i++) {
      setProgress({ done: i, total: sessions.length });
      const s = sessions[i];
      const price = split.prices[i];
      // Each session needs its own gallery password; the form builds the same
      // one from the same names, so a repeat gets the session type added.
      let galleryPassword = String(s.body.gallery_password ?? '');
      if (usedPasswords.has(galleryPassword.toLowerCase())) galleryPassword = `${galleryPassword}${cap(s.summary.type).replace(/\s+/g, '')}`;
      usedPasswords.add(galleryPassword.toLowerCase());
      const body = {
        ...s.body,
        password: adminPassword,
        gallery_password: galleryPassword,
        contract_total_amount: price,
        contract_retainer_amount: Number(suggestedRetainer(price) || 0),
        package_id: packageId,
        regular_amount: s.summary.regular,
        // The first session's email (invite, or "new session" for an existing
        // client) names them all; the rest add nothing to the client's inbox.
        quiet: i > 0,
        announce_titles: i === 0 ? titles : undefined,
        // The conversation link goes on the first session only.
        link_to_conversation_id: i === 0 ? s.body.link_to_conversation_id ?? null : null,
      };
      try {
        const res = await fetch('/api/admin/portals-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setProgress(null);
          if (i === 0) setError(data.error || `Server error (${res.status})`);
          else setError(t.newPackage.partialFail(i, sessions.length, data.error || `Server error (${res.status})`));
          return;
        }
      } catch {
        setProgress(null);
        setError(i === 0 ? t.common.couldNotReach : t.newPackage.partialFail(i, sessions.length, t.common.couldNotReach));
        return;
      }
    }
    setProgress(null);
    onCreated();
  };

  return (
    <Box maxW="760px" mx="auto">
      <Flex align="flex-start" gap={4} mb={6}>
        <AdminBackButton onClick={onCancel} label={t.common.back} />
        <Box>
          <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="brand.accentText">
            {t.newPackage.kicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0} mt={0.5}>
            {t.newPackage.headline}
          </Text>
        </Box>
      </Flex>

      <VStack align="stretch" spacing={5} data-testid="package-screen">
        <Text fontSize="sm" color="gray.600">{t.newPackage.intro}</Text>

        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" p={{ base: 4, md: 5 }}>
          <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500" mb={3}>
            {t.newPackage.sessionsLabel}
          </Text>
          <VStack align="stretch" spacing={2}>
            {sessions.map((s, i) => (
              <Flex key={i} justify="space-between" align="baseline" gap={3} wrap="wrap" borderBottom="1px solid" borderColor="gray.100" pb={2} data-testid="package-session">
                <Box minW={0}>
                  <Text fontSize="md" color="gray.800">{s.summary.title || cap(s.summary.type)}</Text>
                  <Text fontSize="sm" color="gray.500">{cap(s.summary.type)}{s.summary.date ? ` · ${fmtAdminDate(s.summary.date, lang)}` : ''}</Text>
                </Box>
                <HStack spacing={3}>
                  <Text fontSize="sm" color="gray.700" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(s.summary.regular)}</Text>
                  {/* The first session stays (it is the one the form started with);
                      its row keeps the same space so the prices line up. */}
                  <Box visibility={i > 0 ? 'visible' : 'hidden'} aria-hidden={i === 0}>
                    <CTAButton variant="ghost" size="sm" onClick={() => setSessions((list) => list.filter((_, j) => j !== i))}>
                      {t.newPackage.remove}
                    </CTAButton>
                  </Box>
                </HStack>
              </Flex>
            ))}
          </VStack>
        </Box>

        {formOpen ? (
          <Box border="1px dashed" borderColor="brand.accent" borderRadius="md" p={{ base: 2, md: 3 }} data-testid="package-next-form">
            <Flex justify="space-between" align="center" px={2} pt={1} pb={2}>
              <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="brand.accentText">
                {t.newPackage.nextSession}
              </Text>
              {sessions.length > 1 && (
                <CTAButton variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                  {t.newPackage.cancelSession}
                </CTAButton>
              )}
            </Flex>
            <AdminNewClient
              key={formKey}
              adminPassword={adminPassword}
              sameClient={seed}
              packageMode={{
                onAdd: (entry) => {
                  setSessions((list) => [...list, entry]);
                  setFormOpen(false);
                  setFormKey((k) => k + 1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                },
              }}
              onCancel={() => (sessions.length > 1 ? setFormOpen(false) : onCancel())}
              onCreated={() => {}}
            />
          </Box>
        ) : (
          <CTAButton variant="outline" size="md" onClick={() => setFormOpen(true)}>
            {t.newPackage.addAnother}
          </CTAButton>
        )}

        {sessions.length > 1 && (
          <Box bg="#fbf6ec" border="1px solid" borderColor="brand.accentBorder" borderRadius="md" p={{ base: 4, md: 5 }} data-testid="package-box">
            <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="brand.accentText" mb={3}>
              {t.newPackage.discountLabel}
            </Text>
            <HStack spacing={2} mb={4} align="stretch">
              <Input
                id="package-discount"
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                maxW="140px"
                bg="white"
                h="40px"
              />
              <HStack spacing={0} border="1px solid" borderColor="gray.300" borderRadius="md" overflow="hidden">
                {(['usd', 'pct'] as const).map((m) => (
                  <Box
                    key={m}
                    as="button"
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    data-testid={`discount-${m}`}
                    px={4}
                    h="40px"
                    bg={mode === m ? 'brand.accentText' : 'white'}
                    color={mode === m ? 'white' : 'gray.600'}
                    fontSize="sm"
                  >
                    {m === 'usd' ? '$' : '%'}
                  </Box>
                ))}
              </HStack>
            </HStack>
            <Box overflowX="auto">
              <Box as="table" w="100%" fontSize="sm" sx={{ fontVariantNumeric: 'tabular-nums', 'th, td': { py: 1.5, px: 1, borderBottom: '1px solid', borderColor: 'brand.accentBorder', textAlign: 'right' }, 'th:first-of-type, td:first-of-type': { textAlign: 'left' } }} data-testid="package-table">
                <thead>
                  <tr>
                    {[t.newPackage.colSession, t.newPackage.colRegular, t.newPackage.colPackage, t.newPackage.colRetainer].map((h) => (
                      <Box as="th" key={h} fontSize="2xs" fontWeight="500" letterSpacing="0.14em" textTransform="uppercase" color="gray.500">{h}</Box>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={i}>
                      <td>{cap(s.summary.type)}</td>
                      <td>{money(s.summary.regular)}</td>
                      <td>{money(split.prices[i])}</td>
                      <td>{money(Number(suggestedRetainer(split.prices[i]) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <Box as="td" fontWeight="500">{t.newPackage.total}</Box>
                    <Box as="td" fontWeight="500">{money(split.regularTotal)}</Box>
                    <Box as="td" fontWeight="500">{money(split.packageTotal)}</Box>
                    <td />
                  </tr>
                </tfoot>
              </Box>
            </Box>
            <Text fontSize="sm" color="green.700" fontWeight="500" mt={3}>{t.newPackage.saving(money(saving), pct)}</Text>
            <Text fontSize="xs" color="gray.500" mt={1.5}>{t.newPackage.splitNote}</Text>
          </Box>
        )}

        {error && <Text fontSize="sm" color="red.600" role="alert">{error}</Text>}

        <CTAButton
          variant="solid"
          size="lg"
          fullWidth
          onClick={create}
          isDisabled={sessions.length < 2 || progress !== null}
          isLoading={progress !== null}
          loadingText={progress ? t.newPackage.creating(progress.done + 1, progress.total) : undefined}
        >
          {sessions.length < 2 ? t.newPackage.needTwo : t.newPackage.create(sessions.length)}
        </CTAButton>
      </VStack>
    </Box>
  );
}
