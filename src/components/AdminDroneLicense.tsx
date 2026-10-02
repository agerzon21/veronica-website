/**
 * Vero's path to the FAA Part 107 Remote Pilot Certificate, as a checklist
 * she fills in as she goes.
 *
 * WHY. She sells drone shots, and flying for pay needs the FAA's certificate.
 * Getting it takes a few weeks across several government sites, a test center
 * and a TSA check, and a number from one step is needed in a later one (the
 * FTN to book the test, the 17-digit exam ID to apply). So each step says
 * what to do, links to where it is done, and has boxes for the numbers it
 * produces. Later steps show those numbers back, and the dates that follow
 * from them (when the temporary certificate runs out, when the registration
 * and the refresher training are due) are worked out here, not remembered.
 *
 * Both admin levels see and edit it (api/admin/_drone-license.ts). Reached from
 * the Menu drawer rather than the tab bar: it is worked through over a few
 * weeks, not every day. The words are in src/data/drone-license-content.ts,
 * in both languages; this file is the behaviour.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  Flex,
  HStack,
  Icon,
  IconButton,
  Input,
  ListItem,
  OrderedList,
  Spinner,
  Text,
  UnorderedList,
  VStack,
} from '@chakra-ui/react';
import CTAButton from './ui/CTAButton';
import { useAdminLang } from '../i18n/admin';
import FaCheck from '../icons/fa/FaCheck';
import FaChevronDown from '../icons/fa/FaChevronDown';
import FaChevronUp from '../icons/fa/FaChevronUp';
import FaExternalLinkAlt from '../icons/fa/FaExternalLinkAlt';
import FaSyncAlt from '../icons/fa/FaSyncAlt';
import {
  DRONE_FIELDS,
  DRONE_PLAN_KEY,
  DRONE_STEP_KEYS,
  DRONE_TEST_CHANGES_ON,
  addDaysIso,
  addYearsIso,
  daysUntil,
  endOfCalendarMonthsAfter,
  type DronePath,
  type DroneStepKey,
} from '../data/drone-license';
import {
  DRONE_DATE_TEXT,
  DRONE_FIELD_TEXT,
  DRONE_INTRO,
  DRONE_STEP_TEXT,
  type L,
} from '../data/drone-license-content';

type AnyKey = DroneStepKey | typeof DRONE_PLAN_KEY;
type Drafts = Partial<Record<AnyKey, Record<string, string>>>;

/** How long a temporary certificate lasts (14 CFR 107.64 / FAA: 120 days). */
const TEMP_CERT_DAYS = 120;
/** A DroneZone registration lasts three years. */
const REGISTRATION_YEARS = 3;
/** Recurrent training, and the knowledge test result itself, last 24 calendar months. */
const CURRENCY_MONTHS = 24;

