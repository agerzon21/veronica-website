import { Box, VStack, Text, Flex, HStack, Icon, Input, Checkbox, SimpleGrid, useToast, Collapse } from '@chakra-ui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FaCopy, FaSync, FaCheck, FaUndo } from 'react-icons/fa';
import SignatureCanvas from 'react-signature-canvas';
import type SignatureCanvasType from 'react-signature-canvas';
import ClientGallery, { type DriveFile, type FolderSection } from './ClientGallery';
import CTAButton from './ui/CTAButton';
import type { ContractTemplate } from '../data/contract-template';

// Full client portal payload — mirrors the shape returned by
// /api/portal/client. Each field group is annotated with which phase
// of the rollout populates / consumes it.
export interface ClientPortalData {
  mode: 'full';
  client_name: string | null;
  client_email: string;
  drive_url: string | null;
  rootFiles: DriveFile[];
  sections: FolderSection[];
  warning?: string;

  // Contract — Phase 2
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_signed_at: string | null;
  contract_body: string | null;
  contract_signed_pdf_available: boolean;

  // Payment — Phase 3
  contract_total_amount: number | null;
  contract_retainer_amount: number | null;
  paid_to_date: number;
  payment_plan_enabled: boolean;
  installments: Array<{
    installment_number: number;
    amount: number;
    due_date: string;
    paid_at: string | null;
    paid_amount: number | null;
    payment_method: string | null;
  }>;
  // Itemized log of payments Veronika has recorded against this booking.
  payments: Array<{
    id: string;
    amount: number;
    method: string | null;
    note: string | null;
    paid_at: string;
  }>;

  // Gallery Pass settings — Phase 1c
  gallery_password: string;
  gallery_enabled: boolean;

  // Gallery hosting — surfaced in the UI as the "available until" line
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;
}

interface ClientPortalViewProps {
  data: ClientPortalData;
  // Re-auth credentials for actions that mutate portal state (rotate the
  // Gallery Pass, sign the contract, etc.). The credentials live in the
  // Portal page's React state only — never persisted to storage — so a
  // tab refresh boots the client back to the login form. Acceptable for
  // this MVP; sessions can come later.
  credentials: { email: string; password: string };
  onDataUpdate: (data: ClientPortalData) => void;
  // Fired after the client changes their password from the Account
  // section. Parent (Portal.tsx) uses this to keep its cached
  // credentials.password in sync — without it, the next mutating
  // request (rotate gallery pass, sign contract, etc.) would fail
  // authentication because the parent would still be sending the old
  // password.
  onPasswordChanged?: (newPassword: string) => void;
}

const formatMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const formatDate = (iso: string) => {
  // event_date, due_date, and similar date-only fields come back from
  // Postgres as midnight-UTC timestamps. Without timeZone='UTC' the
  // formatter would render them in the viewer's local timezone, sliding
  // dates back a day in any negative UTC offset. Using UTC consistently
  // here means typed-date matches displayed-date everywhere. The trade-
  // off is that timestamps within an hour or two of UTC midnight may
  // appear as the "next" day relative to the viewer's local clock; for
  // date-level display (payments, signed-at, expires) that's a fair
  // call.
  const datePart = iso.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

// Detect whether Vercel has deployed a new build since this page loaded.
//
// How: Vite writes the main JS bundle with a content-hashed filename
// (e.g. /assets/index.BcH27ukN.js). Every deploy changes the hash and
// updates the <script src> in index.html. So if we fetch the current
// index.html and its script src differs from the one WE loaded, a new
// deploy has landed.
//
// Called from the portal's Refresh button — if this returns true we do
// a full window.location.reload() to pick up the new bundle. Falls
// through silently (returns false) on any failure so a network hiccup
// never breaks the normal data-refresh path.
async function hasNewerDeploy(): Promise<boolean> {
  try {
    const currentBundle = Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[src]'),
    )
      .map((s) => s.getAttribute('src') ?? '')
      .find((src) => src.includes('/assets/index.') && src.endsWith('.js'));
    if (!currentBundle) return false;

    // Fetch the live index.html for this route. cache: 'no-store' is
    // belt-and-suspenders on top of the vercel.json no-cache header —
    // guarantees we're seeing what the CDN would serve fresh, not
    // some proxy cache in between.
    const res = await fetch(window.location.pathname, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return false;
    const html = await res.text();
    const match = html.match(
      /src=["']([^"']*\/assets\/index\.[^"']+\.js)["']/,
    );
    if (!match) return false;
    return match[1] !== currentBundle;
  } catch {
    return false;
  }
}

const ClientPortalView = ({ data, credentials, onDataUpdate, onPasswordChanged }: ClientPortalViewProps) => {
  const remaining =
    data.contract_total_amount !== null
      ? data.contract_total_amount - data.paid_to_date
      : null;

  // ─── Gallery Pass management state ───
  const toast = useToast();
  const [gpUpdating, setGpUpdating] = useState(false);
  const [gpCustomOpen, setGpCustomOpen] = useState(false);
  const [gpCustomValue, setGpCustomValue] = useState('');
  const [gpError, setGpError] = useState('');
  const [gpCopied, setGpCopied] = useState(false);

  // ─── Refresh ───
  // Page reload would log them out (credentials live in state), so a
  // soft refresh button is genuinely useful — most relevant right
  // after they've sent a payment and want to see Vero's "Payment
  // Received" entry show up without losing the session.
  const [refreshing, setRefreshing] = useState(false);
  // When Vercel has deployed a newer build since this page loaded, we
  // surface a small notice under the Refresh button with a "Reload" CTA.
  // We don't force-reload — that would log the client out mid-task,
  // which is much more annoying than briefly missing a new feature.
  // The client decides when to reload (e.g. after they finish signing
  // the contract or sharing a gallery link).
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Check for a new build in parallel with the data fetch. If one
      // landed, we just flag it — the client keeps their session and
      // sees the notice when they're ready to act on it.
      const [newer, res] = await Promise.all([
        hasNewerDeploy(),
        fetch('/api/portal/client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        }),
      ]);
      if (newer) setUpdateAvailable(true);
      const fresh = await res.json();
      if (res.ok && fresh.success) {
        onDataUpdate(fresh as ClientPortalData);
      }
    } catch {
      // Swallow — user can just click again. No toast clutter.
    } finally {
      setRefreshing(false);
    }
  };

  // ─── Sharing state ───
  // shareUrl is derived from gallery_password (no need to store it, just
  // recompute below). The copy / invite states live here.
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<
    { kind: 'error' | 'success'; text: string } | null
  >(null);
  const [invitesRemaining, setInvitesRemaining] = useState<number | null>(null);

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://vero.photography'}/portal/pass?password=${encodeURIComponent(data.gallery_password)}`;

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 2000);
    } catch {
      toast({ title: 'Could not copy', status: 'error', duration: 2000 });
    }
  };

  const handleSendInvite = async () => {
    setInviteMessage(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      setInviteMessage({ kind: 'error', text: 'Enter a valid email address.' });
      return;
    }
    setInviteSending(true);
    try {
      const res = await fetch('/api/portal/share-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, target_email: inviteEmail.trim() }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setInviteMessage({
          kind: 'success',
          text: `Invite sent to ${inviteEmail.trim()}.`,
        });
        setInviteEmail('');
        if (typeof result.remaining_today === 'number') {
          setInvitesRemaining(result.remaining_today);
        }
      } else {
        setInviteMessage({
          kind: 'error',
          text: result.error || 'Could not send the invite.',
        });
      }
    } catch {
      setInviteMessage({ kind: 'error', text: 'Could not reach the server.' });
    } finally {
      setInviteSending(false);
    }
  };

  // Single helper for every gallery-pass action — auth + the action are
  // all server-side, this just dispatches and folds the new state back into
  // the parent's clientData so the rest of the view stays in sync.
  const callGalleryPass = async (
    body:
      | { action: 'rotate' }
      | { action: 'enable' }
      | { action: 'disable' }
      | { action: 'set'; customPassword: string },
  ): Promise<boolean> => {
    setGpUpdating(true);
    setGpError('');
    try {
      const res = await fetch('/api/portal/gallery-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, ...body }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        onDataUpdate({
          ...data,
          gallery_password: result.gallery_password,
          gallery_enabled: result.gallery_enabled,
        });
        return true;
      }
      setGpError(result.error || 'Could not update the gallery pass.');
      return false;
    } catch {
      setGpError('Could not reach the server. Please try again.');
      return false;
    } finally {
      setGpUpdating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.gallery_password);
      setGpCopied(true);
      setTimeout(() => setGpCopied(false), 2000);
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Long-press the password to copy it manually.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleSetCustom = async () => {
    const trimmed = gpCustomValue.trim();
    if (trimmed.length < 4) {
      setGpError('Custom password must be at least 4 characters.');
      return;
    }
    const ok = await callGalleryPass({ action: 'set', customPassword: trimmed });
    if (ok) {
      setGpCustomOpen(false);
      setGpCustomValue('');
    }
  };

  return (
    <Box bg="white" minH="100vh" pt="72px">
      {/* ─── Header ─── */}
      <Box px={{ base: 4, md: 8 }} py={{ base: 8, md: 12 }} textAlign="center">
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="#c9a96e"
          mb={3}
        >
          Your Portal
        </Text>
        <Box w="40px" h="1px" bg="#c9a96e" mx="auto" mb={5} />
        <Text
          as="h1"
          fontSize={{ base: '2xl', md: '3xl' }}
          fontWeight="200"
          color="gray.800"
          letterSpacing="0.02em"
          m={0}
        >
          {data.client_name ? `Welcome, ${data.client_name}` : 'Welcome'}
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300" mt={2}>
          {data.client_email}
        </Text>
        <Box
          as="button"
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          mt={3}
          display="inline-flex"
          alignItems="center"
          gap={1.5}
          fontSize="xs"
          letterSpacing="0.2em"
          textTransform="uppercase"
          color="gray.500"
          bg="transparent"
          border="none"
          cursor={refreshing ? 'wait' : 'pointer'}
          _hover={{ color: '#c9a96e' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Icon
            as={FaSync}
            boxSize={2.5}
            sx={
              refreshing
                ? { animation: 'spin 1s linear infinite' }
                : undefined
            }
          />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Box>
        {/* Update-available notice — surfaces when Refresh detected a
            newer build. Non-blocking; the client keeps their session
            and can reload when they're ready. Signing back in is a
            fine cost for seeing the latest UI. */}
        {updateAvailable && (
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            align="center"
            justify="center"
            gap={2}
            mt={3}
            px={4}
            py={2}
            bg="#fff8e6"
            borderTop="1px solid"
            borderBottom="1px solid"
            borderColor="#e8d9a8"
            maxW="fit-content"
            mx="auto"
          >
            <Text fontSize="xs" color="gray.700" fontWeight="300">
              A newer version of the portal is available.
            </Text>
            <Box
              as="button"
              type="button"
              onClick={() => window.location.reload()}
              fontSize="xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.15em"
              color="#c9a96e"
              bg="transparent"
              border="none"
              cursor="pointer"
              _hover={{ color: '#b8964f' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Reload →
            </Box>
          </Flex>
        )}
      </Box>
      {/* Keyframes for the refresh spinner */}
      <Box
        as="style"
        dangerouslySetInnerHTML={{
          __html: '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
        }}
      />

      {/* ─── Contract section ───
          Pending: shows the consent checkbox + signature pad + sign button.
          Signed: shows the date + a download link to the signed PDF (served
          via Drive's standard download endpoint).
          Other (none/void): empty.
      */}
      {data.contract_status === 'pending' && (
        <ContractSignSection
          credentials={credentials}
          contractBody={data.contract_body}
          onSigned={(updates) => onDataUpdate({ ...data, ...updates })}
        />
      )}
      {data.contract_status === 'signed' && data.contract_signed_at && (
        <SignedContractSection
          credentials={credentials}
          signedAt={data.contract_signed_at}
          pdfAvailable={data.contract_signed_pdf_available}
        />
      )}

      {/* Next-steps panel: lives between the signed contract status and
          the balance section. Surfaces what the client owes RIGHT NOW.
          - Contract signed but retainer not paid → big push to send the
            retainer (it's the bit that actually reserves the date).
          - Retainer paid but balance still outstanding → softer
            reminder about the balance window.
          - Paid in full → no nudge. */}
      <NextStepsPanel
        contractStatus={data.contract_status}
        total={data.contract_total_amount}
        retainer={data.contract_retainer_amount}
        paidToDate={data.paid_to_date}
      />

      {/* ─── Payment / Balance section — Phase 3 fills this in fully.
            For now, surface the totals so it's visible end-to-end. ─── */}
      {data.contract_total_amount !== null && remaining !== null && (
        <Box py={{ base: 10, md: 12 }} px={6}>
          <VStack spacing={4} maxW="540px" mx="auto" textAlign="center">
            <Text
              fontSize="xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.25em"
              color="#c9a96e"
            >
              Balance
            </Text>
            <Box w="30px" h="1px" bg="#c9a96e" />
            {/* Equal-width grid keeps the four stats aligned even when
                the Retainer column drops out. On mobile we go to 2x2
                so amounts don't truncate; desktop sits on one row. */}
            <SimpleGrid
              columns={{
                base: 2,
                md: data.contract_retainer_amount !== null && data.contract_retainer_amount > 0 ? 4 : 3,
              }}
              spacing={{ base: 5, md: 8 }}
              w="100%"
            >
              <BalanceStat label="Total" value={formatMoney(data.contract_total_amount)} />
              {data.contract_retainer_amount !== null && data.contract_retainer_amount > 0 && (
                <BalanceStat
                  label="Retainer"
                  value={formatMoney(data.contract_retainer_amount)}
                  note="Part of total"
                />
              )}
              <BalanceStat label="Paid" value={formatMoney(data.paid_to_date)} />
              <BalanceStat
                label="Remaining"
                value={formatMoney(remaining)}
                emphasize={remaining > 0}
              />
            </SimpleGrid>

            {/* Itemized payment log — every entry Veronika has recorded
                (retainer, balance, etc.), with method and notes. Doesn't
                include in-the-future installment plan rows; those live
                below in their own section. */}
            {data.payments.length > 0 && (
              <Box w="100%" pt={6}>
                <Text
                  fontSize="2xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.25em"
                  color="#c9a96e"
                  mb={4}
                >
                  Payments Received
                </Text>
                <VStack spacing={2} align="stretch">
                  {data.payments.map((p) => (
                    <Flex
                      key={p.id}
                      align="center"
                      justify="space-between"
                      bg="white"
                      border="1px solid"
                      borderColor="green.100"
                      borderRadius="sm"
                      px={4}
                      py={3}
                      textAlign="left"
                      gap={3}
                    >
                      <VStack align="start" spacing={0.5} flex="1" minW={0}>
                        <HStack spacing={2} flexWrap="wrap">
                          <Text fontSize="sm" color="gray.800" fontWeight="500">
                            {formatMoney(p.amount)}
                          </Text>
                          {p.method && (
                            <Text fontSize="sm" color="gray.500">
                              · {p.method}
                            </Text>
                          )}
                          <Text fontSize="sm" color="gray.400">
                            · {formatDate(p.paid_at)}
                          </Text>
                        </HStack>
                        {p.note && (
                          <Text fontSize="xs" color="gray.600" fontWeight="300">
                            {p.note}
                          </Text>
                        )}
                      </VStack>
                      <Text
                        fontSize="2xs"
                        fontWeight="500"
                        textTransform="uppercase"
                        letterSpacing="0.15em"
                        color="green.500"
                      >
                        Received
                      </Text>
                    </Flex>
                  ))}
                </VStack>
              </Box>
            )}

            {data.payment_plan_enabled && data.installments.length > 0 && (
              <Box w="100%" pt={6}>
                <Text
                  fontSize="2xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.25em"
                  color="#c9a96e"
                  mb={4}
                >
                  Payment Schedule
                </Text>
                <VStack spacing={3} align="stretch">
                  {data.installments.map((inst) => {
                    const isPaid = inst.paid_at !== null;
                    const isOverdue =
                      !isPaid && new Date(inst.due_date) < new Date();
                    return (
                      <Flex
                        key={inst.installment_number}
                        align="center"
                        justify="space-between"
                        bg="white"
                        border="1px solid"
                        borderColor={isPaid ? 'green.200' : isOverdue ? 'red.200' : 'gray.200'}
                        borderRadius="sm"
                        px={4}
                        py={3}
                        textAlign="left"
                      >
                        <VStack align="start" spacing={0.5}>
                          <Text fontSize="xs" color="gray.500" fontWeight="500">
                            Installment {inst.installment_number}
                          </Text>
                          <Text fontSize="sm" color="gray.700" fontWeight="400">
                            {formatMoney(inst.amount)}
                            <Text as="span" color="gray.400" fontWeight="300">
                              {' · due '}
                              {formatDate(inst.due_date)}
                            </Text>
                          </Text>
                        </VStack>
                        <Text
                          fontSize="2xs"
                          fontWeight="500"
                          textTransform="uppercase"
                          letterSpacing="0.15em"
                          color={
                            isPaid ? 'green.500' : isOverdue ? 'red.500' : 'gray.500'
                          }
                        >
                          {isPaid
                            ? `Paid ${inst.payment_method ? `· ${inst.payment_method}` : ''}`
                            : isOverdue
                              ? 'Overdue'
                              : 'Upcoming'}
                        </Text>
                      </Flex>
                    );
                  })}
                </VStack>
              </Box>
            )}
          </VStack>
        </Box>
      )}

      {/* ─── Gallery hosting expiration banner — surfaces the retention
            window the contract specifies, so the client knows when they
            need to download by. ─── */}
      {data.gallery_expires_at && data.drive_url && (
        <Box bg="#fef9e6" borderTop="1px solid" borderColor="#f0e4b6" py={4} px={6}>
          <Text
            fontSize="xs"
            color="#7a6520"
            fontWeight="400"
            textAlign="center"
            letterSpacing="0.05em"
          >
            Your gallery is available until{' '}
            <Text as="span" fontWeight="600">
              {formatDate(data.gallery_expires_at)}
            </Text>
            . Download what you'd like to keep before then.
          </Text>
        </Box>
      )}

      {/* ─── Photos ───
          Three states, kept mutually exclusive:
          1) No Drive URL set OR Drive folder empty with no listing error →
             "photos will appear once they're ready" placeholder. No
             Drive buttons (nothing to link to yet).
          2) Drive URL set, listing failed (warning) → render the gallery
             (the failure-mode UI inside shows the "previews aren't
             loading" message + a "View in Drive" button so the client
             still has a path to their photos).
          3) Drive URL set, files present → normal gallery. */}
      {(() => {
        const hasFiles =
          data.rootFiles.length > 0 || data.sections.some((s) => s.files.length > 0);
        const ready = data.drive_url && (hasFiles || data.warning);
        if (ready) {
          return (
            <ClientGallery
              clientName={data.client_name}
              driveUrl={data.drive_url!}
              rootFiles={data.rootFiles}
              sections={data.sections}
              warning={data.warning}
            />
          );
        }
        return (
          <Box py={20} px={6} textAlign="center" bg="white">
            <Text fontSize="sm" color="gray.500" fontWeight="300">
              Your photos will appear here once they're ready.
            </Text>
          </Box>
        );
      })()}

      {/* ─── Gallery Pass management ───
          The client owns this control: rotate, disable entirely, or set a
          custom password. All server-side via /api/portal/gallery-pass,
          re-authenticated each call with the credentials passed down from
          the Portal page. */}
      <Box bg="gray.50" py={{ base: 12, md: 14 }} px={6} mt={6}>
        <VStack spacing={4} maxW="520px" mx="auto" textAlign="center">
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            Gallery Pass
          </Text>
          <Box w="30px" h="1px" bg="#c9a96e" />
          <Text fontSize="sm" color="gray.600" lineHeight="1.8" fontWeight="300">
            {data.gallery_enabled
              ? 'Share this password with guests so they can view your photos without your full Client Portal login.'
              : 'Gallery sharing is currently disabled. No one can view your photos with the password below.'}
          </Text>

          {/* Password chip with inline copy button */}
          <Flex
            align="center"
            justify="center"
            gap={3}
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="sm"
            px={5}
            py={3}
            opacity={data.gallery_enabled ? 1 : 0.6}
            transition="opacity 0.2s"
          >
            <Text
              fontSize="md"
              fontWeight="500"
              color="gray.800"
              fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
              letterSpacing="0.05em"
            >
              {data.gallery_password}
            </Text>
            <Box
              as="button"
              type="button"
              onClick={handleCopy}
              aria-label="Copy password"
              p={2}
              borderRadius="sm"
              color="gray.500"
              transition="all 0.2s"
              cursor="pointer"
              _hover={{ color: '#c9a96e', bg: 'gray.100' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={gpCopied ? FaCheck : FaCopy} boxSize={3.5} />
            </Box>
          </Flex>

          {/* Action row — rotate / toggle / custom */}
          <HStack spacing={3} pt={2} flexWrap="wrap" justify="center">
            <CTAButton
              onClick={() => callGalleryPass({ action: 'rotate' })}
              variant="outline"
              size="sm"
              icon={FaSync}
              isLoading={gpUpdating}
              isDisabled={!data.gallery_enabled}
            >
              Rotate
            </CTAButton>
            <CTAButton
              onClick={() =>
                callGalleryPass({ action: data.gallery_enabled ? 'disable' : 'enable' })
              }
              variant="outline"
              size="sm"
              isLoading={gpUpdating}
            >
              {data.gallery_enabled ? 'Disable sharing' : 'Enable sharing'}
            </CTAButton>
            <CTAButton
              onClick={() => setGpCustomOpen((open) => !open)}
              variant="outline"
              size="sm"
              isDisabled={!data.gallery_enabled || gpUpdating}
            >
              {gpCustomOpen ? 'Cancel' : 'Set custom'}
            </CTAButton>
          </HStack>

          {/* Custom-password input — collapses in when "Set custom" is open */}
          {gpCustomOpen && (
            <Flex
              gap={2}
              w="100%"
              maxW="420px"
              direction={{ base: 'column', sm: 'row' }}
              pt={3}
            >
              <Input
                value={gpCustomValue}
                onChange={(e) => setGpCustomValue(e.target.value.toUpperCase())}
                placeholder="ABCD1234"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                h="40px"
                bg="white"
                fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
                fontSize="sm"
                letterSpacing="0.05em"
                _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
              />
              <CTAButton
                onClick={handleSetCustom}
                variant="solid"
                size="sm"
                isLoading={gpUpdating}
                loadingText="Saving..."
              >
                Save
              </CTAButton>
            </Flex>
          )}

          {gpError && (
            <Text fontSize="xs" color="red.500" fontWeight="400" pt={1}>
              {gpError}
            </Text>
          )}

          {/* ─── Share section ───
              Two ways to hand the gallery off to someone:
              1) Copy a one-click direct URL (password embedded). Easiest
                 path — paste into iMessage / WhatsApp / wherever.
              2) Type an email and we send the recipient an "invited by you"
                 message. Rate-limited server-side to 5/24h to keep the
                 sender domain reputation clean. */}
          {data.gallery_enabled && (
            <VStack
              w="100%"
              maxW="480px"
              spacing={5}
              pt={6}
              mt={2}
              borderTop="1px solid"
              borderColor="gray.200"
            >
              <Text
                fontSize="2xs"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.25em"
                color="#c9a96e"
              >
                Share
              </Text>

              {/* Direct link with copy button */}
              <VStack w="100%" spacing={2} align="stretch">
                <Text fontSize="xs" color="gray.500" fontWeight="500" letterSpacing="0.05em">
                  One-click link
                </Text>
                <Flex
                  align="center"
                  gap={2}
                  bg="white"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="sm"
                  px={3}
                  py={2}
                >
                  <Text
                    fontSize="xs"
                    color="gray.700"
                    fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
                    flex="1"
                    minW={0}
                    noOfLines={1}
                    textAlign="left"
                  >
                    {shareUrl}
                  </Text>
                  <Box
                    as="button"
                    type="button"
                    onClick={handleCopyShareLink}
                    aria-label="Copy share link"
                    p={1.5}
                    borderRadius="sm"
                    color="gray.500"
                    transition="all 0.2s"
                    cursor="pointer"
                    _hover={{ color: '#c9a96e', bg: 'gray.100' }}
                    sx={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <Icon as={shareLinkCopied ? FaCheck : FaCopy} boxSize={3} />
                  </Box>
                </Flex>
                <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.5">
                  Send via iMessage, WhatsApp, email — whoever opens it goes straight to the gallery, no password to type.
                </Text>
              </VStack>

              {/* Email invite */}
              <VStack w="100%" spacing={2} align="stretch">
                <Text fontSize="xs" color="gray.500" fontWeight="500" letterSpacing="0.05em">
                  Or send via email
                </Text>
                <Flex
                  gap={2}
                  direction={{ base: 'column', sm: 'row' }}
                >
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="friend@example.com"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    h="40px"
                    bg="white"
                    fontSize="sm"
                    _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
                  />
                  <CTAButton
                    onClick={handleSendInvite}
                    variant="solid"
                    size="sm"
                    isLoading={inviteSending}
                    loadingText="Sending..."
                  >
                    Send Invite
                  </CTAButton>
                </Flex>
                <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.5">
                  We'll email them a note saying you shared the gallery, with the same one-click link.
                  {invitesRemaining !== null && (
                    <> {invitesRemaining} {invitesRemaining === 1 ? 'invite' : 'invites'} left today.</>
                  )}
                </Text>
                {inviteMessage && (
                  <Text
                    fontSize="xs"
                    fontWeight="400"
                    color={inviteMessage.kind === 'error' ? 'red.500' : 'green.600'}
                  >
                    {inviteMessage.text}
                  </Text>
                )}
              </VStack>
            </VStack>
          )}
        </VStack>
      </Box>

      {/* ─── Login password management ───
          Lets the client swap the temp password Vero handed them for one
          they'll actually remember. Collapsed by default; most clients
          only touch this once. Ordered after Gallery Pass so the
          "different from your Gallery Pass above" cue makes sense
          visually — the two are easy to conflate and we should not
          leave any ambiguity about which is which. */}
      <ChangePasswordSection
        credentials={credentials}
        onChanged={onPasswordChanged}
      />
    </Box>
  );
};

const BalanceStat = ({
  label,
  value,
  emphasize,
  note,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  note?: string;
}) => (
  <VStack spacing={1}>
    <Text
      fontSize="2xs"
      fontWeight="500"
      textTransform="uppercase"
      letterSpacing="0.25em"
      color={emphasize ? '#c9a96e' : 'gray.400'}
    >
      {label}
    </Text>
    <Text
      fontSize={{ base: 'xl', md: '2xl' }}
      fontWeight={emphasize ? '400' : '200'}
      color={emphasize ? 'gray.800' : 'gray.600'}
    >
      {value}
    </Text>
    {note && (
      <Text fontSize="2xs" color="gray.400" fontStyle="italic">
        {note}
      </Text>
    )}
  </VStack>
);

/**
 * Post-sign "what's next" panel. Surfaces the most pressing payment
 * step (retainer or balance) with payment-method links so the client
 * isn't left wondering what to do after they sign.
 *
 * Payment-method handles are hardcoded for now — once Vero wants to
 * update them or use different ones per booking, we'll move to env
 * vars (e.g. VERO_VENMO_HANDLE).
 */
// Zelle is bank-app initiated — no public URL, so we just surface the
// phone number with a Copy button. Venmo + Cash App both have public
// /handle URLs that open the in-app payment screen on mobile.
const PAYMENT_HANDLES = {
  zelle: '(570) 909-5707',
  venmo: '@Alex-Gerzon',
  cashapp: '$AlexGerzon',
};

function NextStepsPanel({
  contractStatus,
  total,
  retainer,
  paidToDate,
}: {
  contractStatus: 'none' | 'pending' | 'signed' | 'void';
  total: number | null;
  retainer: number | null;
  paidToDate: number;
}) {
  // Only show after signing, and only when there's something owed.
  if (contractStatus !== 'signed' || total === null) return null;
  if (paidToDate >= total) return null;

  const retainerOutstanding = retainer !== null && retainer > 0 && paidToDate < retainer;
  const retainerToSend = retainerOutstanding ? retainer - paidToDate : 0;
  const balanceOutstanding = !retainerOutstanding && paidToDate < total;
  const balanceToSend = balanceOutstanding ? total - paidToDate : 0;

  return (
    <Box
      bg="linear-gradient(180deg, #fefaf2 0%, #fcf6ea 100%)"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="#f0e4b6"
      py={{ base: 10, md: 12 }}
      px={6}
    >
      <VStack maxW="560px" mx="auto" spacing={5}>
        <VStack spacing={2}>
          <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="#c9a96e">
            Next Step
          </Text>
          <Box w="30px" h="1px" bg="#c9a96e" />
        </VStack>

        {retainerOutstanding ? (
          <VStack spacing={3} textAlign="center">
            <Text fontSize="lg" color="gray.800" fontWeight="400">
              Send your retainer of <strong>${retainerToSend.toFixed(0)}</strong> to reserve the date.
            </Text>
            <Text fontSize="sm" color="gray.600" fontWeight="300" lineHeight="1.7">
              Your contract is signed, but per the agreement the event date isn't officially booked until the retainer arrives. You can send it through any of the methods below — note "retainer" in the comments so Veronika can match it up.
            </Text>
          </VStack>
        ) : (
          <VStack spacing={3} textAlign="center">
            <Text fontSize="lg" color="gray.800" fontWeight="400">
              Remaining balance: <strong>${balanceToSend.toFixed(0)}</strong>
            </Text>
            <Text fontSize="sm" color="gray.600" fontWeight="300" lineHeight="1.7">
              Your retainer's received and your date's reserved. The remaining balance is due per the contract — same methods below.
            </Text>
          </VStack>
        )}

        <VStack spacing={2} w="100%" maxW="380px">
          <PaymentMethodRow label="Zelle" value={PAYMENT_HANDLES.zelle} />
          <PaymentMethodRow
            label="Venmo"
            value={PAYMENT_HANDLES.venmo}
            href={`https://venmo.com/u/${PAYMENT_HANDLES.venmo.replace(/^@/, '')}`}
          />
          <PaymentMethodRow
            label="Cash App"
            value={PAYMENT_HANDLES.cashapp}
            href={`https://cash.app/${PAYMENT_HANDLES.cashapp}`}
          />
        </VStack>

        <Text fontSize="xs" color="gray.500" fontWeight="300" textAlign="center" maxW="440px" lineHeight="1.7">
          Once you've sent it, reply to this booking's email or message Veronika so she can confirm receipt and update your portal.
        </Text>
      </VStack>
    </Box>
  );
}

function PaymentMethodRow({ label, value, href }: { label: string; value: string; href?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard fallback handled by input selection in a textarea elsewhere */
    }
  };

  const body = (
    <Flex
      align="center"
      justify="space-between"
      bg="white"
      border="1px solid"
      borderColor="#f0e4b6"
      borderRadius="sm"
      px={3}
      py={2}
      gap={3}
    >
      <HStack spacing={3}>
        <Text fontSize="xs" fontWeight="500" letterSpacing="0.15em" textTransform="uppercase" color="#c9a96e" minW="64px">
          {label}
        </Text>
        <Text fontSize="sm" color="gray.700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
          {value}
        </Text>
      </HStack>
      <Box
        as="button"
        type="button"
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
          e.preventDefault();
          e.stopPropagation();
          copy();
        }}
        aria-label={`Copy ${label}`}
        p={1.5}
        borderRadius="sm"
        color="gray.500"
        cursor="pointer"
        _hover={{ color: '#c9a96e', bg: 'gray.50' }}
        sx={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Icon as={copied ? FaCheck : FaCopy} boxSize={3} />
      </Box>
    </Flex>
  );

  if (href) {
    return (
      <Box
        as="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        w="100%"
        textDecoration="none"
        _hover={{ textDecoration: 'none' }}
      >
        {body}
      </Box>
    );
  }
  return <Box w="100%">{body}</Box>;
}

/**
 * Signed-state display + download. The PDF lives in a private Vercel Blob
 * store (no direct URL exposed to the browser), so the download button
 * re-auths via /api/portal/download-contract and streams the binary back,
 * which we then trigger a file save on via an in-memory object URL.
 */
function SignedContractSection({
  credentials,
  signedAt,
  pdfAvailable,
}: {
  credentials: { email: string; password: string };
  signedAt: string;
  pdfAvailable: boolean;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  const handleView = async () => {
    setError('');
    setOpening(true);
    try {
      const res = await fetch('/api/portal/download-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) {
        // Error responses are JSON; success is binary.
        const data = await res.json().catch(() => null);
        setError(data?.error || `Could not open (status ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Open in a new tab. The browser's PDF viewer renders inline and has
      // its own download button — covers both "view" and "save" from one
      // action. We hold the object URL for a bit so the new tab has time
      // to fetch it before we revoke.
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error('[download-contract] network error:', err);
      setError('Could not reach the server. Please try again.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <Box
      bg="gray.50"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="gray.100"
      py={{ base: 10, md: 12 }}
      px={6}
    >
      <VStack spacing={4} maxW="500px" mx="auto" textAlign="center">
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="#c9a96e"
        >
          Contract
        </Text>
        <Box w="30px" h="1px" bg="#c9a96e" />
        <Icon as={FaCheck} color="green.500" boxSize={6} />
        <Text fontSize="sm" color="gray.600" lineHeight="1.8" fontWeight="300">
          Signed electronically on {formatDate(signedAt)}.
        </Text>
        {pdfAvailable && (
          <CTAButton
            onClick={handleView}
            variant="outline"
            size="sm"
            isLoading={opening}
            loadingText="Opening..."
          >
            View Signed Copy
          </CTAButton>
        )}
        {error && (
          <Text fontSize="xs" color="red.500" fontWeight="400">
            {error}
          </Text>
        )}
      </VStack>
    </Box>
  );
}

/**
 * Pending-contract signing UI: typed full name + consent checkbox +
 * signature pad. Sends everything to /api/portal/sign-contract which
 * does the heavy lifting (PDF generation, Blob upload, email).
 *
 * Kept as its own component because it owns a fair amount of local state
 * (the signature canvas ref, the typed name, the consent flag, the
 * submitting/error states) — pulling it out keeps ClientPortalView
 * readable as a layout component.
 */
function ContractSignSection({
  credentials,
  contractBody,
  onSigned,
}: {
  credentials: { email: string; password: string };
  contractBody: string | null;
  onSigned: (updates: {
    contract_status: 'signed';
    contract_signed_at: string;
    contract_signed_pdf_available: boolean;
  }) => void;
}) {
  const sigPadRef = useRef<SignatureCanvasType | null>(null);
  const [signerName, setSignerName] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Parse the frozen contract body. If it's missing or malformed, we show a
  // friendly "being prepared" message rather than a sign form pointed at
  // nothing — the endpoint would 409 anyway, but the UI shouldn't promise
  // signing it can't deliver.
  const contract = useMemo<ContractTemplate | null>(() => {
    if (!contractBody) return null;
    try {
      return JSON.parse(contractBody) as ContractTemplate;
    } catch {
      return null;
    }
  }, [contractBody]);

  // Size the signature canvas to its rendered CSS size × devicePixelRatio.
  // Without this, the fixed internal pixel buffer doesn't match the
  // stretched CSS width — pointer events get coordinate-rounded, and the
  // bezier smoothing in signature_pad accumulates that error over long
  // strokes, producing visible drift between cursor and ink.
  useEffect(() => {
    if (!contract) return;
    const pad = sigPadRef.current;
    if (!pad) return;

    const resize = () => {
      const canvas = pad.getCanvas();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [contract]);

  const handleClear = () => {
    sigPadRef.current?.clear();
  };

  const handleSign = async () => {
    setError('');
    if (!consent) {
      setError('Please confirm you intend to sign this contract electronically.');
      return;
    }
    if (signerName.trim().length < 2) {
      setError('Please type your full name to sign.');
      return;
    }
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      setError('Please draw your signature in the box.');
      return;
    }
    const signatureDataUrl = sigPadRef.current.toDataURL('image/png');

    setSubmitting(true);
    try {
      let res: Response;
      try {
        res = await fetch('/api/portal/sign-contract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...credentials,
            signer_name: signerName.trim(),
            signer_signature: signatureDataUrl,
            consent: true,
          }),
        });
      } catch (err) {
        // Genuine network failure (offline, DNS, etc). Distinct from a
        // server response we couldn't parse.
        console.error('[sign-contract] network error:', err);
        setError('Could not reach the server. Please check your connection and try again.');
        return;
      }

      // Read the response as text first so we can show *something* useful
      // even if the body isn't JSON (e.g. Vercel returning an HTML error
      // page). Logging both the status and the raw body to the console
      // makes the failure mode obvious in DevTools.
      const rawBody = await res.text();
      let data: { success?: boolean; error?: string; contract_signed_at?: string } | null = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        console.error('[sign-contract] non-JSON response', { status: res.status, rawBody });
        setError(`Server returned an unexpected response (status ${res.status}). Open the browser console for details.`);
        return;
      }

      if (res.ok && data?.success) {
        onSigned({
          contract_status: 'signed',
          contract_signed_at: data.contract_signed_at!,
          contract_signed_pdf_available: true,
        });
      } else {
        console.error('[sign-contract] server returned error', { status: res.status, data });
        setError(data?.error || `Could not sign the contract (status ${res.status}). Please try again.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!contract) {
    return (
      <Box
        bg="gray.50"
        borderTop="1px solid"
        borderBottom="1px solid"
        borderColor="gray.100"
        py={{ base: 12, md: 14 }}
        px={6}
      >
        <VStack spacing={4} maxW="500px" mx="auto" textAlign="center">
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            Contract
          </Text>
          <Box w="30px" h="1px" bg="#c9a96e" />
          <Text fontSize="sm" color="gray.600" lineHeight="1.8" fontWeight="300">
            Your contract is being prepared. We'll let you know as soon as it's
            ready to sign.
          </Text>
        </VStack>
      </Box>
    );
  }

  return (
    <Box
      bg="gray.50"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="gray.100"
      py={{ base: 12, md: 14 }}
      px={6}
    >
      <VStack spacing={6} maxW="640px" mx="auto">
        <VStack spacing={3}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            Your Contract
          </Text>
          <Box w="35px" h="1px" bg="#c9a96e" />
        </VStack>

        <Text
          fontSize="sm"
          color="gray.600"
          lineHeight="1.8"
          fontWeight="300"
          textAlign="center"
        >
          Please read the contract below. Once you sign, both you and Veronika
          will receive a copy by email, and the signed PDF will be available
          here to download any time.
        </Text>
        <Text
          fontSize="xs"
          color="gray.500"
          lineHeight="1.7"
          fontWeight="300"
          textAlign="center"
          fontStyle="italic"
          maxW="540px"
        >
          If anything looks wrong with your details, or if there's a clause you'd like to adjust or don't fully understand, please reach out to Veronika before signing so she can update it.
        </Text>

        {/* Full contract body. The signature section is skipped — the form
            below replaces it. Page scroll carries the user through; we don't
            trap scroll inside a small box because that hides the document. */}
        <ContractBodyView contract={contract} />

        <VStack spacing={2} pt={2}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            Sign Below
          </Text>
          <Box w="35px" h="1px" bg="#c9a96e" />
        </VStack>

        {/* Typed full name — required for the audit trail */}
        <Box w="100%">
          <Text
            as="label"
            htmlFor="signer-name"
            display="block"
            fontSize="2xs"
            fontWeight="500"
            letterSpacing="0.2em"
            textTransform="uppercase"
            color="#c9a96e"
            mb={2}
          >
            Full Name
          </Text>
          <Input
            id="signer-name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Type your full name"
            h="48px"
            bg="white"
            _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
          />
        </Box>

        {/* Signature canvas */}
        <Box w="100%">
          <Flex justify="space-between" align="center" mb={2}>
            <Text
              fontSize="2xs"
              fontWeight="500"
              letterSpacing="0.2em"
              textTransform="uppercase"
              color="#c9a96e"
            >
              Draw Your Signature
            </Text>
            <Box
              as="button"
              type="button"
              onClick={handleClear}
              fontSize="2xs"
              letterSpacing="0.15em"
              textTransform="uppercase"
              color="gray.500"
              cursor="pointer"
              display="inline-flex"
              alignItems="center"
              gap={1.5}
              _hover={{ color: '#c9a96e' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={FaUndo} boxSize={2.5} />
              Clear
            </Box>
          </Flex>
          <Box
            bg="white"
            border="1px dashed"
            borderColor="gray.300"
            borderRadius="sm"
            overflow="hidden"
            sx={{
              // The canvas inside needs an explicit width to render
              // properly; we let the wrapper drive the visible area.
              '& canvas': {
                display: 'block',
                width: '100% !important',
                height: '180px !important',
                touchAction: 'none',
              },
            }}
          >
            <SignatureCanvas
              ref={sigPadRef}
              penColor="#2d2d2d"
              canvasProps={{
                style: { width: '100%', height: '180px', display: 'block' },
              }}
            />
          </Box>
        </Box>

        {/* Consent checkbox — the ESIGN "intent to sign" requirement */}
        <Checkbox
          isChecked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          colorScheme="yellow"
          alignItems="flex-start"
        >
          <Text fontSize="xs" color="gray.600" lineHeight="1.7" fontWeight="300">
            I agree to sign this contract electronically. I understand this
            signature has the same legal effect as a handwritten one under
            the U.S. ESIGN Act and the Uniform Electronic Transactions Act.
          </Text>
        </Checkbox>

        {error && (
          <Text fontSize="sm" color="red.500" fontWeight="400" textAlign="center">
            {error}
          </Text>
        )}

        <CTAButton
          onClick={handleSign}
          variant="solid"
          size="lg"
          fullWidth
          isLoading={submitting}
          loadingText="Signing..."
        >
          Sign Contract
        </CTAButton>
      </VStack>
    </Box>
  );
}

/**
 * Renders the contract body for in-portal reading. Mirrors the look of the
 * PDF (numbered sections, gold accents, bullets) but in HTML/Chakra so it
 * flows naturally on mobile. Skips the signature_block paragraph — the
 * sign form is the in-portal equivalent.
 */
function ContractBodyView({ contract }: { contract: ContractTemplate }) {
  return (
    <Box
      w="100%"
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      px={{ base: 5, md: 8 }}
      py={{ base: 7, md: 9 }}
    >
      <Text
        fontSize={{ base: 'md', md: 'lg' }}
        fontWeight="500"
        letterSpacing="0.05em"
        textAlign="center"
        color="gray.800"
        mb={6}
      >
        {contract.title}
      </Text>

      <VStack spacing={5} align="stretch">
        {contract.sections.map((section, idx) => {
          const isSignature = section.paragraphs.some(
            (p) => p.kind === 'signature_block',
          );
          if (isSignature) return null;
          return (
            <Box key={idx}>
              <Text
                fontSize="xs"
                fontWeight="600"
                letterSpacing="0.15em"
                textTransform="uppercase"
                color="#c9a96e"
                mb={2}
              >
                {section.number ? `${section.number}. ` : ''}
                {section.title}
              </Text>
              <VStack spacing={2.5} align="stretch">
                {section.paragraphs.map((p, i) => {
                  if (p.kind === 'text') {
                    return (
                      <Text
                        key={i}
                        fontSize="sm"
                        color="gray.700"
                        lineHeight="1.7"
                        fontWeight={p.emphasis === 'bold' ? '500' : '300'}
                        fontStyle={p.emphasis === 'italic' ? 'italic' : 'normal'}
                      >
                        {p.text}
                      </Text>
                    );
                  }
                  if (p.kind === 'bullets') {
                    return (
                      <VStack key={i} spacing={1.5} align="stretch" pl={4}>
                        {p.items.map((item, j) => (
                          <HStack key={j} align="flex-start" spacing={2.5}>
                            <Text color="#c9a96e" fontSize="sm" lineHeight="1.7">
                              •
                            </Text>
                            <Text
                              fontSize="sm"
                              color="gray.700"
                              lineHeight="1.7"
                              fontWeight="300"
                            >
                              {item}
                            </Text>
                          </HStack>
                        ))}
                      </VStack>
                    );
                  }
                  if (p.kind === 'fields') {
                    return (
                      <VStack key={i} spacing={1.5} align="stretch" pl={2}>
                        {p.items.map((f, j) => (
                          <Flex
                            key={j}
                            direction={{ base: 'column', md: 'row' }}
                            align={{ base: 'flex-start', md: 'baseline' }}
                            gap={{ base: 0.5, md: 2 }}
                          >
                            <Text
                              fontSize="sm"
                              color="gray.800"
                              fontWeight="500"
                              lineHeight="1.7"
                              minW={{ md: '170px' }}
                            >
                              {f.label}:
                            </Text>
                            <Text
                              fontSize="sm"
                              color="gray.700"
                              fontWeight="300"
                              lineHeight="1.7"
                              flex="1"
                            >
                              {f.value}
                            </Text>
                          </Flex>
                        ))}
                      </VStack>
                    );
                  }
                  return null;
                })}
              </VStack>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
}

/**
 * Change-password section. Collapsed by default (small "Change password"
 * link on the right); expands to reveal current / new / confirm inputs.
 *
 * We ask for the current password (not just email) so someone with a
 * hijacked but unlocked browser tab can't silently take over the
 * account. Same lightweight re-auth pattern the mutating gallery-pass
 * endpoints use.
 *
 * On success, we call `onChanged(newPassword)` so the parent Portal
 * page can update the cached credentials — otherwise the next mutating
 * API call would still be sending the old password.
 */
function ChangePasswordSection({
  credentials,
  onChanged,
}: {
  credentials: { email: string; password: string };
  onChanged?: (newPassword: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setMessage(null);
  };

  const handleToggle = () => {
    if (open) {
      // Closing — wipe any in-flight edits + banner so reopening is clean.
      reset();
    }
    setOpen((o) => !o);
  };

  const handleSave = async () => {
    setMessage(null);
    if (!current) {
      setMessage({ kind: 'err', text: 'Enter your current password.' });
      return;
    }
    if (next.length < 6) {
      setMessage({ kind: 'err', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (next !== confirm) {
      setMessage({ kind: 'err', text: 'New password and confirmation don’t match.' });
      return;
    }
    if (next === current) {
      setMessage({ kind: 'err', text: 'New password must be different from the current one.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/portal/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          current_password: current,
          new_password: next,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Bubble the new password up so the parent's cached credentials
        // stay in sync. Without this the next mutating call (rotate
        // gallery pass, sign contract) would 401.
        onChanged?.(next);
        setMessage({ kind: 'ok', text: 'Password updated.' });
        setCurrent('');
        setNext('');
        setConfirm('');
        // Collapse after a beat so the success banner is visible first.
        setTimeout(() => {
          setOpen(false);
          setMessage(null);
        }, 2500);
      } else {
        setMessage({ kind: 'err', text: data.error || `Server error (${res.status}).` });
      }
    } catch {
      setMessage({ kind: 'err', text: 'Could not reach the server. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box bg="white" py={{ base: 10, md: 12 }} px={6} borderTop="1px solid" borderColor="gray.100">
      <VStack spacing={4} maxW="520px" mx="auto" textAlign="center">
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="#c9a96e"
        >
          Login Password
        </Text>
        <Box w="30px" h="1px" bg="#c9a96e" />
        <Text fontSize="sm" color="gray.600" lineHeight="1.8" fontWeight="300">
          The password you use to sign in to this portal.
          {' '}
          <Text as="span" color="gray.500">
            (This is separate from the Gallery Pass above, which is what you share with guests.)
          </Text>
        </Text>
        <CTAButton
          onClick={handleToggle}
          variant="outline"
          size="sm"
        >
          {open ? 'Cancel' : 'Change login password'}
        </CTAButton>

        {/* Collapse animates the height + fade in/out instead of an
            instant show/hide. On iOS this matters not just for polish
            — an instant collapse used to snap the page shorter mid-scroll,
            which triggered the rubber-band overscroll past the footer. */}
        <Collapse in={open} animateOpacity>
          <VStack spacing={3} w="100%" maxW="360px" pt={2} mx="auto">
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Current login password"
              autoComplete="current-password"
              h="42px"
              bg="white"
              fontSize="sm"
              _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
            />
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="New login password (min. 6 characters)"
              autoComplete="new-password"
              h="42px"
              bg="white"
              fontSize="sm"
              _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
            />
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new login password"
              autoComplete="new-password"
              h="42px"
              bg="white"
              fontSize="sm"
              _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
            />
            <CTAButton
              onClick={handleSave}
              variant="solid"
              size="sm"
              isLoading={saving}
              loadingText="Saving..."
              fullWidth
            >
              Save
            </CTAButton>
          </VStack>
        </Collapse>

        {message && (
          <Text
            fontSize="xs"
            color={message.kind === 'ok' ? 'green.600' : 'red.500'}
            fontWeight="400"
          >
            {message.text}
          </Text>
        )}
      </VStack>
    </Box>
  );
}

export default ClientPortalView;
