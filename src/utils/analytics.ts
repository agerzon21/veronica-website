import ReactGA from 'react-ga4';

// Initialize Google Analytics
export const initGA = (trackingId: string) => {
  ReactGA.initialize(trackingId);
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

// Track contact form submissions
export const trackContactSubmission = (method: string) => {
  trackEvent('Contact', 'Submit', method);
}; 