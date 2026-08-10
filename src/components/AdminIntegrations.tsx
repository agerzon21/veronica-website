import { Box, VStack, HStack, Stack, Text, Flex, Icon, Badge, IconButton, useToast } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { FaInstagram, FaCheck, FaExternalLinkAlt, FaExclamationTriangle, FaTerminal, FaCopy } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import { useAdminLang } from '../i18n/admin';

/**
 * The "Integrations" tab in /admin. Currently just Instagram; will grow
 * as we plug in other third-party services (WhatsApp messaging, Stripe
 * payments, etc.).
 *
 * Superadmin-only. The parent (Admin.tsx) hides the whole tab when the
 * signed-in level is 'admin' rather than 'super'.
 */

interface Props {
  adminPassword: string;
}

interface IgStatus {
  status: 'fresh' | 'aging' | 'overdue' | 'unknown';
  refreshedAt: string | null;
  daysSinceRefresh: number | null;
  daysUntilExpiry: number | null;
  userId: string | null;
  message?: string;
}

const VERCEL_ENV_LINK =
  'https://vercel.com/agerzon21/veronica-website/settings/environment-variables';

const AdminIntegrations = ({ adminPassword }: Props) => {
  const { t } = useAdminLang();
  return (
    <Box maxW="1200px" mx="auto" px={{ base: 0, md: 0 }}>
      <VStack align="flex-start" spacing={1} mb={8}>
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="#c9a96e"
        >
          {t.common.adminKicker}
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          {t.nav.integrations}
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300">
          {t.integrations.subtitle}
        </Text>
      </VStack>

      <InstagramCard adminPassword={adminPassword} />
    </Box>
  );
};

/**
 * Instagram integration card. Shows days-since-last-rotation, a rotation
 * how-to, and a "Mark as Refreshed" button that stamps `system_state`
 * with the current time (resets the reminder clock).
 *
 * The daily cron in api/cron/_instagram-check.ts fires a reminder email
 * ~50 days after the last stamp. Alex owns the actual rotation via the
 * local `scripts/refresh-instagram-token.mjs` — the button here is the
 * "I did it" acknowledgement, not the rotation itself.
 */
