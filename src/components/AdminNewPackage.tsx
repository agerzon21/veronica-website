/**
 * New Client, with room for a package (2026-10-22, reworked 2026-10-23).
 *
 * Until "+ Add another session" is pressed this is exactly the New Client
 * form, nothing around it. Pressing it turns the screen into a package:
 * every session's form stays mounted with whatever was typed in it, and tabs
 * switch between them, so any session can be changed until the package is
 * created. Session 1 keeps the thread it came from (prefill, its banner and
 * the floating "View conversation"); the others are seeded with the client's
 * details and get the same floating button. When the thread booked more than
 * one shoot (prefill.more_sessions), session 2 opens filled with the second
 * shoot's details, session 3 with the third, and so on.
 *
 * Each form validates and builds its own request (packageMode.onAdd). On
 * Create every form is asked to do that again, so nothing typed after a save
 * is lost; a session that is not complete is opened with its errors showing.
 * Then each is created in order through the same endpoint at its package
 * price. The first sends the client's one email; the rest join quietly
 * (api/portal/_account.ts).
 */

import { Box, Flex, HStack, Input, Text, VStack } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import CTAButton from './ui/CTAButton';
import AdminBackButton from './ui/AdminBackButton';
import ConfirmDialog from './ui/ConfirmDialog';
import AdminNewClient, { type PackageEntry, type SameClientSeed } from './AdminNewClient';
import { prefillForSession, type ClientPrefill } from './clientPrefill';
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
const formIdOf = (id: number) => `package-form-${id}`;

