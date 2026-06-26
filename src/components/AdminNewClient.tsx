import { Box, VStack, HStack, Text, Input, Select, Textarea, Flex, Icon, Checkbox } from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import SessionTypePicker from './SessionTypePicker';
import {
  CONTRACT_TEMPLATES,
  type ContractTemplateField,
} from '../data/contract-template';

interface Props {
  adminPassword: string;
  onCancel: () => void;
  onCreated: () => void;
}

// ─── Small formatting helpers ──────────────────────────────────────────

const cap = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

const firstWord = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? '';

const fmtCurrency = (n: number): string =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// "2026-08-09" → "August 9, 2026"
const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

// "17:00" → "5:00 PM"
const fmtTime12h = (hhmm: string): string => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
};

// Returns hours as a float, e.g. 1.5 for an hour and a half. 0 if invalid.
const hoursBetween = (startHhmm: string, endHhmm: string): number => {
  if (!startHhmm || !endHhmm) return 0;
  const [sH, sM] = startHhmm.split(':').map(Number);
  const [eH, eM] = endHhmm.split(':').map(Number);
  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;
  const diff = endMin - startMin;
  return diff > 0 ? diff / 60 : 0;
};

const formatEventTime = (startHhmm: string, endHhmm: string): string => {
  if (!startHhmm || !endHhmm) return '';
  const hours = hoursBetween(startHhmm, endHhmm);
  const label = (() => {
    if (hours === 0) return '';
    const rounded = Math.round(hours * 100) / 100;
    if (rounded === 1) return '1 hour';
    if (Number.isInteger(rounded)) return `${rounded} hours`;
    return `${rounded} hours`;
  })();
  return label
    ? `${fmtTime12h(startHhmm)} to ${fmtTime12h(endHhmm)} (approximately ${label})`
    : `${fmtTime12h(startHhmm)} to ${fmtTime12h(endHhmm)}`;
};

const defaultGalleryPassword = (p1First: string, p2First: string, year: string): string =>
  `${cap(p1First)}${cap(p2First)}${year}`;

const defaultDisplayName = (p1First: string, p2First: string): string => {
  const a = cap(p1First);
  const b = cap(p2First);
  if (a && b) return `${a} & ${b}`;
  return a || b;
};

const defaultEventTitle = (p1First: string, p2First: string, sessionType: string): string => {
  const names = defaultDisplayName(p1First, p2First);
  const type = cap(sessionType);
  if (!names || !type) return '';
  return `${names}'s ${type}`;
};

// Today as YYYY-MM-DD in the user's local time (so the date input picker
// matches what they'd expect from "today").
const todayYmd = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ─── Component ─────────────────────────────────────────────────────────

