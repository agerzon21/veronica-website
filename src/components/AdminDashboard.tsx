import { Box, HStack, VStack, Text, Flex, Badge, Icon } from '@chakra-ui/react';
import { FaPlus, FaSyncAlt } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

export interface AdminPortalSummary {
  id: string;
  mode: 'simple' | 'full';
  session_type: string | null;
  client_display_name: string | null;
  client_email: string | null;
  event_date: string | null;
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_signed_at: string | null;
  contract_total_amount: number | null;
  paid_to_date: number;
  drive_url: string | null;
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;
  gallery_password: string;
  gallery_enabled: boolean;
  pending_invite: boolean;
  created_at: string;
}

interface Props {
  portals: AdminPortalSummary[];
  onNewClient: () => void;
  onOpenPortal: (id: string) => void;
  onRefresh: () => void;
}

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatMoney = (amount: number | null): string => {
  if (amount === null || amount === undefined) return '—';
  return `$${amount.toFixed(0)}`;
};

const AdminDashboard = ({ portals, onNewClient, onOpenPortal, onRefresh }: Props) => {
  return (
    <Box maxW="1200px" mx="auto">
      {/* Header row */}
      <Flex
        align="center"
        justify="space-between"
        mb={8}
        wrap="wrap"
        gap={4}
      >
        <VStack align="flex-start" spacing={1}>
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
            Clients
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {portals.length} portal{portals.length === 1 ? '' : 's'}
          </Text>
        </VStack>
        <HStack spacing={3}>
          <Box
            as="button"
            type="button"
            onClick={onRefresh}
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
            <Icon as={FaSyncAlt} boxSize={3} />
            Refresh
          </Box>
          <CTAButton onClick={onNewClient} variant="solid" size="md">
            <Icon as={FaPlus} boxSize={3} mr={2} />
            New Client
          </CTAButton>
        </HStack>
      </Flex>

      {/* Empty state */}
      {portals.length === 0 && (
        <Box bg="white" borderRadius="md" border="1px solid" borderColor="gray.200" py={20} textAlign="center">
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            No portals yet. Click "New Client" to create the first one.
          </Text>
        </Box>
      )}

      {/* Table — desktop */}
      {portals.length > 0 && (
        <Box display={{ base: 'none', md: 'block' }} bg="white" borderRadius="md" border="1px solid" borderColor="gray.200" overflow="hidden">
          {/* Header */}
          <Flex
            px={6}
            py={3}
            bg="gray.50"
            borderBottom="1px solid"
            borderColor="gray.200"
            fontSize="2xs"
            fontWeight="500"
            letterSpacing="0.2em"
            textTransform="uppercase"
            color="gray.500"
            gap={4}
          >
            <Box flex="2.5">Client</Box>
            <Box flex="1.2">Event Date</Box>
            <Box flex="1.5">Contract</Box>
            <Box flex="1.5">Balance</Box>
            <Box flex="1.5">Gallery</Box>
          </Flex>

          {/* Rows */}
          {portals.map((p) => (
            <PortalRow key={p.id} portal={p} onClick={() => onOpenPortal(p.id)} />
          ))}
        </Box>
      )}

      {/* Cards — mobile */}
      {portals.length > 0 && (
        <VStack spacing={3} align="stretch" display={{ base: 'flex', md: 'none' }}>
          {portals.map((p) => (
            <PortalCard key={p.id} portal={p} onClick={() => onOpenPortal(p.id)} />
          ))}
        </VStack>
      )}
    </Box>
  );
};

function PortalRow({ portal, onClick }: { portal: AdminPortalSummary; onClick: () => void }) {
  return (
    <Flex
      as="button"
      type="button"
      onClick={onClick}
      w="100%"
      bg="transparent"
      border="none"
      textAlign="left"
      cursor="pointer"
      px={6}
      py={4}
      borderBottom="1px solid"
      borderColor="gray.100"
      _last={{ borderBottom: 'none' }}
      _hover={{ bg: 'gray.50' }}
      align="center"
      fontSize="sm"
      gap={4}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Box flex="2.5">
        <Text fontWeight="500" color="gray.800">
          {portal.client_display_name || portal.client_email || '(unnamed)'}
        </Text>
        <HStack spacing={2} mt={0.5}>
          {portal.session_type && (
            <Text fontSize="xs" color="gray.500" textTransform="capitalize">
              {portal.session_type}
            </Text>
          )}
          {portal.pending_invite && (
            <Badge fontSize="2xs" colorScheme="orange" variant="subtle">
              Invite pending
            </Badge>
          )}
          {portal.mode === 'simple' && (
            <Badge fontSize="2xs" colorScheme="gray" variant="subtle">
              Gallery-only
            </Badge>
          )}
        </HStack>
      </Box>
      <Box flex="1.2" color="gray.700">
        {formatDate(portal.event_date)}
      </Box>
      <Box flex="1.5">
        <ContractStatusBadge status={portal.contract_status} />
      </Box>
      <Box flex="1.5" color="gray.700">
        <BalanceLine paid={portal.paid_to_date} total={portal.contract_total_amount} />
      </Box>
      <Box flex="1.5">
        <GalleryStatusBadge portal={portal} />
      </Box>
    </Flex>
  );
}

