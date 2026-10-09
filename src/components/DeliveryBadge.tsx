import { Box, Flex, Icon, Spinner, Text } from '@chakra-ui/react';
import FaCheckCircle from '../icons/fa/FaCheckCircle';
import FaExclamationTriangle from '../icons/fa/FaExclamationTriangle';
import { useAdminLang } from '../i18n/admin';

/**
 * Did an email actually arrive? A spinner while Resend is still deciding, a
 * green check once it is delivered, a red warning if it bounced.
 *
 * Instagram needs nothing like this, Vero can open the app and see the
 * message. Email is opaque: the composer clears and she has to trust it
 * went. Worse, "Resend accepted it" and "the client received it" are
 * different facts, and a bounce is exactly the case where she needs to
 * know and would otherwise never find out.
 *
 * Shared by the Messages thread and the client screen's photos-are-ready
 * email (2026-10-09, moved out of AdminMessages), so the two read the same.
 */
export const DELIVERY_TERMINAL = ['delivered', 'bounced', 'complained', 'failed', 'canceled'];

/**
 * Opened and clicked are later than delivered, not earlier: an email someone
 * opened was delivered. Without this they counted as still in flight and the
 * spinner never stopped for exactly the emails that worked best.
 */
export function deliveryStateOf(state: string | null | undefined): string | null {
  if (!state) return null;
  return state === 'opened' || state === 'clicked' ? 'delivered' : state;
}

export default function DeliveryBadge({
  state: rawState,
  onRetry,
  retrying,
  align = 'end',
  detail,
}: {
  state: string | null | undefined;
  onRetry?: () => void;
  retrying?: boolean;
  /** 'end' sits under an outbound message bubble; 'start' under a form. */
  align?: 'start' | 'end';
  /** Said after the state, e.g. "to client@example.com · Oct 9, 3:51 AM". */
  detail?: string;
}) {
  const { t } = useAdminLang();
  const state = deliveryStateOf(rawState);
  if (!state) return null;

  const failed =
    state === 'bounced' || state === 'complained' || state === 'failed' || state === 'canceled';
  const delivered = state === 'delivered';
  const inFlight = !DELIVERY_TERMINAL.includes(state);

  return (
    <Flex align="center" gap={1} justify={align === 'end' ? 'flex-end' : 'flex-start'} mt={1} wrap="wrap">
      {/* In-flight gets a spinner rather than a static icon: the state is
          genuinely still resolving, and a motionless "Sent" reads as the
          final answer. Sized to the text so it's a hint, not a widget. */}
      {inFlight ? (
        <Spinner size="xs" boxSize={2.5} thickness="1.5px" speed="0.9s" color="gray.400" />
      ) : (
        <Icon
          as={delivered ? FaCheckCircle : FaExclamationTriangle}
          boxSize={2.5}
          color={delivered ? 'green.500' : 'red.500'}
        />
      )}
      <Text
        fontSize="2xs"
        color={failed ? 'red.600' : delivered ? 'green.600' : 'gray.500'}
        fontWeight={failed ? '500' : '400'}
        // A bounce is the one state that needs Vero to DO something, and
        // retrying is usually futile, a hard bounce means the address
        // doesn't accept mail, and Resend suppresses it after one.
        title={failed ? t.messages.deliveryBouncedHelp : undefined}
      >
        {failed
          ? t.messages.deliveryBounced
          : delivered
          ? t.messages.deliveryDelivered
          : t.messages.deliverySent}
        {detail ? ` ${detail}` : ''}
      </Text>
      {/* Retry only on failure, and only because the common bounce here
          is TRANSIENT, a busy or filtering receiver, or a shared
          sending IP briefly on a blocklist. Those clear on their own,
          so a second attempt genuinely works. */}
      {failed && onRetry && (
        <Box
          as="button"
          type="button"
          onClick={onRetry}
          disabled={retrying}
          ml={1}
          fontSize="2xs"
          fontWeight="500"
          color="brand.accentText"
          textDecoration="underline"
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {retrying ? t.common.sending : t.messages.deliveryBouncedRetry}
        </Box>
      )}
    </Flex>
  );
}
