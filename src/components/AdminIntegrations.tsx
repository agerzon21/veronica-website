import { Box, VStack, HStack, Text, Flex, Icon, Badge, useToast } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { FaInstagram, FaCheck, FaExternalLinkAlt, FaExclamationTriangle, FaTerminal } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

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
  return (
    <Box maxW="1200px" mx="auto">
      <VStack align="flex-start" spacing={1} mb={8}>
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="#c9a96e"
        >
          Admin
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          Integrations
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300">
          Third-party services that power the site.
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
  const [status, setStatus] = useState<IgStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

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
        setError(data.error || `Status check failed (${res.status})`);
      }
    } catch {
      setError('Could not reach the server.');
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
          title: 'Marked as refreshed',
          description: 'Reminder clock reset. Next nudge in ~50 days.',
          status: 'success',
          duration: 4000,
          isClosable: true,
        });
        await loadStatus();
      } else {
        setError(data.error || `Could not save (${res.status})`);
      }
    } catch {
      setError('Could not reach the server.');
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
              fontSize="2xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.22em"
              color="#c9a96e"
            >
              Integration
            </Text>
            <Text fontSize="md" fontWeight="500" color="gray.800">
              Instagram feed
            </Text>
          </VStack>
        </HStack>
        {status && !loading && <StatusBadge status={status.status} />}
      </Flex>

      {/* Status detail row */}
      {loading ? (
        <Text fontSize="sm" color="gray.500" fontWeight="300">Checking rotation status…</Text>
      ) : status ? (
        <StatusDetail status={status} />
      ) : (
        <Text fontSize="sm" color="red.500" fontWeight="300">
          Could not read status.
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
            fontSize="2xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.22em"
            color="#c9a96e"
          >
            How to rotate
          </Text>
        </Flex>
        <VStack align="stretch" spacing={3} pl={5}>
          <Text as="li" fontSize="sm" color="gray.700" lineHeight="1.7" listStyleType="decimal">
            Open the VeronicaWebsite repo in VS Code, open a terminal
          </Text>
          <Box as="li" fontSize="sm" color="gray.700" lineHeight="1.7" listStyleType="decimal">
            Run:{' '}
            <Text
              as="code"
              display="block"
              mt={1.5}
              bg="gray.900"
              color="gray.100"
              fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
              fontSize="xs"
              px={3}
              py={2}
              borderRadius="sm"
              wordBreak="break-all"
            >
              IG_ACCESS_TOKEN=&lt;current-token-from-vercel&gt; node scripts/refresh-instagram-token.mjs
            </Text>
          </Box>
          <Text as="li" fontSize="sm" color="gray.700" lineHeight="1.7" listStyleType="decimal">
            Copy the new long-lived token from the script's output
          </Text>
          <Text as="li" fontSize="sm" color="gray.700" lineHeight="1.7" listStyleType="decimal">
            Paste it into Vercel → <Text as="code" bg="gray.100" px={1.5} py={0.5} borderRadius="sm" fontSize="xs">IG_ACCESS_TOKEN</Text> → Save → Redeploy
          </Text>
          <Text as="li" fontSize="sm" color="gray.700" lineHeight="1.7" listStyleType="decimal">
            That&rsquo;s it — the reminder clock resets automatically the
            next time this page loads or the daily cron runs (the
            <strong> Mark as Refreshed</strong> button below is just an
            optional way to reset it right this second)
          </Text>
        </VStack>
      </Box>

      {/* Actions row */}
      <HStack spacing={3} mt={6} wrap="wrap">
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
          loadingText="Saving..."
        >
          Mark as Refreshed
        </CTAButton>
        <CTAButton
          href={VERCEL_ENV_LINK}
          newTab
          icon={FaExternalLinkAlt}
          variant="outline"
          size="sm"
        >
          Open Vercel env vars
        </CTAButton>
      </HStack>

      {/* Reassurance footnote */}
      <Box mt={6} pt={5} borderTop="1px solid" borderColor="gray.100">
        <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.7">
          <strong style={{ color: '#4a5568' }}>Auto-reminder:</strong> A daily cron watches this stamp and emails
          you at agerzon21@gmail.com when we're ~10 days from the token's 60-day
          expiry. You should rarely need to open this tab.
        </Text>
      </Box>
    </Box>
  );
}

function StatusBadge({ status }: { status: IgStatus['status'] }) {
  const config: Record<IgStatus['status'], { color: string; bg: string; label: string }> = {
    fresh:   { color: 'green.700',  bg: 'green.100',  label: 'Fresh' },
    aging:   { color: 'orange.700', bg: 'orange.100', label: 'Aging' },
    overdue: { color: 'red.700',    bg: 'red.100',    label: 'Rotate now' },
    unknown: { color: 'gray.600',   bg: 'gray.100',   label: 'Unknown' },
  };
  const c = config[status];
  return (
    <Badge
      bg={c.bg}
      color={c.color}
      fontSize="2xs"
      fontWeight="500"
      letterSpacing="0.1em"
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
  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  if (status.status === 'unknown' || !status.refreshedAt || status.daysSinceRefresh === null) {
    return (
      <Text fontSize="sm" color="gray.700" fontWeight="400" lineHeight="1.6">
        {status.message || 'No rotation date on record — click Mark as Refreshed to establish a baseline.'}
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
        Last rotated{' '}
        <Text as="span" fontWeight="600" color="gray.800">
          {formatDate(status.refreshedAt)}
        </Text>{' '}
        <Text as="span" color="gray.500" fontSize="xs">
          ({status.daysSinceRefresh} {status.daysSinceRefresh === 1 ? 'day' : 'days'} ago)
        </Text>
      </Text>
      {daysRemaining !== null && (
        <Text fontSize="sm" color="gray.700" fontWeight="400">
          {daysRemaining > 0 ? (
            <>
              Estimated{' '}
              <Text as="span" fontWeight="600" color={emphasis}>
                {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
              </Text>{' '}
              of runway left (60-day token window).
            </>
          ) : (
            <Text as="span" fontWeight="600" color="red.600">
              Past the 60-day window — auto-refresh may no longer work.
            </Text>
          )}
        </Text>
      )}
      {status.userId && (
        <Text fontSize="xs" color="gray.500" fontWeight="300">
          Instagram user ID:{' '}
          <Text as="span" fontFamily="'SFMono-Regular', Menlo, Consolas, monospace">
            {status.userId}
          </Text>
        </Text>
      )}
    </VStack>
  );
}

export default AdminIntegrations;
