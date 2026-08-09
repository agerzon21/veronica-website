import { Box, HStack, VStack, Text, Flex, Badge, Icon, Stack, SimpleGrid } from '@chakra-ui/react';
import { FaPlus, FaSyncAlt, FaTable, FaCalendarAlt } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import AdminCalendarView from './AdminCalendarView';

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

type ViewMode = 'table' | 'calendar';

interface Props {
  portals: AdminPortalSummary[];
  onNewClient: () => void;
  onOpenPortal: (id: string) => void;
  onRefresh: () => void;
  // View mode is owned by the shell (Admin.tsx) so the mobile
  // bottom-nav's sub-tab strip can toggle it in sync. Falls back to
  // 'table' if unset.
  viewMode?: ViewMode;
  onChangeViewMode?: (v: ViewMode) => void;
}

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  // event_date is a DATE column — comes back as 'YYYY-MM-DD' or a full
  // ISO timestamp at midnight UTC. Parsing with `new Date(...)` then
  // formatting without timeZone='UTC' converts to the viewer's local
  // timezone, which slides date-only values back a day in any negative
  // offset. Force UTC formatting so the date that gets typed is the
  // date that gets shown.
  const datePart = iso.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

const formatMoney = (amount: number | null): string => {
  if (amount === null || amount === undefined) return '—';
  return `$${amount.toFixed(0)}`;
};

const AdminDashboard = ({
  portals,
  onNewClient,
  onOpenPortal,
  onRefresh,
  viewMode = 'table',
  onChangeViewMode,
}: Props) => {
  // Fallback no-op — used only when a caller forgets to wire
  // onChangeViewMode (shouldn't happen in Admin.tsx, but keeps the
  // desktop view toggle from crashing if someone imports this in
  // isolation).
  const setViewMode = onChangeViewMode ?? (() => {});
  return (
    <Box maxW="1200px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Header row — title kicker + h1 + count on the left, primary CTA
          (+ New) inline to the right of the title on mobile, view-toggle
          and refresh sit on a second row on mobile so they don't compete
          for space with the title. Desktop keeps everything on one row. */}
      <Stack direction="column" spacing={3} mb={{ base: 5, md: 8 }}>
        <Stack
          direction="row"
          justify="space-between"
          align="flex-end"
          spacing={3}
          w="100%"
        >
          <VStack align="flex-start" spacing={1} minW={0}>
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
          {/* + New sits inline with the title on every breakpoint. The
              label is just "+ New" because this flow can create either a
              full client portal OR a gallery-only portal — the chooser
              decides, so "New Client" was misleading. */}
          <CTAButton onClick={onNewClient} icon={FaPlus} variant="solid" size="sm">
            New
          </CTAButton>
        </Stack>
        {/* Secondary actions row: view toggle + refresh. On mobile the
            view toggle is redundant (the bottom-nav sub-strip already
            switches Table ↔ Calendar), so we hide it and only show
            Refresh. On desktop both live inline. */}
        <Stack
          direction="row"
          justify={{ base: 'flex-end', md: 'flex-end' }}
          spacing={3}
          align="center"
        >
          <HStack
            spacing={0}
            border="1px solid"
            borderColor="gray.200"
            borderRadius="sm"
            overflow="hidden"
            display={{ base: 'none', md: 'inline-flex' }}
          >
            <ViewToggleButton
              active={viewMode === 'table'}
              icon={FaTable}
              label="Table"
              onClick={() => setViewMode('table')}
            />
            <ViewToggleButton
              active={viewMode === 'calendar'}
              icon={FaCalendarAlt}
              label="Calendar"
              onClick={() => setViewMode('calendar')}
            />
          </HStack>
          <Box
            as="button"
            type="button"
            onClick={onRefresh}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            gap={2}
            fontSize={{ base: '2xs', md: 'xs' }}
            letterSpacing="0.2em"
            textTransform="uppercase"
            color="gray.500"
            _hover={{ color: '#c9a96e' }}
            _active={{ color: '#b89858' }}
            cursor="pointer"
            bg="transparent"
            border="none"
            minH={{ base: '40px', md: 'auto' }}
            px={{ base: 3, md: 2 }}
            py={{ base: 2, md: 1 }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Icon as={FaSyncAlt} boxSize={3} />
            Refresh
          </Box>
        </Stack>
      </Stack>

      {/* Calendar view replaces the table when toggled. The dashboard's
          empty-state + table-vs-cards stays only in table mode. */}
      {viewMode === 'calendar' && (
        <AdminCalendarView portals={portals} onOpenPortal={onOpenPortal} />
      )}
      {viewMode === 'table' && (
        <TableView portals={portals} onOpenPortal={onOpenPortal} />
      )}
    </Box>
  );
};

function ViewToggleButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      bg={active ? '#c9a96e' : 'white'}
      color={active ? 'white' : 'gray.600'}
      border="none"
      px={3}
      py={2}
      cursor="pointer"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      gap={2}
      // Touch target: 44px on mobile so the segmented toggle is tap-friendly;
      // slightly larger label text on mobile improves legibility.
      minH={{ base: '44px', md: 'auto' }}
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="500"
      letterSpacing="0.2em"
      textTransform="uppercase"
      _hover={{ bg: active ? '#b89858' : 'gray.50' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Icon as={icon} boxSize={3} />
      {label}
    </Box>
  );
}

function TableView({
  portals,
  onOpenPortal,
}: {
  portals: AdminPortalSummary[];
  onOpenPortal: (id: string) => void;
}) {
  return (
    <>


      {/* Empty state */}
      {portals.length === 0 && (
        <Box bg="white" borderRadius="md" border="1px solid" borderColor="gray.200" py={20} textAlign="center">
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            No portals yet. Tap "+ New" above to create the first one.
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
    </>
  );
}

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
            <Badge fontSize={{ base: 'xs', md: '2xs' }} colorScheme="orange" variant="subtle">
              Invite pending
            </Badge>
          )}
          {portal.mode === 'simple' && (
            <Badge fontSize={{ base: 'xs', md: '2xs' }} colorScheme="gray" variant="subtle">
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
      // Only apply the hover treatment on true hover-capable pointers.
      // On touch devices `_hover` sticks after tap and looks like the card
      // is stuck "selected", so we gate it behind `hover: hover` and use
      // an explicit `_active` for the pressed-tap feedback instead.
      _active={{ borderColor: '#c9a96e', bg: '#fdf9f0' }}
      sx={{
        WebkitTapHighlightColor: 'transparent',
        '@media (hover: hover)': {
          '&:hover': { borderColor: '#c9a96e' },
        },
      }}
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
        {/* Contract / Balance / Gallery — grid instead of HStack so the
            three columns don't overflow narrow phones. 2-up on tiny screens,
            3-up once we clear the `sm` breakpoint. `minW={0}` on each cell
            lets long badge/balance text truncate rather than push the grid
            wider than its container. */}
        <SimpleGrid columns={{ base: 2, sm: 3 }} spacing={{ base: 2, md: 4 }} fontSize="xs">
          <VStack align="flex-start" spacing={0.5} minW={0}>
            <Text color="gray.400" textTransform="uppercase" letterSpacing="0.1em">Contract</Text>
            <ContractStatusBadge status={portal.contract_status} />
          </VStack>
          <VStack align="flex-start" spacing={0.5} minW={0}>
            <Text color="gray.400" textTransform="uppercase" letterSpacing="0.1em">Balance</Text>
            <BalanceLine paid={portal.paid_to_date} total={portal.contract_total_amount} />
          </VStack>
          <VStack align="flex-start" spacing={0.5} minW={0}>
            <Text color="gray.400" textTransform="uppercase" letterSpacing="0.1em">Gallery</Text>
            <GalleryStatusBadge portal={portal} />
          </VStack>
        </SimpleGrid>
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
    <Badge colorScheme={cfg.color} variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
      {cfg.label}
    </Badge>
  );
}

function BalanceLine({ paid, total }: { paid: number; total: number | null }) {
  if (total === null) return <Text color="gray.500">—</Text>;
  const remaining = total - paid;
  if (remaining <= 0 && total > 0) {
    return (
      <Badge colorScheme="green" variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
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
        <Badge colorScheme="gray" variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
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
        <Badge colorScheme="green" variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
          Delivered
        </Badge>
        {daysLeft !== null && daysLeft >= 0 && (
          <Text
            fontSize={{ base: 'xs', md: '2xs' }}
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
      <Badge colorScheme="blue" variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
        Ready
      </Badge>
    );
  }
  return (
    <Badge colorScheme="gray" variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
      Not started
    </Badge>
  );
}

export default AdminDashboard;
