import { Box, VStack, Stack, Text, Input, Flex, Icon, Textarea } from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import { FaCheck, FaCopy } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import AdminBackButton from './ui/AdminBackButton';
import SessionTypePicker from './SessionTypePicker';
import { useAdminLang } from '../i18n/admin';

interface Props {
  adminPassword: string;
  onCancel: () => void;
  onCreated: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────

// Titlecase a name, but preserve internal capitalization (McKenna,
// DeAndre, MacDonald). Pure all-lower or all-upper still gets
// normalized to "Capitalized".
const cap = (s: string) => {
  if (!s) return '';
  const tail = s.slice(1);
  const hasInternalUpper = /[A-Z]/.test(tail);
  const hasInternalLower = /[a-z]/.test(tail);
  if (hasInternalUpper && hasInternalLower) {
    return s.charAt(0).toUpperCase() + tail;
  }
  return s.charAt(0).toUpperCase() + tail.toLowerCase();
};

const firstWord = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? '';

// "Portrait Alex Smith 2026" → "PortraitAlexSmith2026"
const stripSpaces = (s: string) => s.replace(/\s+/g, '');

// Auto-builds the event/display name from session type + client name + year.
// e.g. ('portrait', 'Alex Smith', '2026') → 'Portrait Alex Smith 2026'
const buildDisplayName = (sessionType: string, clientName: string, year: string): string => {
  const s = cap(sessionType.trim());
  const c = clientName.trim();
  if (!s && !c) return '';
  return [s, c, year].filter(Boolean).join(' ');
};

// "2026-09-25" → "September 25, 2026"
// Kept English-only on purpose: this string lands in the share message
// that Vero sends to clients (who are almost always English-speaking).
// Not part of the admin UI language.
const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

// The full share message stays English on purpose — it's copy that Vero
// sends to her (English-speaking) clients, not admin UI. Do not wrap in
// the i18n dict.
const buildShareMessage = (
  firstName: string,
  expiresIso: string | null,
  galleryPassword: string,
): string => {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const expLine = expiresIso
    ? `\nThe gallery will stay online until ${fmtDate(expiresIso)}. Please download and back up your favourites before then.\n`
    : '';
  const directUrl = `https://vero.photography/portal/pass?password=${encodeURIComponent(galleryPassword)}`;
  return `${greeting}

Your photos are ready ✨

Open your gallery (one-click access):
${directUrl}

If that link doesn't work, you can also go to https://vero.photography/portal/pass and enter the password manually:

Password: ${galleryPassword}
${expLine}
If you have any questions or want to order prints, just reply to this message.

Warmly,
Veronika`;
};

// ─── Component ─────────────────────────────────────────────────────────

interface SuccessState {
  displayName: string;
  galleryPassword: string;
  firstName: string;
  driveDelivered: boolean;
  expiresIso: string | null;
  emailWasSent: boolean;
}

const AdminNewGalleryOnly = ({ adminPassword, onCancel, onCreated }: Props) => {
  const { t } = useAdminLang();
  const [sessionType, setSessionType] = useState('portrait');
  const [clientName, setClientName] = useState('');
  const [eventDateIso, setEventDateIso] = useState('');

  // Auto-derived display name (overridable)
  const [displayNameOverride, setDisplayNameOverride] = useState<string | null>(null);
  const [galleryPasswordOverride, setGalleryPasswordOverride] = useState<string | null>(null);

  const [driveUrl, setDriveUrl] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [retentionMonths, setRetentionMonths] = useState('3');
  const [totalAmount, setTotalAmount] = useState('');
  const [retainerAmount, setRetainerAmount] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<SuccessState | null>(null);

  // Derive year + display name + password from the top inputs.
  const year = eventDateIso ? eventDateIso.slice(0, 4) : new Date().getFullYear().toString();
  const derivedDisplayName = useMemo(
    () => buildDisplayName(sessionType, clientName, year),
    [sessionType, clientName, year],
  );
  const displayName = displayNameOverride ?? derivedDisplayName;
  const derivedPassword = useMemo(
    () => (displayName ? stripSpaces(displayName) : ''),
    [displayName],
  );
  const galleryPassword = galleryPasswordOverride ?? derivedPassword;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!sessionType.trim()) {
      setError(t.newGallery.errors.sessionTypeRequired);
      return;
    }
    if (!clientName.trim()) {
      setError(t.newGallery.errors.clientNameRequired);
      return;
    }
    if (!displayName.trim()) {
      setError(t.newGallery.errors.displayNameRequired);
      return;
    }
    if (!galleryPassword.trim()) {
      setError(t.newGallery.errors.galleryPasswordRequired);
      return;
    }
    const months = Number(retentionMonths);
    if (!Number.isFinite(months) || months <= 0) {
      setError(t.newGallery.errors.retentionMustBePositive);
      return;
    }
    const totalNum = totalAmount ? Number(totalAmount) : null;
    const retainerNum = retainerAmount ? Number(retainerAmount) : null;
    if (totalNum !== null && (!Number.isFinite(totalNum) || totalNum < 0)) {
      setError(t.newGallery.errors.totalMustBeNonNegative);
      return;
    }
    if (retainerNum !== null && (!Number.isFinite(retainerNum) || retainerNum < 0)) {
      setError(t.newGallery.errors.retainerMustBeNonNegative);
      return;
    }
    if (totalNum !== null && retainerNum !== null && retainerNum > totalNum) {
      setError(t.newGallery.errors.retainerExceedsTotal);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/portals-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          mode: 'simple',
          session_type: sessionType.trim(),
          client_display_name: displayName.trim(),
          // Reused for greeting-friendly first-name extraction in emails.
          partner_1_first_name: firstWord(clientName) || null,
          client_email: clientEmail.trim().toLowerCase() || null,
          event_date: eventDateIso || null,
          drive_url: driveUrl.trim() || null,
          retention_months: months,
          gallery_password: galleryPassword.trim(),
          contract_total_amount: totalNum,
          contract_retainer_amount: retainerNum,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const driveDelivered = !!driveUrl.trim();
        const expiresIso = driveDelivered
          ? new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString()
          : null;
        setSuccess({
          displayName: displayName.trim(),
          galleryPassword: galleryPassword.trim(),
          firstName: firstWord(clientName),
          driveDelivered,
          expiresIso,
          emailWasSent: driveDelivered && !!clientEmail.trim(),
        });
      } else {
        setError(data.error || t.newGallery.errors.serverErrorWithStatus(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success screen ────────────────────────────────────────────────
  if (success) {
    return (
      <SuccessScreen
        state={success}
        onDone={onCreated}
      />
    );
  }

  // ─── Form ──────────────────────────────────────────────────────────
  return (
    <Box maxW="640px" mx="auto" px={{ base: 0, md: 0 }}>
      <Flex align="center" mb={8} gap={3}>
        <AdminBackButton onClick={onCancel} label={t.common.back} />
      </Flex>

      <VStack align="flex-start" spacing={1} mb={6}>
        <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="#c9a96e">
          {t.newGallery.kicker}
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          {t.newGallery.heading}
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300" mt={1}>
          {t.newGallery.intro}
        </Text>
      </VStack>

      <Box
        as="form"
        onSubmit={handleSubmit}
        bg="white"
        borderRadius="md"
        border="1px solid"
        borderColor="gray.200"
        px={{ base: 5, md: 8 }}
        py={{ base: 6, md: 8 }}
      >
        <VStack align="stretch" spacing={6}>
          <Field
            label={t.newGallery.sessionTypeLabel}
            required
            helpText={t.newGallery.sessionTypeHelp}
          >
            <SessionTypePicker value={sessionType} onChange={setSessionType} />
          </Field>

          <Field
            label={t.newGallery.clientNameLabel}
            required
            helpText={t.newGallery.clientNameHelp}
          >
            <FormInput
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={t.newGallery.clientNamePlaceholder}
            />
          </Field>

          <Field
            label={t.newGallery.eventDateLabel}
            helpText={t.newGallery.eventDateHelp}
          >
            <FormInput type="date" value={eventDateIso} onChange={(e) => setEventDateIso(e.target.value)} />
          </Field>

          <Field
            label={t.newGallery.displayNameLabel}
            helpText={
              displayNameOverride !== null
                ? t.newGallery.displayNameHelpCustom
                : t.newGallery.displayNameHelpAuto
            }
          >
            <FormInput
              value={displayName}
              onChange={(e) => setDisplayNameOverride(e.target.value)}
              placeholder={t.newGallery.displayNamePlaceholder}
            />
          </Field>

          <Field
            label={t.newGallery.galleryPasswordLabel}
            helpText={
              galleryPasswordOverride !== null
                ? t.newGallery.galleryPasswordHelpCustom
                : t.newGallery.galleryPasswordHelpAuto
            }
          >
            <FormInput
              value={galleryPassword}
              onChange={(e) => setGalleryPasswordOverride(e.target.value)}
              placeholder={t.newGallery.galleryPasswordPlaceholder}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          <Field
            label={t.newGallery.driveUrlLabel}
            helpText={t.newGallery.driveUrlHelp}
          >
            <FormInput
              type="url"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder={t.newGallery.driveUrlPlaceholder}
            />
          </Field>

          <Field
            label={t.newGallery.clientEmailLabel}
            helpText={t.newGallery.clientEmailHelp}
          >
            <FormInput
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder={t.newGallery.clientEmailPlaceholder}
            />
          </Field>

          <Field label={t.newGallery.retentionLabel} helpText={t.newGallery.retentionHelp}>
            <FormInput
              type="number"
              value={retentionMonths}
              onChange={(e) => setRetentionMonths(e.target.value)}
              min="1"
            />
          </Field>

          <Box pt={3} borderTop="1px solid" borderColor="gray.100">
            <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500" mb={2}>
              {t.newGallery.bookkeepingKicker}
            </Text>
            <Text fontSize="xs" color="gray.500" mb={4} fontWeight="300">
              {t.newGallery.bookkeepingHint}
            </Text>
            <VStack align="stretch" spacing={4}>
              <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
                <Field label={t.newGallery.totalLabel} w={{ base: '100%', md: '50%' }} helpText={t.newGallery.totalHelp}>
                  <FormInput
                    type="number"
                    inputMode="decimal"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </Field>
                <Field label={t.newGallery.retainerLabel} w={{ base: '100%', md: '50%' }} helpText={t.newGallery.retainerHelp}>
                  <FormInput
                    type="number"
                    inputMode="decimal"
                    value={retainerAmount}
                    onChange={(e) => setRetainerAmount(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </Field>
              </Stack>
              <Text fontSize="xs" color="gray.500" fontWeight="300">
                {t.newGallery.paymentsNote}
              </Text>
            </VStack>
          </Box>

          {error && (
            <Text fontSize="sm" color="red.500" fontWeight="400">
              {error}
            </Text>
          )}

          <CTAButton
            type="submit"
            variant="solid"
            size="lg"
            fullWidth
            isLoading={submitting}
            loadingText={t.newGallery.creating}
          >
            {t.newGallery.createCta}
          </CTAButton>
        </VStack>
      </Box>
    </Box>
  );
};

// ─── Success screen with copyable share message ─────────────────────────

function SuccessScreen({ state, onDone }: { state: SuccessState; onDone: () => void }) {
  const { t } = useAdminLang();
  const message = buildShareMessage(state.firstName, state.expiresIso, state.galleryPassword);
  const directUrl = `https://vero.photography/portal/pass?password=${encodeURIComponent(state.galleryPassword)}`;
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail on insecure origins. Falling back to a
      // textarea select is more code than it's worth — the message is
      // selectable in the readonly Textarea below.
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(directUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      // Selection fallback in the input.
    }
  };

  return (
    <Box maxW="640px" mx="auto">
      <VStack align="flex-start" spacing={1} mb={6}>
        <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="#c9a96e">
          {t.newGallery.doneKicker}
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          {t.newGallery.createdHeading}
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300" mt={1}>
          {t.newGallery.createdSubtitle(state.displayName)}
        </Text>
      </VStack>

      {/* Quick-access link card — only shown when delivered. The full
          message below has the same URL, but it's buried in copy; this
          gives Vero an instant copy-or-click target to verify the link
          works before she pastes the long message elsewhere. */}
      {state.driveDelivered && (
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" px={{ base: 5, md: 7 }} py={{ base: 4, md: 5 }} mb={4}>
          <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500" mb={2}>
            {t.newGallery.oneClickLinkLabel}
          </Text>
          <Flex gap={2} align="center" direction={{ base: 'column', sm: 'row' }}>
            <Input
              value={directUrl}
              readOnly
              h="40px"
              bg="gray.50"
              fontSize="sm"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              color="gray.800"
              onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
              focusBorderColor="#c9a96e"
            />
            <Flex gap={2} w={{ base: '100%', sm: 'auto' }}>
              <CTAButton
                onClick={copyUrl}
                variant={urlCopied ? 'outline' : 'solid'}
                size="sm"
                fullWidth={{ base: true, md: false }}
              >
                {urlCopied ? (
                  <>
                    <Icon as={FaCheck} boxSize={3} mr={2} /> {t.common.copied}
                  </>
                ) : (
                  <>
                    <Icon as={FaCopy} boxSize={3} mr={2} /> {t.common.copy}
                  </>
                )}
              </CTAButton>
              <CTAButton
                href={directUrl}
                variant="outline"
                size="sm"
                fullWidth={{ base: true, md: false }}
              >
                {t.common.open}
              </CTAButton>
            </Flex>
          </Flex>
          <Text fontSize="xs" color="gray.500" mt={2} fontWeight="300">
            {t.newGallery.oneClickLinkHint}
          </Text>
        </Box>
      )}

      <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" px={{ base: 5, md: 7 }} py={{ base: 5, md: 6 }} mb={5}>
        <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={3}>
          <Box>
            <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500">
              {state.driveDelivered ? t.newGallery.shareWithClient : t.newGallery.statusLabel}
            </Text>
            {state.emailWasSent ? (
              <Text fontSize="sm" color="gray.600" fontWeight="300" mt={1}>
                {t.newGallery.emailWasSentBody}
              </Text>
            ) : state.driveDelivered ? (
              <Text fontSize="sm" color="gray.600" fontWeight="300" mt={1}>
                {t.newGallery.noEmailBody}
              </Text>
            ) : (
              <Text fontSize="sm" color="gray.600" fontWeight="300" mt={1}>
                {t.newGallery.notDeliveredBody}
              </Text>
            )}
          </Box>
          {state.driveDelivered && (
            <CTAButton onClick={copy} variant={copied ? 'outline' : 'solid'} size="sm">
              {copied ? (
                <>
                  <Icon as={FaCheck} boxSize={3} mr={2} />
                  {t.common.copied}
                </>
              ) : (
                <>
                  <Icon as={FaCopy} boxSize={3} mr={2} />
                  {t.newGallery.copyMessage}
                </>
              )}
            </CTAButton>
          )}
        </Flex>

        {state.driveDelivered ? (
          <Textarea
            value={message}
            readOnly
            rows={12}
            bg="gray.50"
            fontSize="sm"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            color="gray.800"
            focusBorderColor="#c9a96e"
            onClick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
          />
        ) : (
          <Box bg="gray.50" border="1px dashed" borderColor="gray.200" borderRadius="sm" px={4} py={5}>
            <VStack align="flex-start" spacing={2}>
              <Text
                fontSize="sm"
                color="gray.700"
                fontWeight="500"
                // Long auto-generated passwords (e.g. "PortraitAlexSmith2026")
                // can overflow narrow mobile viewports without a break rule.
                sx={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
              >
                {t.newGallery.passwordPrefix} <Text as="span" fontFamily="monospace">{state.galleryPassword}</Text>
              </Text>
              <Text fontSize="sm" color="gray.500" fontWeight="300">
                {t.newGallery.passwordSaveHint}
              </Text>
            </VStack>
          </Box>
        )}
      </Box>

      <CTAButton onClick={onDone} variant="outline" size="md" fullWidth>
        {t.newGallery.backToDashboard}
      </CTAButton>
    </Box>
  );
}

// ─── Form bits ─────────────────────────────────────────────────────────

const Field = ({
  label,
  helpText,
  children,
  w,
  required,
}: {
  label: string;
  helpText?: string;
  children: React.ReactNode;
  // Accepts Chakra responsive values (e.g. { base: '100%', md: '50%' })
  // in addition to plain strings, so callers can stack side-by-side
  // fields on desktop and full-width on mobile.
  w?: any;
  required?: boolean;
}) => (
  <Box w={w ?? '100%'}>
    <Text
      as="label"
      display="inline-flex"
      alignItems="center"
      gap={1.5}
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="500"
      color="#c9a96e"
      letterSpacing={{ base: '0.15em', md: '0.2em' }}
      textTransform="uppercase"
      mb={2}
    >
      {label}
      {required && <Box w="6px" h="6px" borderRadius="full" bg="red.400" />}
    </Text>
    {children}
    {helpText && (
      <Text fontSize="xs" color="gray.500" mt={1.5} fontWeight="300" lineHeight="1.5">
        {helpText}
      </Text>
    )}
  </Box>
);

const FormInput = (props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>) => (
  <Input
    {...props}
    h="44px"
    bg="white"
    border="1px solid"
    borderColor="gray.300"
    color="gray.800"
    // Mobile bumps to `md` (16px) so iOS Safari doesn't auto-zoom on
    // focus. Desktop stays compact.
    fontSize={{ base: 'md', md: 'sm' }}
    borderRadius="sm"
    _hover={{ borderColor: 'gray.400' }}
    _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
  />
);

export default AdminNewGalleryOnly;
