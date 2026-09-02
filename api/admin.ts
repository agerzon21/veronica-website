/**
 * Dispatcher for /api/admin/* routes.
 *
 * Same pattern as api/portal.ts — one function fans out to
 * underscore-prefixed handler files under ./admin/ to stay under
 * Vercel's Hobby-plan 12-function ceiling. The `vercel.json` rewrite
 * maps /api/admin/X → /api/admin?action=X.
 *
 * Routes:
 *   POST /api/admin/portals          → ./admin/_portals.ts          (list)
 *   POST /api/admin/portals-create   → ./admin/_portals-create.ts   (create + invite)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import portalsHandler from './admin/_portals.js';
import portalsCreateHandler from './admin/_portals-create.js';
import portalDetailHandler from './admin/_portal-detail.js';
import portalUpdateHandler from './admin/_portal-update.js';
import portalDeliverHandler from './admin/_portal-deliver.js';
import portalDeleteHandler from './admin/_portal-delete.js';
import paymentLogHandler from './admin/_payment-log.js';
import resendInviteHandler from './admin/_resend-invite.js';
import portalPdfHandler from './admin/_portal-pdf.js';
import instagramStatusHandler from './admin/_instagram-status.js';
import instagramMarkRefreshedHandler from './admin/_instagram-mark-refreshed.js';
import journalListHandler from './admin/_journal-list.js';
import journalDetailHandler from './admin/_journal-detail.js';
import journalCreateHandler from './admin/_journal-create.js';
import journalUpdateHandler from './admin/_journal-update.js';
import journalDeleteHandler from './admin/_journal-delete.js';
import reviewsListHandler from './admin/_reviews-list.js';
import reviewsUpsertHandler from './admin/_reviews-upsert.js';
import reviewsDeleteHandler from './admin/_reviews-delete.js';
import reviewsAggregateHandler from './admin/_reviews-aggregate.js';
import leadsListHandler from './admin/_leads-list.js';
import leadsUpdateHandler from './admin/_leads-update.js';
import leadsDeleteHandler from './admin/_leads-delete.js';
import messagesListHandler from './admin/_messages-list.js';
import messagesDetailHandler from './admin/_messages-detail.js';
import messagesToggleAiHandler from './admin/_messages-toggle-ai.js';
import messagesToggleGlobalHandler from './admin/_messages-toggle-global.js';
import messagesSendHandler from './admin/_messages-send.js';
import messagesMarkReadHandler from './admin/_messages-mark-read.js';
import messagesTranslateHandler from './admin/_messages-translate.js';
import messagesSummaryHandler from './admin/_messages-summary.js';
import messagesMarkPromotionalHandler from './admin/_messages-mark-promotional.js';
import messagesMarkPersonalHandler from './admin/_messages-mark-personal.js';
import logoutHandler from './admin/_logout.js';
import usersHandler from './admin/_users.js';
import messagesDeleteHandler from './admin/_messages-delete.js';
import messagesDeliveryHandler from './admin/_messages-delivery.js';
import messagesDraftDiscardHandler from './admin/_messages-draft-discard.js';
import messagesSettingsHandler from './admin/_messages-settings.js';
import messagesResetHandler from './admin/_messages-reset.js';
import contextListHandler from './admin/_context-list.js';
import contextCreateHandler from './admin/_context-create.js';
import contextUpdateHandler from './admin/_context-update.js';
import contextDeleteHandler from './admin/_context-delete.js';
import galleryListHandler from './admin/_gallery-list.js';
import galleryUpdateHandler from './admin/_gallery-update.js';
import galleryDeleteHandler from './admin/_gallery-delete.js';
import gallerySyncNowHandler from './admin/_gallery-sync-now.js';
import gallerySettingsHandler from './admin/_gallery-settings.js';
import galleryBulkHandler from './admin/_gallery-bulk.js';
import assistantChatHandler from './admin/_assistant-chat.js';
import transcribeHandler from './admin/_transcribe.js';
import cronsListHandler from './admin/_crons-list.js';
import cronsToggleHandler from './admin/_crons-toggle.js';
import cronsRunNowHandler from './admin/_crons-run-now.js';
import cronsHistoryHandler from './admin/_crons-history.js';
import configHealthHandler from './admin/_config-health.js';
import rebuildHandler from './admin/_rebuild.js';

const HANDLERS: Record<
  string,
  (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown
> = {
  portals: portalsHandler,
  'portals-create': portalsCreateHandler,
  'portal-detail': portalDetailHandler,
  'portal-update': portalUpdateHandler,
  'portal-deliver': portalDeliverHandler,
  'portal-delete': portalDeleteHandler,
  'payment-log': paymentLogHandler,
  'resend-invite': resendInviteHandler,
  'portal-pdf': portalPdfHandler,
  'instagram-status': instagramStatusHandler,
  'instagram-mark-refreshed': instagramMarkRefreshedHandler,
  'journal-list': journalListHandler,
  'journal-detail': journalDetailHandler,
  'journal-create': journalCreateHandler,
  'journal-update': journalUpdateHandler,
  'journal-delete': journalDeleteHandler,
  'reviews-list': reviewsListHandler,
  'reviews-upsert': reviewsUpsertHandler,
  'reviews-delete': reviewsDeleteHandler,
  'reviews-aggregate': reviewsAggregateHandler,
  'leads-list': leadsListHandler,
  'leads-update': leadsUpdateHandler,
  'leads-delete': leadsDeleteHandler,
  'messages-list': messagesListHandler,
  'messages-detail': messagesDetailHandler,
  'messages-toggle-ai': messagesToggleAiHandler,
  'messages-toggle-global': messagesToggleGlobalHandler,
  'messages-send': messagesSendHandler,
  'messages-mark-read': messagesMarkReadHandler,
  'messages-translate': messagesTranslateHandler,
  'messages-summary': messagesSummaryHandler,
  'messages-reset': messagesResetHandler,
  'messages-settings': messagesSettingsHandler,
  'messages-draft-discard': messagesDraftDiscardHandler,
  'messages-delivery': messagesDeliveryHandler,
  'messages-delete': messagesDeleteHandler,
  'messages-mark-promotional': messagesMarkPromotionalHandler,
  'messages-mark-personal': messagesMarkPersonalHandler,
  logout: logoutHandler,
  users: usersHandler,
  'context-list': contextListHandler,
  'context-create': contextCreateHandler,
  'context-update': contextUpdateHandler,
  'context-delete': contextDeleteHandler,
  'gallery-list': galleryListHandler,
  'gallery-update': galleryUpdateHandler,
  'gallery-delete': galleryDeleteHandler,
  'gallery-sync-now': gallerySyncNowHandler,
  'gallery-settings': gallerySettingsHandler,
  'gallery-bulk': galleryBulkHandler,
  'assistant-chat': assistantChatHandler,
  transcribe: transcribeHandler,
  'crons-list': cronsListHandler,
  'crons-toggle': cronsToggleHandler,
  'crons-run-now': cronsRunNowHandler,
  'crons-history': cronsHistoryHandler,
  'config-health': configHealthHandler,
  rebuild: rebuildHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  if (!action || !HANDLERS[action]) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  return HANDLERS[action](req, res);
}
