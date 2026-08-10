import { Box, VStack, Stack, SimpleGrid, Text, Input, Select, Textarea, Flex, Checkbox } from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import CTAButton from './ui/CTAButton';
import AdminBackButton from './ui/AdminBackButton';
import SessionTypePicker from './SessionTypePicker';
import {
  CONTRACT_TEMPLATES,
  type ContractTemplateField,
} from '../data/contract-template';
import { useAdminLang } from '../i18n/admin';

interface Props {
  adminPassword: string;
  onCancel: () => void;
  onCreated: () => void;
}

// ─── Small formatting helpers ──────────────────────────────────────────

// Titlecase a name, but preserve internal capitalization. Handles
// McKenna, DeAndre, MacDonald, etc. — typing "McKenna" stays as
// "McKenna" instead of being flattened to "Mckenna". Pure all-lower
// or all-upper still gets normalized to "Capitalized".
const cap = (s: string): string => {
  if (!s) return '';
  const tail = s.slice(1);
  const hasInternalUpper = /[A-Z]/.test(tail);
  const hasInternalLower = /[a-z]/.test(tail);
  if (hasInternalUpper && hasInternalLower) {
    // Mixed case → assume intentional, just enforce the leading cap.
    return s.charAt(0).toUpperCase() + tail;
  }
  // All-lower or all-upper → normalize to Titlecase.
  return s.charAt(0).toUpperCase() + tail.toLowerCase();
};

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
  const { t } = useAdminLang();
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
  // Set of field ids that failed the last submit attempt. Drives
  // per-field red highlighting via <Field hasError={...}> — much
  // faster to eyeball than reading "these fields are required: X, Y, Z"
  // and hunting them down manually in a form this long.
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const clearFieldError = (id: string) => {
    setFieldErrors((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleVarChange = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setFieldErrors(new Set());

    // Collect ALL missing/invalid fields up front instead of
    // early-returning on the first one — Vero shouldn't have to fix
    // → submit → fix → submit → fix through a long form to discover
    // every missing piece one at a time.
    const missing: { id: string; label: string }[] = [];
    if (!partner1FullName.trim())
      missing.push({ id: 'partner1', label: t.newClient.fieldLabelPartner1 });
    if (!clientEmail.trim())
      missing.push({ id: 'clientEmail', label: t.newClient.fieldLabelClientEmail });
    if (!eventDateIso)
      missing.push({ id: 'eventDate', label: t.newClient.fieldLabelEventDate });
    if (!sessionType.trim())
      missing.push({ id: 'sessionType', label: t.newClient.fieldLabelSessionType });
    if (!clientDisplayName.trim())
      missing.push({ id: 'displayName', label: t.newClient.fieldLabelDisplayName });
    if (!galleryPassword.trim())
      missing.push({ id: 'galleryPassword', label: t.newClient.fieldLabelGalleryPassword });
    if (coverage === 'custom' && !customCoverage.trim())
      missing.push({ id: 'customCoverage', label: t.newClient.fieldLabelCustomCoverage });
    if (responsiblePartyEnabled) {
      if (!responsiblePartyName.trim())
        missing.push({ id: 'responsiblePartyName', label: t.newClient.fieldLabelResponsiblePartyName });
      if (!responsiblePartyRelationship.trim())
        missing.push({ id: 'responsiblePartyRelationship', label: t.newClient.fieldLabelResponsiblePartyRelationship });
    }

    // Amount validation is trickier because it's cross-field (retainer
    // vs total). Do that separately after the "missing fields" check.
    const total = parseFloat(totalAmount);
    const retainer = parseFloat(retainerAmount);
    const totalInvalid = !Number.isFinite(total) || total < 0;
    const retainerInvalid = !Number.isFinite(retainer) || retainer < 0;
    if (totalInvalid) missing.push({ id: 'total', label: t.newClient.fieldLabelTotal });
    if (retainerInvalid) missing.push({ id: 'retainer', label: t.newClient.fieldLabelRetainer });

    if (missing.length > 0) {
      setFieldErrors(new Set(missing.map((m) => m.id)));
      const labels = missing.map((m) => m.label);
      setError(
        labels.length === 1
          ? t.newClient.singleFieldRequired(labels[0])
          : t.newClient.missingFields(labels),
      );
      return;
    }

    if (retainer > total) {
      setFieldErrors(new Set(['retainer']));
      setError(t.newClient.retainerExceedsTotal);
      return;
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
        setError(data.error || t.newClient.serverErrorStatus(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box maxW="760px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Header */}
      <Flex align="center" mb={8} gap={3}>
        <AdminBackButton onClick={onCancel} label={t.common.back} />
      </Flex>

      <VStack align="flex-start" spacing={1} mb={6}>
        <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="#c9a96e">
          {t.newClient.kicker}
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          {t.newClient.headline}
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
          <SectionHeading>{t.newClient.sectionContract}</SectionHeading>

          <Field
            label={t.newClient.contractTemplateLabel}
            helpText={t.newClient.contractTemplateHelp}
          >
            <Select
              value={templateKey}
              onChange={(e) => {
                setTemplateKey(e.target.value);
                setSessionType(e.target.value);
              }}
              size={{ base: 'md', md: 'sm' } as any}
              fontSize={{ base: 'md', md: 'sm' } as any}
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
          <SectionHeading>{t.newClient.sectionClient}</SectionHeading>

          <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
            <Field label={t.newClient.partner1Label} w={{ base: '100%', md: '50%' }} required helpText={t.newClient.partner1Help} hasError={fieldErrors.has('partner1')}>
              <FormInput value={partner1FullName} onChange={(e) => { setPartner1FullName(e.target.value); clearFieldError('partner1'); }} placeholder={t.newClient.partner1Placeholder} />
            </Field>
            <Field label={t.newClient.partner2Label} w={{ base: '100%', md: '50%' }} helpText={t.newClient.partner2Help}>
              <FormInput value={partner2FullName} onChange={(e) => setPartner2FullName(e.target.value)} placeholder={t.newClient.partner2Placeholder} />
            </Field>
          </Stack>

          <Field
            label={t.newClient.displayNameLabel}
            helpText={
              displayNameOverride !== null
                ? t.newClient.displayNameHelpCustom
                : t.newClient.displayNameHelpAuto
            }
            hasError={fieldErrors.has('displayName')}
          >
            <FormInput
              value={clientDisplayName}
              onChange={(e) => { setDisplayNameOverride(e.target.value); clearFieldError('displayName'); }}
              placeholder={t.newClient.displayNamePlaceholder}
            />
          </Field>

          <Field label={t.newClient.clientEmailLabel} required helpText={t.newClient.clientEmailHelp} hasError={fieldErrors.has('clientEmail')}>
            <FormInput type="email" value={clientEmail} onChange={(e) => { setClientEmail(e.target.value); clearFieldError('clientEmail'); }} placeholder={t.newClient.clientEmailPlaceholder} />
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
                  {t.newClient.responsiblePartyToggle}
                </Text>
              </Checkbox>
            </Flex>
            <Text fontSize="xs" color="gray.500" mt={1} ml={6} fontWeight="300" lineHeight="1.5">
              {t.newClient.responsiblePartyToggleHelp}
            </Text>
            {responsiblePartyEnabled && (
              <VStack align="stretch" spacing={4} mt={4}>
                <Field
                  label={t.newClient.responsiblePartyNameLabel}
                  required
                  helpText={t.newClient.responsiblePartyNameHelp}
                  hasError={fieldErrors.has('responsiblePartyName')}
                >
                  <FormInput
                    value={responsiblePartyName}
                    onChange={(e) => { setResponsiblePartyName(e.target.value); clearFieldError('responsiblePartyName'); }}
                    placeholder={t.newClient.responsiblePartyNamePlaceholder}
                  />
                </Field>
                <Field
                  label={t.newClient.responsiblePartyRelationshipLabel}
                  required
                  helpText={t.newClient.responsiblePartyRelationshipHelp}
                  hasError={fieldErrors.has('responsiblePartyRelationship')}
                >
                  <FormInput
                    value={responsiblePartyRelationship}
                    onChange={(e) => { setResponsiblePartyRelationship(e.target.value); clearFieldError('responsiblePartyRelationship'); }}
                    placeholder={t.newClient.responsiblePartyRelationshipPlaceholder}
                  />
                </Field>
              </VStack>
            )}
          </Box>

          {/* ─── Event ─── */}
          <SectionHeading>{t.newClient.sectionEvent}</SectionHeading>

          <Field
            label={t.newClient.eventTitleLabel}
            helpText={
              eventTitleOverride !== null
                ? t.newClient.eventTitleHelpCustom
                : t.newClient.eventTitleHelpAuto
            }
          >
            <FormInput
              value={eventTitle}
              onChange={(e) => setEventTitleOverride(e.target.value)}
              placeholder={t.newClient.eventTitlePlaceholder}
            />
          </Field>

          <Field label={t.newClient.eventDateLabel} required helpText={t.newClient.eventDateHelp} hasError={fieldErrors.has('eventDate')}>
            <FormInput type="date" value={eventDateIso} onChange={(e) => { setEventDateIso(e.target.value); clearFieldError('eventDate'); }} />
          </Field>

          <Field
            label={t.newClient.coverageLabel}
            required
            helpText={t.newClient.coverageHelp}
          >
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2}>
              {(
                [
                  { key: 'specific', label: t.newClient.coverageSpecific },
                  { key: 'half-day', label: t.newClient.coverageHalfDay },
                  { key: 'full-day', label: t.newClient.coverageFullDay },
                  { key: 'custom', label: t.newClient.coverageCustom },
                ] as const
              ).map((opt) => (
                <Box
                  key={opt.key}
                  as="button"
                  type="button"
                  onClick={() => setCoverage(opt.key)}
                  px={3}
                  py={{ base: 3, md: 1.5 }}
                  minH={{ base: '44px', md: 'auto' }}
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
            </SimpleGrid>
          </Field>

          {coverage === 'specific' && (
            <>
              <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
                <Field label={t.newClient.startTimeLabel} w={{ base: '100%', md: '50%' }} required helpText={t.newClient.startTimeHelp}>
                  <FormInput type="time" value={eventStartTime} onChange={(e) => setEventStartTime(e.target.value)} />
                </Field>
                <Field label={t.newClient.endTimeLabel} w={{ base: '100%', md: '50%' }} required helpText={t.newClient.endTimeHelp}>
                  <FormInput type="time" value={eventEndTime} onChange={(e) => setEventEndTime(e.target.value)} />
                </Field>
              </Stack>

              {eventStartTime && eventEndTime && (
                <Box bg="gray.50" border="1px dashed" borderColor="gray.200" borderRadius="sm" px={3} py={2}>
                  <Text fontSize="xs" color="gray.500" mb={0.5}>{t.newClient.onTheContract}</Text>
                  {/* Preview text is the exact English string that will
                      be substituted into the contract, so it stays
                      English regardless of admin UI language. */}
                  <Text fontSize="sm" color="gray.800">{formatEventTime(eventStartTime, eventEndTime)}</Text>
                </Box>
              )}
            </>
          )}

          {(coverage === 'half-day' || coverage === 'full-day') && (
            <Box bg="gray.50" border="1px dashed" borderColor="gray.200" borderRadius="sm" px={3} py={3}>
              <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                {t.newClient.contractTimeSlot}
              </Text>
              {/* Preview bodies below are the exact English strings
                  that will appear on the customer-facing contract, so
                  they stay English regardless of admin UI language. */}
              <Text fontSize="sm" color="gray.800" mb={3}>
                {coverage === 'half-day'
                  ? 'Half-day coverage (approximately 4 hours, exact times to be confirmed)'
                  : 'Full-day coverage (exact schedule to be confirmed)'}
              </Text>
              <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                {t.newClient.contractAdditionalNotesSlot}
              </Text>
              <Text fontSize="xs" color="gray.700" fontStyle="italic" lineHeight="1.6">
                {coverage === 'half-day'
                  ? 'At the time of signing, the exact event start and end times are still being finalized. Both parties acknowledge that coverage will be approximately 4 hours, with specific times to be confirmed by the Client in writing (email or text) prior to the event date.'
                  : 'At the time of signing, the exact event schedule is still being finalized. This is a full-day coverage booking — the Photographer will be present for the major moments of the Client’s day from start to finish, with the specific schedule to be confirmed by the Client in writing (email or text) prior to the event date.'}
              </Text>
              <Box mt={3} pt={3} borderTop="1px solid" borderColor="gray.200">
                <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                  {t.newClient.noteForYou}
                </Text>
                <Text fontSize="xs" color="gray.500" fontStyle="italic">
                  {t.newClient.noteForYouBody}
                </Text>
              </Box>
            </Box>
          )}

          {coverage === 'custom' && (
            <Field
              label={t.newClient.customCoverageLabel}
              required
              helpText={t.newClient.customCoverageHelp}
              hasError={fieldErrors.has('customCoverage')}
            >
              <Textarea
                value={customCoverage}
                onChange={(e) => { setCustomCoverage(e.target.value); clearFieldError('customCoverage'); }}
                placeholder={t.newClient.customCoveragePlaceholder}
                rows={2}
                focusBorderColor="#c9a96e"
                fontSize={{ base: 'md', md: 'sm' }}
              />
            </Field>
          )}

          <Field label={t.newClient.sessionTypeLabel} required helpText={t.newClient.sessionTypeHelp} hasError={fieldErrors.has('sessionType')}>
            <SessionTypePicker value={sessionType} onChange={(v) => { setSessionType(v); clearFieldError('sessionType'); }} />
          </Field>

          {/* ─── Pricing ─── */}
          <SectionHeading>{t.newClient.sectionPricing}</SectionHeading>

          <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
            <Field label={t.newClient.totalLabel} w={{ base: '100%', md: '50%' }} required helpText={t.newClient.totalHelp} hasError={fieldErrors.has('total')}>
              <FormInput
                type="number"
                inputMode="decimal"
                value={totalAmount}
                onChange={(e) => { setTotalAmount(e.target.value); clearFieldError('total'); }}
                placeholder="0"
                step="1"
                min="0"
              />
            </Field>
            <Field label={t.newClient.retainerLabel} w={{ base: '100%', md: '50%' }} required helpText={t.newClient.retainerHelp} hasError={fieldErrors.has('retainer')}>
              <FormInput
                type="number"
                inputMode="decimal"
                value={retainerAmount}
                onChange={(e) => { setRetainerAmount(e.target.value); clearFieldError('retainer'); }}
                placeholder="0"
                step="1"
                min="0"
              />
            </Field>
          </Stack>

          {/* ─── Gallery Pass ─── */}
          <SectionHeading>{t.newClient.sectionGalleryPass}</SectionHeading>

          <Field
            label={t.newClient.galleryPasswordLabel}
            helpText={
              galleryPasswordOverride !== null
                ? t.newClient.galleryPasswordHelpCustom
                : t.newClient.galleryPasswordHelpAuto
            }
            hasError={fieldErrors.has('galleryPassword')}
          >
            <FormInput
              value={galleryPassword}
              onChange={(e) => { setGalleryPasswordOverride(e.target.value); clearFieldError('galleryPassword'); }}
              placeholder="ChrisannRajiv2026"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          {/* ─── Contract variables ─── */}
          <SectionHeading>{t.newClient.sectionContractDetails}</SectionHeading>
          <Text fontSize="xs" color="gray.500" mt={-3}>
            {t.newClient.contractDetailsIntro}
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
          <SectionHeading>{t.newClient.sectionOptionalClauses}</SectionHeading>
          <Text fontSize="xs" color="gray.500" mt={-3} mb={-1} fontWeight="300" lineHeight="1.5">
            {t.newClient.optionalClausesIntro}
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
                  {t.newClient.twoCameraLabel}
                </Text>
                <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1} lineHeight="1.5">
                  {t.newClient.twoCameraHelp}
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
                  {t.newClient.additionalRetouchingLabel}
                </Text>
                <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1} lineHeight="1.5">
                  {t.newClient.additionalRetouchingHelp}
                </Text>
              </Box>
            </Checkbox>
          </Box>

          {/* ─── Additional notes ─── */}
          <SectionHeading>{t.newClient.sectionAdditionalNotes}</SectionHeading>
          <Field
            label={t.newClient.customClausesLabel}
            helpText={t.newClient.customClausesHelp}
          >
            <Textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder={t.newClient.customClausesPlaceholder}
              focusBorderColor="#c9a96e"
              rows={4}
              fontSize={{ base: 'md', md: 'sm' }}
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
            wrapText
            isLoading={submitting}
            loadingText={t.newClient.submitting}
          >
            {t.newClient.submit}
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
          fontSize={{ base: 'md', md: 'sm' }}
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
  hasError,
}: {
  label: string;
  helpText?: string;
  children: React.ReactNode;
  // Accepts either a plain width string or a responsive object so callers
  // can stack two-column layouts on mobile (`{ base: '100%', md: '50%' }`).
  w?: string | { base?: string; md?: string; lg?: string };
  // Surfaces a red dot next to the label — for fields that don't have
  // a sensible auto-fill, so Vero can scan the form and spot what's
  // still missing before submitting.
  required?: boolean;
  // Turns the label red and wraps the children with a red glow when
  // this specific field failed validation on the last submit attempt.
  // Complements the summary error message so Vero can spot the exact
  // fields to fix at a glance instead of hunting through the form.
  hasError?: boolean;
}) => (
  <Box w={w ?? '100%'}>
    <Text
      as="label"
      display="inline-flex"
      alignItems="center"
      gap={1.5}
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="500"
      color={hasError ? 'red.500' : '#c9a96e'}
      letterSpacing={{ base: '0.15em', md: '0.2em' }}
      textTransform="uppercase"
      mb={2}
    >
      {label}
      {required && (
        <Box
          w="6px"
          h="6px"
          borderRadius="full"
          bg={hasError ? 'red.500' : 'red.400'}
        />
      )}
    </Text>
    <Box
      // Red glow around the input(s) when there's an error. Uses
      // box-shadow so it doesn't push around whatever layout the
      // caller has set on the children.
      sx={
        hasError
          ? {
              borderRadius: '4px',
              boxShadow: '0 0 0 2px rgba(229, 62, 62, 0.35)',
              transition: 'box-shadow 0.2s',
            }
          : undefined
      }
    >
      {children}
    </Box>
    {helpText && (
      <Text
        fontSize="xs"
        color={hasError ? 'red.500' : 'gray.500'}
        mt={1.5}
        fontWeight="300"
        lineHeight="1.5"
      >
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
    // Mobile bump to `md` (16px) prevents iOS Safari from zooming the
    // viewport when the input is focused. Desktop keeps `sm` for the
    // compact form feel.
    fontSize={{ base: 'md', md: 'sm' }}
    borderRadius="sm"
    _hover={{ borderColor: 'gray.400' }}
    _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
  />
);

export default AdminNewClient;
