import ReactGA from 'react-ga4';

const GA_ID = 'G-T769KRMR0E';
const ADS_ID = 'AW-18082198928';

// Snapshot the landing URL at module evaluation, BEFORE react-router gets a
// chance to rewrite it with pushState. This is the crux of the whole file: no
// gclid is persisted anywhere in this codebase, so Google Ads attribution
// depends entirely on gtag reading the click id off the URL when it executes.
// If gtag boots late and the visitor has already tapped a nav link, the query
// string is gone, the _gcl_aw cookie is never written, and the conversion
// still fires but arrives UNATTRIBUTED — a silent revenue-reporting failure
// with no error anywhere. Capturing it here makes deferral safe.
const LANDING_URL = typeof window !== 'undefined' ? window.location.href : '';
const LANDING_PATH = typeof window !== 'undefined' ? window.location.pathname : '/';
const IS_PAID_CLICK = /[?&](gclid|gbraid|wbraid|msclkid|dclid)=/.test(LANDING_URL);

let booted = false;
// Buffers the full href, not just the path. A pageview flushed after a late
// boot would otherwise fall back to gtag's auto-collected page_location, which
// by then is whatever page the visitor has since navigated to.
const pendingPageViews: { path: string; location: string }[] = [];

/**
 * Load gtag now. Idempotent and synchronous — safe to call from anywhere,
 * including immediately before sending a conversion.
 */
export const ensureAnalytics = () => {
  if (booted || typeof window === 'undefined') return;
  booted = true;

  // send_page_view false because ScrollToTop already sends one per route —
  // without it the landing page gets counted twice.
  //
  // page_location is deliberately NOT set here. A gtag config parameter is a
  // sticky default merged into every later event for that measurement ID, so
  // pinning it would report the landing URL for the whole session: /gallery,
  // /photo/*, and /contact/thank-you would all show up as the landing page in
  // GA4, and every paid click would spawn a unique gclid-bearing row. It goes
  // on each page_view event instead — see trackPageView.
  ReactGA.initialize(GA_ID, { gtagOptions: { send_page_view: false } });

  // The Ads destination DOES want the pinned landing URL: that is what lets
  // the conversion linker read the click id even on a late boot. Must land
  // before any conversion event — gtag.js silently drops events for a
  // destination that has no config yet.
  const gtag = (window as any).gtag;
  if (typeof gtag === 'function') gtag('config', ADS_ID, { page_location: LANDING_URL });

  // Flush anything ScrollToTop queued while we were waiting, each with the URL
  // it was actually captured at.
  pendingPageViews.splice(0).forEach(({ path, location }) => {
    ReactGA.send({ hitType: 'pageview', page: path, location });
  });
};

/**
 * Defer gtag out of the critical window, with two hard exemptions.
 * Returns a cleanup function.
 */
export const scheduleAnalytics = () => {
  if (typeof window === 'undefined') return () => {};

  // Never defer money paths. A lost gclid costs more than 356KB saves, and
  // the /contact funnel ends in the Ads conversion.
  if (IS_PAID_CLICK || LANDING_PATH.startsWith('/contact')) {
    ensureAnalytics();
    return () => {};
  }

  // Anchored to navigation start, not to when this effect happened to mount —
  // mount is already ~4s in on a throttled phone, so a naive delay would push
  // gtag LATER than it loads today and make TBT worse.
  const delay = Math.max(0, 1500 - performance.now());
  const timer = window.setTimeout(ensureAnalytics, delay);

  // Any real interaction means a session worth measuring; boot immediately.
  const boot = () => ensureAnalytics();
  const events = ['pointerdown', 'keydown'] as const;
  events.forEach((e) => window.addEventListener(e, boot, { once: true, passive: true }));

  return () => {
    clearTimeout(timer);
    events.forEach((e) => window.removeEventListener(e, boot));
  };
};

// Google Ads conversion — fires when a contact-form submission actually
// lands on /contact/thank-you (guarded by ThankYou's autoReplyPayload
// check so direct visits / refreshes / back-navs don't inflate).
//
// The send_to value pairs the Ads account with the specific conversion
// action; both together identify which conversion this event belongs to.
// value + currency are for reporting only — we hard-code $1 USD because
// a contact-form lead has no inherent monetary value at submission time.
export const trackAdsLeadConversion = () => {
  if (typeof window === 'undefined') return;
  // Force gtag up before sending. Without this the event can reach dataLayer
  // ahead of its config and be dropped on the floor.
  ensureAnalytics();
  const gtag = (window as any).gtag;
  if (typeof gtag === 'function') {
    gtag('event', 'conversion', {
      send_to: `${ADS_ID}/2-7CCNim4tMcEJDroa5D`,
      value: 1.0,
      currency: 'USD',
    });
  }
};

// Track page views. Buffered rather than sent blind: react-ga4 does NOT no-op
// before initialize — it would push into dataLayer ahead of the js/config
// pair, and gtag.js drops events that precede a destination's config.
export const trackPageView = (path: string) => {
  const location = typeof window !== 'undefined' ? window.location.href : '';
  if (!booted) {
    pendingPageViews.push({ path, location });
    return;
  }
  ReactGA.send({ hitType: 'pageview', page: path, location });
};

// Track events. Every caller is user-initiated, so booting here is free —
// the pointerdown listener in scheduleAnalytics has almost always fired
// already, and ensureAnalytics is idempotent.
export const trackEvent = (category: string, action: string, label?: string) => {
  ensureAnalytics();
  ReactGA.event({
    category,
    action,
    label,
  });
};

// Track social media clicks
export const trackSocialClick = (platform: string) => {
  trackEvent('Social', 'Click', platform);
};

// Track gallery interactions
export const trackGalleryInteraction = (action: string, category?: string) => {
  trackEvent('Gallery', action, category);
};

// Track contact form submissions (WhatsApp/Email/Instagram clicks).
// Form submission conversions are tracked on the /contact/thank-you page.
export const trackContactSubmission = (method: string) => {
  trackEvent('Contact', 'Submit', method);
};