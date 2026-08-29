import { useEffect, useState } from 'react';

/**
 * Poll Resend until an email is actually accepted by the recipient's server.
 *
 * Extracted from src/pages/ThankYou.tsx, which has done exactly this since
 * commit a0014d6 — the same 3s interval, the same 60s ceiling, the same
 * terminal-failure list. The admin invite flow needed identical behaviour, and
 * two copies of a polling loop drift.
 *
 * The distinction that matters, and the reason this waits rather than assuming:
 * "Resend accepted it" is not "it arrived". On the free tier a send can be
 * rejected or bounced minutes later because the shared sending IP is
 * blocklisted. Reporting success on the API's 200 is how a client silently
 * never receives their portal invite.
 *
 * Pass `emailId = null` to sit idle — the hook does nothing until it has an id.
 */

export type EmailDeliveryStatus = 'idle' | 'sending' | 'delivered' | 'pending' | 'failed';

const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 60000;

// Anything here is final — stop polling, tell the operator it did not arrive.
const TERMINAL_FAILURES = ['bounced', 'complained', 'failed', 'canceled', 'suppressed'];

export function useEmailDelivery(emailId: string | null): EmailDeliveryStatus {
  const [status, setStatus] = useState<EmailDeliveryStatus>(emailId ? 'sending' : 'idle');

  useEffect(() => {
    if (!emailId) {
      setStatus('idle');
      return;
    }

    setStatus('sending');
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelled) return;
      let current: string | undefined;
      try {
        const res = await fetch(`/api/email-status?id=${encodeURIComponent(emailId)}`);
        const data = await res.json().catch(() => ({ status: 'unknown' }));
        current = data?.status;
      } catch {
        current = 'unknown';
      }
      if (cancelled) return;

      if (current === 'delivered') return setStatus('delivered');
      if (current && TERMINAL_FAILURES.includes(current)) return setStatus('failed');

      // queued / sent / delayed / unknown — still in transit. After the window,
      // stop waiting and say so honestly rather than showing a green state we
      // have not earned.
      if (Date.now() - startedAt >= MAX_WAIT_MS) return setStatus('pending');
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [emailId]);

  return status;
}