const AdminNewClient = ({ adminPassword, onCancel, onCreated }: Props) => {
  const templateKeys = Object.keys(CONTRACT_TEMPLATES);
  const [templateKey, setTemplateKey] = useState<string>(templateKeys[0]);

  // Partner full names — first names are extracted automatically for
  // derived fields (display name, gallery password, event title).
  const [partner1FullName, setPartner1FullName] = useState('');
  const [partner2FullName, setPartner2FullName] = useState('');
  const p1First = firstWord(partner1FullName);
  const p2First = firstWord(partner2FullName);

  // Auto-derived: display name, event title, gallery password.
  // All overridable — once the user types something into the override
  // box we stop syncing with the derived value (null means "not yet
  // overridden, use derived").
  const [displayNameOverride, setDisplayNameOverride] = useState<string | null>(null);
  const [eventTitleOverride, setEventTitleOverride] = useState<string | null>(null);
  const [galleryPasswordOverride, setGalleryPasswordOverride] = useState<string | null>(null);

  const [clientEmail, setClientEmail] = useState('');
  const [eventDateIso, setEventDateIso] = useState('');
  // Defaults: 5:00 PM – 6:00 PM. Most shoots/weddings start in the late
  // afternoon, and seeding zero-minute values means Vero just adjusts
  // the hour instead of zeroing out :37 every time she opens the
  // picker.
  const [eventStartTime, setEventStartTime] = useState('17:00');
  const [eventEndTime, setEventEndTime] = useState('18:00');

  // Coverage type covers the case where the booking is sold as a
  // package (half-day, full-day) and exact times aren't known yet —
  // common for weddings booked months out where the timeline gets
  // finalized closer to the event.
  type Coverage = 'specific' | 'half-day' | 'full-day' | 'custom';
  const [coverage, setCoverage] = useState<Coverage>('specific');
  const [customCoverage, setCustomCoverage] = useState('');

  // Session type defaults to the chosen template key. Override if needed
  // (mostly relevant when we add additional templates).
  const [sessionType, setSessionType] = useState<string>(templateKeys[0]);

  const [totalAmount, setTotalAmount] = useState('');
  const [retainerAmount, setRetainerAmount] = useState('');

  const [additionalNotes, setAdditionalNotes] = useState('');

  // Optional: a third party who's signing + paying (e.g. parent of the
  // bride). When the toggle is off both fields are sent as empty
  // strings and the RESPONSIBLE PARTY section is pruned out of the
  // rendered contract.
  const [responsiblePartyEnabled, setResponsiblePartyEnabled] = useState(false);
  const [responsiblePartyName, setResponsiblePartyName] = useState('');
  const [responsiblePartyRelationship, setResponsiblePartyRelationship] = useState('');

  // Optional service clauses. Each is a checkbox that drives a single
  // 'yes' / '' flag variable. Both sections in the template are marked
  // optional with requireVariables, so flipping the checkbox off prunes
  // them out of the rendered contract.
  const [twoCameraEnabled, setTwoCameraEnabled] = useState(false);
  const [additionalRetouchingEnabled, setAdditionalRetouchingEnabled] = useState(false);

  // Template-driven variable fields (the static ones at the bottom).
  const fields = CONTRACT_TEMPLATES[templateKey]?.fields ?? [];
  const [variables, setVariables] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? ''])),
  );

  // Default the effective_date to today on first render.
  useEffect(() => {
    setVariables((prev) => ({
      ...prev,
      effective_date: prev.effective_date || todayYmd(),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the template changes, reset variables to that template's defaults.
  useMemo(() => {
    const f = CONTRACT_TEMPLATES[templateKey]?.fields ?? [];
    const next: Record<string, string> = Object.fromEntries(
      f.map((field) => [field.key, field.defaultValue ?? '']),
    );
    if (!next.effective_date) next.effective_date = todayYmd();
    setVariables(next);
  }, [templateKey]);

  const eventYear = eventDateIso ? eventDateIso.slice(0, 4) : new Date().getFullYear().toString();
  const derivedDisplayName = defaultDisplayName(p1First, p2First);
  const derivedGalleryPassword = defaultGalleryPassword(p1First, p2First, eventYear);
  const derivedEventTitle = defaultEventTitle(p1First, p2First, sessionType);

  const clientDisplayName = displayNameOverride ?? derivedDisplayName;
  const galleryPassword = galleryPasswordOverride ?? derivedGalleryPassword;
  const eventTitle = eventTitleOverride ?? derivedEventTitle;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleVarChange = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!partner1FullName.trim()) {
      setError('Partner 1 name is required.');
      return;
    }
    if (!clientEmail.trim() || !eventDateIso || !sessionType.trim()) {
      setError('Client email, event date, and session type are required.');
      return;
    }
    if (!clientDisplayName.trim()) {
      setError('Display name is required (it auto-fills from partner names).');
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
    if (coverage === 'custom' && !customCoverage.trim()) {
      setError('Custom coverage needs a description (or pick Specific Times / Half Day / Full Day).');
      return;
    }
    if (responsiblePartyEnabled) {
      if (!responsiblePartyName.trim() || !responsiblePartyRelationship.trim()) {
        setError('Responsible Party needs both a name and a relationship — or untoggle that option.');
        return;
      }
    }

    // Build the variables object the contract template expects. Most
    // keys come from the dynamic `variables` map; we override the ones
    // we've collected explicitly above so the rendered contract sees
    // human-formatted strings.
    //
    // client_names uses FULL LEGAL NAMES (not the auto-display name).
    // For a wedding contract this needs to read like "Chrisann Bryan &
    // Rajiv Thomas" not "Chrisann & Rajiv" — the legal binding is on
    // the full identities, not the shorthand we use in greetings.
    const remaining = total - retainer;
    const legalClientNames = partner2FullName.trim()
      ? `${partner1FullName.trim()} & ${partner2FullName.trim()}`
      : partner1FullName.trim();
    const eventTimeString = (() => {
      if (coverage === 'half-day') {
        return 'Half-day coverage (approximately 4 hours, exact times to be confirmed)';
      }
      if (coverage === 'full-day') {
        return 'Full-day coverage (exact schedule to be confirmed)';
      }
      if (coverage === 'custom') {
        return customCoverage.trim();
      }
      return formatEventTime(eventStartTime, eventEndTime);
    })();

    // When the booking is sold as half-day or full-day, the EVENT DETAILS
    // Time field gives the short version; we also auto-add a proper
    // acknowledgement clause to ADDITIONAL NOTES so the contract is
    // explicit about what the parties agreed to. Vero's own additional
    // notes (if any) come after, separated by a blank line.
    //
    // Full-day phrasing deliberately doesn't pin an hour count because
    // it's the top-tier package — "major moments of the day from start
    // to finish" gives the same bounding implication (i.e. the contract
    // covers the wedding-day arc, not a 14-hour open-ended request)
    // without numerically capping what's included.
    const tbaClause = (() => {
      if (coverage === 'half-day') {
        return 'At the time of signing, the exact event start and end times are still being finalized. Both parties acknowledge that coverage will be approximately 4 hours, with specific times to be confirmed by the Client in writing (email or text) prior to the event date.';
      }
      if (coverage === 'full-day') {
        return 'At the time of signing, the exact event schedule is still being finalized. This is a full-day coverage booking — the Photographer will be present for the major moments of the Client’s day from start to finish, with the specific schedule to be confirmed by the Client in writing (email or text) prior to the event date.';
      }
      return '';
    })();
    const mergedAdditionalNotes = [tbaClause, additionalNotes.trim()].filter(Boolean).join('\n\n');

    const finalVariables: Record<string, string> = {
      ...variables,
      client_names: legalClientNames,
      event_title: eventTitle,
      event_date: fmtDate(eventDateIso),
      event_time: eventTimeString,
      total_amount: fmtCurrency(total),
      retainer_amount: fmtCurrency(retainer),
      remaining_balance: fmtCurrency(remaining),
      additional_notes: mergedAdditionalNotes,
      // Responsible party — sent always so the substitute step has a
      // value to swap in. Blank when the toggle is off, which causes
      // pruneEmptyOptionalSections to drop the section server-side.
      responsible_party_name: responsiblePartyEnabled ? responsiblePartyName.trim() : '',
      responsible_party_relationship: responsiblePartyEnabled ? responsiblePartyRelationship.trim() : '',
      // Optional service-clause flags — 'yes' includes the section,
      // empty string prunes it.
      two_camera_enabled: twoCameraEnabled ? 'yes' : '',
      additional_retouching_enabled: additionalRetouchingEnabled ? 'yes' : '',
    };
    // For date fields where the user typed an ISO date (e.g. effective_date
    // from the date picker), convert to friendly form for the contract.
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
          partner_1_first_name: p1First || null,
          partner_2_first_name: p2First || null,
          partner_1_full_name: partner1FullName.trim() || null,
          partner_2_full_name: partner2FullName.trim() || null,
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
    <Box maxW="760px" mx="auto">
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
          {/* ─── Contract type ─── */}
          <SectionHeading>Contract</SectionHeading>

          <Field
            label="Contract Template"
            helpText="The template shapes which clauses appear in the contract. Pick the one matching this booking."
          >
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

          {/* ─── Client ─── */}
          <SectionHeading>Client</SectionHeading>

          <HStack spacing={4} align="flex-start">
            <Field label="Partner 1 Full Name" w="50%" required helpText="Their full legal name. First name is used in the portal greeting.">
              <FormInput value={partner1FullName} onChange={(e) => setPartner1FullName(e.target.value)} placeholder="e.g. Chrisann Bryan" />
            </Field>
            <Field label="Partner 2 Full Name" w="50%" helpText="Optional. Leave blank for solo bookings (portraits, etc.).">
              <FormInput value={partner2FullName} onChange={(e) => setPartner2FullName(e.target.value)} placeholder="e.g. Rajiv Thomas (optional)" />
            </Field>
          </HStack>

          <Field
            label="Display Name"
            helpText={
              displayNameOverride !== null
                ? 'Custom — clear the field to go back to the auto-generated name.'
                : 'Auto-generated from the partner first names. Type to override.'
            }
          >
            <FormInput
              value={clientDisplayName}
              onChange={(e) => setDisplayNameOverride(e.target.value)}
              placeholder="e.g. Chrisann & Rajiv"
            />
          </Field>

          <Field label="Client Email" required helpText="The invite email goes here. They'll log in with this address.">
            <FormInput type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" />
          </Field>

          {/* ─── Responsible Party (optional) ───
              When someone other than the partners is paying + signing
              (e.g. mother of the bride). When the toggle is off both
              variables go through as empty strings and the section is
              pruned out of the rendered contract. */}
          <Box pt={3} borderTop="1px solid" borderColor="gray.100">
            <Flex align="center" gap={3}>
              <Checkbox
                isChecked={responsiblePartyEnabled}
                onChange={(e) => setResponsiblePartyEnabled(e.target.checked)}
                colorScheme="yellow"
              >
                <Text fontSize="sm" color="gray.700" fontWeight="400">
                  Different person is paying & signing
                </Text>
              </Checkbox>
            </Flex>
            <Text fontSize="xs" color="gray.500" mt={1} ml={6} fontWeight="300" lineHeight="1.5">
              Use this when a third party (e.g. mother of the bride) is the one financially responsible for the booking and will be signing the contract. Adds a "Responsible Party" section to the contract.
            </Text>
            {responsiblePartyEnabled && (
              <VStack align="stretch" spacing={4} mt={4}>
                <Field
                  label="Responsible Party Full Name"
                  required
                  helpText="Their full legal name. They'll be the one signing the contract."
                >
                  <FormInput
                    value={responsiblePartyName}
                    onChange={(e) => setResponsiblePartyName(e.target.value)}
                    placeholder="e.g. Patricia Bryan"
                  />
                </Field>
                <Field
                  label="Relationship to Client(s)"
                  required
                  helpText='e.g. "Mother of the Bride", "Father of the Groom", "Family Friend".'
                >
                  <FormInput
                    value={responsiblePartyRelationship}
                    onChange={(e) => setResponsiblePartyRelationship(e.target.value)}
                    placeholder="Mother of the Bride"
                  />
                </Field>
              </VStack>
            )}
          </Box>

          {/* ─── Event ─── */}
          <SectionHeading>Event</SectionHeading>

          <Field
            label="Event Title"
            helpText={
              eventTitleOverride !== null
                ? 'Custom — clear the field to go back to the auto-generated title.'
                : "Auto-generated from partner names + contract type (e.g. \"Chrisann & Rajiv's Wedding\"). Type to override."
            }
          >
            <FormInput
              value={eventTitle}
              onChange={(e) => setEventTitleOverride(e.target.value)}
              placeholder="e.g. Chrisann & Rajiv's Wedding"
            />
          </Field>

          <Field label="Event Date" required helpText="The day of the shoot.">
            <FormInput type="date" value={eventDateIso} onChange={(e) => setEventDateIso(e.target.value)} />
          </Field>

          <Field
            label="Coverage"
            required
            helpText="Specific Times for known hours. Half/Full Day for packages where the schedule will be locked in later."
          >
            <Flex gap={2} wrap="wrap">
              {(
                [
                  { key: 'specific', label: 'Specific Times' },
                  { key: 'half-day', label: 'Half Day' },
                  { key: 'full-day', label: 'Full Day' },
                  { key: 'custom', label: 'Custom' },
                ] as const
              ).map((opt) => (
                <Box
                  key={opt.key}
                  as="button"
                  type="button"
                  onClick={() => setCoverage(opt.key)}
                  px={3}
                  py={1.5}
                  bg={coverage === opt.key ? '#c9a96e' : 'white'}
                  color={coverage === opt.key ? 'white' : 'gray.700'}
                  border="1px solid"
                  borderColor={coverage === opt.key ? '#c9a96e' : 'gray.300'}
                  borderRadius="sm"
                  fontSize="xs"
                  fontWeight="500"
                  letterSpacing="0.05em"
                  cursor="pointer"
                  _hover={{ borderColor: '#c9a96e' }}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {opt.label}
                </Box>
              ))}
            </Flex>
          </Field>

          {coverage === 'specific' && (
            <>
              <HStack spacing={4} align="flex-start">
                <Field label="Start Time" w="50%" required helpText="When the shoot starts.">
                  <FormInput type="time" value={eventStartTime} onChange={(e) => setEventStartTime(e.target.value)} />
                </Field>
                <Field label="End Time" w="50%" required helpText="When the shoot ends. Duration is auto-calculated.">
                  <FormInput type="time" value={eventEndTime} onChange={(e) => setEventEndTime(e.target.value)} />
                </Field>
              </HStack>

              {eventStartTime && eventEndTime && (
                <Box bg="gray.50" border="1px dashed" borderColor="gray.200" borderRadius="sm" px={3} py={2}>
                  <Text fontSize="xs" color="gray.500" mb={0.5}>On the contract:</Text>
                  <Text fontSize="sm" color="gray.800">{formatEventTime(eventStartTime, eventEndTime)}</Text>
                </Box>
              )}
            </>
          )}

          {(coverage === 'half-day' || coverage === 'full-day') && (
            <Box bg="gray.50" border="1px dashed" borderColor="gray.200" borderRadius="sm" px={3} py={3}>
              <Text fontSize="2xs" color="gray.500" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                Will appear on the contract — Event Details → Time
              </Text>
              <Text fontSize="sm" color="gray.800" mb={3}>
                {coverage === 'half-day'
                  ? 'Half-day coverage (approximately 4 hours, exact times to be confirmed)'
                  : 'Full-day coverage (exact schedule to be confirmed)'}
              </Text>
              <Text fontSize="2xs" color="gray.500" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                Will appear on the contract — Additional Notes
              </Text>
              <Text fontSize="xs" color="gray.700" fontStyle="italic" lineHeight="1.6">
                {coverage === 'half-day'
                  ? 'At the time of signing, the exact event start and end times are still being finalized. Both parties acknowledge that coverage will be approximately 4 hours, with specific times to be confirmed by the Client in writing (email or text) prior to the event date.'
                  : 'At the time of signing, the exact event schedule is still being finalized. This is a full-day coverage booking — the Photographer will be present for the major moments of the Client’s day from start to finish, with the specific schedule to be confirmed by the Client in writing (email or text) prior to the event date.'}
              </Text>
              <Box mt={3} pt={3} borderTop="1px solid" borderColor="gray.200">
                <Text fontSize="2xs" color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                  Note for you (not on the contract)
                </Text>
                <Text fontSize="xs" color="gray.500" fontStyle="italic">
                  Once the client confirms the exact times, you can update the event_time variable via Admin → Contract → Edit fields, and remove the clause above from additional_notes.
                </Text>
              </Box>
            </Box>
          )}

          {coverage === 'custom' && (
            <Field
              label="Custom Coverage Description"
              required
              helpText='Free text — appears on the contract as the Time. e.g. "Ceremony coverage only, exact times TBD" or "Approximately 3 hours, schedule TBD".'
            >
              <Textarea
                value={customCoverage}
                onChange={(e) => setCustomCoverage(e.target.value)}
                placeholder="e.g. Approximately 3 hours, exact times to be confirmed"
                rows={2}
                focusBorderColor="#c9a96e"
              />
            </Field>
          )}

          <Field label="Session Type" required helpText="What kind of shoot this is. Click a standard type, or use Custom for anything else.">
            <SessionTypePicker value={sessionType} onChange={setSessionType} />
          </Field>

          {/* ─── Pricing ─── */}
          <SectionHeading>Pricing</SectionHeading>

          <HStack spacing={4} align="flex-start">
            <Field label="Total (USD)" w="50%" required helpText="Total project cost across the whole booking.">
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
            <Field label="Retainer (USD)" w="50%" required helpText="Non-refundable deposit. Due at signing, reserves the date.">
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

          {/* ─── Gallery Pass ─── */}
          <SectionHeading>Gallery Pass</SectionHeading>

          <Field
            label="Gallery Password"
            helpText={
              galleryPasswordOverride !== null
                ? 'Custom — clear the field to go back to the auto-generated password.'
                : 'Auto-generated from the partner first names + event year (e.g. ChrisannRajiv2026). Type to override.'
            }
          >
            <FormInput
              value={galleryPassword}
              onChange={(e) => setGalleryPasswordOverride(e.target.value)}
              placeholder="ChrisannRajiv2026"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          {/* ─── Contract variables ─── */}
          <SectionHeading>Contract Details</SectionHeading>
          <Text fontSize="xs" color="gray.500" mt={-3}>
            Values that get filled into the contract template. Most have sensible defaults — only touch if this booking needs something different.
          </Text>

          {fields.map((f) => (
            <FieldRow
              key={f.key}
              field={f}
              value={variables[f.key] ?? ''}
              onChange={(v) => handleVarChange(f.key, v)}
            />
          ))}

          {/* ─── Optional service clauses ─── */}
          <SectionHeading>Optional Clauses</SectionHeading>
          <Text fontSize="xs" color="gray.500" mt={-3} mb={-1} fontWeight="300" lineHeight="1.5">
            Toggle these on only when they apply to this booking. Each adds a clearly-titled section to the contract.
          </Text>

          <Box pt={2}>
            <Checkbox
              isChecked={twoCameraEnabled}
              onChange={(e) => setTwoCameraEnabled(e.target.checked)}
              colorScheme="yellow"
              alignItems="flex-start"
            >
              <Box>
                <Text fontSize="sm" color="gray.700" fontWeight="500">
                  Two-camera coverage (lead + second camera operator)
                </Text>
                <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1} lineHeight="1.5">
                  Adds a clause describing two-camera coverage for key moments, with the Second Camera Operator acting in an assistant capacity (not as an independent professional). Use this when you're working with an assistant covering supplemental angles.
                </Text>
              </Box>
            </Checkbox>
          </Box>

          <Box>
            <Checkbox
              isChecked={additionalRetouchingEnabled}
              onChange={(e) => setAdditionalRetouchingEnabled(e.target.checked)}
              colorScheme="yellow"
              alignItems="flex-start"
            >
              <Box>
                <Text fontSize="sm" color="gray.700" fontWeight="500">
                  Option for additional retouching after delivery
                </Text>
                <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1} lineHeight="1.5">
                  Adds a clause noting that the Client can request additional retouching (skin smoothing, advanced color, object removal, etc.) beyond the standard edits, with scope and price negotiated separately.
                </Text>
              </Box>
            </Checkbox>
          </Box>

          {/* ─── Additional notes ─── */}
          <SectionHeading>Additional Notes (optional)</SectionHeading>
          <Field
            label="Custom Clauses / Addendums"
            helpText="Anything specific to this booking — e.g. 'Includes drone footage', 'Second photographer for ceremony only', or any unusual terms. Appears as an addendum at the end of the contract. Leave blank to skip."
          >
            <Textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Leave blank if none."
              focusBorderColor="#c9a96e"
              rows={4}
            />
          </Field>

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
    <Field label={field.label} helpText={field.helpText} required={field.required}>
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
          type={
            field.type === 'date'
              ? 'date'
              : field.type === 'number' || field.type === 'currency'
                ? 'number'
                : 'text'
          }
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
  required,
}: {
  label: string;
  helpText?: string;
  children: React.ReactNode;
  w?: string;
  // Surfaces a red dot next to the label — for fields that don't have
  // a sensible auto-fill, so Vero can scan the form and spot what's
  // still missing before submitting.
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
      {required && (
        <Box w="6px" h="6px" borderRadius="full" bg="red.400" />
      )}
    </Text>
    {children}
    {helpText && (
      <Text fontSize="xs" color="gray.500" mt={1.5} fontWeight="300" lineHeight="1.5">
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
