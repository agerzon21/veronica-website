/**
 * Taxes: every deadline in one list, the sales tax cards, and what the 2026
 * return will need. Super admin only (Menu, Taxes).
 *
 * WHY THIS EXISTS. The first sales tax return was filed two and a half months
 * late because nothing said it was due, and the income tax side (federal, PA
 * and Scranton, with estimated payments in between) was tracked nowhere. The
 * deadlines live in src/data/tax-calendar.ts; api/cron/_tax-reminders.ts
 * emails Alex 14 and 3 days before each one until it is marked done here, or,
 * for a sales tax return, marked filed on the licence card below.
 *
 * Not tax advice, and the page says so: it is a checklist built from the IRS,
 * PA Revenue and Scranton's own pages, for the person who files.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Box, Flex, Icon, IconButton, ListItem, Spinner, Text, UnorderedList, VStack } from '@chakra-ui/react';
import CTAButton from './ui/CTAButton';
import { useAdminLang } from '../i18n/admin';
import FaCheck from '../icons/fa/FaCheck';
import FaExternalLinkAlt from '../icons/fa/FaExternalLinkAlt';
import FaSyncAlt from '../icons/fa/FaSyncAlt';
import { SalesTaxLicenseCard, SalesTaxReportCard } from './AdminTaxCards';
import {
  TAX_DEADLINES,
  TAX_SERIES,
  daysBetween,
  deadlineIsDone,
  easternToday,
  seriesKey,
  type TaxDeadline,
  type TaxSeries,
} from '../data/tax-calendar';
import { TAX_GUIDE } from '../data/tax-guide';

type DoneMap = Record<string, { at: string; by: string }>;

/**
 * "Coming up" shows what falls due in the next four months, which always
 * reaches the next quarterly sales tax return, and never fewer than three.
 */
const SOON_DAYS = 120;
const AT_LEAST = 3;