export default function AdminNewPackage({
  adminPassword,
  prefill,
  sameClient,
  onCancel,
  onCreated,
  onSwitchToGalleryOnly,
}: {
  adminPassword: string;
  prefill: ClientPrefill | null;
  sameClient: SameClientSeed | null;
  onCancel: () => void;
  onCreated: () => void;
  onSwitchToGalleryOnly?: () => void;
}) {
  const { t, lang } = useAdminLang();
  const [isPackage, setIsPackage] = useState(false);
  const [forms, setForms] = useState<number[]>([1]);
  const [active, setActive] = useState(1);
  const entriesRef = useRef<Record<number, PackageEntry>>({});
  const [entries, setEntries] = useState<Record<number, PackageEntry>>({});
  const [mode, setMode] = useState<DiscountMode>('usd');
  const [discount, setDiscount] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);

  /** Per form, fixed when it opens: a form reads its prefill once, on mount. */
  const prefillsRef = useRef<Record<number, ClientPrefill | null>>({ 1: prefill });
  /** Which of prefill.more_sessions each later form was opened with. */
  const shootOfRef = useRef<Record<number, number>>({});

  const record = (id: number, entry: PackageEntry) => {
    entriesRef.current = { ...entriesRef.current, [id]: entry };
    setEntries(entriesRef.current);
  };
  /** Ask a form to validate and hand over its request (synchronously, via its own submit). */
  const collect = (id: number): PackageEntry | null => {
    const before = entriesRef.current[id];
    delete entriesRef.current[id];
    const form = document.getElementById(formIdOf(id)) as HTMLFormElement | null;
    form?.requestSubmit();
    const after = entriesRef.current[id] ?? null;
    if (!after && before) entriesRef.current[id] = before;
    setEntries({ ...entriesRef.current });
    return after;
  };

  const seedFrom = (first: PackageEntry | undefined): SameClientSeed => {
    const fb = (first?.body ?? {}) as Record<string, string | null>;
    return {
      label: String(fb.client_display_name ?? sameClient?.label ?? ''),
      fullName: (fb.partner_1_full_name as string | null) ?? sameClient?.fullName ?? null,
      partnerFullName: (fb.partner_2_full_name as string | null) ?? sameClient?.partnerFullName ?? null,
      email: (fb.client_email as string | null) ?? sameClient?.email ?? null,
      phone: (fb.client_phone as string | null) ?? sameClient?.phone ?? null,
    };
  };
  const seed = seedFrom(entries[1]);
  const convo = prefill ? { conversationId: prefill.conversationId, displayName: prefill.displayName } : null;

  const addForm = () => {
    const id = Math.max(...forms) + 1;
    // The next shoot the thread booked that no open form has yet, so removing
    // a session hands its shoot to the next one opened.
    const claimed = new Set(forms.map((f) => shootOfRef.current[f]));
    const index = (prefill?.more_sessions ?? []).findIndex((_, i) => !claimed.has(i));
    const shoot = index >= 0 ? prefill?.more_sessions?.[index] : undefined;
    if (shoot) shootOfRef.current[id] = index;
    prefillsRef.current[id] = prefill && shoot ? prefillForSession(prefill, shoot, seedFrom(entriesRef.current[1])) : null;
    setForms((list) => [...list, id]);
    setActive(id);
    window.scrollTo({ top: 0 });
  };
  const start = (entry: PackageEntry) => {
    record(1, entry);
    setIsPackage(true);
    addForm();
  };
  const switchTo = (id: number) => {
    if (id === active) return;
    collect(active); // keeps the totals current; an incomplete form just shows its errors when reopened
    setError('');
    setActive(id);
    window.scrollTo({ top: 0 });
  };
  const removeForm = (id: number) => {
    setForms((list) => list.filter((x) => x !== id));
    delete entriesRef.current[id];
    setEntries({ ...entriesRef.current });
    setActive(1);
  };

  const saved = forms.filter((id) => entries[id]);
  const split = splitPackage(saved.map((id) => entries[id].summary.regular), mode, parseFloat(discount) || 0);
  const priceOf = (id: number) => split.prices[saved.indexOf(id)] ?? 0;
  const saving = split.regularTotal - split.packageTotal;
  const pct = split.regularTotal ? (Math.round((saving / split.regularTotal) * 1000) / 10).toString() : '0';

  const create = async () => {
    setError('');
    // Every form, again, so nothing typed after a save is left behind.
    const list: Array<{ id: number; entry: PackageEntry }> = [];
    for (const id of forms) {
      const entry = collect(id);
      if (!entry) {
        setActive(id);
        setError(t.newPackage.fixSession(forms.indexOf(id) + 1));
        window.scrollTo({ top: 0 });
        return;
      }
      list.push({ id, entry });
    }
    if (list.length < 2) {
      setError(t.newPackage.needTwo);
      return;
    }
    const fresh = splitPackage(list.map((x) => x.entry.summary.regular), mode, parseFloat(discount) || 0);
    const packageId = uuid();
    const titles = list.map((x) => x.entry.summary.title).filter(Boolean);
    const usedPasswords = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      setProgress({ done: i, total: list.length });
      const s = list[i].entry;
      const price = fresh.prices[i];
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
        quiet: i > 0,
        announce_titles: i === 0 ? titles : undefined,
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
          setError(i === 0 ? data.error || `Server error (${res.status})` : t.newPackage.partialFail(i, list.length, data.error || `Server error (${res.status})`));
          return;
        }
      } catch {
        setProgress(null);
        setError(i === 0 ? t.common.couldNotReach : t.newPackage.partialFail(i, list.length, t.common.couldNotReach));
        return;
      }
    }
    setProgress(null);
    onCreated();
  };

  const tabLabel = (id: number, n: number) => {
    const e = entries[id];
    const fromThread = prefillsRef.current[id]?.session_type;
    return t.newPackage.tabSession(n, e ? cap(e.summary.type) : fromThread ? cap(fromThread) : t.newPackage.tabNew);
  };

  return (
    <Box>
      {isPackage && (
        <Box maxW="760px" mx="auto" mb={6}>
          <Flex align="flex-start" gap={4} mb={5}>
            <AdminBackButton onClick={() => setLeaveOpen(true)} label={t.common.back} />
            <Box>
              <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="brand.accentText">
                {t.newPackage.kicker}
              </Text>
              <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0} mt={0.5}>
                {t.newPackage.headline}
              </Text>
            </Box>
          </Flex>
          <Text fontSize="sm" color="gray.600" mb={4}>{t.newPackage.intro}</Text>
          <Flex gap={2} wrap="wrap" align="center" data-testid="package-tabs">
            {forms.map((id, i) => (
              <CTAButton key={id} variant={id === active ? 'solid' : 'outline'} size="sm" onClick={() => switchTo(id)}>
                {tabLabel(id, i + 1)}
              </CTAButton>
            ))}
            <CTAButton variant="ghost" size="sm" onClick={() => { collect(active); addForm(); }}>
              {t.newPackage.addAnother}
            </CTAButton>
          </Flex>
          {active !== 1 && (
            <Box mt={2}>
              <CTAButton variant="ghost" size="sm" onClick={() => removeForm(active)}>
                {t.newPackage.remove}
              </CTAButton>
            </Box>
          )}
          {error && <Text fontSize="sm" color="red.600" role="alert" mt={3}>{error}</Text>}
        </Box>
      )}

      {/* Every session's form stays mounted with what was typed in it; only the open one shows. */}
      {forms.map((id) => (
        <Box key={id} display={id === active ? 'block' : 'none'} data-testid={`package-form-${id}`}>
          <AdminNewClient
            formId={formIdOf(id)}
            adminPassword={adminPassword}
            prefill={prefillsRef.current[id] ?? null}
            sameClient={id === 1 ? sameClient : seed}
            peekConversation={id === 1 ? null : convo}
            onSwitchToGalleryOnly={id === 1 && !isPackage ? onSwitchToGalleryOnly : undefined}
            onCancel={onCancel}
            onCreated={onCreated}
            packageMode={isPackage ? { onAdd: (entry) => record(id, entry) } : undefined}
            onStartPackage={!isPackage && id === 1 ? start : undefined}
          />
        </Box>
      ))}

      {isPackage && (
        <VStack align="stretch" spacing={5} maxW="760px" mx="auto" mt={6} data-testid="package-screen">
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
                  {forms.map((id, i) => {
                    const e = entries[id];
                    return (
                      <tr key={id}>
                        <td>
                          {e ? `${cap(e.summary.type)}${e.summary.date ? ` · ${fmtAdminDate(e.summary.date, lang)}` : ''}` : tabLabel(id, i + 1)}
                        </td>
                        {e ? (
                          <>
                            <td>{money(e.summary.regular)}</td>
                            <td>{money(priceOf(id))}</td>
                            <td>{money(Number(suggestedRetainer(priceOf(id)) || 0))}</td>
                          </>
                        ) : (
                          <Box as="td" colSpan={3} color="gray.400">{t.newPackage.notSaved}</Box>
                        )}
                      </tr>
                    );
                  })}
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

          <CTAButton
            variant="solid"
            size="lg"
            fullWidth
            onClick={create}
            isDisabled={forms.length < 2 || progress !== null}
            isLoading={progress !== null}
            loadingText={progress ? t.newPackage.creating(progress.done + 1, progress.total) : undefined}
          >
            {t.newPackage.create(forms.length)}
          </CTAButton>
        </VStack>
      )}

      <ConfirmDialog
        isOpen={leaveOpen}
        title={t.newPackage.discardTitle}
        body={t.newPackage.discardBody}
        confirmLabel={t.newClient.discardConfirm}
        cancelLabel={t.common.cancel}
        onConfirm={() => {
          setLeaveOpen(false);
          onCancel();
        }}
        onCancel={() => setLeaveOpen(false)}
      />
    </Box>
  );
}