/** "Oct 15, 2026" / "15 окт. 2026 г." from YYYY-MM-DD, without timezone drift. */
function fmtDate(iso: string, lang: 'en' | 'ru'): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function AdminDroneLicense({ adminPassword }: { adminPassword: string }) {
  const { t, lang } = useAdminLang();
  const tr = useCallback((l: L) => l[lang], [lang]);

  const [path, setPath] = useState<DronePath | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The step being saved, and by which button. Per step: a save on one step
  // never blocks another (see the merge in save()).
  const [saving, setSaving] = useState<Partial<Record<AnyKey, 'fields' | 'done' | 'undo'>>>({});
  const [savedFlash, setSavedFlash] = useState<AnyKey | null>(null);
  const [saveError, setSaveError] = useState<AnyKey | null>(null);
  const [open, setOpen] = useState<Set<DroneStepKey> | null>(null);

  const draftsFrom = (p: DronePath): Drafts => {
    const out: Drafts = {};
    for (const k of [DRONE_PLAN_KEY, ...DRONE_STEP_KEYS] as AnyKey[]) {
      out[k] = { ...(p.steps[k]?.fields ?? {}) };
    }
    return out;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/drone-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'failed');
      setPath(data.path);
      setDrafts(draftsFrom(data.path));
    } catch {
      setError(t.drone.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [adminPassword, t.drone.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const isDone = useCallback((k: DroneStepKey) => path?.steps[k]?.done === true, [path]);
  const current = useMemo(
    () => DRONE_STEP_KEYS.find((k) => !isDone(k)) ?? null,
    [isDone],
  );

  // The step to work on starts open, the rest closed. Set once per load, so
  // opening and closing by hand is not undone by a save.
  useEffect(() => {
    if (path && open === null) setOpen(new Set(current ? [current] : []));
  }, [path, open, current]);

  /** A value as typed, or as saved when nothing has been typed. */
  const val = (k: AnyKey, field: string): string =>
    drafts[k]?.[field] ?? path?.steps[k]?.fields?.[field] ?? '';

  const setField = (k: AnyKey, field: string, value: string) => {
    setDrafts((d) => ({ ...d, [k]: { ...(d[k] ?? {}), [field]: value } }));
    setSavedFlash(null);
  };

  const isDirty = (k: AnyKey): boolean => {
    const saved = path?.steps[k]?.fields ?? {};
    const draft = drafts[k] ?? {};
    return DRONE_FIELDS[k].some((f) => (draft[f.key] ?? '').trim() !== (saved[f.key] ?? ''));
  };

  const save = async (k: AnyKey, done?: boolean) => {
    if (!path) return;
    setSaving((s) => ({ ...s, [k]: done === true ? 'done' : done === false ? 'undo' : 'fields' }));
    setSaveError(null);
    const existing = path.steps[k];
    const nextDone = done ?? existing?.done ?? false;
    try {
      const res = await fetch('/api/admin/drone-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          action: 'save-step',
          step: k,
          done: nextDone,
          // Keep the day it was first ticked when only the fields change.
          done_at: nextDone && existing?.done ? existing.doneAt : undefined,
          fields: drafts[k] ?? {},
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'failed');
      // Only THIS step is taken from the reply. Two saves can be in flight at
      // once (the trip date saves when its box loses focus, which is usually
      // the moment a button is pressed), and a reply arriving out of order
      // must not put an older copy of another step back on screen.
      setPath((prev) => ({
        ...(prev ?? data.path),
        steps: { ...(prev?.steps ?? {}), [k]: data.path.steps[k] },
        updatedAt: data.path.updatedAt,
        updatedBy: data.path.updatedBy,
      }));
      // Only this step's boxes are reset to what was stored (cleaned, trimmed);
      // anything typed into another step stays where it is.
      setDrafts((d) => ({ ...d, [k]: { ...(data.path.steps[k]?.fields ?? {}) } }));
      setSavedFlash(k);
      if (done === true && k !== DRONE_PLAN_KEY) {
        // Ticked: fold it away and open the next one still to do.
        const after = DRONE_STEP_KEYS.find(
          (s) => s !== k && data.path.steps[s]?.done !== true,
        );
        setOpen((o) => {
          const n = new Set(o ?? []);
          n.delete(k as DroneStepKey);
          if (after) n.add(after);
          return n;
        });
      }
    } catch {
      setSaveError(k);
    } finally {
      setSaving((s) => {
        const next = { ...s };
        delete next[k];
        return next;
      });
    }
  };

  const toggle = (k: DroneStepKey) =>
    setOpen((o) => {
      const n = new Set(o ?? []);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const doneCount = DRONE_STEP_KEYS.filter((k) => isDone(k)).length;

  // ── Numbers and dates carried between steps ─────────────────────────────
  const ftn = val('ftn', 'ftn');
  const examId = val('test', 'examId');
  const passedOn = val('test', 'passedOn');
  const testDate = val('book', 'testDate');
  const leaveOn = val(DRONE_PLAN_KEY, 'leaveOn');

  const carried: Partial<Record<DroneStepKey, Array<{ label: string; value: string }>>> = {
    book: ftn ? [{ label: tr(DRONE_FIELD_TEXT.ftn.label), value: ftn }] : [],
    test: [
      ...(testDate ? [{ label: tr(DRONE_FIELD_TEXT.testDate.label), value: fmtDate(testDate, lang) }] : []),
      ...(val('book', 'testTime') ? [{ label: tr(DRONE_FIELD_TEXT.testTime.label), value: val('book', 'testTime') }] : []),
      ...(val('book', 'testCenter') ? [{ label: tr(DRONE_FIELD_TEXT.testCenter.label), value: val('book', 'testCenter') }] : []),
    ],
    apply: [
      ...(ftn ? [{ label: tr(DRONE_FIELD_TEXT.ftn.label), value: ftn }] : []),
      ...(examId ? [{ label: tr(DRONE_FIELD_TEXT.examId.label), value: examId }] : []),
    ],
    fly: [
      ...(val('temporary', 'certificateNumber')
        ? [{ label: tr(DRONE_FIELD_TEXT.certificateNumber.label), value: val('temporary', 'certificateNumber') }]
        : []),
      ...(val('register', 'registrationNumber')
        ? [{ label: tr(DRONE_FIELD_TEXT.registrationNumber.label), value: val('register', 'registrationNumber') }]
        : []),
    ],
  };

  const dated: Partial<Record<DroneStepKey, Array<{ label: string; iso: string }>>> = {
    test: passedOn
      ? [{ label: tr(DRONE_DATE_TEXT.applyBy), iso: endOfCalendarMonthsAfter(passedOn, CURRENCY_MONTHS) }]
      : [],
    temporary: val('temporary', 'tempIssuedOn')
      ? [{ label: tr(DRONE_DATE_TEXT.tempValidUntil), iso: addDaysIso(val('temporary', 'tempIssuedOn'), TEMP_CERT_DAYS) }]
      : [],
    register: val('register', 'registeredOn')
      ? [{ label: tr(DRONE_DATE_TEXT.renewBy), iso: addYearsIso(val('register', 'registeredOn'), REGISTRATION_YEARS) }]
      : [],
    recurrent:
      val('recurrent', 'trainedOn') || passedOn
        ? [
            {
              label: tr(DRONE_DATE_TEXT.recurrentDue),
              iso: endOfCalendarMonthsAfter(val('recurrent', 'trainedOn') || passedOn, CURRENCY_MONTHS),
            },
          ]
        : [],
  };

  const leaveDays = leaveOn ? daysUntil(leaveOn) : null;
  const testAfterLeaving = Boolean(leaveOn && testDate && testDate >= leaveOn && !isDone('test'));
  const testAfterChange = Boolean(testDate && testDate >= DRONE_TEST_CHANGES_ON && !isDone('test'));

  return (
    <Box maxW="860px" mx="auto">
      {/* Same header as Crons and the Studio tabs: gold kicker, thin H1,
          subtitle, icon-only refresh. */}
      <Flex align="flex-end" justify="space-between" mb={{ base: 5, md: 8 }} gap={3}>
        <VStack align="flex-start" spacing={1} minW={0}>
          <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="brand.accent">
            {t.common.adminKicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
            {t.drone.tabTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {t.drone.subtitle}
          </Text>
        </VStack>
        <IconButton
          aria-label={t.drone.refreshAria}
          icon={<Icon as={FaSyncAlt} boxSize={4} />}
          onClick={() => {
            setOpen(null);
            void load();
          }}
          variant="ghost"
          size="md"
          minW="44px"
          minH="44px"
          color="gray.500"
          _hover={{ color: 'brand.accent' }}
          flexShrink={0}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        />
      </Flex>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {loading && !path ? (
        <Flex justify="center" py={16}>
          <Spinner color="brand.accent" />
        </Flex>
      ) : path ? (
        <VStack align="stretch" spacing={4}>
          {/* What this is, in a few lines, and the facts worth knowing first. */}
          <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="sm" p={{ base: 5, md: 7 }}>
            <VStack align="stretch" spacing={3}>
              {DRONE_INTRO.lead.map((p, i) => (
                <Text key={i} fontSize="sm" color="gray.700" lineHeight="1.65">
                  {tr(p)}
                </Text>
              ))}
            </VStack>
            <Box
              mt={5}
              display="grid"
              gridTemplateColumns={{ base: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }}
              gap={3}
            >
              {DRONE_INTRO.facts.map((f, i) => (
                <Box key={i} borderLeft="2px solid" borderColor="brand.accentBorder" pl={3} minW={0}>
                  <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" letterSpacing="0.08em" textTransform="uppercase">
                    {tr(f.label)}
                  </Text>
                  <Text fontSize="sm" color="gray.800">
                    {tr(f.value)}
                  </Text>
                </Box>
              ))}
            </Box>

            {/* The trip date: the test has to happen before it. */}
            <Box mt={6} pt={5} borderTop="1px solid" borderColor="gray.100">
              <Flex gap={4} align={{ base: 'stretch', sm: 'flex-end' }} direction={{ base: 'column', sm: 'row' }}>
                <Box flex="1" minW={0}>
                  <Text as="label" htmlFor="drone-leave-on" fontSize="sm" color="gray.700" display="block" mb={1}>
                    {t.drone.leaveOn}
                  </Text>
                  <Input
                    id="drone-leave-on"
                    size="sm"
                    type="date"
                    maxW={{ base: '100%', sm: '220px' }}
                    value={val(DRONE_PLAN_KEY, 'leaveOn')}
                    onChange={(e) => setField(DRONE_PLAN_KEY, 'leaveOn', e.target.value)}
                    onBlur={() => {
                      if (isDirty(DRONE_PLAN_KEY)) void save(DRONE_PLAN_KEY);
                    }}
                  />
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    {t.drone.leaveOnHelp}
                  </Text>
                </Box>
                {leaveDays !== null && (
                  <Text
                    fontSize="md"
                    fontWeight="500"
                    color={leaveDays < 0 ? 'gray.500' : leaveDays <= 14 ? 'red.600' : 'gray.800'}
                  >
                    {leaveDays < 0 ? t.drone.leftAlready : t.drone.daysLeft(leaveDays)}
                  </Text>
                )}
              </Flex>
              {testAfterLeaving && (
                <Text fontSize="sm" color="red.600" mt={2}>
                  {t.drone.testAfterLeaving}
                </Text>
              )}
              {testAfterChange && (
                <Text fontSize="sm" color="orange.700" mt={2} data-testid="drone-test-after-change">
                  {t.drone.testAfterChange}
                </Text>
              )}
            </Box>
          </Box>

          {/* Progress. */}
          <Box>
            <Flex justify="space-between" align="baseline" mb={2} gap={3}>
              <Text fontSize="sm" color="gray.700">
                {t.drone.progress(doneCount, DRONE_STEP_KEYS.length)}
              </Text>
              {doneCount === DRONE_STEP_KEYS.length && (
                <Text fontSize="sm" color="green.700">
                  {t.drone.allDone}
                </Text>
              )}
            </Flex>
            <Box h="4px" bg="gray.100" borderRadius="full" overflow="hidden">
              <Box
                h="100%"
                bg="brand.accent"
                w={`${(doneCount / DRONE_STEP_KEYS.length) * 100}%`}
                transition="width 0.3s ease"
              />
            </Box>
          </Box>

          {DRONE_STEP_KEYS.map((k, i) => {
            const text = DRONE_STEP_TEXT[k];
            const state = path.steps[k];
            const done = state?.done === true;
            const isOpen = open?.has(k) ?? false;
            const isCurrent = k === current;
            const fields = DRONE_FIELDS[k];
            const carriedHere = carried[k] ?? [];
            const datesHere = dated[k] ?? [];
            return (
              <Box
                key={k}
                id={`drone-step-${k}`}
                bg="white"
                border="1px solid"
                borderColor={isCurrent ? 'brand.accent' : 'gray.200'}
                borderRadius="sm"
              >
                {/* The whole header row opens and closes the step. */}
                <Flex
                  as="button"
                  type="button"
                  w="100%"
                  textAlign="left"
                  align="center"
                  gap={3}
                  px={{ base: 4, md: 6 }}
                  py={4}
                  onClick={() => toggle(k)}
                  aria-expanded={isOpen}
                  aria-controls={`drone-step-body-${k}`}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <Flex
                    w="28px"
                    h="28px"
                    borderRadius="full"
                    flexShrink={0}
                    align="center"
                    justify="center"
                    bg={done ? 'brand.accent' : 'transparent'}
                    border="1px solid"
                    borderColor={done || isCurrent ? 'brand.accent' : 'gray.300'}
                    color={done ? 'white' : isCurrent ? 'brand.accentText' : 'gray.500'}
                    fontSize="xs"
                    fontWeight="600"
                  >
                    {done ? <Icon as={FaCheck} boxSize={3} /> : i + 1}
                  </Flex>
                  <Box flex="1" minW={0}>
                    <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="500" color={done ? 'gray.500' : 'gray.800'}>
                      {tr(text.title)}
                    </Text>
                    <Text fontSize="xs" color="gray.500" mt={0.5}>
                      {done && state?.doneAt
                        ? t.drone.doneOn(fmtDate(state.doneAt, lang), state.updatedBy ?? '')
                        : tr(text.summary)}
                    </Text>
                  </Box>
                  <Icon as={isOpen ? FaChevronUp : FaChevronDown} boxSize={3} color="gray.400" flexShrink={0} />
                </Flex>

                {isOpen && (
                  <Box id={`drone-step-body-${k}`} px={{ base: 4, md: 6 }} pb={5}>
                    {(text.time || text.cost) && (
                      <HStack spacing={5} mb={4} flexWrap="wrap" rowGap={1}>
                        {text.time && (
                          <Text fontSize="xs" color="gray.600">
                            <Text as="span" color="gray.400" textTransform="uppercase" letterSpacing="0.08em" mr={1.5}>
                              {t.drone.time}
                            </Text>
                            {tr(text.time)}
                          </Text>
                        )}
                        {text.cost && (
                          <Text fontSize="xs" color="gray.600">
                            <Text as="span" color="gray.400" textTransform="uppercase" letterSpacing="0.08em" mr={1.5}>
                              {t.drone.cost}
                            </Text>
                            {tr(text.cost)}
                          </Text>
                        )}
                      </HStack>
                    )}

                    <SectionLabel>{t.drone.whatToDo}</SectionLabel>
                    <OrderedList spacing={1.5} ml={5} mb={4} fontSize="sm" color="gray.700" lineHeight="1.6">
                      {text.todo.map((line, j) => (
                        <ListItem key={j}>{tr(line)}</ListItem>
                      ))}
                    </OrderedList>

                    {text.links && text.links.length > 0 && (
                      <Flex gap={2} flexWrap="wrap" mb={4}>
                        {text.links.map((l) => (
                          <CTAButton
                            key={l.href}
                            href={l.href}
                            variant="outline"
                            size="sm"
                            icon={FaExternalLinkAlt}
                            wrapText
                            // A column of equal buttons on a phone, a row on a desktop.
                            fullWidth={{ base: true, sm: false }}
                          >
                            {tr(l.label)}
                          </CTAButton>
                        ))}
                      </Flex>
                    )}

                    {text.notes && text.notes.length > 0 && (
                      <>
                        <SectionLabel>{t.drone.goodToKnow}</SectionLabel>
                        <UnorderedList spacing={1.5} ml={5} mb={4} fontSize="sm" color="gray.600" lineHeight="1.6">
                          {text.notes.map((line, j) => (
                            <ListItem key={j}>{tr(line)}</ListItem>
                          ))}
                        </UnorderedList>
                      </>
                    )}

                    {(carriedHere.length > 0 || datesHere.length > 0) && (
                      <Box bg="brand.surface" border="1px solid" borderColor="brand.accentBorder" borderRadius="sm" p={3} mb={4}>
                        {carriedHere.length > 0 && (
                          <>
                            <SectionLabel>{t.drone.fromEarlier}</SectionLabel>
                            {carriedHere.map((c) => (
                              <Text key={c.label} fontSize="sm" color="gray.800">
                                {c.label}: <strong>{c.value}</strong>
                              </Text>
                            ))}
                          </>
                        )}
                        {datesHere.length > 0 && (
                          <Box mt={carriedHere.length > 0 ? 3 : 0}>
                            <SectionLabel>{t.drone.dates}</SectionLabel>
                            {datesHere.map((d) => (
                              <Text key={d.label} fontSize="sm" color="gray.800">
                                {d.label}: <strong>{fmtDate(d.iso, lang)}</strong>
                              </Text>
                            ))}
                          </Box>
                        )}
                      </Box>
                    )}

                    {fields.length > 0 && (
                      <>
                        <SectionLabel>{t.drone.record}</SectionLabel>
                        <Box
                          display="grid"
                          gridTemplateColumns={{ base: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }}
                          gap={3}
                          mb={2}
                        >
                          {fields.map((f) => {
                            const ft = DRONE_FIELD_TEXT[f.key];
                            const id = `drone-${k}-${f.key}`;
                            return (
                              <Box key={f.key} minW={0}>
                                <Text as="label" htmlFor={id} fontSize="sm" color="gray.700" display="block" mb={1}>
                                  {tr(ft.label)}
                                </Text>
                                <Input
                                  id={id}
                                  size="sm"
                                  type={f.kind === 'date' ? 'date' : 'text'}
                                  inputMode={f.kind === 'number' ? 'numeric' : undefined}
                                  value={val(k, f.key)}
                                  placeholder={ft.placeholder ? tr(ft.placeholder) : undefined}
                                  maxLength={f.maxLength}
                                  onChange={(e) => setField(k, f.key, e.target.value)}
                                />
                                {ft.help && (
                                  <Text fontSize="xs" color="gray.500" mt={1}>
                                    {tr(ft.help)}
                                  </Text>
                                )}
                              </Box>
                            );
                          })}
                        </Box>
                        <Text fontSize="xs" color="gray.500" mb={4}>
                          {t.drone.noPasswords}
                        </Text>
                      </>
                    )}

                    <Flex gap={2} flexWrap="wrap" align="center">
                      {fields.length > 0 && (
                        <CTAButton
                          variant="outline"
                          size="sm"
                          onClick={() => void save(k)}
                          isDisabled={!isDirty(k) || !!saving[k]}
                          isLoading={saving[k] === 'fields'}
                        >
                          {t.drone.save}
                        </CTAButton>
                      )}
                      {done ? (
                        <CTAButton
                          variant="ghost"
                          size="sm"
                          onClick={() => void save(k, false)}
                          isLoading={saving[k] === 'undo'}
                          isDisabled={!!saving[k]}
                        >
                          {t.drone.undo}
                        </CTAButton>
                      ) : (
                        <CTAButton
                          variant="solid"
                          size="sm"
                          icon={FaCheck}
                          onClick={() => void save(k, true)}
                          isLoading={saving[k] === 'done'}
                          isDisabled={!!saving[k]}
                        >
                          {t.drone.markDone}
                        </CTAButton>
                      )}
                      {savedFlash === k && !saving[k] && (
                        <Text fontSize="xs" color="green.700">
                          {t.drone.saved}
                        </Text>
                      )}
                      {saveError === k && (
                        <Text fontSize="xs" color="red.600">
                          {t.drone.saveFailed}
                        </Text>
                      )}
                    </Flex>
                  </Box>
                )}
              </Box>
            );
          })}
        </VStack>
      ) : null}
    </Box>
  );
}

/** The small grey caps label above each part of a step. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      fontSize={{ base: 'xs', md: '2xs' }}
      color="gray.500"
      letterSpacing="0.08em"
      textTransform="uppercase"
      mb={1.5}
    >
      {children}
    </Text>
  );
}
