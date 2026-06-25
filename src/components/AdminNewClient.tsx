import { Box, VStack, HStack, Text, Input, Select, Textarea, Flex, Icon } from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import {
  CONTRACT_TEMPLATES,
  type ContractTemplateField,
} from '../data/contract-template';

interface Props {
  adminPassword: string;
  onCancel: () => void;
  onCreated: () => void;
}

// Pretty-print a number as currency text for storage in the contract variables.
const fmtCurrency = (n: number): string =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Pretty-print a YYYY-MM-DD date as "August 9, 2026" for the contract.
const fmtDate = (iso: string): string => {
  if (!iso) return '';
  // Use UTC parts to avoid the off-by-one-day issue on -05:00 timezones.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

// Generate a default gallery password from the partners + year.
// e.g. "Chrisann" + "Rajiv" + "2026" → "ChrisannRajiv2026"
const defaultGalleryPassword = (p1: string, p2: string, year: string): string => {
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');
  return `${cap(p1)}${cap(p2)}${year}`;
};

const AdminNewClient = ({ adminPassword, onCancel, onCreated }: Props) => {
  const templateKeys = Object.keys(CONTRACT_TEMPLATES);
  const [templateKey, setTemplateKey] = useState<string>(templateKeys[0]);

  // Top-level portal fields
  const [partner1, setPartner1] = useState('');
  const [partner2, setPartner2] = useState('');
  const [clientDisplayName, setClientDisplayName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [eventDateIso, setEventDateIso] = useState(''); // YYYY-MM-DD from date input
  const [sessionType, setSessionType] = useState<string>(templateKeys[0]);
  const [totalAmount, setTotalAmount] = useState('');
  const [retainerAmount, setRetainerAmount] = useState('');

  // Auto-derived gallery password (user can override)
  const eventYear = eventDateIso ? eventDateIso.slice(0, 4) : new Date().getFullYear().toString();
  const derivedGalleryPassword = defaultGalleryPassword(partner1, partner2, eventYear);
  const [galleryPasswordOverride, setGalleryPasswordOverride] = useState<string | null>(null);
  const galleryPassword = galleryPasswordOverride ?? derivedGalleryPassword;

  // Template-driven variable form. Initialize each field with its
  // defaultValue. Sync from the top-level fields where appropriate
  // (event date, amounts).
  const fields = CONTRACT_TEMPLATES[templateKey]?.fields ?? [];
  const [variables, setVariables] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? ''])),
  );

  // When the template changes, reset variables to that template's defaults.
  useMemo(() => {
    const f = CONTRACT_TEMPLATES[templateKey]?.fields ?? [];
    setVariables(Object.fromEntries(f.map((field) => [field.key, field.defaultValue ?? ''])));
  }, [templateKey]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleVarChange = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!clientDisplayName.trim() || !clientEmail.trim() || !eventDateIso || !sessionType.trim()) {
      setError('Client name, email, event date, and session type are required.');
      return;
    }
    const total = parseFloat(totalAmount);
    const retainer = parseFloat(retainerAmount);
    if (!Number.isFinite(total) || total < 0 || !Number.isFinite(retainer) || retainer < 0) {
      setError('Enter valid amounts.');
      return;
    }
    if (retainer > total) {
      setError('Retainer cannot exceed total.');
      return;
    }
    if (!galleryPassword.trim()) {
      setError('Gallery password is required.');
      return;
    }

    // Merge derived fields into the variables before submitting:
    //   event_date  → human-formatted from the date picker
    //   total_amount / retainer_amount / remaining_balance → formatted $X
    const remaining = total - retainer;
    const finalVariables: Record<string, string> = {
      ...variables,
      event_date: variables.event_date?.trim() || fmtDate(eventDateIso),
      total_amount: variables.total_amount?.trim() || fmtCurrency(total),
      retainer_amount: variables.retainer_amount?.trim() || fmtCurrency(retainer),
      remaining_balance: fmtCurrency(remaining),
    };
    // For date fields where the user typed an ISO date (from a date input),
    // convert to friendly form for the contract.
    fields.forEach((f) => {
      if (f.type === 'date' && finalVariables[f.key]?.match(/^\d{4}-\d{2}-\d{2}$/)) {
        finalVariables[f.key] = fmtDate(finalVariables[f.key]);
      }
    });

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/portals-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          mode: 'full',
          session_type: sessionType,
          partner_1_first_name: partner1 || null,
          partner_2_first_name: partner2 || null,
          client_display_name: clientDisplayName.trim(),
          client_email: clientEmail.trim().toLowerCase(),
          event_date: eventDateIso,
          contract_template_key: templateKey,
          variables: finalVariables,
          contract_total_amount: total,
          contract_retainer_amount: retainer,
          gallery_password: galleryPassword.trim(),
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
    <Box maxW="700px" mx="auto">
      {/* Header */}
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
          New Client
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          Set up a portal
        </Text>
      </VStack>

      <Box as="form" onSubmit={handleSubmit} bg="white" borderRadius="md" border="1px solid" borderColor="gray.200" px={{ base: 5, md: 8 }} py={{ base: 6, md: 8 }}>
        <VStack align="stretch" spacing={6}>
          <SectionHeading>Booking</SectionHeading>

          <Field label="Contract Template">
            <Select
              value={templateKey}
              onChange={(e) => {
                setTemplateKey(e.target.value);
                setSessionType(e.target.value);
              }}
              size="md"
              focusBorderColor="#c9a96e"
            >
              {templateKeys.map((k) => (
                <option key={k} value={k}>
                  {CONTRACT_TEMPLATES[k].name}
                </option>
              ))}
            </Select>
          </Field>

          <HStack spacing={4} align="flex-start">
            <Field label="Partner 1 First Name" w="50%">
              <FormInput value={partner1} onChange={(e) => setPartner1(e.target.value)} placeholder="e.g. Chrisann" />
            </Field>
            <Field label="Partner 2 First Name" w="50%">
              <FormInput value={partner2} onChange={(e) => setPartner2(e.target.value)} placeholder="e.g. Rajiv" />
            </Field>
          </HStack>

          <Field label="Client Display Name" helpText="What we'll greet them by in the portal. e.g. &quot;Chrisann &amp; Rajiv&quot;.">
            <FormInput value={clientDisplayName} onChange={(e) => setClientDisplayName(e.target.value)} placeholder="Chrisann & Rajiv" />
          </Field>

          <Field label="Client Email">
            <FormInput type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" />
          </Field>

          <HStack spacing={4} align="flex-start">
            <Field label="Event Date" w="50%">
              <FormInput type="date" value={eventDateIso} onChange={(e) => setEventDateIso(e.target.value)} />
            </Field>
            <Field label="Session Type" w="50%" helpText="Lowercase keyword, e.g. wedding, portrait.">
              <FormInput value={sessionType} onChange={(e) => setSessionType(e.target.value)} placeholder="wedding" />
            </Field>
          </HStack>

          <SectionHeading>Pricing</SectionHeading>

          <HStack spacing={4} align="flex-start">
            <Field label="Total (USD)" w="50%">
              <FormInput
                type="number"
                inputMode="decimal"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="0"
                step="1"
                min="0"
              />
            </Field>
            <Field label="Retainer (USD)" w="50%" helpText="Non-refundable. Due at signing.">
              <FormInput
                type="number"
                inputMode="decimal"
                value={retainerAmount}
                onChange={(e) => setRetainerAmount(e.target.value)}
                placeholder="0"
                step="1"
                min="0"
              />
            </Field>
          </HStack>

          <SectionHeading>Gallery Pass</SectionHeading>

          <Field label="Gallery Password" helpText="Auto-generated from partner names + year. Override below if needed.">
            <FormInput
              value={galleryPassword}
              onChange={(e) => setGalleryPasswordOverride(e.target.value)}
              placeholder="ChrisannRajiv2026"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          <SectionHeading>Contract Variables</SectionHeading>
          <Text fontSize="xs" color="gray.500" mt={-2}>
            These are the values that get filled into the contract template. Most have sensible defaults.
          </Text>

          {fields
            // Skip variables we derive from the top-level inputs above
            .filter((f) => !['total_amount', 'retainer_amount', 'event_date'].includes(f.key))
            .map((f) => (
              <FieldRow
                key={f.key}
                field={f}
                value={variables[f.key] ?? ''}
                onChange={(v) => handleVarChange(f.key, v)}
              />
            ))}

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
            Create Portal &amp; Send Invite
          </CTAButton>
        </VStack>
      </Box>
    </Box>
  );
};

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ContractTemplateField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={field.label} helpText={field.helpText}>
      {field.type === 'textarea' ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          focusBorderColor="#c9a96e"
          rows={3}
        />
      ) : (
        <FormInput
          type={field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'currency' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )}
    </Field>
  );
}

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
      <Text fontSize="xs" color="gray.500" mt={1.5} fontWeight="300">
        {helpText}
      </Text>
    )}
  </Box>
);

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <Box pt={3} pb={1} borderTop="1px solid" borderColor="gray.100">
    <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500">
      {children}
    </Text>
  </Box>
);

// Omit `size` because HTMLInputElement's numeric `size` collides with
// Chakra's string-union `size` ('sm' | 'md' | 'lg' | 'xs').
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

export default AdminNewClient;
