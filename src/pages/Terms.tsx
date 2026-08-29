import { Helmet } from 'react-helmet-async';
import { Text } from '@chakra-ui/react';
import PolicyLayout, { PolicySection, P, PolicyList, Term } from '../components/PolicyLayout';

/**
 * Terms of Service — governs a visitor's use of the Site, includes the
 * copyright / image-rights disclosure, and describes the process for
 * requesting removal of an image.
 *
 * Also serves as the "User Agreement URL" required by Meta's Instagram
 * Graph API app registration (currently pointing at facebook.com in the
 * form, which is wrong — should point here after this page ships).
 *
 * Photo-copyright language mirrors the contract template Vero uses with
 * clients (Section X: COPYRIGHT & USAGE) so client-signed contracts and
 * public-facing terms don't say contradictory things.
 *
 * This is a template document. It reflects site + business realities but
 * Alex should have a lawyer review before relying on it for enforcement.
 */

const EFFECTIVE_DATE = '2026-07-28';

const Terms = () => {
  return (
    <>
      <Helmet>
        <title>Terms of Service | Vero Photography</title>
        <meta
          name="description"
          content="Terms of service for vero.photography — how the site may be used, photo copyright, and how to request image removal."
        />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <PolicyLayout
        kicker="Terms of Service"
        title="Site use, rights, and responsibilities"
        effectiveDate={EFFECTIVE_DATE}
        intro={
          <>
            These Terms govern your use of{' '}
            <Term>vero.photography</Term> (the <Term>&ldquo;Site&rdquo;</Term>),
            operated by Veronika Gerzon d/b/a Vero Photography (
            <Term>&ldquo;we&rdquo;</Term>, <Term>&ldquo;us&rdquo;</Term>,{' '}
            <Term>&ldquo;the Photographer&rdquo;</Term>). By accessing or
            using the Site, you agree to these Terms. If you don&rsquo;t
            agree, please don&rsquo;t use the Site.
          </>
        }
      >
        <PolicySection title="1. Description of service">
          <P>
            The Site is the online presence of Vero Photography. It
            showcases photography work, provides information about
            available services, hosts client-facing portals (contracts,
            payment records, delivered galleries), and lets visitors
            contact us about booking a session.
          </P>
          <P>
            Some parts of the Site (client portals, admin panel) require
            authentication and are only accessible to authorized users.
          </P>
        </PolicySection>

        <PolicySection title="2. Photo copyright" id="copyright">
          <P>
            <Term>All photographs displayed on the Site are the exclusive
            copyright of Veronika Gerzon.</Term> This includes portfolio
            galleries, individual photo pages, blog / journal posts,
            homepage imagery, and any photograph delivered through a
            Client Portal.
          </P>
          <P>You may:</P>
          <PolicyList
            items={[
              'View photos on the Site in a browser for personal, non-commercial use.',
              'Share links to individual photo pages on the Site (e.g., via social media, messaging apps).',
              'If you are a client with a Client Portal: download, print, and share your delivered photos in accordance with the personal-use license granted in your photography contract.',
            ]}
          />
          <P>You may not, without prior written permission:</P>
          <PolicyList
            items={[
              'Reproduce, redistribute, or republish photos elsewhere (including on your own website, social feeds, or third-party services).',
              'Use photos for commercial purposes — advertising, promotion, resale, print sale, stock, etc.',
              'Alter, edit, crop, filter, or add watermarks to any photograph.',
              'Remove or obscure any watermark, signature, or credit line.',
              'Feed photos to any machine-learning training dataset or generative AI system.',
              'Screen-scrape or bulk-download photos from the Site.',
            ]}
          />
          <P>
            Client contracts govern the specific personal-use license
            granted for that client&rsquo;s delivered gallery. Nothing in
            these public Terms expands or reduces the rights granted in
            a signed photography contract.
          </P>
        </PolicySection>

        <PolicySection title="3. Model release + image takedown requests" id="takedown">
          <P>
            If you were photographed by Vero Photography and would like
            your image(s) removed from the public portions of the Site
            (portfolio galleries, Journal, homepage, social sharing
            metadata), you may request removal at any time. We honor
            these requests promptly and without argument.
          </P>
          <P>
            Send an email to{' '}
            <Text as="a" href="mailto:vero@vero.photography" color="brand.accentText" textDecoration="underline">
              vero@vero.photography
            </Text>{' '}
            with the subject line{' '}
            <Term>&ldquo;Image removal request&rdquo;</Term> and include:
          </P>
          <PolicyList
            items={[
              'A description or link to the photograph(s) you want removed.',
              'Confirmation that you are the person depicted (or the parent/guardian of a depicted minor).',
              'Any preference — full removal from public pages, removal from social sharing metadata only, etc.',
            ]}
          />
          <P>
            We aim to complete removal from the Site within 5 business
            days of your request. Note that we cannot control copies
            that may have been made by third parties before removal (for
            example, cached Google Image results — those typically clear
            within a few weeks). Removal from the Site does not delete
            the underlying image file from the Photographer&rsquo;s
            private archive; it removes the image from public display.
          </P>
          <P>
            If you believe your copyright is being infringed by content
            on the Site (for example, a photograph you own that appears
            here without authorization), send a DMCA-style takedown
            notice to{' '}
            <Text as="a" href="mailto:vero@vero.photography" color="brand.accentText" textDecoration="underline">
              vero@vero.photography
            </Text>{' '}
            with the subject line <Term>&ldquo;DMCA takedown&rdquo;</Term>{' '}
            containing: your contact info, identification of the
            copyrighted work, the URL(s) of the allegedly infringing
            material, a good-faith statement that use is not authorized,
            and a statement made under penalty of perjury that the
            information is accurate.
          </P>
        </PolicySection>

        <PolicySection title="4. Client portals + bookings">
          <P>
            If you become a client, we&rsquo;ll issue you access to a
            private Client Portal for your booking. Any signed
            photography contract between you and Vero Photography governs
            the substantive terms of the engagement — deliverables,
            payment schedule, cancellation, model release, retention
            windows, and so on. These Site Terms do not modify that
            contract; where the two speak to the same topic, the signed
            contract controls.
          </P>
          <P>
            Keep your portal login credentials confidential. You&rsquo;re
            responsible for activity that happens under your account.
          </P>
        </PolicySection>

        <PolicySection title="5. Acceptable use">
          <P>You agree not to:</P>
          <PolicyList
            items={[
              'Interfere with, disrupt, or attempt to gain unauthorized access to any part of the Site.',
              'Use automated tools (bots, scrapers, crawlers) to systematically download content from the Site, other than well-behaved search engine crawlers.',
              'Attempt to circumvent authentication on the client portal or admin areas.',
              'Impersonate any person or entity, or misrepresent your affiliation with a person or entity, when submitting the contact form or interacting with the Site.',
              'Use the Site for any unlawful purpose or in violation of these Terms.',
            ]}
          />
        </PolicySection>

        <PolicySection title="6. Third-party services + links">
          <P>
            The Site integrates with a small number of third-party
            services (Google, Meta / Instagram, Resend, Neon, Google
            Drive, Vercel) as described in the{' '}
            <Text as="a" href="/privacy" color="brand.accentText" textDecoration="underline">
              Privacy Policy
            </Text>
            . Those services have their own terms and privacy policies
            we don&rsquo;t control.
          </P>
          <P>
            The Site may contain links to third-party websites (social
            media, review platforms). We&rsquo;re not responsible for
            the content or practices of those sites.
          </P>
        </PolicySection>

        <PolicySection title="7. Disclaimer of warranties">
          <P>
            The Site is provided on an <Term>&ldquo;as-is&rdquo;</Term>{' '}
            and <Term>&ldquo;as-available&rdquo;</Term> basis. To the
            fullest extent permitted by law, we disclaim all warranties,
            express or implied, including warranties of merchantability,
            fitness for a particular purpose, and non-infringement. We
            don&rsquo;t warrant that the Site will be uninterrupted,
            error-free, or free of viruses.
          </P>
        </PolicySection>

        <PolicySection title="8. Limitation of liability">
          <P>
            To the fullest extent permitted by law, Vero Photography
            (Veronika Gerzon, its owners, employees, and contractors)
            will not be liable for any indirect, incidental, special,
            consequential, or punitive damages arising out of or related
            to your use of the Site. Our total aggregate liability for
            any claim related to the Site is limited to the greater of
            (a) the amount you paid us in the twelve months preceding
            the claim, or (b) US $100.
          </P>
          <P>
            Liability under a signed photography contract is governed by
            that contract&rsquo;s terms, not by this section.
          </P>
        </PolicySection>

        <PolicySection title="9. Governing law">
          <P>
            These Terms are governed by the laws of the Commonwealth of
            Pennsylvania, United States, without regard to its
            conflict-of-laws principles. Any dispute arising out of or
            relating to these Terms or the Site will be brought
            exclusively in the state or federal courts located in
            Lackawanna County, Pennsylvania, and you consent to personal
            jurisdiction there.
          </P>
        </PolicySection>

        <PolicySection title="10. Changes to these Terms">
          <P>
            We may update these Terms occasionally. When we do,
            we&rsquo;ll update the &ldquo;Effective&rdquo; date at the
            top of this page. Continued use of the Site after changes
            take effect constitutes acceptance of the updated Terms.
          </P>
        </PolicySection>

        <PolicySection title="11. Contact">
          <P>
            Questions about these Terms:{' '}
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

export default Terms;
