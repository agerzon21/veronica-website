import {
  Box,
  HStack,
  VStack,
  Text,
  Flex,
  Badge,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  SimpleGrid,
  IconButton,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import FaCalendarAlt from '../icons/fa/FaCalendarAlt';
import FaChevronDown from '../icons/fa/FaChevronDown';
import FaChevronUp from '../icons/fa/FaChevronUp';
import FaPlus from '../icons/fa/FaPlus';
import FaSearch from '../icons/fa/FaSearch';
import FaSyncAlt from '../icons/fa/FaSyncAlt';
import FaTable from '../icons/fa/FaTable';
import CTAButton from './ui/CTAButton';
import PillButton from './ui/PillButton';
import MobileSheetModal from './ui/MobileSheetModal';
import AdminCalendarView from './AdminCalendarView';
import { useAdminLang } from '../i18n/admin';
import {
  balanceOf,
  bookingTotal,
  countFilters,
  formatDate,
  formatMoney,
  galleryDaysLeft,
  relativeDay,
  selectVisible,
  type AdminPortalSummary,
  type ClientFilter,
  type ClientSort,
  type ClientSortKey,
} from './adminClients';

// The booking shape moved into adminClients.ts, where the arithmetic that
// reads it lives. Re-exported from here because this is where every caller
// has always imported it from, and moving an interface is not a reason to
// touch five other files.
export type { AdminPortalSummary } from './adminClients';

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
  /**
   * The ids of the rows she can actually see, in the order she sees them.
   *
   * Not optional polish. The client screen's Previous and Next walk the
   * Clients list, and Admin.tsx used to index the raw API array with the
   * comment "AdminDashboard does not sort or filter, so the array order IS
   * what she is looking at". This screen now sorts and filters, so that
   * comment stopped being true, and without this the Next button would walk
   * an order nobody on the other side of the screen can see.
   */
  onVisibleOrderChange?: (ids: string[]) => void;
}

const SORT_STORAGE_KEY = 'vg:clientsSort';
const FILTER_STORAGE_KEY = 'vg:clientsFilter';

const FILTER_KEYS: ClientFilter[] = ['all', 'upcoming', 'owes', 'overpaid', 'unsigned', 'deliver'];
const SORT_KEYS: ClientSortKey[] = ['date', 'name', 'money'];

/**
 * One definition of the five columns, spread into the header and into every
 * row. Two copies of these numbers is how a table's header creeps out of line
 * with its body one edit at a time.
 *
 * The order is the order she works in: who, when, what still needs doing, and
 * money last. Money used to sit fourth, ahead of the gallery, which put the
 * one column she cannot act on in front of the two she can.
 */
const COL = {
  client: { flex: '2.4 1 0', minW: 0 },
  when: { flex: '1.35 1 0', minW: 0 },
  contract: { flex: '1.4 1 0', minW: 0 },
  gallery: { flex: '1.5 1 0', minW: 0 },
  money: { flex: '1.35 1 0', minW: 0 },
} as const;

const readStoredFilter = (): ClientFilter => {
  if (typeof window === 'undefined') return 'all';
  try {
    const saved = window.localStorage.getItem(FILTER_STORAGE_KEY);
    return FILTER_KEYS.includes(saved as ClientFilter) ? (saved as ClientFilter) : 'all';
  } catch {
    // Private-mode Safari throws on every storage access. The screen still works.
    return 'all';
  }
};

const readStoredSort = (): ClientSort => {
  const fallback: ClientSort = { key: 'date', dir: 'asc' };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ClientSort>;
    if (!SORT_KEYS.includes(parsed.key as ClientSortKey)) return fallback;
    return { key: parsed.key as ClientSortKey, dir: parsed.dir === 'desc' ? 'desc' : 'asc' };
  } catch {
    return fallback;
  }
};