function fmtDate(iso: string, lang: 'en' | 'ru'): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function AdminTax({ adminPassword }: { adminPassword: string }) {
  const { t, lang } = useAdminLang();
  // The guide's long points are English only (super admin only page); see tax-guide.ts.
  const pick = (l: { en: string; ru?: string }) => (lang === 'ru' ? l.ru ?? l.en : l.en);
  const [done, setDone] = useState<DoneMap>({});
  const [lastFiled, setLastFiled] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // The licence card's "Mark filed" changes which sales tax returns are done,
  // so the list re-reads when it reports a change.
  const [cardsVersion, setCardsVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/tax-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'failed');
      setDone(data.done ?? {});
      setLastFiled(data.lastFiledPeriod ?? null);
    } catch {
      setError(t.tax.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [adminPassword, t.tax.loadFailed]);

  useEffect(() => {
    void load();
  }, [load, cardsVersion]);

  const mark = async (key: string, value: boolean) => {
    setBusy(key);
    try {
      const res = await fetch('/api/admin/tax-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, action: 'mark', key, done: value }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'failed');
      setDone(data.done ?? {});
      setLastFiled(data.lastFiledPeriod ?? null);
    } catch {
      setError(t.tax.saveFailed);
    } finally {
      setBusy(null);
    }
  };

  const today = easternToday();
  const open = useMemo(
    () =>
      TAX_DEADLINES.filter((d) => !deadlineIsDone(d, done, lastFiled)).sort((a, b) => (a.due < b.due ? -1 : 1)),
    [done, lastFiled],
  );
  // A series marked as not applying is one line in Done, not one per date.
  const seriesOff = (Object.keys(TAX_SERIES) as TaxSeries[]).filter((s) => done[seriesKey(s)]);
  const finished = useMemo(
    () =>
      TAX_DEADLINES.filter((d) => !(d.series && done[seriesKey(d.series)]) && deadlineIsDone(d, done, lastFiled)).sort((a, b) =>
        a.due < b.due ? 1 : -1,
      ),
    [done, lastFiled],
  );
  const soon = open.filter((d) => daysBetween(today, d.due) <= SOON_DAYS);
  const shown = showAll ? open : soon.length >= AT_LEAST ? soon : open.slice(0, AT_LEAST);
  const lastListed = TAX_DEADLINES.reduce((m, d) => (d.due > m ? d.due : m), '');
  const listRunsOut = daysBetween(today, lastListed) < 120;

  return (
    <Box maxW="860px" mx="auto">
      <Flex align="flex-end" justify="space-between" mb={{ base: 5, md: 8 }} gap={3}>
        <VStack align="flex-start" spacing={1} minW={0}>
          <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="brand.accent">
            {t.common.adminKicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
            {t.tax.tabTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {t.tax.subtitle}
          </Text>
        </VStack>
        <IconButton
          aria-label={t.tax.refreshAria}
          icon={<Icon as={FaSyncAlt} boxSize={4} />}
          onClick={() => void load()}
          variant="ghost"
          size="md"
          minW="44px"
          minH="44px"
          color="gray.500"
          _hover={{ color: 'brand.accent' }}
          flexShrink={0}
        />
      </Flex>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {/* ── Coming up ───────────────────────────────────────────────── */}
      <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="sm" p={{ base: 5, md: 7 }} mb={6}>
        <Text as="h2" fontSize="md" fontWeight="400" color="gray.800" m={0} mb={1}>
          {t.tax.comingUp}
        </Text>
        <Text fontSize="sm" color="gray.500" mb={4}>
          {t.tax.remindersNote}
        </Text>
        {loading ? (
          <Spinner color="brand.accent" />
        ) : open.length === 0 ? (
          <Text fontSize="sm" color="gray.600">{t.tax.nothingOpen}</Text>
        ) : (
          <VStack align="stretch" spacing={0} divider={<Box borderTop="1px solid" borderColor="gray.100" />}>
            {shown.map((d) => (
              <DeadlineRow
                key={d.key}
                d={d}
                today={today}
                lang={lang}
                busy={busy === d.key}
                onDone={() => void mark(d.key, true)}
                seriesBusy={!!d.series && busy === seriesKey(d.series)}
                onNotApplicable={d.series ? () => void mark(seriesKey(d.series as TaxSeries), true) : undefined}
              />
            ))}
          </VStack>
        )}
        {open.length > shown.length || showAll ? (
          <Box mt={3}>
            <CTAButton variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
              {showAll ? t.tax.showFewer : t.tax.showAll(open.length)}
            </CTAButton>
          </Box>
        ) : null}
        {listRunsOut && (
          <Text fontSize="xs" color="orange.700" mt={3}>
            {t.tax.listRunsOut(fmtDate(lastListed, lang))}
          </Text>
        )}
        {(finished.length > 0 || seriesOff.length > 0) && (
          <Box mt={5} pt={4} borderTop="1px solid" borderColor="gray.100">
            <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" letterSpacing="0.08em" textTransform="uppercase" mb={2}>
              {t.tax.doneHeading}
            </Text>
            <VStack align="stretch" spacing={1}>
              {seriesOff.map((s) => (
                <Flex key={s} justify="space-between" align="center" gap={3} flexWrap="wrap" data-testid={`series-off-${s}`}>
                  <Text fontSize="sm" color="gray.500">
                    <Icon as={FaCheck} boxSize={3} color="green.600" mr={2} />
                    {t.tax.seriesOff(TAX_SERIES[s][lang])}
                  </Text>
                  <CTAButton variant="ghost" size="sm" onClick={() => void mark(seriesKey(s), false)} isLoading={busy === seriesKey(s)}>
                    {t.tax.seriesUndo}
                  </CTAButton>
                </Flex>
              ))}
              {finished.map((d) => (
                <Flex key={d.key} justify="space-between" align="center" gap={3} flexWrap="wrap">
                  <Text fontSize="sm" color="gray.500">
                    <Icon as={FaCheck} boxSize={3} color="green.600" mr={2} />
                    {d.title[lang]}
                  </Text>
                  {!d.salesPeriod && (
                    <CTAButton variant="ghost" size="sm" onClick={() => void mark(d.key, false)} isLoading={busy === d.key}>
                      {t.tax.undo}
                    </CTAButton>
                  )}
                </Flex>
              ))}
            </VStack>
          </Box>
        )}
      </Box>

      {/* ── Sales tax: the licence with its returns, and what goes on them ── */}
      <SalesTaxLicenseCard adminPassword={adminPassword} onChanged={() => setCardsVersion((v) => v + 1)} />
      <SalesTaxReportCard adminPassword={adminPassword} />

      {/* ── The 2026 return ─────────────────────────────────────────── */}
      <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="sm" p={{ base: 5, md: 7 }} mt={6}>
        <Text as="h2" fontSize="md" fontWeight="400" color="gray.800" m={0} mb={1}>
          {pick(TAX_GUIDE.title)}
        </Text>
        <Text fontSize="sm" color="gray.500" mb={5}>
          {pick(TAX_GUIDE.intro)}
        </Text>
        <VStack align="stretch" spacing={6}>
          {TAX_GUIDE.sections.map((sec) => (
            <Box key={sec.title.en}>
              <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" letterSpacing="0.08em" textTransform="uppercase" mb={2}>
                {pick(sec.title)}
              </Text>
              <UnorderedList spacing={1.5} ml={5} fontSize="sm" color="gray.700" lineHeight="1.6">
                {sec.points.map((p, i) => (
                  <ListItem key={i}>{pick(p)}</ListItem>
                ))}
              </UnorderedList>
              {sec.links && sec.links.length > 0 && (
                <Flex gap={2} flexWrap="wrap" mt={3}>
                  {sec.links.map((l) => (
                    <CTAButton key={l.href} href={l.href} variant="outline" size="sm" icon={FaExternalLinkAlt} wrapText fullWidth={{ base: true, sm: false }}>
                      {pick(l.label)}
                    </CTAButton>
                  ))}
                </Flex>
              )}
            </Box>
          ))}
        </VStack>
        <Text fontSize="xs" color="gray.500" mt={6}>
          {pick(TAX_GUIDE.disclaimer)}
        </Text>
      </Box>
    </Box>
  );
}

function DeadlineRow({
  d,
  today,
  lang,
  busy,
  onDone,
  seriesBusy,
  onNotApplicable,
}: {
  d: TaxDeadline;
  today: string;
  lang: 'en' | 'ru';
  busy: boolean;
  onDone: () => void;
  seriesBusy: boolean;
  /** For a tax that applies only in some cases: switch off every date in it. */
  onNotApplicable?: () => void;
}) {
  const { t } = useAdminLang();
  const left = daysBetween(today, d.due);
  const scheme = left < 0 ? 'red' : left <= 3 ? 'red' : left <= 14 ? 'orange' : left <= 45 ? 'yellow' : 'gray';
  return (
    <Box py={3} data-testid={`deadline-${d.key}`}>
      <Flex justify="space-between" align="flex-start" gap={3} flexWrap="wrap">
        <Box minW={0} flex="1">
          <Text fontSize="xs" color="gray.500">
            {fmtDate(d.due, lang)} · {t.tax.kinds[d.kind]}
          </Text>
          <Text fontSize="sm" fontWeight="500" color="gray.800">
            {d.title[lang]}
          </Text>
        </Box>
        <Badge colorScheme={scheme} flexShrink={0}>
          {left < 0 ? t.tax.overdue(-left) : left === 0 ? t.tax.today : t.tax.inDays(left)}
        </Badge>
      </Flex>
      <Text fontSize="sm" color="gray.600" mt={1} lineHeight="1.55">
        {d.detail[lang]}
      </Text>
      {d.onlyIf && (
        <Text fontSize="xs" color="gray.500" mt={1}>
          {t.tax.onlyIf} {d.onlyIf[lang]}
        </Text>
      )}
      <Flex gap={2} mt={2} flexWrap="wrap" align="center">
        {d.link && (
          <CTAButton href={d.link.href} variant="outline" size="sm" icon={FaExternalLinkAlt}>
            {d.link.label[lang]}
          </CTAButton>
        )}
        {d.salesPeriod ? (
          <Text fontSize="xs" color="gray.500">
            {t.tax.markOnCard}
          </Text>
        ) : (
          <CTAButton variant="ghost" size="sm" icon={FaCheck} onClick={onDone} isLoading={busy}>
            {t.tax.markDone}
          </CTAButton>
        )}
        {onNotApplicable && (
          <CTAButton variant="ghost" size="sm" onClick={onNotApplicable} isLoading={seriesBusy}>
            {t.tax.notApplicable}
          </CTAButton>
        )}
      </Flex>
    </Box>
  );
}
