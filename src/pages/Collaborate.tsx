import { Helmet } from 'react-helmet-async';
import { Link as RouterLink } from 'react-router-dom';
import { Link, Text } from '@chakra-ui/react';
import PolicyLayout, { PolicySection, P, PolicyList, Term } from '../components/PolicyLayout';

/**
 * Collaborate — for photographers and videographers, not for clients.
 *
 * WHY THIS PAGE EXISTS
 * Enquiries from second shooters and videographers were already arriving
 * unprompted through the contact form, mixed in with couples asking about
 * weddings, with nowhere on the site describing what Vero is actually looking
 * for. Meanwhile the one role she genuinely needs filling, a videographer, was
 * advertised nowhere at all.
 *
 * WHY "COLLABORATE" AND NOT "CAREERS"
 * Nobody here is an employee. These are contractors paid per event, and a page
 * headed Careers sets an expectation about permanence, W-2s and benefits that
 * is not on offer. The word matters legally as well as tonally: it is the
 * first thing that tells an applicant what kind of arrangement this is.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * Vero also sometimes refers an enquiry to another photographer and takes a
 * share. That is a private arrangement with people she already trusts, and
 * advertising "we will send you work for a cut" attracts exactly the wrong
 * applicants. It also works differently: the couple contracts with the other
 * photographer, so her contract, her insurance and her liability do not reach
 * it. Subcontracting, which is what this page describes, keeps all three.
 *
 * THE INSURANCE LINE IS LOAD BEARING. An uninsured subcontractor is routinely
 * reclassified as payroll at an insurance audit, which arrives as a surprise
 * premium bill a year later. Saying it here filters applicants before the
 * conversation rather than after it.
 */

const Collaborate = () => {
  return (
    <>
      <Helmet>
        <title>Collaborate | Vero Photography</title>
        <meta
          name="description"
          content="Wedding videographers and second shooters in northeastern Pennsylvania: what Vero Photography looks for in a collaborator, how the work is paid, and how to get in touch."
        />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <PolicyLayout
        kicker="Collaborate"
        title="For videographers and second shooters"
        intro={
          <>
            This page is for photographers and videographers, not for couples.
            If you are planning a wedding, the{' '}
            <Link as={RouterLink} to="/wedding-photography" color="brand.accentTextDeep">
              weddings page
            </Link>{' '}
            is the one you want.
          </>
        }
      >
        <PolicySection title="Who we are looking for">
          <P>
            Two roles, and they are different jobs. Both are paid per event as
            independent contractors, not employment.
          </P>
          <P>
            <Term>Videographers.</Term> This is the one we most need. We
            photograph weddings and are asked for video often enough that
            turning it down has become the awkward part of the conversation. We
            are looking for someone to bring onto wedding days, filming
            alongside the photography rather than competing with it.
          </P>
          <P>
            <Term>Second photographers.</Term> Occasional, mostly on larger
            weddings and days split across several locations. A second
            photographer earns their place with big guest counts, multiple
            venues, or several things happening at once.
          </P>
        </PolicySection>

        <PolicySection title="What we ask for">
          <PolicyList
            items={[
              <>
                <Term>Work we can look at.</Term> A reel, a portfolio, a
                website, a gallery from a real day. It does not have to be a
                polished wedding reel: we would rather see honest event footage
                than a showpiece cut from something else.
              </>,
              <>
                <Term>Your own equipment,</Term> including backups. A wedding
                does not pause for a dead battery or a failed card.
              </>,
              <>
                <Term>Your own liability insurance.</Term> This one is not
                negotiable, and it is the question venues ask before they ask
                anything else.
              </>,
              <>
                <Term>Based in or willing to travel to northeastern
                Pennsylvania.</Term> Most of our work is within about two hours
                of Scranton and the Poconos.
              </>,
              <>
                <Term>Calm on a live day.</Term> Weddings run late, move
                indoors, and change shape an hour before the ceremony. That is
                normal, and the people who are good at this treat it as normal.
              </>,
            ]}
          />
        </PolicySection>

        <PolicySection title="How it works">
          <P>
            You are booked and paid by us for the event, and the couple signs a
            single contract with Vero Photography. That means one point of
            contact for them, and for you it means you are not chasing a client
            for payment or carrying the booking if something goes wrong on our
            side.
          </P>
          <P>
            Rates are agreed per event and depend on the day: how long it runs,
            how far it is, and what is being asked for. We would rather talk
            about a specific wedding than publish a number that turns out to be
            wrong for yours.
          </P>
          <P>
            You keep your own credit. Once we have worked together and it has
            gone well, we are glad to list you among the vendors we recommend to
            couples, which is a page we are deliberately slow to add people to.
          </P>
        </PolicySection>

        <PolicySection title="Getting in touch">
          <P>
            Send us your work through the{' '}
            <Link as={RouterLink} to="/contact" color="brand.accentTextDeep">
              contact form
            </Link>
            , choosing <Term>Collaboration</Term> as the enquiry type so it
            reaches the right place rather than sitting among wedding enquiries.
            Include a link to your work, roughly where you are based, and
            anything you have filmed or photographed that you are proud of.
          </P>
          <Text textStyle="metaCaption" mt={4}>
            We read everything, and we reply to people whose work fits what we
            are looking for. If we do not have anything for you now, we keep
            details on file rather than starting from nothing next season.
          </Text>
        </PolicySection>
      </PolicyLayout>
    </>
  );
};

export default Collaborate;