function InstagramCard({ adminPassword }: { adminPassword: string }) {
  const { t } = useAdminLang();
  const [status, setStatus] = useState<IgStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tiny local flag that briefly swaps the copy IconButton's icon to a checkmark
  // after clipboard write succeeds — pure visual acknowledgement, no toast noise.
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const ROTATE_COMMAND =
    'IG_ACCESS_TOKEN=<current-token-from-vercel> node scripts/refresh-instagram-token.mjs';

  const handleCopyCommand = () => {
    // Fire-and-forget clipboard write; ignore rejection (e.g. insecure context)
    // rather than surfacing a toast — the icon-swap is enough feedback.
    void navigator.clipboard?.writeText(ROTATE_COMMAND).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/instagram-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus(data);
      } else {
        setError(data.error || t.integrations.statusCheckFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword]);

  const handleMarkRefreshed = async () => {
    setMarking(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/instagram-mark-refreshed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: t.integrations.markedRefreshedTitle,
          description: t.integrations.markedRefreshedBody,
          status: 'success',
          duration: 4000,
          isClosable: true,
        });
        await loadStatus();
      } else {
        setError(data.error || t.integrations.couldNotSaveStatus(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setMarking(false);
    }
  };

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      p={{ base: 5, md: 7 }}
      maxW="720px"
    >
      {/* Card header — Instagram icon + label + live status badge */}
      <Flex align="center" justify="space-between" mb={5} wrap="wrap" gap={3}>
        <HStack spacing={3}>
          <Flex
            w="40px"
            h="40px"
            borderRadius="sm"
            bg="linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)"
            align="center"
            justify="center"
            color="white"
            flexShrink={0}
          >
            <Icon as={FaInstagram} boxSize={5} />
          </Flex>
          <VStack align="flex-start" spacing={0}>
            <Text
              fontSize={{ base: 'xs', md: '2xs' }}
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing={{ base: '0.15em', md: '0.2em' }}
              color="#c9a96e"
            >
              {t.integrations.kicker}
            </Text>
            <Text fontSize="md" fontWeight="500" color="gray.800">
              {t.integrations.instagramTitle}
            </Text>
          </VStack>
        </HStack>
        {status && !loading && <StatusBadge status={status.status} />}
      </Flex>

      {/* Status detail row */}
      {loading ? (
        <Text fontSize="sm" color="gray.500" fontWeight="300">{t.integrations.checkingStatus}</Text>
      ) : status ? (
        <StatusDetail status={status} />
      ) : (
        <Text fontSize="sm" color="red.500" fontWeight="300">
          {t.integrations.couldNotReadStatus}
        </Text>
      )}

      {error && (
        <Flex
          mt={4}
          align="center"
          gap={2}
          bg="red.50"
          border="1px solid"
          borderColor="red.200"
          borderRadius="sm"
          px={3}
          py={2}
        >
          <Icon as={FaExclamationTriangle} color="red.500" boxSize={3.5} />
          <Text fontSize="xs" color="red.700" fontWeight="400">
            {error}
          </Text>
        </Flex>
      )}

      {/* How-to-rotate section — the whole procedure lives here so the
          card is self-contained. Alex runs the script locally, updates
          Vercel, then clicks Mark as Refreshed to reset the clock. */}
      <Box mt={6} pt={5} borderTop="1px solid" borderColor="gray.100">
        <Flex align="center" gap={2} mb={3}>
          <Icon as={FaTerminal} boxSize={3} color="#c9a96e" />
          <Text
            fontSize={{ base: 'xs', md: '2xs' }}
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing={{ base: '0.15em', md: '0.2em' }}
            color="#c9a96e"
          >
            {t.integrations.howToRotate}
          </Text>
        </Flex>
        {/* Real <ol> so browsers render decimal markers — previously a VStack
            wrapped bare <li> children, which produced no numbers at all. */}
        <Box as="ol" pl={5} listStyleType="decimal">
          <Box as="li" fontSize="sm" color="gray.700" lineHeight="1.7" mb={3}>
            {t.integrations.step1}
          </Box>
          <Box as="li" fontSize="sm" color="gray.700" lineHeight="1.7" mb={3}>
            {t.integrations.stepRun}{' '}
            {/* The command is longer than a phone viewport. Instead of wrapping
                mid-token (wordBreak='break-all' looked ragged), let the code
                pane scroll horizontally, and offer a Copy button so mobile
                users don't have to select-drag inside the scroll region. */}
            <Flex mt={1.5} gap={2} align="stretch">
              <Box
                flex="1"
                minW={0}
                overflowX="auto"
                bg="gray.900"
                borderRadius="sm"
                sx={{ scrollbarWidth: 'thin' }}
              >
                <Text
                  as="code"
                  display="block"
                  color="gray.100"
                  fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
                  fontSize="xs"
                  px={3}
                  py={2}
                  whiteSpace="nowrap"
                >
                  IG_ACCESS_TOKEN=&lt;current-token-from-vercel&gt; node scripts/refresh-instagram-token.mjs
                </Text>
              </Box>
              <IconButton
                aria-label={t.integrations.copyCommandAria}
                icon={<Icon as={copied ? FaCheck : FaCopy} boxSize={3.5} />}
                onClick={handleCopyCommand}
                variant="outline"
                borderColor="gray.300"
                color={copied ? 'green.600' : 'gray.600'}
                minW={{ base: '44px', md: '32px' }}
                minH={{ base: '44px', md: '32px' }}
                h={{ base: '44px', md: '32px' }}
                w={{ base: '44px', md: '32px' }}
                borderRadius="sm"
                flexShrink={0}
              />
            </Flex>
          </Box>
          <Box as="li" fontSize="sm" color="gray.700" lineHeight="1.7" mb={3}>
            {t.integrations.step3}
          </Box>
          <Box as="li" fontSize="sm" color="gray.700" lineHeight="1.7" mb={3}>
            {t.integrations.step4Before} <Text as="code" bg="gray.100" px={1.5} py={0.5} borderRadius="sm" fontSize="xs">IG_ACCESS_TOKEN</Text> {t.integrations.step4After}
          </Box>
          <Box as="li" fontSize="sm" color="gray.700" lineHeight="1.7">
            {t.integrations.step5Before}
            <strong> {t.integrations.markAsRefreshed}</strong> {t.integrations.step5After}
          </Box>
        </Box>
      </Box>

      {/* Actions row — stacks vertically on mobile so full-width tap targets
          don't sit half-off-viewport when the labels are long. */}
      <Stack direction={{ base: 'column', md: 'row' }} spacing={2} mt={6}>
        <CTAButton
          onClick={handleMarkRefreshed}
          icon={FaCheck}
          variant={
            status?.status === 'overdue' || status?.status === 'aging'
              ? 'solid'
              : 'outline'
          }
          size="sm"
          isLoading={marking}
          loadingText={t.common.saving}
          fullWidth={{ base: true, md: false }}
        >
          {t.integrations.markAsRefreshed}
        </CTAButton>
        <CTAButton
          href={VERCEL_ENV_LINK}
          newTab
          icon={FaExternalLinkAlt}
          variant="outline"
          size="sm"
          fullWidth={{ base: true, md: false }}
        >
          {t.integrations.openVercelEnv}
        </CTAButton>
      </Stack>

      {/* Reassurance footnote */}
      <Box mt={6} pt={5} borderTop="1px solid" borderColor="gray.100">
        <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.7">
          <strong style={{ color: '#4a5568' }}>{t.integrations.autoReminderLabel}</strong>{t.integrations.autoReminderBody}
        </Text>
      </Box>
    </Box>
  );
}

