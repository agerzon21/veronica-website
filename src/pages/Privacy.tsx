import { Helmet } from 'react-helmet-async';
import { Text } from '@chakra-ui/react';
import PolicyLayout, { PolicySection, P, PolicyList, Term } from '../components/PolicyLayout';

/**
 * Privacy Policy. Also serves double-duty as the Privacy Policy URL for
 * Meta's Instagram Graph API app registration (required for the app to
 * be published). Because of that, this page needs to specifically
 * disclose:
 *   - What data we collect from users of THIS site
 *   - How we use third-party services (Meta, Google, Resend, Neon)
 *   - How a user can request deletion of their data
 * — those three are Meta's minimum-bar requirements.
 *
 * This is a template document. It reflects what the site actually does
 * (based on the codebase — contact form, subscribe, portal auth, IG
 * feed, analytics), but Alex should have a lawyer review before
 * relying on it for real-world enforcement.
 */

const EFFECTIVE_DATE = '2026-07-28';

const Privacy = () => {
  return (
    <>
      <Helmet>
        <title>Privacy Policy | Vero Photography</title>
        <meta
          name="description"
          content="Privacy policy for vero.photography — what information we collect, how we use it, and how to request deletion."
        />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <PolicyLayout
        kicker="Privacy Policy"
        title="How we handle your information"
        effectiveDate={EFFECTIVE_DATE}
        intro={
          <>
            This page describes what personal information Vero Photography (
            <Term>&ldquo;we&rdquo;</Term>, <Term>&ldquo;us&rdquo;</Term>) collects when
            you visit <Term>vero.photography</Term> (the <Term>&ldquo;Site&rdquo;</Term>),
            how we use it, and the choices you have about it. If you contact
            us or become a client, we treat your information with care and
            never sell it to third parties.
          </>
        }
      >
        <PolicySection title="Who we are">
          <P>
            The Site is owned and operated by Veronika Gerzon, a wedding
            and portrait photographer based in Scranton, Pennsylvania,
            available worldwide. For any privacy-related question, contact{' '}
            <Text as="a" href="mailto:vero@vero.photography" color="brand.accentText" textDecoration="underline">
              vero@vero.photography
            </Text>
            .
          </P>
        </PolicySection>

        <PolicySection title="Information we collect">
          <P>
            We collect only what we need to operate the Site and respond
            to inquiries. Specifically:
          </P>
          <PolicyList
            items={[
              <>
                <Term>Contact form submissions.</Term> When you fill out the
                inquiry form we receive your name, email address, phone
                number (if provided), the session type you&rsquo;re asking
                about, event date, event location, and the message text
                you send.
              </>,
              <>
                <Term>Newsletter / subscribe.</Term> If you subscribe from
                the Site, we store your email address for the purpose of
                sending occasional updates.
              </>,
              <>
                <Term>Client Portal accounts.</Term> If you book a session,
                we create a client portal for you containing your name,
                email address, event details, signed contract, payment
                records, and delivered photo galleries. Access requires
                the email + password we provide you.
              </>,
              <>
                <Term>Analytics.</Term> We use Google Analytics to
                understand aggregate site traffic patterns — pageviews,
                referrers, general device / browser information. This
                data is pseudonymous and not tied to identified individuals.
              </>,
              <>
                <Term>Cookies.</Term> The Site uses cookies set by Google
                Analytics and Google Ads (for measuring inquiry-form
                conversions). We do not set our own tracking cookies.
              </>,
              <>
                <Term>Instagram feed cache.</Term> Public posts from
                <Text as="span" fontWeight="500" color="gray.800"> @vero.art.photo </Text>
                are fetched and briefly cached on our servers for display
                on the homepage. This is public content — nothing private
                is stored.
              </>,
            ]}
          />
        </PolicySection>

        <PolicySection title="How we use your information">
          <PolicyList
            items={[
              'To respond to inquiries and coordinate photography sessions.',
              'To fulfill the terms of any photography contract you enter into with us — including delivering galleries, collecting payment, and providing customer support.',
              'To send transactional emails (booking confirmations, gallery-ready notifications, contract copies, invoices).',
              'To understand how the Site is used, so we can make it better.',
              'To measure the effectiveness of any advertising we run (Google Ads inquiry-form conversions).',
            ]}
          />
          <P>
            We do <Term>not</Term> sell your personal information. We do
            <Term> not</Term> use your information for automated
            decision-making or profiling.
          </P>
        </PolicySection>

        <PolicySection title="Third-party service providers">
          <P>
            We use a small set of trusted service providers to run the
            Site. Data shared with each is limited to what that provider
            needs to perform its function:
          </P>
          <PolicyList
            items={[
              <>
                <Term>Google (Analytics + Ads).</Term> Pseudonymous traffic
                and conversion data. See Google&rsquo;s privacy policy at{' '}
                <PolicyLink href="https://policies.google.com/privacy" />.
              </>,
              <>
                <Term>Meta / Instagram.</Term> Public Instagram post data
                we fetch via the Instagram Graph API for the homepage feed.
                See Meta&rsquo;s privacy policy at{' '}
                <PolicyLink href="https://www.facebook.com/policy.php" />.
              </>,
              <>
                <Term>Resend.</Term> Delivers transactional email (contact
                auto-replies, contract copies, gallery notifications). See{' '}
                <PolicyLink href="https://resend.com/legal/privacy-policy" />.
              </>,
              <>
                <Term>Neon (PostgreSQL).</Term> Hosts the client portal
                database. See{' '}
                <PolicyLink href="https://neon.tech/privacy-policy" />.
              </>,
              <>
                <Term>Google Drive.</Term> Client photo galleries and
                Journal posts are stored in Google Drive under
                Veronika&rsquo;s account. See{' '}
                <PolicyLink href="https://policies.google.com/privacy" />.
              </>,
              <>
                <Term>Vercel.</Term> Hosts the Site itself. See{' '}
                <PolicyLink href="https://vercel.com/legal/privacy-policy" />.
              </>,
            ]}
          />
        </PolicySection>

        <PolicySection title="How long we keep information">
          <P>
            We keep information for as long as it is reasonably necessary
            for the purpose it was collected. As a general rule:
          </P>
          <PolicyList
            items={[
              'Contact form submissions: up to 2 years, then deleted or anonymized.',
              'Client portal accounts + delivered galleries: retained for the retention window specified in your photography contract (typically 3 months after gallery delivery), then removed from the Site. Vero retains her working copies of shoot files separately.',
              'Payment records: retained for the period required by tax and business record-keeping law (typically 7 years).',
              'Analytics: aggregated data may be retained indefinitely; individual pseudonymous events are governed by Google Analytics&rsquo;s own retention settings (currently 14 months).',
            ]}
          />
        </PolicySection>

        <PolicySection title="Your rights and choices">
          <P>Depending on where you live, you may have rights to:</P>
          <PolicyList
            items={[
              'Access the personal information we hold about you.',
              'Correct inaccurate information.',
              'Request deletion of your information (subject to our legal record-keeping obligations — see next section).',
              'Object to or restrict certain processing.',
              'Opt out of analytics: install a browser extension like Google Analytics Opt-Out, or use your browser&rsquo;s "Do Not Track" setting.',
              'Opt out of Google Ads personalization at https://adssettings.google.com.',
              'Unsubscribe from email at any time via the "unsubscribe" link at the bottom of any newsletter, or by emailing vero@vero.photography.',
            ]}
          />
          <P>
            To exercise any of these rights, email{' '}
            <Text as="a" href="mailto:vero@vero.photography" color="brand.accentText" textDecoration="underline">
              vero@vero.photography
            </Text>{' '}
            with a description of what you&rsquo;d like us to do. We
            aim to respond within 30 days.
          </P>
        </PolicySection>

        <PolicySection title="Data deletion requests" id="data-deletion">
          <P>
            To request deletion of your personal information from the
            Site, email{' '}
            <Text as="a" href="mailto:vero@vero.photography" color="brand.accentText" textDecoration="underline">
              vero@vero.photography
            </Text>{' '}
            with the subject line <Term>&ldquo;Data deletion request&rdquo;</Term>{' '}
            and include:
          </P>
          <PolicyList
            items={[
              'The email address or name associated with your account or inquiry.',
              'A brief description of what you\'d like deleted (contact form submission, portal account, newsletter subscription, etc.).',
            ]}
          />
          <P>
            We will confirm your request within 5 business days and
            complete the deletion within 30 days, subject to any legal
            obligations we have to retain records (for example, financial
            records for tax purposes). Deletion is permanent — we cannot
            recover a portal or gallery after removal.
          </P>
        </PolicySection>

        <PolicySection title="Children">
          <P>
            The Site is not directed at children under 13, and we do
            not knowingly collect personal information from anyone under
            13. If you believe a child has provided us information,
            email us and we will delete it.
          </P>
        </PolicySection>

        <PolicySection title="International visitors">
          <P>
            The Site is operated from the United States. If you visit
            from outside the US, your information will be transferred to
            and processed in the US, which may have different data
            protection laws than your country of residence. By using the
            Site, you consent to that transfer.
          </P>
        </PolicySection>

        <PolicySection title="Changes to this policy">
          <P>
            We may update this Privacy Policy from time to time. When we
            do, we&rsquo;ll update the &ldquo;Effective&rdquo; date at the top
            of this page. Material changes will also be surfaced on the
            Site or communicated by email where appropriate.
          </P>
        </PolicySection>

        <PolicySection title="Contact">
          <P>
            Questions, requests, or complaints about this policy:{' '}
            <Text as="a" href="mailto:vero@vero.photography" color="brand.accentText" textDecoration="underline">
              vero@vero.photography
            </Text>
            .
          </P>
        </PolicySection>
      </PolicyLayout>
    </>
  );
};

// Small helper — external links in policy body should always open in a
// new tab and get nofollow so they don't leak page rank to third parties.
function PolicyLink({ href }: { href: string }) {
  return (
    <Text
      as="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      color="brand.accentText"
      textDecoration="underline"
    >
      {href.replace(/^https?:\/\//, '')}
    </Text>
  );
}

export default Privacy;
