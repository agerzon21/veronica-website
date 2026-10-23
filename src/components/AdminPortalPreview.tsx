import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box, Flex, Text, Icon, Spinner,
  Modal, ModalOverlay, ModalContent, ModalBody,
} from '@chakra-ui/react';
import ClientPortalView, { type AccountSession, type ClientPortalData } from './ClientPortalView';
import ClientAccountHome from './ClientAccountHome';
import CTAButton from './ui/CTAButton';
import FaArrowLeft from '../icons/fa/FaArrowLeft';
import { salesTaxModeOf } from '../data/sales-tax';
import { cardPricingOf } from '../data/payment-handles';
import FaExclamationTriangle from '../icons/fa/FaExclamationTriangle';

/**
 * "Preview Client Portal", the client's own screen, read only, inside admin.
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
  /** To load the client's other sessions, which the preview can open from "Your sessions". */
  adminPassword: string;
}

type GalleryPayload = {
  rootFiles?: ClientPortalData['rootFiles'];
  sections?: ClientPortalData['sections'];
  warning?: string;
};

interface SessionDetail {
  portal: Record<string, unknown>;
  payments: Array<Record<string, unknown>>;
  charges: Array<Record<string, unknown>>;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

/**
 * The sessions a client's login opens, as /api/portal/client lists them:
 * full bookings on the email that have a password, oldest first. Built from
 * the record being previewed and its same_client_bookings.
 */
function accountSessions(portal: Record<string, unknown>): AccountSession[] {
  const self = {
    ...portal,
    has_password: portal.client_has_password === true,
    has_gallery: Boolean(portal.drive_url),
  } as Record<string, unknown>;
  const others = Array.isArray(portal.same_client_bookings) ? (portal.same_client_bookings as Array<Record<string, unknown>>) : [];
  return [self, ...others]
    .filter((s) => s.has_password === true)
    .map((s) => ({
      id: String(s.id),
      session_type: str(s.session_type),
      contract_template_key: str(s.contract_template_key),
      event_date: str(s.event_date),
      session_location: str(s.session_location),
      event_title: str(s.event_title),
      event_location: str(s.event_location),
      contract_status: (str(s.contract_status) ?? 'none') as AccountSession['contract_status'],
      contract_total_amount: s.contract_total_amount == null ? null : num(s.contract_total_amount),
      contract_retainer_amount: s.contract_retainer_amount == null ? null : num(s.contract_retainer_amount),
      paid_to_date: num(s.paid_to_date),
      charges_total: num(s.charges_total),
      sales_tax: str(s.sales_tax),
      complimentary: s.complimentary === true,
      has_gallery: s.has_gallery === true,
      gallery_delivered_at: str(s.gallery_delivered_at),
      gallery_expires_at: str(s.gallery_expires_at),
      created_at: String(s.created_at ?? ''),
      package_id: str(s.package_id),
      regular_amount: s.regular_amount == null ? null : num(s.regular_amount),
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** One session's record, as its client's portal would show it. */
function previewData(
  { portal, payments, charges }: SessionDetail,
  gallery: GalleryPayload | null,
  sessions: AccountSession[],
): ClientPortalData {
  // A free booking reaches the client with no total, retainer or charges
  // (api/portal/_client.ts), so the preview has to drop them the same way or
  // it shows Vero a balance her client never sees.
  const free = portal.complimentary === true;
  const regular = portal.regular_amount == null ? null : num(portal.regular_amount);
  const total = portal.contract_total_amount == null ? null : num(portal.contract_total_amount);
  return {
    portal_id: str(portal.id) ?? undefined,
    sessions,
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
    contract_total_amount: free || total === null ? null : total,
    contract_retainer_amount: free || portal.contract_retainer_amount == null ? null : num(portal.contract_retainer_amount),
    // What it saves them (migrations 057, 058), as the portal endpoint sends it.
    saving:
      !free && regular !== null && total !== null && regular > total
        ? { regular, off: Math.round((regular - total) * 100) / 100, label: portal.package_id ? null : str(portal.discount_label) }
        : null,
    paid_to_date: num(portal.paid_to_date),
    payment_plan_enabled: !free && portal.payment_plan_enabled === true,
    // Pennsylvania sales tax, so the preview asks for the taxed figures the
    // client's own portal does.
    sales_tax: salesTaxModeOf(portal.sales_tax),
    // And who pays the card fee, so the preview shows the card prices too.
    card_pricing: cardPricingOf(portal.card_pricing),
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
      credited_amount: p.credited_amount == null ? null : num(p.credited_amount),
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
}

/**
 * Photos come from the gallery endpoint rather than from portal-detail,
 * so no Drive call is added to an endpoint the whole admin screen depends
 * on. It is the same request the Preview Client Gallery button already
 * makes, with the same short-lived token, so an undelivered gallery still
 * shows rather than the withheld notice.
 */
async function loadGallery(portal: Record<string, unknown>): Promise<GalleryPayload> {
  const password = str(portal.gallery_password);
  if (!password) return { rootFiles: [], sections: [] };
  try {
    const token = str(portal.gallery_preview_token);
    const res = await fetch(`/api/portal/gallery${token ? `?preview=${encodeURIComponent(token)}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data?.success
      ? { rootFiles: data.rootFiles ?? [], sections: data.sections ?? [], warning: data.warning }
      : { rootFiles: [], sections: [], warning: data?.error || 'Could not load the gallery for this preview.' };
  } catch {
    return { rootFiles: [], sections: [], warning: 'Could not load the gallery for this preview.' };
  }
}

/** The entry this preview pushes onto the browser history, per screen. */
const STATE_KEY = 'portalPreview';

export default function AdminPortalPreview({
  isOpen, onClose, portal, payments, charges, adminPassword,
}: AdminPortalPreviewProps) {
  const sessions = accountSessions(portal);
  // A client with more than one session signs in to "Your sessions", so the
  // preview opens there too (2026-10-23); one session opens on its portal.
  const hasHome = sessions.length > 1;
  const [stage, setStage] = useState<'home' | string>('home');
  const [details, setDetails] = useState<Record<string, SessionDetail>>({});
  const [galleries, setGalleries] = useState<Record<string, GalleryPayload>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const depthRef = useRef(0);
  const ownId = String(portal.id);

  const ensure = useCallback(async (id: string) => {
    setError('');
    let detail: SessionDetail | undefined = id === ownId ? { portal, payments, charges } : details[id];
    if (!detail) {
      setLoading(id);
      try {
        const res = await fetch('/api/admin/portal-detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword, id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not load that session.');
        detail = { portal: data.portal, payments: data.payments ?? [], charges: data.charges ?? [] };
        setDetails((d) => ({ ...d, [id]: detail as SessionDetail }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load that session.');
        setLoading(null);
        return;
      }
    }
    if (!galleries[id]) {
      setLoading(id);
      const g = await loadGallery(detail.portal);
      setGalleries((all) => ({ ...all, [id]: g }));
    }
    setLoading(null);
  }, [adminPassword, charges, details, galleries, ownId, payments, portal]);

  /**
   * Back and the swipe gesture move through the PREVIEW, never the admin
   * behind it. Each screen is a history entry of its own, on the same URL so
   * the admin's own popstate reads it as "still on this client": a session
   * goes back to "Your sessions", and "Your sessions" (or a lone session)
   * goes back to the client's page. Before this, Back walked the admin to the
   * client list with the preview still sitting on top of it.
   */
  useEffect(() => {
    if (!isOpen) return;
    const first = hasHome ? 'home' : ownId;
    setStage(first);
    if (first !== 'home') void ensure(first);
    window.history.pushState({ ...window.history.state, [STATE_KEY]: first }, '', window.location.href);
    depthRef.current = 1;
    const onPop = (e: PopStateEvent) => {
      const at = (e.state as Record<string, unknown> | null)?.[STATE_KEY];
      if (typeof at === 'string') {
        depthRef.current = Math.max(1, depthRef.current - 1);
        setStage(at);
        return;
      }
      depthRef.current = 0;
      onClose();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // Opening is the event; the rest is read when it happens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const openSession = (id: string) => {
    window.history.pushState({ ...window.history.state, [STATE_KEY]: id }, '', window.location.href);
    depthRef.current += 1;
    setStage(id);
    void ensure(id);
  };
  /** Every way out of the preview: unwind its history entries, which closes it. */
  const close = () => {
    const depth = depthRef.current;
    // Zeroed before the jump: Escape reaches here twice in one key press
    // (Chakra calls onEsc and then onClose), and a second go() walked the
    // admin back past the client page.
    depthRef.current = 0;
    if (depth > 0) window.history.go(-depth);
    else onClose();
  };

  const viewing = stage === 'home' ? null : stage;
  const detail = viewing ? (viewing === ownId ? { portal, payments, charges } : details[viewing]) : null;
  const homeData = previewData({ portal, payments, charges }, null, sessions);

  return (
    <Modal isOpen={isOpen} onClose={close} size="full">
      <ModalOverlay />
      <ModalContent bg="white" m={0} borderRadius={0}>
        <ModalBody p={0} pb="96px">
          {/* Never leave doubt about which surface is on screen, or how to
              leave it. At the BOTTOM, fixed, above everything: the portal's
              own header is fixed to the top at z-index 1000, and it covered
              this bar and the modal's close button when they sat up there,
              so Escape was the only way out (2026-10-23). */}
          <Flex
            align="center"
            gap={3}
            px={4}
            pt={3}
            pb="calc(12px + env(safe-area-inset-bottom, 0px))"
            bg="brand.surfaceFold"
            borderTop="1px solid"
            borderColor="brand.accent"
            boxShadow="0 -4px 16px rgba(0, 0, 0, 0.08)"
            position="fixed"
            bottom={0}
            left={0}
            right={0}
            zIndex={1100}
            wrap="wrap"
          >
            <Box data-testid="preview-back-to-client">
              <CTAButton onClick={close} icon={FaArrowLeft} variant="outline" size="sm">
                Back to client page
              </CTAButton>
            </Box>
            <Flex align="center" gap={2} flex="1" minW="240px">
              <Icon as={FaExclamationTriangle} color="brand.accentText" boxSize={4} flexShrink={0} />
              <Text fontSize="sm" color="brand.mutedText">
                Preview of the client&rsquo;s portal, read only. Buttons here will not work: every action
                needs the client&rsquo;s own password and the server refuses without it.
              </Text>
            </Flex>
          </Flex>
          {error ? (
            <Text fontSize="sm" color="red.600" p={6} role="alert">{error}</Text>
          ) : viewing && (loading === viewing || !detail || !galleries[viewing]) ? (
            <Flex align="center" justify="center" py={20} gap={3}>
              <Spinner size="sm" color="brand.accent" />
              <Text fontSize="sm" color="brand.mutedText">Loading the portal&hellip;</Text>
            </Flex>
          ) : viewing && detail ? (
            <Box>
              <ClientPortalView
                data={previewData(detail, galleries[viewing] ?? null, sessions)}
                credentials={{ email: '', password: '' }}
                onDataUpdate={() => { /* preview is read only */ }}
                onAllSessions={hasHome ? () => window.history.back() : undefined}
              />
            </Box>
          ) : (
            <Box data-testid="preview-sessions-home">
              <ClientAccountHome
                data={homeData}
                credentials={{ email: '', password: '' }}
                onOpen={openSession}
                onBook={() => { /* preview is read only */ }}
                onLogout={close}
                onPasswordChanged={() => { /* preview is read only */ }}
              />
            </Box>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
