import { Box, VStack, HStack, Text, Input, Flex, Icon } from '@chakra-ui/react';
import { useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

interface Props {
  adminPassword: string;
  onCancel: () => void;
  onCreated: () => void;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

// Auto-generate a sane default password from the display name. Strips
// non-alphanumerics, capitalizes word starts, appends the year.
const defaultGalleryPassword = (displayName: string, year: string): string => {
  if (!displayName) return '';
  const parts = displayName
    .split(/[\s&,/-]+/)
    .filter(Boolean)
    .map(cap)
    .join('');
  return parts + year;
};

const AdminNewGalleryOnly = ({ adminPassword, onCancel, onCreated }: Props) => {
  const [sessionType, setSessionType] = useState('portrait');
  const [displayName, setDisplayName] = useState('');
  const [eventDateIso, setEventDateIso] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [retentionMonths, setRetentionMonths] = useState('3');
  const [passwordOverride, setPasswordOverride] = useState<string | null>(null);
  const [clientEmail, setClientEmail] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [retainerAmount, setRetainerAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const year = eventDateIso ? eventDateIso.slice(0, 4) : new Date().getFullYear().toString();
  const derivedPassword = defaultGalleryPassword(displayName, year);
  const galleryPassword = passwordOverride ?? derivedPassword;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!sessionType.trim()) {
      setError('Session type is required.');
      return;
    }
    if (!displayName.trim()) {
      setError('Client / event name is required.');
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
    // Optional totals — validate if provided. Both empty is fine.
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
        onCreated();
      } else {
        setError(data.error || `Server error (${res.status}).`);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

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
          Use this for any booking that doesn't need a contract — portraits, family sessions, gifted shoots. You can create it as soon as you get the order and fill in the Drive URL later, or paste the URL now to deliver immediately.
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
          <Field label="Session Type" helpText='Lowercase keyword, e.g. "portrait", "family", "maternity".'>
            <FormInput value={sessionType} onChange={(e) => setSessionType(e.target.value)} placeholder="portrait" />
          </Field>

          <Field
            label="Client / Event Name"
            helpText="Shown in the admin dashboard and used to auto-generate a password. e.g. 'Jay June 2026' or 'Mariana Family'."
          >
            <FormInput
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Jay June 2026"
            />
          </Field>

          <Field label="Event Date" helpText="Optional — used to sort the dashboard and to derive the year for the password.">
            <FormInput type="date" value={eventDateIso} onChange={(e) => setEventDateIso(e.target.value)} />
          </Field>

          <Field
            label="Google Drive Folder URL"
            helpText="Paste the share URL of the folder containing the gallery. Make sure the service account has Viewer access on it."
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
            helpText="If you enter an email AND a Drive URL above, the client gets an automatic email with the gallery link and password as soon as you click Create. Leave blank to skip the email."
          >
            <FormInput
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@example.com"
            />
          </Field>

          <HStack spacing={4} align="flex-start">
            <Field
              label="Gallery Password"
              w="65%"
              helpText={
                passwordOverride !== null
                  ? 'Custom — clear the field to go back to the auto-generated password.'
                  : 'Auto-generated from the client name + year. Type to override.'
              }
            >
              <FormInput
                value={galleryPassword}
                onChange={(e) => setPasswordOverride(e.target.value)}
                placeholder="JayJune2026"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Retention (months)" w="35%" helpText="How long the gallery stays online.">
              <FormInput
                type="number"
                value={retentionMonths}
                onChange={(e) => setRetentionMonths(e.target.value)}
                min="1"
              />
            </Field>
          </HStack>

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

const Field = ({
  label,
  helpText,
  children,
  w,
}: {
  label: string;
  helpText?: string;
  children: React.ReactNode;
  w?: string;
}) => (
  <Box w={w ?? '100%'}>
    <Text
      as="label"
      display="block"
      fontSize="2xs"
      fontWeight="500"
      color="#c9a96e"
      letterSpacing="0.2em"
      textTransform="uppercase"
      mb={2}
    >
      {label}
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
