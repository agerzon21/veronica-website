/**
 * "Your sessions": what a client with more than one session sees after signing
 * in (2026-10-22, Option A of the multi-session proposal).
 *
 * Built only from what the portal already has, so it reads as the same place:
 * the portal header with nothing in it but the logo (as on a shared gallery),
 * the portal's own welcome block (eyebrow, rule, "Welcome, ..." and the
 * account buttons), and its Change Password form. Below that, what needs
 * doing across every session, and a card per session. Tapping a card opens
 * the portal for that session, exactly as a one-session client sees it.
 *
 * A one-session client never comes here (Portal.tsx).
 */

import { Box, Flex, HStack, Text, VStack } from '@chakra-ui/react';
import { useState } from 'react';
import CTAButton from './ui/CTAButton';
import ConfirmDialog from './ui/ConfirmDialog';
import PortalHeader, { formatMoney } from './PortalHeader';
import { HEADER_CLEARANCE } from './portalLayout';
import FaKey from '../icons/fa/FaKey';
import FaSignOutAlt from '../icons/fa/FaSignOutAlt';
import FaCalendarAlt from '../icons/fa/FaCalendarAlt';
import { bookingOwedTotal, retainerOwed, salesTaxModeOf } from '../data/sales-tax';
import {
  ChangePasswordSection,
  InfoRow,
  formatDate,
  type AccountSession,
  type ClientPortalData,
} from './ClientPortalView';

type Tone = 'warn' | 'ok' | 'info';
interface Line { tone: Tone; text: string }

const TONE = {
  warn: { color: 'orange.700', bg: 'orange.50', dot: 'orange.500' },
  ok: { color: 'green.700', bg: 'green.50', dot: 'green.500' },
  info: { color: 'gray.700', bg: 'gray.100', dot: 'brand.accent' },
} as const;

const DAY = 86_400_000;
const dayOf = (iso: string | null): number | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  return y && m && d ? Date.UTC(y, m - 1, d) : null;
};
const today = (): number => {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
};

