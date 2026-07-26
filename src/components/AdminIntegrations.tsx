import { Box, VStack, HStack, Text, Flex, Icon, Badge, useToast } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { FaInstagram, FaCheck, FaCopy, FaExternalLinkAlt, FaSync, FaExclamationTriangle } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

/**
 * The "Integrations" tab in /admin. Currently just Instagram; will grow
 * as we plug in other third-party services (WhatsApp messaging, Stripe
 * payments, etc.).
 *
 * Superadmin-only. The parent (Admin.tsx) hides the whole tab when the
 * signed-in level is 'admin' rather than 'super' — the endpoints under
 * this component also enforce super on the server, so the tab-hide is a
 * UX-first line of defense, not the actual security boundary.
 */

interface Props {
  adminPassword: string;
}

interface IgStatus {
  status: 'valid' | 'expiring' | 'expired' | 'invalid' | 'missing';
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  appId: string | null;
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
 * Instagram integration card. Shows current token status + a Refresh
 * button that rotates the 60-day long-lived token. On success, surfaces
 * the new token with a Copy button and a deep link to the Vercel env-
 * var page so the paste-in step is a 5-second flow.
 *
 * The daily cron in api/cron/_instagram-check.ts also fires an email
 * ~12 days before expiration with a ready-to-paste token, so this card
 * is really a "check now" / "rotate ahead of schedule" tool rather than
 * a reminder mechanism.
 */
function InstagramCard({ adminPassword }: { adminPassword: string }) {
  const [status, setStatus] = useState<IgStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [newTokenExpiry, setNewTokenExpiry] = useState<number | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
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

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    setNewToken(null);
    try {
      const res = await fetch('/api/admin/instagram-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewToken(data.token);
        setNewTokenExpiry(data.expiresInDays);
        toast({
          title: `New token minted — valid ${data.expiresInDays} days`,
          description: 'Copy it below and paste into Vercel.',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } else {
        setError(
          data.error ||
            `Refresh failed (${res.status}). If the token is past its 60-day window a full re-mint via Meta's dashboard is needed.`,
        );
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleCopyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      // fall through — the token is visible in the code block below
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
      {/* Card header — Instagram icon + label + live status badge on the
          right. Uses the same uppercase-gold typography as the rest of
          the site so the card feels of a piece. */}
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
        {status && <StatusBadge status={status} loading={loading} />}
      </Flex>

      {/* Status detail row */}
      {loading ? (
        <Text fontSize="sm" color="gray.500" fontWeight="300">Checking token status…</Text>
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

      {/* Actions row */}
      <HStack spacing={3} mt={6} wrap="wrap">
        <CTAButton
          onClick={handleRefresh}
          icon={FaSync}
          variant={
            status?.status === 'expiring' || status?.status === 'expired'
              ? 'solid'
              : 'outline'
          }
          size="sm"
          isLoading={refreshing}
          loadingText="Refreshing..."
        >
          Refresh Token
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

      {/* New-token panel — appears after a successful refresh with the
          exact string to paste + a Copy button + the 3-step recipe. */}
      {newToken && (
        <Box
          mt={6}
          bg="#fdf9f0"
          border="1px solid"
          borderColor="#e8d9a8"
          borderRadius="sm"
          p={5}
        >
          <Text
            fontSize="2xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.22em"
            color="#8a6e35"
            mb={2}
          >
            New long-lived token
          </Text>
          <Text fontSize="xs" color="gray.700" mb={3} lineHeight="1.6">
            Valid for <strong>{newTokenExpiry} days</strong>. Paste into Vercel to activate.
          </Text>
          <Box
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="sm"
            p={3}
            mb={3}
            fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
            fontSize="xs"
            color="gray.800"
            wordBreak="break-all"
            lineHeight="1.5"
          >
            {newToken}
          </Box>
          <HStack spacing={3} wrap="wrap">
            <CTAButton
              onClick={handleCopyToken}
              icon={tokenCopied ? FaCheck : FaCopy}
              variant="solid"
              size="sm"
            >
              {tokenCopied ? 'Copied!' : 'Copy Token'}
            </CTAButton>
            <CTAButton
              href={VERCEL_ENV_LINK}
              newTab
              icon={FaExternalLinkAlt}
              variant="outline"
              size="sm"
            >
              Paste into Vercel
            </CTAButton>
          </HStack>

          <Box mt={5} pt={4} borderTop="1px solid" borderColor="#e8d9a8">
            <Text fontSize="2xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.22em" color="#8a6e35" mb={2}>
              Next steps
            </Text>
            <VStack align="flex-start" spacing={1.5} pl={4}>
              <Text as="li" fontSize="xs" color="gray.700" lineHeight="1.6">
                Open the Vercel env vars page (link above)
              </Text>
              <Text as="li" fontSize="xs" color="gray.700" lineHeight="1.6">
                Edit <Text as="code" bg="whiteAlpha.700" px={1.5} py={0.5} borderRadius="sm" fontSize="2xs">IG_ACCESS_TOKEN</Text>, paste the token, save
              </Text>
              <Text as="li" fontSize="xs" color="gray.700" lineHeight="1.6">
                Deployments → ⋯ on latest → <strong>Redeploy</strong> (uncheck "Use existing Build Cache")
              </Text>
            </VStack>
          </Box>
        </Box>
      )}

      {/* Auto-refresh reassurance */}
      <Box mt={6} pt={5} borderTop="1px solid" borderColor="gray.100">
        <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.7">
          <strong style={{ color: '#4a5568' }}>Auto-refresh:</strong> A daily cron checks this token and emails a
          ready-to-paste refreshed one ~12 days before expiration. You should
          rarely need to visit this page — but it's here whenever you want
          to rotate ahead of schedule.
        </Text>
      </Box>
    </Box>
  );
}

function StatusBadge({ status, loading }: { status: IgStatus; loading: boolean }) {
  if (loading) return null;
  const config: Record<
    IgStatus['status'],
    { color: string; bg: string; label: string }
  > = {
    valid:    { color: 'green.700',  bg: 'green.100',  label: 'Healthy' },
    expiring: { color: 'orange.700', bg: 'orange.100', label: 'Expiring soon' },
    expired:  { color: 'red.700',    bg: 'red.100',    label: 'Expired' },
    invalid:  { color: 'red.700',    bg: 'red.100',    label: 'Invalid' },
    missing:  { color: 'red.700',    bg: 'red.100',    label: 'Not configured' },
  };
  const c = config[status.status];
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

  return (
    <VStack align="flex-start" spacing={2} pt={1}>
      {status.daysUntilExpiry !== null && status.expiresAt ? (
        <Text fontSize="sm" color="gray.700" fontWeight="400">
          Token expires in{' '}
          <Text
            as="span"
            fontWeight="600"
            color={
              status.status === 'expiring'
                ? 'orange.600'
                : status.status === 'expired'
                ? 'red.600'
                : 'gray.800'
            }
          >
            {status.daysUntilExpiry} {status.daysUntilExpiry === 1 ? 'day' : 'days'}
          </Text>{' '}
          <Text as="span" color="gray.500" fontSize="xs">
            (on {formatDate(status.expiresAt)})
          </Text>
        </Text>
      ) : (
        <Text fontSize="sm" color="gray.700" fontWeight="400">
          {status.message || 'Token status unavailable.'}
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