const AdminDashboard = ({
  portals,
  onNewClient,
  onOpenPortal,
  onRefresh,
  viewMode = 'table',
  onChangeViewMode,
  onVisibleOrderChange,
}: Props) => {
  const { t, lang } = useAdminLang();
  // Fallback no-op — used only when a caller forgets to wire
  // onChangeViewMode (shouldn't happen in Admin.tsx, but keeps the
  // desktop view toggle from crashing if someone imports this in
  // isolation).
  const setViewMode = onChangeViewMode ?? (() => {});

  const [query, setQuery] = useState('');
  const [filter, setFilterState] = useState<ClientFilter>(readStoredFilter);
  const [sort, setSortState] = useState<ClientSort>(readStoredSort);

  const setFilter = (f: ClientFilter) => {
    setFilterState(f);
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, f);
    } catch {
      // See readStoredFilter.
    }
  };

  const setSort = (s: ClientSort) => {
    setSortState(s);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(s));
    } catch {
      // See readStoredFilter.
    }
  };

  // Clicking the column she is already sorted by flips the direction.
  // Clicking a different one starts that column at the direction it is most
  // useful in: the next shoot first for dates, A first for names, and the
  // largest debt first for money.
  const toggleSort = (key: ClientSortKey) => {
    if (sort.key === key) setSort({ key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else setSort({ key, dir: key === 'money' ? 'desc' : 'asc' });
  };

  const counts = useMemo(() => countFilters(portals), [portals]);
  const visible = useMemo(
    () => selectVisible(portals, filter, query, sort, lang),
    [portals, filter, query, sort, lang],
  );

  // A filter that survives a reload can hide most of the list, so the count
  // line has to say so. It reads exactly as it always did when nothing is
  // filtered out.
  const isNarrowed = visible.length !== portals.length;

  // Hand the visible order up to the shell, for the client screen's
  // Previous / Next. `visible` is a useMemo, so this fires only when the
  // rows or their order actually change, not on every render.
  const lastSentRef = useRef<string>('');
  useEffect(() => {
    if (!onVisibleOrderChange) return;
    const ids = visible.map((p) => p.id);
    const stamp = ids.join(',');
    if (stamp === lastSentRef.current) return;
    lastSentRef.current = stamp;
    onVisibleOrderChange(ids);
  }, [visible, onVisibleOrderChange]);

  // The calendar keeps every booking in the month grid and dims the ones the
  // filter excludes, so a filtered month still looks like that month. Passing
  // undefined when nothing is narrowed keeps it at full strength.
  const matchIds = useMemo(
    () => (isNarrowed ? new Set(visible.map((p) => p.id)) : undefined),
    [isNarrowed, visible],
  );

  const clearFilters = () => {
    setFilter('all');
    setQuery('');
  };

  return (
    <Box maxW="1200px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Header row — title kicker + h1 + count on the left, refresh
          icon-button + primary CTA (+ New) on the right, ALL on the same
          row on every breakpoint. Desktop adds the Table/Calendar
          view toggle (mobile uses the bottom-nav sub-strip instead). */}
      <Flex align="flex-end" justify="space-between" mb={{ base: 4, md: 5 }} gap={2}>
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
            {t.clients.tabTitle}
          </Text>
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {t.clients.portalCountFiltered(portals.length, visible.length)}
          </Text>
        </VStack>
        <HStack spacing={2} flexShrink={0}>
          {/* Desktop-only view toggle (Table / Calendar). Mobile uses
              the bottom-nav sub-strip instead — no reason to show both. */}
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
              label={t.nav.table}
              onClick={() => setViewMode('table')}
            />
            <ViewToggleButton
              active={viewMode === 'calendar'}
              icon={FaCalendarAlt}
              label={t.nav.calendar}
              onClick={() => setViewMode('calendar')}
            />
          </HStack>
          {/* Refresh is icon-only across every admin tab now (Messages,
              Journal, Clients) so the label pattern is consistent. */}
          <IconButton
            aria-label={t.common.refresh}
            icon={<Icon as={FaSyncAlt} boxSize={4} />}
            onClick={onRefresh}
            variant="ghost"
            size="md"
            minW="44px"
            minH="44px"
            color="gray.500"
            _hover={{ color: 'brand.accent' }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          />
          {/* + New — the flow creates either a full client portal OR a
              gallery-only portal (chooser decides), so "New Client" was
              misleading. Just "+ New". */}
          <CTAButton onClick={onNewClient} icon={FaPlus} variant="solid" size="sm">
            {t.clients.newClient}
          </CTAButton>
        </HStack>
      </Flex>

      {/* The strip governs BOTH views, so it sits above the branch. Hidden
          on an account with no bookings at all, where filtering nothing by
          nothing is just furniture. */}
      {portals.length > 0 && (
        <ListControls
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          counts={counts}
          sort={sort}
          onSort={setSort}
        />
      )}

      {/* Calendar view replaces the table when toggled. The dashboard's
          empty-state + table-vs-cards stays only in table mode. */}
      {viewMode === 'calendar' && (
        <AdminCalendarView portals={portals} onOpenPortal={onOpenPortal} matchIds={matchIds} />
      )}
      {viewMode === 'table' && (
        <TableView
          portals={portals}
          visible={visible}
          onOpenPortal={onOpenPortal}
          sort={sort}
          onToggleSort={toggleSort}
          onClearFilters={clearFilters}
        />
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
      bg={active ? 'brand.accent' : 'white'}
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

/**
 * Search, six chips, and a sort control, on the ground color with no card
 * around it.
 *
 * The chips are the point. Their counts are the status summary this screen
 * has never had: how many shoots are coming, how many clients owe money, how
 * many have overpaid, how many contracts are still unsigned, how many
 * galleries are waiting to go out. The Overpaid chip renders only when there
 * is something to report, because a zero there is noise.
 */
function ListControls({
  query,
  onQuery,
  filter,
  onFilter,
  counts,
  sort,
  onSort,
}: {
  query: string;
  onQuery: (v: string) => void;
  filter: ClientFilter;
  onFilter: (f: ClientFilter) => void;
  counts: ReturnType<typeof countFilters>;
  sort: ClientSort;
  onSort: (s: ClientSort) => void;
}) {
  const { t } = useAdminLang();
  const sheet = useDisclosure();

  const chips = FILTER_KEYS.filter((k) => k === 'all' || k === filter || counts[k] > 0);

  return (
    <Box mb={{ base: 4, md: 5 }}>
      {/* flex-start, not center, because the Russian labels ("Без подписи",
          "Отдать галерею") wrap the chips onto a second row at any realistic
          width. Centred, the search field then floats half a chip lower than
          the row it belongs to. Each block instead centres its own contents
          inside a 44px band, so all three line up on the FIRST row whether
          there is one row of chips or two. */}
      <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'stretch', md: 'flex-start' }} gap={3}>
        {/* Search and the sort control share one line on a phone. Sort on its
            own row cost a full 44px band for the control she touches least. */}
        <Flex gap={2} align="center" minH="44px" flexShrink={0} w={{ base: '100%', md: '280px' }}>
          <InputGroup flex="1" minW={0}>
            <InputLeftElement pointerEvents="none" h="44px" w="40px">
              <Icon as={FaSearch} boxSize={3.5} color="gray.400" />
            </InputLeftElement>
            <Input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={t.clients.search}
              aria-label={t.clients.search}
              type="search"
              bg="white"
              h="44px"
              pl="40px"
              fontSize="sm"
              borderColor="gray.200"
              _focusVisible={{ borderColor: 'brand.accent', boxShadow: 'none' }}
            />
          </InputGroup>
          <Box display={{ base: 'block', md: 'none' }} flexShrink={0}>
            <PillButton
              label={t.clients.sortBy[sort.key]}
              ariaLabel={`${t.clients.sortLabel}: ${t.clients.sortBy[sort.key]}, ${t.clients.sortDir[sort.key][sort.dir]}`}
              icon={sort.dir === 'desc' ? FaChevronDown : FaChevronUp}
              isActive={false}
              fullWidth={false}
              onClick={sheet.onOpen}
            />
          </Box>
        </Flex>

        {/* Scrolls sideways on a phone rather than wrapping to three rows.
            The negative margins let the row bleed to the screen edges so the
            last chip is visibly cut off, which is what tells you to swipe. */}
        <Flex
          gap={2}
          flex="1"
          minW={0}
          minH={{ md: '44px' }}
          align="center"
          alignContent="center"
          flexWrap={{ base: 'nowrap', md: 'wrap' }}
          overflowX={{ base: 'auto', md: 'visible' }}
          mx={{ base: -4, md: 0 }}
          px={{ base: 4, md: 0 }}
          py={{ base: 1, md: 0 }}
          sx={{
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {chips.map((k) => (
            <Box key={k} flexShrink={0}>
              <PillButton
                label={t.clients.filterCount(t.clients.filters[k], counts[k])}
                isActive={filter === k}
                fullWidth={false}
                onClick={() => onFilter(k)}
              />
            </Box>
          ))}
        </Flex>

        {/* Desktop: the same hairline segmented shell the Table/Calendar
            toggle uses. Mobile: one pill that opens an action sheet, because
            three more chips in that row would push the filters off screen. */}
        <HStack
          spacing={0}
          border="1px solid"
          borderColor="gray.200"
          borderRadius="sm"
          overflow="hidden"
          flexShrink={0}
          alignSelf={{ md: 'center' }}
          mt={{ md: '5px' }}
          display={{ base: 'none', md: 'inline-flex' }}
        >
          {SORT_KEYS.map((k) => (
            <ViewToggleButton
              key={k}
              active={sort.key === k}
              icon={sort.key === k && sort.dir === 'desc' ? FaChevronDown : FaChevronUp}
              label={t.clients.sortBy[k]}
              onClick={() => onSort({ key: k, dir: sort.key === k ? (sort.dir === 'asc' ? 'desc' : 'asc') : k === 'money' ? 'desc' : 'asc' })}
            />
          ))}
        </HStack>
      </Flex>

      <MobileSheetModal
        isOpen={sheet.isOpen}
        onClose={sheet.onClose}
        title={t.clients.sortLabel}
        sheet
        desktopSize="sm"
      >
        <VStack align="stretch" spacing={2} pb={2}>
          {SORT_KEYS.map((k) =>
            (['asc', 'desc'] as const).map((dir) => (
              <Box
                key={`${k}-${dir}`}
                as="button"
                type="button"
                onClick={() => {
                  onSort({ key: k, dir });
                  sheet.onClose();
                }}
                w="100%"
                minH="52px"
                px={4}
                textAlign="left"
                borderRadius="md"
                border="1px solid"
                borderColor={sort.key === k && sort.dir === dir ? 'brand.accent' : 'gray.200'}
                bg={sort.key === k && sort.dir === dir ? 'brand.surface' : 'white'}
                color="gray.800"
                fontSize="sm"
                fontWeight="500"
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {t.clients.sortBy[k]}
                <Text as="span" color="gray.500" fontWeight="400">
                  {' '}
                  {t.clients.sortDir[k][dir]}
                </Text>
              </Box>
            )),
          )}
        </VStack>
      </MobileSheetModal>
    </Box>
  );
}

function TableView({
  portals,
  visible,
  onOpenPortal,
  sort,
  onToggleSort,
  onClearFilters,
}: {
  portals: AdminPortalSummary[];
  visible: AdminPortalSummary[];
  onOpenPortal: (id: string) => void;
  sort: ClientSort;
  onToggleSort: (k: ClientSortKey) => void;
  onClearFilters: () => void;
}) {
  const { t } = useAdminLang();
  return (
    <>
      {/* Empty state */}
      {portals.length === 0 && (
        <Box bg="white" borderRadius="md" border="1px solid" borderColor="gray.200" py={20} textAlign="center">
          <Text fontSize="sm" color="gray.500" fontWeight="300">
            {t.clients.emptyState}
          </Text>
        </Box>
      )}

      {/* Filtered down to nothing. A different situation from having no
          clients, and it needs the way out on the screen, not a guess at
          which chip is doing it. */}
      {portals.length > 0 && visible.length === 0 && (
        <Box bg="white" borderRadius="md" border="1px solid" borderColor="gray.200" py={16} textAlign="center">
          <VStack spacing={4}>
            <Text fontSize="sm" color="gray.500" fontWeight="300">
              {t.clients.noMatches}
            </Text>
            <CTAButton onClick={onClearFilters} variant="ghost" size="sm">
              {t.clients.clearFilter}
            </CTAButton>
          </VStack>
        </Box>
      )}

      {/* Table — desktop */}
      {visible.length > 0 && (
        <Box display={{ base: 'none', md: 'block' }} bg="white" borderRadius="md" border="1px solid" borderColor="gray.200" overflow="hidden">
          {/* Header */}
          <Flex
            px={6}
            py={2}
            bg="gray.50"
            borderBottom="1px solid"
            borderColor="gray.200"
            fontSize="2xs"
            fontWeight="500"
            letterSpacing="0.2em"
            textTransform="uppercase"
            color="gray.500"
            gap={4}
            align="center"
          >
            <SortHeader col={COL.client} label={t.clients.tableHeaders.client} sortKey="name" sort={sort} onToggle={onToggleSort} />
            <SortHeader col={COL.when} label={t.clients.tableHeaders.eventDate} sortKey="date" sort={sort} onToggle={onToggleSort} />
            <Box {...COL.contract} data-col="contract">{t.clients.tableHeaders.contract}</Box>
            <Box {...COL.gallery} data-col="gallery">{t.clients.tableHeaders.gallery}</Box>
            <SortHeader col={COL.money} label={t.clients.tableHeaders.balance} sortKey="money" sort={sort} onToggle={onToggleSort} align="right" />
          </Flex>

          {/* Rows */}
          {visible.map((p) => (
            <PortalRow key={p.id} portal={p} onClick={() => onOpenPortal(p.id)} />
          ))}
        </Box>
      )}

      {/* Cards — mobile */}
      {visible.length > 0 && (
        <VStack spacing={3} align="stretch" display={{ base: 'flex', md: 'none' }}>
          {visible.map((p) => (
            <PortalCard key={p.id} portal={p} onClick={() => onOpenPortal(p.id)} />
          ))}
        </VStack>
      )}
    </>
  );
}

/** A column header that is a real button, carries aria-sort, and shows which
 *  way the column it names is pointing. */
function SortHeader({
  col,
  label,
  sortKey,
  sort,
  onToggle,
  align = 'left',
}: {
  col: { flex: string; minW: number };
  label: string;
  sortKey: ClientSortKey;
  sort: ClientSort;
  onToggle: (k: ClientSortKey) => void;
  align?: 'left' | 'right';
}) {
  const { t } = useAdminLang();
  const active = sort.key === sortKey;
  const dirWord = t.clients.sortDir[sortKey][sort.dir];
  return (
    // aria-sort belongs on the header cell, so it sits here rather than on the
    // button inside it. The direction is ALSO spelled into the button's own
    // name, because these five cells are divs, not a real table: without a
    // table around them there is nothing to hang aria-sort on that a screen
    // reader will announce, and the name is the part that always gets read.
    <Box
      {...col}
      textAlign={align}
      data-col={sortKey}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Box
        as="button"
        type="button"
        onClick={() => onToggle(sortKey)}
        aria-label={active ? `${t.clients.sortAria(label)}, ${dirWord}` : t.clients.sortAria(label)}
        display="inline-flex"
        alignItems="center"
        gap={1}
        bg="transparent"
        border="none"
        p={0}
        fontFamily="inherit"
        fontSize="inherit"
        fontWeight="inherit"
        letterSpacing="inherit"
        textTransform="inherit"
        color={active ? 'brand.accentText' : 'gray.500'}
        cursor="pointer"
        _hover={{ color: 'brand.accentText' }}
        sx={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {label}
        <Icon
          as={active && sort.dir === 'desc' ? FaChevronDown : FaChevronUp}
          boxSize={2.5}
          opacity={active ? 1 : 0.35}
        />
      </Box>
    </Box>
  );
}

/** The second line under a cell's headline. Same size, same color, everywhere,
 *  so five columns of them read as one band rather than five decisions. */
function SubLine({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' }) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return (
    <Text
      fontSize="2xs"
      color={tone === 'warn' ? 'orange.600' : 'gray.400'}
      fontWeight={tone === 'warn' ? '500' : '400'}
      mt={0.5}
      noOfLines={1}
    >
      {children}
    </Text>
  );
}

function PortalRow({ portal, onClick }: { portal: AdminPortalSummary; onClick: () => void }) {
  const { t } = useAdminLang();
  const daysLeft = galleryDaysLeft(portal);
  return (
    <Flex
      as="button"
      type="button"
      onClick={onClick}
      data-portal-row={portal.id}
      w="100%"
      bg="transparent"
      border="none"
      textAlign="left"
      cursor="pointer"
      px={6}
      py={3}
      borderBottom="1px solid"
      borderColor="gray.100"
      _last={{ borderBottom: 'none' }}
      _hover={{ bg: 'gray.50' }}
      align="center"
      fontSize="sm"
      gap={4}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Box {...COL.client}>
        <Text fontWeight="500" color="gray.800" noOfLines={1}>
          {portal.client_display_name || portal.client_email || t.clients.unnamed}
        </Text>
        <HStack spacing={2} mt={0.5}>
          {portal.session_type && (
            // session_type is a DB enum value ('portrait', 'wedding', ...)
            // that also travels over the wire — leaving it English + capitalized.
            <Text fontSize="2xs" color="gray.400" textTransform="capitalize">
              {portal.session_type}
            </Text>
          )}
          {portal.pending_invite && (
            <Badge fontSize="2xs" colorScheme="orange" variant="subtle">
              {t.clients.status.pendingInvite}
            </Badge>
          )}
          {portal.mode === 'simple' && (
            <Badge fontSize="2xs" colorScheme="gray" variant="subtle">
              {t.clients.status.galleryOnly}
            </Badge>
          )}
        </HStack>
      </Box>

      <Box {...COL.when} color="gray.700">
        {formatDate(portal.event_date) && (
          <>
            <Text noOfLines={1}>{formatDate(portal.event_date)}</Text>
            <SubLine>{relativeDay(portal.event_date, t.clients.when)}</SubLine>
          </>
        )}
      </Box>

      <Box {...COL.contract}>
        <ContractStatusBadge status={portal.contract_status} />
        <SubLine>{contractSubLine(portal, t)}</SubLine>
      </Box>

      <Box {...COL.gallery}>
        <GalleryStatusBadge portal={portal} />
        <SubLine tone={daysLeft !== null && daysLeft >= 0 && daysLeft < 7 ? 'warn' : 'muted'}>
          {gallerySubLine(portal, t)}
        </SubLine>
      </Box>

      <Box {...COL.money}>
        <MoneyCell portal={portal} align="right" />
      </Box>
    </Flex>
  );
}

function PortalCard({ portal, onClick }: { portal: AdminPortalSummary; onClick: () => void }) {
  const { t } = useAdminLang();
  const daysLeft = galleryDaysLeft(portal);
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      data-portal-row={portal.id}
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
      _active={{ borderColor: 'brand.accent', bg: 'brand.surface' }}
      sx={{
        WebkitTapHighlightColor: 'transparent',
        '@media (hover: hover)': {
          '&:hover': { borderColor: 'brand.accent' },
        },
      }}
    >
      <VStack align="stretch" spacing={3}>
        <Box>
          <Text fontWeight="500" color="gray.800">
            {portal.client_display_name || portal.client_email || t.clients.unnamed}
          </Text>
          <HStack spacing={2} mt={1} flexWrap="wrap">
            {portal.session_type && (
              // See PortalRow — session_type stays as-is (English enum value).
              <Text fontSize="xs" color="gray.500" textTransform="capitalize">
                {portal.session_type}
              </Text>
            )}
            {/* The separator belongs to the JOIN, not to the date. It was
                hardcoded in front, so a booking with no event date rendered a
                lone floating dot, and on a gallery-only row with no session
                type either the dot was the whole line. The same bug was found
                and fixed on the client detail screen; the list never got it. */}
            {formatDate(portal.event_date) && (
              <Text fontSize="xs" color="gray.500">
                {formatDate(portal.event_date)}
              </Text>
            )}
            {relativeDay(portal.event_date, t.clients.when) && (
              <Text fontSize="xs" color="gray.400">
                {relativeDay(portal.event_date, t.clients.when)}
              </Text>
            )}
            {portal.pending_invite && (
              <Badge fontSize="2xs" colorScheme="orange" variant="subtle">
                {t.clients.status.pendingInvite}
              </Badge>
            )}
            {portal.mode === 'simple' && (
              <Badge fontSize="2xs" colorScheme="gray" variant="subtle">
                {t.clients.status.galleryOnly}
              </Badge>
            )}
          </HStack>
        </Box>
        {/* Contract and Gallery side by side, money on its own full-width
            line beneath, matching the desktop column order: the two things
            she can act on first, then the figure. */}
        <SimpleGrid columns={2} spacing={{ base: 2, md: 4 }} fontSize="xs">
          <VStack align="flex-start" spacing={0.5} minW={0}>
            <Text color="gray.400" textTransform="uppercase" letterSpacing="0.1em">{t.clients.tableHeaders.contract}</Text>
            <ContractStatusBadge status={portal.contract_status} />
            <SubLine>{contractSubLine(portal, t)}</SubLine>
          </VStack>
          <VStack align="flex-start" spacing={0.5} minW={0}>
            <Text color="gray.400" textTransform="uppercase" letterSpacing="0.1em">{t.clients.tableHeaders.gallery}</Text>
            <GalleryStatusBadge portal={portal} />
            <SubLine tone={daysLeft !== null && daysLeft >= 0 && daysLeft < 7 ? 'warn' : 'muted'}>
              {gallerySubLine(portal, t)}
            </SubLine>
          </VStack>
        </SimpleGrid>
        {portal.contract_total_amount !== null && (
          <Box>
            {/* Label and figure on ONE line. Stacked, the money block was
                three lines on a card that is already the tallest thing in a
                list of nine, and the label is the least of the three. */}
            <Flex align="baseline" justify="space-between" gap={3}>
              <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.1em" flexShrink={0}>
                {t.clients.tableHeaders.balance}
              </Text>
              <MoneyCell portal={portal} align="right" hideBar />
            </Flex>
            <PaidBar {...barPropsFor(portal)} />
          </Box>
        )}
      </VStack>
    </Box>
  );
}

/** The contract's second line: what it is worth, or when it was signed. */
function contractSubLine(portal: AdminPortalSummary, t: ReturnType<typeof useAdminLang>['t']): string {
  const total = bookingTotal(portal);
  if (total !== null) return t.clients.contractTotal(formatMoney(total));
  if (portal.contract_status === 'signed' && portal.contract_signed_at) {
    return formatDate(portal.contract_signed_at);
  }
  return '';
}

/** The gallery's second line: the countdown, or the fact that a finished
 *  gallery has not been sent yet. */
function gallerySubLine(portal: AdminPortalSummary, t: ReturnType<typeof useAdminLang>['t']): string {
  if (portal.gallery_delivered_at) {
    const daysLeft = galleryDaysLeft(portal);
    return daysLeft !== null && daysLeft >= 0 ? t.clients.status.gallery.daysLeft(daysLeft) : '';
  }
  if (portal.drive_url) return t.clients.galleryNotSent;
  return '';
}

function ContractStatusBadge({ status }: { status: AdminPortalSummary['contract_status'] }) {
  const { t } = useAdminLang();
  // Colors stay local; labels come from the shared dict so they
  // read the same as everywhere else contract statuses appear.
  const map = {
    none: { color: 'gray', label: t.clients.status.contract.none },
    pending: { color: 'orange', label: t.clients.status.contract.pending },
    signed: { color: 'green', label: t.clients.status.contract.signed },
    void: { color: 'red', label: t.clients.status.contract.void },
  } as const;
  const cfg = map[status];
  return (
    <Badge colorScheme={cfg.color} variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
      {cfg.label}
    </Badge>
  );
}

/**
 * What the client still owes, at a glance, and what it looks like when they
 * owe less than nothing.
 *
 * Three cases, where there used to be two:
 *   settled   a green pill, as before
 *   owing     "$1,600 of $3,200" over a part-filled bar
 *   overpaid  "Overpaid $70" in amber, over a full bar with the overrun
 *             hanging off the end of it
 *
 * The third case is why this replaced BalanceLine. That one collapsed
 * `remaining <= 0` into the settled branch, so a client who had sent $670
 * against a $600 booking was reported as simply "Paid $600" and the $70 she
 * owed back was invisible on the only screen that would ever have shown it.
 *
 * A booking with no contract total still renders nothing at all. Not a dash:
 * that branch is the one MOST rows take, since every gallery-only booking
 * lands there.
 */
function MoneyCell({
  portal,
  align,
  hideBar = false,
}: {
  portal: AdminPortalSummary;
  align: 'left' | 'right';
  hideBar?: boolean;
}) {
  const { t } = useAdminLang();
  const owed = bookingTotal(portal);
  if (owed === null) return null;
  const remaining = balanceOf(portal) as number;
  const paid = portal.paid_to_date;
  const bar = hideBar ? null : <PaidBar {...barPropsFor(portal)} />;

  if (remaining < 0) {
    return (
      <Box textAlign={align} minW={0}>
        <Text fontSize="sm" fontWeight="500" color="orange.600" noOfLines={1}>
          {t.clients.overpaid(formatMoney(Math.abs(remaining)))}
        </Text>
        {bar}
      </Box>
    );
  }

  if (remaining === 0 && owed > 0) {
    return (
      <Box textAlign={align} minW={0}>
        <Badge colorScheme="green" variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
          {t.clients.balancePaid(formatMoney(owed))}
        </Badge>
        {bar}
      </Box>
    );
  }

  return (
    <Box textAlign={align} minW={0}>
      <Text fontSize="sm" color="gray.700" noOfLines={1}>
        <Text as="span" fontWeight="500">{formatMoney(paid)}</Text>
        <Text as="span" color="gray.400">{t.clients.owedOfSuffix(formatMoney(owed))}</Text>
      </Text>
      {bar}
    </Box>
  );
}

/** The bar's numbers, derived from the same three branches the figure above
 *  it takes. Separate so the mobile card can put the figure on the label's
 *  line and still draw the bar full width underneath it. */
function barPropsFor(portal: AdminPortalSummary): { pct: number; tone: 'gold' | 'green' | 'amber'; overrunPct?: number } {
  const owed = bookingTotal(portal) ?? 0;
  const remaining = balanceOf(portal) ?? 0;
  if (remaining < 0) {
    const overrun = Math.abs(remaining);
    return { pct: 100, tone: 'amber', overrunPct: owed > 0 ? (overrun / owed) * 100 : 100 };
  }
  if (remaining === 0 && owed > 0) return { pct: 100, tone: 'green' };
  return { pct: owed > 0 ? (portal.paid_to_date / owed) * 100 : 0, tone: 'gold' };
}

/**
 * A 3px reading of the same figure. Not decoration: it is the only part of
 * the Money column you can read without focusing on it, which is what makes
 * a screenful of rows scannable.
 *
 * Overpaid gets a full bar plus a short detached segment past the end, so
 * "further than done" looks like further than done rather than like a
 * differently coloured done.
 */
function PaidBar({ pct, tone, overrunPct = 0 }: { pct: number; tone: 'gold' | 'green' | 'amber'; overrunPct?: number }) {
  const fill = tone === 'green' ? 'green.400' : tone === 'amber' ? 'orange.300' : 'brand.accent';
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const over = Math.max(6, Math.min(34, Number.isFinite(overrunPct) ? overrunPct : 0));
  return (
    <Flex mt={1.5} h="3px" gap="3px" align="stretch" w="100%">
      <Box flex="1" minW={0} bg="#ebe8e2" borderRadius="full" overflow="hidden">
        <Box h="100%" w={`${clamped}%`} bg={fill} borderRadius="full" transition="width 0.25s ease" />
      </Box>
      {overrunPct > 0 && <Box flex={`0 0 ${over}%`} bg="orange.400" borderRadius="full" />}
    </Flex>
  );
}

function GalleryStatusBadge({ portal }: { portal: AdminPortalSummary }) {
  const { t } = useAdminLang();
  if (portal.gallery_delivered_at) {
    if (portal.gallery_expires_at && new Date(portal.gallery_expires_at).getTime() < Date.now()) {
      return (
        <Badge colorScheme="gray" variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
          {t.clients.status.gallery.expired}
        </Badge>
      );
    }
    // The countdown used to hang off the side of this badge. It is the
    // second line of the cell now, which is where every other column keeps
    // its detail, so the five of them line up.
    return (
      <Badge colorScheme="green" variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
        {t.clients.status.gallery.delivered}
      </Badge>
    );
  }
  if (portal.drive_url) {
    return (
      <Badge colorScheme="blue" variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
        {t.clients.status.gallery.ready}
      </Badge>
    );
  }
  return (
    <Badge colorScheme="gray" variant="subtle" fontSize={{ base: 'xs', md: '2xs' }}>
      {t.clients.status.gallery.notStarted}
    </Badge>
  );
}

export default AdminDashboard;
