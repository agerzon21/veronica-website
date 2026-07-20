import ReactGA from 'react-ga4';

// Initialize Google Analytics
export const initGA = (trackingId: string) => {
  ReactGA.initialize(trackingId);
};

// Register an additional Google Ads account against the same gtag
// instance react-ga4 already set up for GA4. gtag is a shared bus —
// adding a second `config` call means conversion events sent later
// (see trackAdsLeadConversion) can attribute to this Ads account
// without needing a second script tag.
//
// Safe to call before or right after initGA — react-ga4 buffers gtag
// calls in the dataLayer until gtag.js finishes loading, so ordering
// isn't fragile.
export const initGoogleAds = (conversionId: string) => {
  if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
    (window as any).gtag('config', conversionId);
  }
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
  if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
    (window as any).gtag('event', 'conversion', {
      send_to: 'AW-18082198928/2-7CCNim4tMcEJDroa5D',
      value: 1.0,
      currency: 'USD',
    });
  }
};

// Track page views
export const trackPageView = (path: string) => {
  ReactGA.send({ hitType: 'pageview', page: path });
};

// Track events
export const trackEvent = (category: string, action: string, label?: string) => {
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