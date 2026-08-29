import {
  Box, VStack, HStack, Text, Flex, Icon, Badge, useToast, Spinner, IconButton,
  Switch, Collapse,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { FaSyncAlt, FaClock, FaPlay, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import ConfirmDialog from './ui/ConfirmDialog';
import { useAdminLang } from '../i18n/admin';

/**
 * "Crons" super-admin panel — the single place to see every registered
 * Vercel cron, toggle each on/off without a redeploy, kick a manual
 * run, and inspect run history. Lives behind the Menu drawer (not the
 * main tab strip) because it's operator-only, not part of Vero's
 * day-to-day. Parent gates rendering on adminLevel === 'super'.
 *
 * How registration works: each cron handler runs through runGuarded()
 * in api/cron/_guard.ts, which upserts a cron_jobs row on the first
 * invocation and re-syncs path/schedule/description on every one
 * after that. So this UI reflects reality as of the last time each
 * cron actually ran — a brand-new cron won't appear until its first
 * scheduled tick (or a manual /api/cron/<name> curl during dev).
 */

interface Props {
  adminPassword: string;
  adminLevel: 'admin' | 'super';
}

interface LastRun {
  startedAt: string;
  finishedAt: string | null;
  status: 'ok' | 'error' | 'skipped' | 'running' | string;
  durationMs: number | null;
  errorMessage: string | null;
  trigger: 'schedule' | 'manual' | string;
}

interface CronRow {
  id: string;
  name: string;
  path: string;
  schedule: string;
  description: string;
  enabled: boolean;
  lastRun: LastRun | null;
}

interface HistoryRun {
  startedAt: string;
  finishedAt: string | null;
  status: string;
  trigger: string;
  durationMs: number | null;
  errorMessage: string | null;
}

const AdminCrons = ({ adminPassword, adminLevel }: Props) => {
  const { t } = useAdminLang();
  const [items, setItems] = useState<CronRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);
  const [runningName, setRunningName] = useState<string | null>(null);
  const [confirmRun, setConfirmRun] = useState<CronRow | null>(null);
  const toast = useToast();

  const isSuper = adminLevel === 'super';

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    setMigrationNotice(null);
    try {
      const res = await fetch('/api/admin/crons-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(data.crons);
        if (data.migrationRequired) {
          setMigrationNotice(t.crons.migrationRequired);
        }
      } else {
        setError(data.error || t.crons.loadFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSuper) return;
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword, isSuper]);

  // Belt-and-braces: the parent gates this component on adminLevel==='super',
  // but if it is ever rendered at the wrong level we want a clear signal rather
  // than a UI whose every API call 403s.
  //
  // This sits BELOW the hooks on purpose. It used to sit above them, which made
  // useEffect conditional — React requires the same hooks in the same order on
  // every render, and a level change while mounted would have thrown.
  if (!isSuper) {
    return (
      <Box maxW="1200px" mx="auto" p={6}>
        <Text fontSize="sm" color="red.600">Super-admin only.</Text>
      </Box>
    );
  }

  // Optimistic toggle — flip local state first, roll back if the API
  // rejects. Feels instant even on flaky connections. Matches the
  // pattern in AdminReviews for the featured/visible switches.
  const toggleEnabled = async (row: CronRow, next: boolean) => {
    const prev = items;
    setItems((cur) =>
      cur ? cur.map((r) => (r.id === row.id ? { ...r, enabled: next } : r)) : cur,
    );
    try {
      const res = await fetch('/api/admin/crons-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, name: row.name, enabled: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setItems(prev);
        toast({
          title: data.error || t.crons.toggleFailed,
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch {
      setItems(prev);
      toast({ title: t.common.couldNotReach, status: 'error', duration: 3000, isClosable: true });
    }
  };

  const handleRunNow = async (row: CronRow) => {
    setConfirmRun(null);
    setRunningName(row.name);
    try {
      const res = await fetch('/api/admin/crons-run-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, name: row.name }),
      });
      const data = await res.json();
      // Distinguish skipped (cron disabled) from failed (error) from ok.
      // The payload the cron itself returned lives in data.payload; a
      // truthy .skipped flag on that means the guard short-circuited.
      const payload = (data.payload ?? {}) as { skipped?: boolean; ok?: boolean; error?: string; action?: string };
      const wasSkipped = payload.skipped === true || payload.action === 'skipped-cron-disabled';
      if (res.ok && data.success && !wasSkipped) {
        toast({
          title: t.crons.runNowSuccess(row.name),
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else if (wasSkipped) {
        toast({
          title: t.crons.runNowSkipped(row.name),
          status: 'warning',
          duration: 4000,
          isClosable: true,
        });
      } else {
        toast({
          title: t.crons.runNowFailed(row.name),
          description: data.error || payload.error,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 3000, isClosable: true });
    } finally {
      setRunningName(null);
      await loadItems();
    }
  };

  return (
    <Box maxW="1200px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Header matches Journal/Gallery/Reviews shape so admin-Studio
          tabs feel uniform: gold kicker, thin H1, count subtitle,
          icon-only refresh. */}
      <Flex align="flex-end" justify="space-between" mb={{ base: 5, md: 8 }} gap={3}>
        <VStack align="flex-start" spacing={1} minW={0}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="brand.accent"
          >
            {t.common.adminKicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
            {t.crons.tabTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {items ? t.crons.cronCount(items.length) : t.crons.subtitle}
          </Text>
        </VStack>

        <HStack spacing={2} flexShrink={0}>
          <IconButton
            aria-label={t.crons.refreshAria}
            icon={<Icon as={FaSyncAlt} boxSize={4} />}
            onClick={loadItems}
            variant="ghost"
            size="md"
            minW="44px"
            minH="44px"
            color="gray.500"
            _hover={{ color: 'brand.accent' }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          />
        </HStack>
      </Flex>

      {error && (
        <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      {migrationNotice && (
        <Box bg="orange.50" border="1px solid" borderColor="orange.200" p={3} mb={4} borderRadius="sm">
          <Text fontSize="sm" color="orange.800">{migrationNotice}</Text>
        </Box>
      )}

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="brand.accent" />
        </Flex>
      ) : !items || items.length === 0 ? (
        <EmptyState />
      ) : (
        <VStack spacing={3} align="stretch">
          {items.map((row) => (
            <CronCard
              key={row.id}
              row={row}
              adminPassword={adminPassword}
              running={runningName === row.name}
              onToggle={(next) => void toggleEnabled(row, next)}
              onRequestRun={() => setConfirmRun(row)}
            />
          ))}
        </VStack>
      )}

      <ConfirmDialog
        isOpen={confirmRun !== null}
        title={confirmRun ? t.crons.runNowConfirmTitle(confirmRun.name) : ''}
        body={t.crons.runNowConfirmBody}
        confirmLabel={t.crons.runNowConfirm}
        cancelLabel={t.common.cancel}
        onConfirm={() => confirmRun && void handleRunNow(confirmRun)}
        onCancel={() => setConfirmRun(null)}
      />
    </Box>
  );
};

// ─── Per-cron card ─────────────────────────────────────────────────
function CronCard({
  row,
  adminPassword,
  running,
  onToggle,
  onRequestRun,
}: {
  row: CronRow;
  adminPassword: string;
  running: boolean;
  onToggle: (next: boolean) => void;
  onRequestRun: () => void;
}) {
  const { t } = useAdminLang();
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      p={{ base: 4, md: 5 }}
      _hover={{ borderColor: 'brand.accent' }}
      transition="all 0.15s"
    >
      {/* Top row — icon + name + enabled Switch */}
      <Flex align="flex-start" gap={4} wrap={{ base: 'wrap', md: 'nowrap' }}>
        <Flex
          w="40px"
          h="40px"
          borderRadius="sm"
          bg="rgba(201, 169, 110, 0.12)"
          color="brand.accent"
          align="center"
          justify="center"
          flexShrink={0}
        >
          <Icon as={FaClock} boxSize={4} />
        </Flex>

        <VStack align="flex-start" spacing={1} flex={1} minW={0}>
          <HStack spacing={2} wrap="wrap" align="center">
            <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="600" color="gray.800">
              {row.name}
            </Text>
            {row.enabled ? (
              <Badge
                bg="green.100"
                color="green.700"
                fontSize="2xs"
                fontWeight="500"
                letterSpacing="0.1em"
                textTransform="uppercase"
                px={2}
                py={0.5}
                borderRadius="sm"
              >
                {t.crons.enabled}
              </Badge>
            ) : (
              <Badge
                bg="gray.100"
                color="gray.600"
                fontSize="2xs"
                fontWeight="500"
                letterSpacing="0.1em"
                textTransform="uppercase"
                px={2}
                py={0.5}
                borderRadius="sm"
              >
                {t.crons.disabled}
              </Badge>
            )}
          </HStack>

          <Text fontSize="xs" color="gray.500" fontWeight="300">
            {humanSchedule(row.schedule, t)} · {row.path}
          </Text>

          {row.description && (
            <Text fontSize="sm" color="gray.700" fontWeight="300" pt={1} lineHeight="1.6">
              {row.description}
            </Text>
          )}

          <Box pt={2}>
            <LastRunLine lastRun={row.lastRun} />
          </Box>
        </VStack>

        {/* Enabled Switch — thumb-reachable, aria-labelled for screen readers. */}
        <HStack spacing={2} flexShrink={0} pt={1}>
          <Switch
            isChecked={row.enabled}
            onChange={(e) => onToggle(e.target.checked)}
            colorScheme="yellow"
            size="md"
            aria-label={t.crons.enabledAria}
          />
        </HStack>
      </Flex>

      {/* Actions row — Run now + History toggle. Stacks on mobile so
          the tap targets stay full width. */}
      <Flex mt={5} pt={4} borderTop="1px solid" borderColor="gray.100" gap={2} wrap="wrap">
        <CTAButton
          onClick={onRequestRun}
          icon={FaPlay}
          variant={row.enabled ? 'solid' : 'outline'}
          size="sm"
          isLoading={running}
          loadingText={t.crons.running}
        >
          {t.crons.runNow}
        </CTAButton>
        <CTAButton
          onClick={() => setHistoryOpen((v) => !v)}
          icon={historyOpen ? FaChevronUp : FaChevronDown}
          variant="outline"
          size="sm"
        >
          {historyOpen ? t.crons.hideHistory : t.crons.history}
        </CTAButton>
      </Flex>

      <Collapse in={historyOpen} animateOpacity>
        {historyOpen && (
          // Mount the inner component only while open so a closed
          // panel doesn't hold onto stale history state.
          <HistoryPanel adminPassword={adminPassword} name={row.name} />
        )}
      </Collapse>
    </Box>
  );
}

// ─── Last-run one-liner ────────────────────────────────────────────
function LastRunLine({ lastRun }: { lastRun: LastRun | null }) {
  const { t, lang } = useAdminLang();
  if (!lastRun) {
    return (
      <Text fontSize="xs" color="gray.500" fontWeight="300">
        {t.crons.lastRunNever}
      </Text>
    );
  }
  const ago = relativeAgo(lastRun.startedAt, lang);
  if (lastRun.status === 'ok') {
    return (
      <Text fontSize="xs" color="gray.600" fontWeight="400">
        {t.crons.lastRunOk(ago, formatDuration(lastRun.durationMs))}
      </Text>
    );
  }
  if (lastRun.status === 'skipped') {
    return (
      <Text fontSize="xs" color="gray.500" fontWeight="400">
        {t.crons.lastRunSkipped(ago)}
      </Text>
    );
  }
  if (lastRun.status === 'error') {
    // Trim to first line + first ~120 chars so a giant error doesn't
    // blow out the card layout. The full text is available in History.
    const short = (lastRun.errorMessage ?? '').split('\n')[0].slice(0, 120);
    return (
      <Text fontSize="xs" color="red.600" fontWeight="400">
        {t.crons.lastRunError(ago, short || '—')}
      </Text>
    );
  }
  if (lastRun.status === 'running') {
    return (
      <Text fontSize="xs" color="orange.600" fontWeight="400">
        {t.crons.lastRunRunning(ago)}
      </Text>
    );
  }
  return null;
}

// ─── History panel (lazy) ──────────────────────────────────────────
function HistoryPanel({ adminPassword, name }: { adminPassword: string; name: string }) {
  const { t, lang } = useAdminLang();
  const [runs, setRuns] = useState<HistoryRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      try {
        const res = await fetch('/api/admin/crons-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword, name, limit: 10 }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) setRuns(data.runs);
        else setError(data.error || t.crons.historyLoadFailed(res.status));
      } catch {
        if (!cancelled) setError(t.common.couldNotReach);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword, name]);

  if (error) {
    return (
      <Box mt={4} p={3} bg="red.50" border="1px solid" borderColor="red.200" borderRadius="sm">
        <Text fontSize="xs" color="red.700">{error}</Text>
      </Box>
    );
  }
  if (!runs) {
    return (
      <Flex mt={4} justify="center" py={4}>
        <Spinner size="sm" color="brand.accent" />
      </Flex>
    );
  }
  if (runs.length === 0) {
    return (
      <Text mt={4} fontSize="xs" color="gray.500" fontWeight="300">
        {t.crons.historyEmpty}
      </Text>
    );
  }

  return (
    <Box mt={4} overflowX="auto" sx={{ scrollbarWidth: 'thin' }}>
      <Box as="table" width="100%" fontSize="xs" style={{ borderCollapse: 'collapse' }}>
        <Box as="thead">
          <Box as="tr" color="gray.500" textAlign="left">
            <HistoryTh>{t.crons.historyStartedAt}</HistoryTh>
            <HistoryTh>{t.crons.historyDuration}</HistoryTh>
            <HistoryTh>{t.crons.historyStatus}</HistoryTh>
            <HistoryTh>{t.crons.historyTrigger}</HistoryTh>
            <HistoryTh>{t.crons.historyError}</HistoryTh>
          </Box>
        </Box>
        <Box as="tbody">
          {runs.map((r, i) => (
            <Box
              as="tr"
              key={r.startedAt + i}
              borderTop="1px solid"
              borderColor="gray.100"
              color="gray.700"
            >
              <HistoryTd>{formatFullDate(r.startedAt, lang)}</HistoryTd>
              <HistoryTd>{formatDuration(r.durationMs)}</HistoryTd>
              <HistoryTd>
                <StatusPill status={r.status} />
              </HistoryTd>
              <HistoryTd>
                <TriggerPill trigger={r.trigger} />
              </HistoryTd>
              <HistoryTd>
                {r.errorMessage ? (
                  <Text as="span" color="red.600" fontSize="xs" fontFamily="'SFMono-Regular', Menlo, Consolas, monospace">
                    {r.errorMessage.split('\n')[0].slice(0, 160)}
                  </Text>
                ) : (
                  <Text as="span" color="gray.300">—</Text>
                )}
              </HistoryTd>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function HistoryTh({ children }: { children: React.ReactNode }) {
  return (
    <Box
      as="th"
      textAlign="left"
      fontSize="2xs"
      fontWeight="600"
      letterSpacing="0.1em"
      textTransform="uppercase"
      color="gray.500"
      px={2}
      py={2}
    >
      {children}
    </Box>
  );
}
function HistoryTd({ children }: { children: React.ReactNode }) {
  return (
    <Box as="td" px={2} py={2} verticalAlign="top">
      {children}
    </Box>
  );
}

function StatusPill({ status }: { status: string }) {
  const { t } = useAdminLang();
  const config: Record<string, { bg: string; color: string; label: string }> = {
    ok: { bg: 'green.100', color: 'green.700', label: t.crons.statusOk },
    error: { bg: 'red.100', color: 'red.700', label: t.crons.statusError },
    skipped: { bg: 'gray.100', color: 'gray.600', label: t.crons.statusSkipped },
    running: { bg: 'orange.100', color: 'orange.700', label: t.crons.statusRunning },
  };
  const c = config[status] ?? { bg: 'gray.100', color: 'gray.600', label: status };
  return (
    <Badge
      bg={c.bg}
      color={c.color}
      fontSize="2xs"
      fontWeight="500"
      letterSpacing="0.08em"
      textTransform="uppercase"
      px={1.5}
      py={0.5}
      borderRadius="sm"
    >
      {c.label}
    </Badge>
  );
}

function TriggerPill({ trigger }: { trigger: string }) {
  const { t } = useAdminLang();
  const label =
    trigger === 'manual' ? t.crons.triggerManual :
    trigger === 'schedule' ? t.crons.triggerSchedule :
    trigger;
  return (
    <Text
      as="span"
      fontSize="2xs"
      fontWeight="500"
      letterSpacing="0.08em"
      textTransform="uppercase"
      color="gray.500"
    >
      {label}
    </Text>
  );
}

// ─── Empty state ───────────────────────────────────────────────────
function EmptyState() {
  const { t } = useAdminLang();
  return (
    <Box
      py={{ base: 12, md: 20 }}
      px={{ base: 4, md: 6 }}
      textAlign="center"
      border="1px dashed"
      borderColor="gray.300"
      borderRadius="sm"
    >
      <VStack spacing={3} maxW="480px" mx="auto">
        <Icon as={FaClock} boxSize={8} color="gray.400" />
        <Text as="h2" fontSize="lg" fontWeight="400" color="gray.700" m={0}>
          {t.crons.emptyTitle}
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300" lineHeight="1.6">
          {t.crons.emptyDescription}
        </Text>
      </VStack>
    </Box>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Turn a 5-field cron expression into a human sentence for the common
 * cases in this project. Anything else falls back to the raw
 * expression tagged as "custom" — we deliberately don't ship a full
 * cron parser here because Vercel Hobby crons are daily-only anyway.
 */
function humanSchedule(expr: string, t: ReturnType<typeof useAdminLang>['t']): string {
  const trimmed = expr.trim();
  if (trimmed === '0 2 * * *') return t.crons.scheduleDaily2Utc;
  if (trimmed === '0 12 * * *') return t.crons.scheduleDaily12Utc;
  return t.crons.scheduleCustom(trimmed);
}

/**
 * "3h ago" / "2d ago" / "now" — compact-relative for the last-run
 * one-liner. Bilingual because the summary row is what the operator
 * scans first. Full timestamps live in the history panel.
 */
function relativeAgo(iso: string, lang: 'ru' | 'en'): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return lang === 'ru' ? 'только что' : 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return lang === 'ru' ? `${mins} мин назад` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === 'ru' ? `${hours} ч назад` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return lang === 'ru' ? `${days} д назад` : `${days}d ago`;
  const months = Math.floor(days / 30);
  return lang === 'ru' ? `${months} мес назад` : `${months}mo ago`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const remS = Math.round(seconds - mins * 60);
  return `${mins}m ${remS}s`;
}

function formatFullDate(iso: string, lang: 'ru' | 'en'): string {
  const d = new Date(iso);
  return d.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default AdminCrons;
