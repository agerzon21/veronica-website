import { Box, VStack, HStack, Text, Flex, Icon, SimpleGrid } from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import type { AdminPortalSummary } from './AdminDashboard';

interface Props {
  portals: AdminPortalSummary[];
  onOpenPortal: (id: string) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Returns "2026-08-09" — local-timezone date string for keying portals
// against an event_date stored as DATE in Postgres (which we receive as
// a YYYY-MM-DD string after JSON serialization).
const ymd = (d: Date): string =>
  `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

const sameYmd = (d: Date) => ymd(d);
const todayYmd = () => sameYmd(new Date());

const AdminCalendarView = ({ portals, onOpenPortal }: Props) => {
  // The first day of the visible month. Navigation just adjusts this.
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const monthLabel = cursor.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

  // Index portals by their event_date for fast cell lookup.
  const portalsByDate = useMemo(() => {
    const map = new Map<string, AdminPortalSummary[]>();
    for (const p of portals) {
      if (!p.event_date) continue;
      // Normalize to YYYY-MM-DD — event_date from the API may be a full
      // ISO timestamp, just take the date part.
      const key = p.event_date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return map;
  }, [portals]);

  // Build a 6x7 grid covering the visible month. Leading + trailing
  // cells come from the prev/next month, dimmed in the UI.
  const cells = useMemo(() => {
    const firstOfMonth = cursor;
    const firstDayOfWeek = firstOfMonth.getDay(); // 0=Sun
    const startDate = new Date(firstOfMonth);
    startDate.setDate(firstOfMonth.getDate() - firstDayOfWeek);

    const cells: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      cells.push({ date: d, inMonth: d.getMonth() === firstOfMonth.getMonth() });
    }
    return cells;
  }, [cursor]);

  const goPrev = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const goNext = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  const goToday = () => {
    const d = new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const today = todayYmd();

  // Agenda list for mobile — chronological list of days IN the visible
  // month that have events. 6×7 grid cells crushed to ~53px on a 375px
  // viewport, which meant EventChip labels truncated to 3 chars and
  // taps were basically impossible. Agenda is honest about the shape
  // of the data (which is inherently a list, not a grid — a photographer
  // has 1-2 sessions a week, not 30).
  const agenda = useMemo(() => {
    return cells
      .filter(({ date, inMonth }) => inMonth && portalsByDate.has(sameYmd(date)))
      .map(({ date }) => ({
        date,
        key: sameYmd(date),
        events: portalsByDate.get(sameYmd(date)) ?? [],
      }));
  }, [cells, portalsByDate]);

  return (
    <Box>
      {/* Month nav — bigger nav buttons on mobile so the chevrons are
          real tap targets, and Today gets a border so it reads as a
          button rather than orphaned text. */}
      <Flex align="center" justify="space-between" mb={4} gap={3}>
        <HStack spacing={{ base: 2, md: 3 }}>
          <NavButton onClick={goPrev}>
            <Icon as={FaChevronLeft} boxSize={{ base: 4, md: 3 }} />
          </NavButton>
          <Text
            fontSize={{ base: 'sm', md: 'md' }}
            fontWeight="500"
            color="gray.800"
            minW={{ base: '120px', md: '140px' }}
            textAlign="center"
          >
            {monthLabel}
          </Text>
          <NavButton onClick={goNext}>
            <Icon as={FaChevronRight} boxSize={{ base: 4, md: 3 }} />
          </NavButton>
        </HStack>
        <Box
          as="button"
          type="button"
          onClick={goToday}
          fontSize={{ base: 'xs', md: 'xs' }}
          letterSpacing={{ base: '0.15em', md: '0.2em' }}
          textTransform="uppercase"
          color="gray.500"
          _hover={{ color: 'brand.accent' }}
          _active={{ color: 'brand.accent', bg: 'rgba(201, 169, 110, 0.06)' }}
          cursor="pointer"
          bg="transparent"
          border={{ base: '1px solid', md: 'none' }}
          borderColor={{ base: 'gray.200', md: 'transparent' }}
          borderRadius={{ base: 'sm', md: 'none' }}
          px={{ base: 3, md: 0 }}
          py={{ base: 2, md: 0 }}
          minH={{ base: '40px', md: 'auto' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          Today
        </Box>
      </Flex>

      {/* Mobile: agenda list (only days with events) */}
      <Box display={{ base: 'block', md: 'none' }} mb={4}>
        {agenda.length === 0 ? (
          <Box
            bg="white"
            border="1px dashed"
            borderColor="gray.300"
            borderRadius="sm"
            py={10}
            textAlign="center"
            color="gray.400"
            fontSize="sm"
          >
            No sessions scheduled this month.
          </Box>
        ) : (
          <VStack spacing={2.5} align="stretch">
            {agenda.map(({ date, key, events }) => {
              const isToday = key === today;
              return (
                <Box
                  key={key}
                  bg="white"
                  border="1px solid"
                  borderColor={isToday ? 'brand.accent' : 'gray.200'}
                  borderRadius="sm"
                  p={4}
                >
                  <HStack spacing={3} align="baseline" mb={2}>
                    <Text
                      fontSize="2xl"
                      fontWeight="300"
                      color={isToday ? 'brand.accent' : 'gray.800'}
                      lineHeight="1"
                    >
                      {date.getDate()}
                    </Text>
                    <VStack spacing={0} align="flex-start">
                      <Text
                        fontSize="xs"
                        fontWeight="500"
                        letterSpacing="0.12em"
                        textTransform="uppercase"
                        color={isToday ? 'brand.accent' : 'gray.500'}
                      >
                        {date.toLocaleDateString('en-US', { weekday: 'long' })}
                        {isToday && ' · Today'}
                      </Text>
                      <Text fontSize="2xs" color="gray.400">
                        {events.length} session{events.length === 1 ? '' : 's'}
                      </Text>
                    </VStack>
                  </HStack>
                  <VStack align="stretch" spacing={1.5}>
                    {events.map((p) => (
                      <Box
                        key={p.id}
                        as="button"
                        type="button"
                        onClick={() => onOpenPortal(p.id)}
                        w="100%"
                        textAlign="left"
                        bg="brand.surface"
                        border="1px solid"
                        borderColor="rgba(201, 169, 110, 0.35)"
                        borderRadius="sm"
                        px={3}
                        py={3}
                        minH="44px"
                        _active={{ bg: 'brand.surfaceSunken', borderColor: 'brand.accent' }}
                        sx={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <Text fontSize="sm" color="gray.800" fontWeight="500" noOfLines={1}>
                          {p.client_display_name || 'Unnamed session'}
                        </Text>
                        {p.session_type && (
                          <Text fontSize="xs" color="gray.500" mt={0.5} noOfLines={1}>
                            {p.session_type}
                          </Text>
                        )}
                      </Box>
                    ))}
                  </VStack>
                </Box>
              );
            })}
          </VStack>
        )}
      </Box>

      {/* Desktop: 6×7 month grid — hidden on mobile because 40-53px
          cells with 10px event labels are actively worse than an
          agenda. */}
      <Box display={{ base: 'none', md: 'block' }}>
        {/* Day labels */}
        <SimpleGrid columns={7} spacing={0} mb={1}>
          {DAY_LABELS.map((d) => (
            <Box key={d} px={2} py={2} textAlign="center">
              <Text fontSize="2xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.400">
                {d}
              </Text>
            </Box>
          ))}
        </SimpleGrid>

        {/* Day cells */}
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" overflow="hidden">
          <SimpleGrid columns={7} spacing={0}>
            {cells.map(({ date, inMonth }, i) => {
              const key = sameYmd(date);
              const events = portalsByDate.get(key) ?? [];
              const isToday = key === today;
              return (
                <DayCell
                  key={i}
                  date={date}
                  inMonth={inMonth}
                  isToday={isToday}
                  events={events}
                  onOpenPortal={onOpenPortal}
                  isLastColumn={(i + 1) % 7 === 0}
                  isLastRow={i >= 35}
                />
              );
            })}
          </SimpleGrid>
        </Box>
      </Box>

      {/* Legend */}
      <HStack spacing={5} mt={4} fontSize="xs" color="gray.500" flexWrap="wrap">
        <LegendDot color="brand.accent" label="Booked" />
        <LegendDot color="green.500" label="Signed / Delivered" />
        <LegendDot color="orange.400" label="Pending" />
      </HStack>
    </Box>
  );
};

function DayCell({
  date,
  inMonth,
  isToday,
  events,
  onOpenPortal,
  isLastColumn,
  isLastRow,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  events: AdminPortalSummary[];
  onOpenPortal: (id: string) => void;
  isLastColumn: boolean;
  isLastRow: boolean;
}) {
  return (
    <Box
      minH={{ base: '70px', md: '110px' }}
      bg={inMonth ? 'white' : 'gray.50'}
      borderRight={isLastColumn ? 'none' : '1px solid'}
      borderBottom={isLastRow ? 'none' : '1px solid'}
      borderColor="gray.100"
      px={1.5}
      py={1.5}
      position="relative"
    >
      {/* Day number */}
      <Flex justify="flex-end" mb={1}>
        {isToday ? (
          <Box
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            w="22px"
            h="22px"
            borderRadius="full"
            bg="brand.accent"
            color="white"
            fontSize="xs"
            fontWeight="500"
          >
            {date.getDate()}
          </Box>
        ) : (
          <Text
            fontSize="xs"
            color={inMonth ? 'gray.600' : 'gray.400'}
            fontWeight={inMonth ? '400' : '300'}
            px={1}
          >
            {date.getDate()}
          </Text>
        )}
      </Flex>

      {/* Event chips */}
      <VStack spacing={1} align="stretch">
        {events.slice(0, 3).map((p) => (
          <EventChip key={p.id} portal={p} onClick={() => onOpenPortal(p.id)} />
        ))}
        {events.length > 3 && (
          <Text fontSize="2xs" color="gray.400" px={1}>
            +{events.length - 3} more
          </Text>
        )}
      </VStack>
    </Box>
  );
}

function EventChip({ portal, onClick }: { portal: AdminPortalSummary; onClick: () => void }) {
  // Color reflects the most-advanced status of the booking. For
  // gallery-only rows, "delivered" is the milestone; for full-mode,
  // "signed" comes first then "delivered".
  const color = (() => {
    if (portal.gallery_delivered_at) return 'green.500';
    if (portal.contract_status === 'signed') return 'green.500';
    if (portal.contract_status === 'pending') return 'orange.400';
    return 'brand.accent';
  })();

  const label = portal.client_display_name || portal.client_email || '(unnamed)';

  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      w="100%"
      px={1.5}
      py={1}
      bg="white"
      border="1px solid"
      borderColor={color}
      borderRadius="sm"
      textAlign="left"
      cursor="pointer"
      _hover={{ bg: 'gray.50' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <HStack spacing={1.5} align="center">
        <Box w="6px" h="6px" borderRadius="full" bg={color} flexShrink={0} />
        <Text
          fontSize="2xs"
          color="gray.700"
          fontWeight="500"
          noOfLines={1}
          flex="1"
          minW={0}
        >
          {label}
        </Text>
      </HStack>
    </Box>
  );
}

function NavButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      w={{ base: '44px', md: '32px' }}
      h={{ base: '44px', md: '32px' }}
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      cursor="pointer"
      color="gray.600"
      _hover={{ borderColor: 'brand.accent', color: 'brand.accent' }}
      _active={{ borderColor: 'brand.accent', color: 'brand.accent', bg: 'brand.surface' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {children}
    </Box>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <HStack spacing={2}>
      <Box w="8px" h="8px" borderRadius="full" bg={color} />
      <Text fontSize="xs" color="gray.500">{label}</Text>
    </HStack>
  );
}

export default AdminCalendarView;
