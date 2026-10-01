import { useState, useCallback } from 'react';
import {
  Box, Flex, Text, Icon, Spinner,
  Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton,
} from '@chakra-ui/react';
import ClientPortalView, { type ClientPortalData } from './ClientPortalView';
import FaExclamationTriangle from '../icons/fa/FaExclamationTriangle';

/**
 * "Preview Client Portal" — the client's own screen, read only, inside admin.
 *
 * WHY IT MOUNTS THE REAL COMPONENT. The point of the preview is to see what the
 * client sees, most usefully whether a balance reads correctly after a payment,
 * which is exactly the bug a second hand-built copy would fail to reproduce.
 * Eight separate places derive a balance in this codebase; a preview that
 * re-derives it a ninth way would be confirming its own arithmetic, not hers.
 *
 * WHY THERE IS NO AUTH BYPASS. The Preview Client Gallery button works by
 * opening the real client URL, which it can do because Vero knows the gallery
 * password. She cannot do that here: the full portal authenticates against
 * client_password_hash, which is bcrypt. Rather than mint a token that skips
 * that check, this renders the component against data from the ADMIN endpoint
 * she is already authenticated to. No new credential, nothing in a URL, nothing
 * in browser history.
 *
 * WHY IT IS SAFE TO PASS EMPTY CREDENTIALS. ClientPortalView takes credentials
 * and uses them for eight mutating endpoints (favorite, client, share-gallery,
 * gallery-pass, pay-start, download-contract, sign-contract, change-password).
 * All eight require them and answer 401 without them, verified endpoint by
 * endpoint. So every action in here is refused by the SERVER, not merely
 * hidden by the UI, which is the only kind of refusal worth relying on.
 *
 * Consequence to know: clicking an action shows an auth error rather than a
 * tidy disabled state. That is the honest trade for touching no client-facing
 * file. Making them disabled means adding a prop to ClientPortalView, which is
 * the component real clients render, and that was not worth the risk for
 * cosmetics.
 */

interface AdminPortalPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  /** The admin `portal` object from /api/admin/portal-detail. */
  portal: Record<string, unknown>;
  payments: Array<Record<string, unknown>>;
  charges: Array<Record<string, unknown>>;
}

type GalleryPayload = {
  rootFiles?: ClientPortalData['rootFiles'];
  sections?: ClientPortalData['sections'];
  warning?: string;
};

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