function StatusBadge({ status }: { status: IgStatus['status'] }) {
  const { t } = useAdminLang();
  const config: Record<IgStatus['status'], { color: string; bg: string; label: string }> = {
    fresh:   { color: 'green.700',  bg: 'green.100',  label: t.integrations.status.fresh },
    aging:   { color: 'orange.700', bg: 'orange.100', label: t.integrations.status.aging },
    overdue: { color: 'red.700',    bg: 'red.100',    label: t.integrations.status.overdue },
    unknown: { color: 'gray.600',   bg: 'gray.100',   label: t.integrations.status.unknown },
  };
  const c = config[status];
  return (
    <Badge
      bg={c.bg}
      color={c.color}
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="500"
      letterSpacing={{ base: '0.08em', md: '0.1em' }}
      textTransform="uppercase"
      px={2.5}
      py={1}
      borderRadius="sm"
    >
      {c.label}
    </Badge>
  );
}

function StatusDetail({ status }: { status: IgStatus }) {
  const { t, lang } = useAdminLang();
  // Format the rotation date in the viewer's locale so Russian gets
  // "12 августа 2026 г." and English gets "August 12, 2026".
  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  if (status.status === 'unknown' || !status.refreshedAt || status.daysSinceRefresh === null) {
    return (
      <Text fontSize="sm" color="gray.700" fontWeight="400" lineHeight="1.6">
        {status.message || t.integrations.noRotationDate}
      </Text>
    );
  }

  const daysRemaining = status.daysUntilExpiry ?? null;
  const emphasis =
    status.status === 'overdue'
      ? 'red.600'
      : status.status === 'aging'
      ? 'orange.600'
      : 'gray.800';

  return (
    <VStack align="flex-start" spacing={2} pt={1}>
      <Text fontSize="sm" color="gray.700" fontWeight="400">
        {t.integrations.lastRotatedPrefix}{' '}
        <Text as="span" fontWeight="600" color="gray.800">
          {formatDate(status.refreshedAt)}
        </Text>{' '}
        <Text as="span" color="gray.500" fontSize="xs">
          {t.integrations.daysAgo(status.daysSinceRefresh)}
        </Text>
      </Text>
      {daysRemaining !== null && (
        <Text fontSize="sm" color="gray.700" fontWeight="400">
          {daysRemaining > 0 ? (
            <>
              {t.integrations.runwayPrefix}{' '}
              <Text as="span" fontWeight="600" color={emphasis}>
                {t.integrations.daysWord(daysRemaining)}
              </Text>{' '}
              {t.integrations.runwaySuffix}
            </>
          ) : (
            <Text as="span" fontWeight="600" color="red.600">
              {t.integrations.pastWindow}
            </Text>
          )}
        </Text>
      )}
      {status.userId && (
        <Text fontSize="xs" color="gray.500" fontWeight="300">
          {t.integrations.instagramUserIdLabel}{' '}
          <Text as="span" fontFamily="'SFMono-Regular', Menlo, Consolas, monospace">
            {status.userId}
          </Text>
        </Text>
      )}
    </VStack>
  );
}

export default AdminIntegrations;