function PortalCard({ portal, onClick }: { portal: AdminPortalSummary; onClick: () => void }) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      w="100%"
      textAlign="left"
      cursor="pointer"
      bg="white"
      borderRadius="md"
      border="1px solid"
      borderColor="gray.200"
      px={5}
      py={4}
      _hover={{ borderColor: '#c9a96e' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <VStack align="stretch" spacing={3}>
        <Box>
          <Text fontWeight="500" color="gray.800">
            {portal.client_display_name || portal.client_email || '(unnamed)'}
          </Text>
          <HStack spacing={2} mt={1} flexWrap="wrap">
            {portal.session_type && (
              <Text fontSize="xs" color="gray.500" textTransform="capitalize">
                {portal.session_type}
              </Text>
            )}
            <Text fontSize="xs" color="gray.500">
              · {formatDate(portal.event_date)}
            </Text>
            {portal.pending_invite && (
              <Badge fontSize="2xs" colorScheme="orange" variant="subtle">
                Invite pending
              </Badge>
            )}
            {portal.mode === 'simple' && (
              <Badge fontSize="2xs" colorScheme="gray" variant="subtle">
                Gallery-only
              </Badge>
            )}
          </HStack>
        </Box>
        <HStack spacing={6} fontSize="xs">
          <VStack align="flex-start" spacing={0.5}>
            <Text color="gray.400" textTransform="uppercase" letterSpacing="0.1em">Contract</Text>
            <ContractStatusBadge status={portal.contract_status} />
          </VStack>
          <VStack align="flex-start" spacing={0.5}>
            <Text color="gray.400" textTransform="uppercase" letterSpacing="0.1em">Balance</Text>
            <BalanceLine paid={portal.paid_to_date} total={portal.contract_total_amount} />
          </VStack>
          <VStack align="flex-start" spacing={0.5}>
            <Text color="gray.400" textTransform="uppercase" letterSpacing="0.1em">Gallery</Text>
            <GalleryStatusBadge portal={portal} />
          </VStack>
        </HStack>
      </VStack>
    </Box>
  );
}

function ContractStatusBadge({ status }: { status: AdminPortalSummary['contract_status'] }) {
  const map = {
    none: { color: 'gray', label: 'N/A' },
    pending: { color: 'orange', label: 'Pending' },
    signed: { color: 'green', label: 'Signed' },
    void: { color: 'red', label: 'Void' },
  } as const;
  const cfg = map[status];
  return (
    <Badge colorScheme={cfg.color} variant="subtle" fontSize="2xs">
      {cfg.label}
    </Badge>
  );
}

function BalanceLine({ paid, total }: { paid: number; total: number | null }) {
  if (total === null) return <Text color="gray.500">—</Text>;
  const remaining = total - paid;
  if (remaining <= 0 && total > 0) {
    return (
      <Badge colorScheme="green" variant="subtle" fontSize="2xs">
        Paid {formatMoney(total)}
      </Badge>
    );
  }
  return (
    <Text fontSize="sm">
      <Text as="span" color="gray.700" fontWeight="500">{formatMoney(paid)}</Text>
      <Text as="span" color="gray.400"> / {formatMoney(total)}</Text>
    </Text>
  );
}

function GalleryStatusBadge({ portal }: { portal: AdminPortalSummary }) {
  if (portal.gallery_delivered_at) {
    if (portal.gallery_expires_at && new Date(portal.gallery_expires_at).getTime() < Date.now()) {
      return (
        <Badge colorScheme="gray" variant="subtle" fontSize="2xs">
          Expired
        </Badge>
      );
    }
    // Compute days remaining for the countdown pill.
    const daysLeft =
      portal.gallery_expires_at !== null
        ? Math.ceil((new Date(portal.gallery_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
    return (
      <HStack spacing={2}>
        <Badge colorScheme="green" variant="subtle" fontSize="2xs">
          Delivered
        </Badge>
        {daysLeft !== null && daysLeft >= 0 && (
          <Text
            fontSize="2xs"
            color={daysLeft < 7 ? 'orange.600' : 'gray.500'}
            fontWeight={daysLeft < 7 ? '500' : '400'}
          >
            {daysLeft}d left
          </Text>
        )}
      </HStack>
    );
  }
  if (portal.drive_url) {
    return (
      <Badge colorScheme="blue" variant="subtle" fontSize="2xs">
        Ready
      </Badge>
    );
  }
  return (
    <Badge colorScheme="gray" variant="subtle" fontSize="2xs">
      Not started
    </Badge>
  );
}

export default AdminDashboard;