/** "Wedding", "Engagement", or the booking's own title when it has one. */
function titleOf(s: AccountSession): string {
  if (s.event_title?.trim()) return s.event_title.trim();
  const t = (s.session_type || s.contract_template_key || 'Session').replace(/[-_]+/g, ' ');
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * What a session needs, in the same arithmetic the portal's own Balance uses
 * (sales-tax.ts): chips for its card, and lines for "At a glance".
 */
function statusOf(s: AccountSession): { chips: Line[]; glance: Line[] } {
  const name = titleOf(s);
  const chips: Line[] = [];
  const glance: Line[] = [];
  const mode = salesTaxModeOf(s.sales_tax);
  if (s.contract_status === 'void') {
    chips.push({ tone: 'info', text: 'Cancelled' });
    return { chips, glance };
  }
  if (s.complimentary) {
    chips.push({ tone: 'ok', text: 'Free' });
  } else if (s.contract_status === 'pending') {
    chips.push({ tone: 'warn', text: 'Contract to sign' });
    glance.push({ tone: 'warn', text: `${name}: your contract is ready to sign` });
  } else if (s.contract_status === 'signed' && s.contract_total_amount !== null) {
    const owed = bookingOwedTotal(s.contract_total_amount, s.charges_total ?? 0, mode) ?? 0;
    const left = Math.max(Math.round(owed * 100) - Math.round((s.paid_to_date ?? 0) * 100), 0) / 100;
    const retainer = retainerOwed(s.contract_retainer_amount, mode) ?? 0;
    chips.push({ tone: 'ok', text: 'Contract signed' });
    if (retainer > 0 && (s.paid_to_date ?? 0) < retainer) {
      const due = Math.round((retainer - (s.paid_to_date ?? 0)) * 100) / 100;
      chips.push({ tone: 'warn', text: `Retainer due ${formatMoney(due)}` });
      glance.push({ tone: 'warn', text: `${name}: retainer of ${formatMoney(due)} to pay` });
    } else if (left > 0) {
      chips.push({ tone: 'info', text: `${formatMoney(left)} left to pay` });
      glance.push({ tone: 'info', text: `${name}: ${formatMoney(left)} left to pay` });
    } else {
      chips.push({ tone: 'ok', text: 'Paid in full' });
    }
  }
  if (s.gallery_delivered_at) {
    const end = dayOf(s.gallery_expires_at);
    if (end !== null && end < today()) {
      chips.push({ tone: 'info', text: 'Gallery closed' });
    } else {
      chips.push({ tone: 'ok', text: 'Photos ready' });
      if (end !== null) {
        const days = Math.round((end - today()) / DAY);
        const until = formatDate(s.gallery_expires_at as string);
        if (days <= 30) {
          chips.push({ tone: 'warn', text: `Online until ${until}` });
          glance.push({ tone: 'warn', text: `${name}: photos online until ${until}, save the ones you love` });
        }
      }
    }
  }
  return { chips, glance };
}

const Chip = ({ line }: { line: Line }) => (
  <Text as="span" fontSize="2xs" fontWeight="500" letterSpacing="0.06em" px={2} py={0.5} borderRadius="sm" color={TONE[line.tone].color} bg={TONE[line.tone].bg} whiteSpace="nowrap">
    {line.text}
  </Text>
);

export default function ClientAccountHome({
  data,
  credentials,
  onOpen,
  onBook,
  onLogout,
  onPasswordChanged,
}: {
  data: ClientPortalData;
  credentials: { email: string; password: string; portalId?: string };
  onOpen: (id: string) => void;
  onBook: () => void;
  onLogout: () => void;
  onPasswordChanged: (newPassword: string) => void;
}) {
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const sessions = data.sessions ?? [];
  const now = today();
  const upcoming = sessions
    .filter((s) => (dayOf(s.event_date) ?? Infinity) >= now)
    .sort((a, b) => (dayOf(a.event_date) ?? Infinity) - (dayOf(b.event_date) ?? Infinity));
  const past = sessions
    .filter((s) => (dayOf(s.event_date) ?? Infinity) < now)
    .sort((a, b) => (dayOf(b.event_date) ?? 0) - (dayOf(a.event_date) ?? 0));
  const glance = [...upcoming, ...past].flatMap((s) => statusOf(s).glance);

  const card = (s: AccountSession) => {
    const { chips } = statusOf(s);
    const where = s.event_location || s.session_location;
    return (
      <Box
        key={s.id}
        as="button"
        type="button"
        onClick={() => onOpen(s.id)}
        data-testid="session-card"
        w="100%"
        textAlign="left"
        bg="white"
        border="1px solid"
        borderColor="gray.200"
        borderRadius="md"
        px={5}
        py={4}
        transition="border-color 0.15s"
        _hover={{ borderColor: 'brand.accent' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'brand.accent', outlineOffset: '2px' }}
      >
        <Flex justify="space-between" align="baseline" gap={3} wrap="wrap">
          <Text fontSize="lg" fontWeight="400" color="gray.800">{titleOf(s)}</Text>
          {s.event_date && <Text fontSize="sm" color="gray.500">{formatDate(s.event_date)}</Text>}
        </Flex>
        {where && <Text fontSize="sm" color="gray.500" mt={0.5}>{where}</Text>}
        {chips.length > 0 && (
          <Flex gap={1.5} wrap="wrap" mt={3}>
            {chips.map((c, i) => <Chip key={i} line={c} />)}
          </Flex>
        )}
      </Box>
    );
  };

  return (
    <Box minH="100vh" bg="white">
      <PortalHeader />
      <Box pt={HEADER_CLEARANCE}>
        {/* The portal's own welcome block, same markup and buttons. */}
        <Box px={6} py={{ base: 8, md: 10 }} textAlign="center">
          <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="brand.accent" mb={3}>
            Your Portal
          </Text>
          <Box w="40px" h="1px" bg="brand.accent" mx="auto" mb={5} />
          <Text as="h1" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="200" color="gray.800" letterSpacing="0.02em" m={0}>
            {data.client_name ? `Welcome, ${data.client_name}` : 'Welcome'}
          </Text>
          <VStack spacing={2} mt={5} mx="auto" align="center">
            <InfoRow label="Email" value={data.client_email} />
          </VStack>
          <HStack mt={6} spacing={3} justify="center" flexWrap="wrap">
            <CTAButton onClick={onBook} icon={FaCalendarAlt} variant="outline" size="sm">
              Book Another Session
            </CTAButton>
            <CTAButton onClick={() => setPasswordOpen((v) => !v)} icon={FaKey} variant="outline" size="sm">
              Change Password
            </CTAButton>
            <CTAButton onClick={() => setSignOutOpen(true)} icon={FaSignOutAlt} variant="danger" size="sm">
              Sign Out
            </CTAButton>
          </HStack>
        </Box>

        <VStack align="stretch" spacing={8} maxW="640px" mx="auto" px={6} pb={16}>
          {glance.length > 0 && (
            <Box bg="brand.surface" border="1px solid" borderColor="brand.accentBorder" borderRadius="md" px={5} py={4} data-testid="at-a-glance">
              <Text fontSize="2xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="brand.accentText" mb={2.5}>
                At a glance
              </Text>
              <VStack align="stretch" spacing={2}>
                {glance.map((g, i) => (
                  <Flex key={i} gap={3} align="baseline">
                    <Box w="7px" h="7px" borderRadius="full" bg={TONE[g.tone].dot} flex="none" transform="translateY(-1px)" />
                    <Text fontSize="sm" color="gray.700">{g.text}</Text>
                  </Flex>
                ))}
              </VStack>
            </Box>
          )}

          {upcoming.length > 0 && (
            <VStack align="stretch" spacing={3}>
              <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500">
                {past.length > 0 ? 'Upcoming sessions' : 'Your sessions'}
              </Text>
              {upcoming.map(card)}
            </VStack>
          )}
          {past.length > 0 && (
            <VStack align="stretch" spacing={3}>
              <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500">
                {upcoming.length > 0 ? 'Past sessions' : 'Your sessions'}
              </Text>
              {past.map(card)}
            </VStack>
          )}

          {passwordOpen && (
            <ChangePasswordSection credentials={credentials} onChanged={onPasswordChanged} />
          )}
        </VStack>
      </Box>

      <ConfirmDialog
        isOpen={signOutOpen}
        title="Sign out?"
        body="You will need your email and password to get back in."
        confirmLabel="Sign Out"
        cancelLabel="Stay Signed In"
        danger
        onConfirm={() => {
          setSignOutOpen(false);
          onLogout();
        }}
        onCancel={() => setSignOutOpen(false)}
      />
    </Box>
  );
}