export default function AdminPortalPreview({
  isOpen, onClose, portal, payments, charges,
}: AdminPortalPreviewProps) {
  const [gallery, setGallery] = useState<GalleryPayload | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Photos come from the gallery endpoint rather than from portal-detail,
   * so no Drive call is added to an endpoint the whole admin screen depends
   * on. It is the same request the Preview Client Gallery button already
   * makes, with the same short-lived token, so an undelivered gallery still
   * shows rather than the withheld notice.
   */
  const load = useCallback(async () => {
    const password = str(portal.gallery_password);
    if (!password) { setGallery({ rootFiles: [], sections: [] }); return; }
    setLoading(true);
    try {
      const token = str(portal.gallery_preview_token);
      const res = await fetch(
        `/api/portal/gallery${token ? `?preview=${encodeURIComponent(token)}` : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        },
      );
      const data = await res.json().catch(() => ({}));
      setGallery(
        res.ok && data?.success
          ? { rootFiles: data.rootFiles ?? [], sections: data.sections ?? [], warning: data.warning }
          : { rootFiles: [], sections: [], warning: data?.error || 'Could not load the gallery for this preview.' },
      );
    } catch {
      setGallery({ rootFiles: [], sections: [], warning: 'Could not load the gallery for this preview.' });
    } finally {
      setLoading(false);
    }
  }, [portal]);

  // A free booking reaches the client with no total, retainer or charges
  // (api/portal/_client.ts), so the preview has to drop them the same way or
  // it shows Vero a balance her client never sees.
  const free = portal.complimentary === true;
  const data: ClientPortalData = {
    mode: 'full',
    client_name: str(portal.client_display_name),
    client_email: str(portal.client_email) ?? '',
    drive_url: str(portal.drive_url),
    rootFiles: gallery?.rootFiles ?? [],
    sections: gallery?.sections ?? [],
    warning: gallery?.warning,
    gallery_withheld: !portal.gallery_delivered_at,
    card_test_mode: portal.card_test_mode === true,
    event_date: str(portal.event_date),
    session_type: str(portal.session_type),
    contract_template_key: str(portal.contract_template_key),
    event_title: str(portal.event_title),
    event_location: str(portal.event_location),
    delivery_timeframe: str(portal.delivery_timeframe),
    contract_status: (str(portal.contract_status) ?? 'none') as ClientPortalData['contract_status'],
    contract_signed_at: str(portal.contract_signed_at),
    contract_body: str(portal.contract_body),
    contract_signed_pdf_available: portal.contract_signed_pdf_available === true,
    contract_total_amount: free || portal.contract_total_amount == null ? null : num(portal.contract_total_amount),
    contract_retainer_amount: free || portal.contract_retainer_amount == null ? null : num(portal.contract_retainer_amount),
    paid_to_date: num(portal.paid_to_date),
    payment_plan_enabled: !free && portal.payment_plan_enabled === true,
    // Nothing in api/ writes payment_installments yet, so the admin endpoint
    // has none to return. Empty is the truthful value, not a placeholder.
    installments: [],
    payments: payments.map((p) => ({
      id: String(p.id),
      amount: num(p.amount),
      method: str(p.method),
      note: str(p.note),
      paid_at: String(p.paid_at),
      kind: p.kind === 'tip' ? 'tip' : 'payment',
    })),
    tips_total: num(portal.tips_total),
    charges_total: free ? 0 : num(portal.charges_total),
    charges: (free ? [] : charges).map((c) => ({
      id: String(c.id),
      amount: num(c.amount),
      reason: String(c.reason ?? 'other'),
      note: str(c.note),
      charged_at: String(c.charged_at),
    })),
    gallery_password: str(portal.gallery_password) ?? '',
    gallery_enabled: portal.gallery_enabled === true,
    gallery_delivered_at: str(portal.gallery_delivered_at),
    gallery_expires_at: str(portal.gallery_expires_at),
    // Favorites are a client action and the admin endpoint does not carry
    // them. An empty list renders the gallery with nothing hearted, which is
    // the only honest option short of querying for them.
    favorite_photo_ids: [],
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" onEsc={onClose} onOverlayClick={onClose}>
      <ModalOverlay />
      <ModalContent bg="white" m={0} borderRadius={0} onAnimationStart={() => { if (!gallery && !loading) void load(); }}>
        <ModalCloseButton zIndex={60} size="lg" />
        <ModalBody p={0}>
          {/* Never leave doubt about which surface is on screen. */}
          <Flex
            align="center"
            gap={2}
            px={4}
            py={3}
            bg="brand.surfaceFold"
            borderBottom="1px solid"
            borderColor="brand.accent"
            position="sticky"
            top={0}
            zIndex={50}
          >
            <Icon as={FaExclamationTriangle} color="brand.accentText" boxSize={4} />
            <Text fontSize="sm" color="brand.mutedText">
              Preview of the client&rsquo;s portal, read only. Buttons here will not work: every action
              needs the client&rsquo;s own password and the server refuses without it.
            </Text>
          </Flex>
          {loading ? (
            <Flex align="center" justify="center" py={20} gap={3}>
              <Spinner size="sm" color="brand.accent" />
              <Text fontSize="sm" color="brand.mutedText">Loading the gallery&hellip;</Text>
            </Flex>
          ) : (
            <Box>
              <ClientPortalView
                data={data}
                credentials={{ email: '', password: '' }}
                onDataUpdate={() => { /* preview is read only */ }}
              />
            </Box>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
