import { Box, VStack, HStack, Text, Input, Flex, Icon, Textarea } from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import { FaArrowLeft, FaCheck, FaCopy } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import SessionTypePicker from './SessionTypePicker';

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
const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

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
      setError('Session type is required.');
      return;
    }
    if (!clientName.trim()) {
      setError('Client name is required.');
      return;
    }
    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }
    if (!galleryPassword.trim()) {
      setError('Gallery password is required.');
      return;
    }
    const months = Number(retentionMonths);
    if (!Number.isFinite(months) || months <= 0) {
      setError('Retention months must be a positive number.');
      return;
    }
    const totalNum = totalAmount ? Number(totalAmount) : null;
    const retainerNum = retainerAmount ? Number(retainerAmount) : null;
    if (totalNum !== null && (!Number.isFinite(totalNum) || totalNum < 0)) {
      setError('Total must be a non-negative number.');
      return;
    }
    if (retainerNum !== null && (!Number.isFinite(retainerNum) || retainerNum < 0)) {
      setError('Retainer must be a non-negative number.');
      return;
    }
    if (totalNum !== null && retainerNum !== null && retainerNum > totalNum) {
      setError('Retainer cannot exceed total.');
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
        setError(data.error || `Server error (${res.status}).`);
      }
    } catch {
      setError('Could not reach the server.');
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
    <Box maxW="640px" mx="auto">
      <Flex align="center" mb={8} gap={3}>
        <Box
          as="button"
          type="button"
          onClick={onCancel}
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
          Back
        </Box>
      </Flex>

      <VStack align="flex-start" spacing={1} mb={6}>
        <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="#c9a96e">
          New Gallery
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          Share a photo gallery
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300" mt={1}>
          Use this for any booking that doesn't need a contract — portraits, family sessions, anniversaries, etc. You can create it as soon as you get the order and fill in the Drive URL later, or paste the URL now to deliver immediately.
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
            label="Session Type"
            required
            helpText="What kind of shoot this is. Click a standard type, or use Custom for anything else."
          >
            <SessionTypePicker value={sessionType} onChange={setSessionType} />
          </Field>

          <Field
            label="Client Name"
            required
            helpText="The client's full name (first last, or however they go by). Used to greet them in emails and to build the display name."
          >
            <FormInput
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Alex Smith"
            />
          </Field>

          <Field
            label="Event Date"
            helpText="Optional — used to sort the dashboard and to pick the year for the display name. Defaults to the current year if blank."
          >
            <FormInput type="date" value={eventDateIso} onChange={(e) => setEventDateIso(e.target.value)} />
          </Field>

          <Field
            label="Display Name"
            helpText={
              displayNameOverride !== null
                ? 'Custom — clear the field to go back to the auto-generated name.'
                : 'Auto-generated as "{Session} {Client Name} {Year}", e.g. "Portrait Alex Smith 2026". Type to override.'
            }
          >
            <FormInput
              value={displayName}
              onChange={(e) => setDisplayNameOverride(e.target.value)}
              placeholder="Portrait Alex Smith 2026"
            />
          </Field>

          <Field
            label="Gallery Password"
            helpText={
              galleryPasswordOverride !== null
                ? 'Custom — clear the field to go back to the auto-generated password.'
                : 'Auto-generated from the display name (spaces removed). Type to override.'
            }
          >
            <FormInput
              value={galleryPassword}
              onChange={(e) => setGalleryPasswordOverride(e.target.value)}
              placeholder="PortraitAlexSmith2026"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          <Field
            label="Google Drive Folder URL"
            helpText="Paste the share URL of the folder containing the gallery. Make sure the service account has Viewer access. Optional — leave blank if you're just creating the booking placeholder now and will attach photos later."
          >
            <FormInput
              type="url"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
            />
          </Field>

          <Field
            label="Client Email (optional)"
            helpText="If you enter an email AND a Drive URL above, the client gets an automatic email with the gallery link and password as soon as you click Create. Leave blank to copy the message manually on the next screen."
          >
            <FormInput
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@example.com"
            />
          </Field>

          <Field label="Retention (months)" helpText="How long the gallery stays online after delivery. Default is 3.">
            <FormInput
              type="number"
              value={retentionMonths}
              onChange={(e) => setRetentionMonths(e.target.value)}
              min="1"
            />
          </Field>

          <Box pt={3} borderTop="1px solid" borderColor="gray.100">
            <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500" mb={2}>
              Bookkeeping (optional)
            </Text>
            <Text fontSize="xs" color="gray.500" mb={4} fontWeight="300">
              These are only visible to you in the admin. The client doesn't see them — gallery-only clients only see their photos.
            </Text>
            <VStack align="stretch" spacing={4}>
              <HStack spacing={4} align="flex-start">
                <Field label="Total (USD)" w="50%" helpText="What you charged for the project. Optional.">
                  <FormInput
                    type="number"
                    inputMode="decimal"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </Field>
                <Field label="Retainer / Deposit (USD)" w="50%" helpText="Amount paid up front to reserve the booking.">
                  <FormInput
                    type="number"
                    inputMode="decimal"
                    value={retainerAmount}
                    onChange={(e) => setRetainerAmount(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </Field>
              </HStack>
              <Text fontSize="xs" color="gray.500" fontWeight="300">
                You can log payments later in the client's detail view — Zelle, cash, Venmo, etc. — with notes attached.
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
            loadingText="Creating..."
          >
            Create Gallery
          </CTAButton>
        </VStack>
      </Box>
    </Box>
  );
};

// ─── Success screen with copyable share message ─────────────────────────

function SuccessScreen({ state, onDone }: { state: SuccessState; onDone: () => void }) {
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
          Done
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          Gallery created ✓
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300" mt={1}>
          {state.displayName} is in the system.
        </Text>
      </VStack>

      {/* Quick-access link card — only shown when delivered. The full
          message below has the same URL, but it's buried in copy; this
          gives Vero an instant copy-or-click target to verify the link
          works before she pastes the long message elsewhere. */}
      {state.driveDelivered && (
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" px={{ base: 5, md: 7 }} py={{ base: 4, md: 5 }} mb={4}>
          <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500" mb={2}>
            One-click link
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
              <CTAButton onClick={copyUrl} variant={urlCopied ? 'outline' : 'solid'} size="sm">
                {urlCopied ? (
                  <>
                    <Icon as={FaCheck} boxSize={3} mr={2} /> Copied
                  </>
                ) : (
                  <>
                    <Icon as={FaCopy} boxSize={3} mr={2} /> Copy
                  </>
                )}
              </CTAButton>
              <CTAButton href={directUrl} variant="outline" size="sm">
                Open
              </CTAButton>
            </Flex>
          </Flex>
          <Text fontSize="xs" color="gray.500" mt={2} fontWeight="300">
            Click Open to test the link in a new tab. The full share message is below.
          </Text>
        </Box>
      )}

      <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" px={{ base: 5, md: 7 }} py={{ base: 5, md: 6 }} mb={5}>
        <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={3}>
          <Box>
            <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500">
              {state.driveDelivered ? 'Share this with the client' : 'Status'}
            </Text>
            {state.emailWasSent ? (
              <Text fontSize="sm" color="gray.600" fontWeight="300" mt={1}>
                An email has been sent to the client — this is a copy in case you want to send it via text/WhatsApp too.
              </Text>
            ) : state.driveDelivered ? (
              <Text fontSize="sm" color="gray.600" fontWeight="300" mt={1}>
                No client email on file — copy this message and send it however you're in touch.
              </Text>
            ) : (
              <Text fontSize="sm" color="gray.600" fontWeight="300" mt={1}>
                The gallery is set up but no Drive URL was provided yet. Open the client's detail view to paste the URL and mark as delivered when ready.
              </Text>
            )}
          </Box>
          {state.driveDelivered && (
            <CTAButton onClick={copy} variant={copied ? 'outline' : 'solid'} size="sm">
              {copied ? (
                <>
                  <Icon as={FaCheck} boxSize={3} mr={2} />
                  Copied
                </>
              ) : (
                <>
                  <Icon as={FaCopy} boxSize={3} mr={2} />
                  Copy message
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
              <Text fontSize="sm" color="gray.700" fontWeight="500">Password: <Text as="span" fontFamily="monospace">{state.galleryPassword}</Text></Text>
              <Text fontSize="sm" color="gray.500" fontWeight="300">
                Save this somewhere — it's how you'll let the client into their gallery once you're ready to deliver.
              </Text>
            </VStack>
          </Box>
        )}
      </Box>

      <CTAButton onClick={onDone} variant="outline" size="md" fullWidth>
        Back to Dashboard
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
  w?: string;
  required?: boolean;
}) => (
  <Box w={w ?? '100%'}>
    <Text
      as="label"
      display="inline-flex"
      alignItems="center"
      gap={1.5}
      fontSize="2xs"
      fontWeight="500"
      color="#c9a96e"
      letterSpacing="0.2em"
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
    fontSize="sm"
    borderRadius="sm"
    _hover={{ borderColor: 'gray.400' }}
    _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
  />
);

export default AdminNewGalleryOnly;
