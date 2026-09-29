import { useCallback, useState } from 'react';
import { Box, HStack, Text } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import FaSignOutAlt from '../icons/fa/FaSignOutAlt';
import CTAButton from './ui/CTAButton';
import ConfirmDialog from './ui/ConfirmDialog';
import Footer from './Footer';
import PortalHeader from './PortalHeader';
import { HEADER_CLEARANCE, portalChrome } from './portalLayout';
import ReadingProgress from './ReadingProgress';
import ClientGallery, {
  useGalleryNav,
  type DriveFile,
  type FolderSection,
} from './ClientGallery';

/**
 * /portal/pass once a guest is through the password form: the shared gallery,
 * its own header nav, and the way out.
 *
 * WHY IT IS A FILE OF ITS OWN. This was inline in Portal.tsx, which meant
 * Portal's chunk statically imported ClientGallery, ImageModal, PortalHeader
 * and ReadingProgress, and the SIGN-IN page downloaded all four before anybody
 * had typed a password: 172 KiB of ClientPortalView plus 61 KiB of ImageModal,
 * measured on production. Welcome.tsx already refuses that trade for the same
 * reason, in the same words: an import that "would drag the whole portal bundle
 * (signature pad, gallery) into a page that is a password form".
 *
 * The one thing that could not simply be wrapped in React.lazy is
 * `useGalleryNav`. A hook has to be called unconditionally, so Portal called it
 * on every render, sign-in form included, which pinned ClientGallery into the
 * static graph however the render below was loaded. Moving the branch moves the
 * hook call with it, and it now runs only when there is a gallery to navigate.
 *
 * The Sign Out confirmation state came along for the same reason: nothing
 * outside this view ever read it.
 */

/** What /api/portal/gallery hands back, as this view consumes it. */
export type GalleryData = {
  clientName: string | null;
  driveUrl: string;
  rootFiles: DriveFile[];
  sections: FolderSection[];
  warning?: string;
  // ISO timestamp for when the gallery access expires. Surfaced in the
  // gallery-only route as an "available until" notice so guests know
  // when the link will stop working (and to nudge them to save copies).
  expiresAt: string | null;
};

export default function PortalGalleryView({
  data: galleryData,
  galleryPassword,
  onSignOut: handleGalleryLogout,
}: {
  data: GalleryData;
  galleryPassword: string;
  /** Forgets the session and lands back on the gallery password form. */
  onSignOut: () => void;
}) {
  /** The gallery only route's Sign Out confirmation, see the dialog below. */
  const [gallerySignOutOpen, setGallerySignOutOpen] = useState(false);

  // The gallery's own nav, lifted so the header can carry it. Built here
  // rather than inside ClientGallery because the header is a sibling, not a
  // child.
  const galleryNav = useGalleryNav({
    sections: galleryData.sections,
    // One row of chrome here, not two: the nav is IN the header on this route,
    // so there is nothing pinned under it. Passing the full portal's two-row
    // chrome is what used to land every section heading a whole nav row too
    // low, and left the scan calling a section current 48px before it was.
    chrome: portalChrome(false),
  });
  const onGallerySelect = useCallback(
    (id: string) => {
      const item = galleryNav.items.find((i) => i.id === id);
      if (!item || item.disabled) return;
      galleryNav.setActiveId(id);
      item.scrollTo();
    },
    [galleryNav],
  );

  return (
    <>
      <Helmet>
        <title>{galleryData.clientName ? `${galleryData.clientName}, Gallery` : 'Gallery'} | Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {/* A guest on a shared gallery link has no contract and no balance,
          so the header shows no progress and no money. What it DOES carry is
          the gallery's own navigation, because here that is the only
          navigation there is: Info plus one item per folder. Favourites is
          absent by construction, since this route passes no favourite
          handler and useGalleryNav only includes it when one exists.

          Passing sectionNavInHeader stops ClientGallery rendering its own
          sticky strip, so the guest gets one bar rather than two. Nothing
          passes portalNavRow either, and the two together are how the
          gallery knows its headings have one row of chrome to clear here
          rather than the full portal's two.

          The padding clears that fixed header. ClientGallery does not pad
          for it itself, so the same component can be embedded inside
          ClientPortalView (where the portal wrapper already handles the
          clearance) without doubling up. */}
      {/* The same travelling coin the full portal and a journal post carry.
          A shared gallery is the longest scroll on the site, so if anywhere
          wants a way to jump half way down it by hand, it is here. */}
      <ReadingProgress rail="always" bottomBar={false} autoHide scrub />
      <PortalHeader
        // The gallery's sections, which the header draws as the photo bar at
        // every width. There is nothing to hand off to here, so the bar
        // simply owns the slot: `inPhotos` is not passed because on this
        // route the whole page IS the photos.
        //
        // No accountNav goes with it, and that is the whole reason a guest
        // on a shared link gets no account bar and no burger: there is no
        // account here to open a menu onto.
        sectionNav={{
          items: galleryNav.items,
          activeId: galleryNav.activeId,
          onSelect: onGallerySelect,
        }}
      />
      <Box pt={HEADER_CLEARANCE}>
        <ClientGallery
          clientName={galleryData.clientName}
          driveUrl={galleryData.driveUrl}
          rootFiles={galleryData.rootFiles}
          sections={galleryData.sections}
          warning={galleryData.warning}
          galleryPassword={galleryPassword.trim()}
          expiresAt={galleryData.expiresAt}
          sectionNavInHeader
        />
        {/* The way out.
            Placed at the very end of the gallery, under the share section
            and above the footer, for two reasons. There is nowhere else: the
            header on this route is the logo plus the photo bar and carries no
            burger, by construction, because a guest on a shared link has no
            account to open a menu onto. And anywhere higher would put an exit
            beside the photos, which is the one thing a gallery page should
            not do. Someone scrolling to the end of their photos reaches it
            without hunting, and nobody else ever has to look at it.

            The treatment is the full portal's Refresh and Sign Out pair,
            lifted whole: the same centred CTAButton row, the same outlined
            danger variant (a hairline that only fills on hover, the quiet end
            of the scale), and the same ConfirmDialog behind it. One button
            rather than two, because a guest has nothing here to refresh.
            The line above it is doing the work the full portal's dialog copy
            does: saying what signing out costs before anyone taps it. */}
        <Box
          as="section"
          px={{ base: 4, md: 8 }}
          pt={{ base: 8, md: 10 }}
          pb={{ base: 10, md: 12 }}
          textAlign="center"
          borderTop="1px solid"
          borderColor="brand.accentBorder"
        >
          <Text
            fontSize="sm"
            color="gray.600"
            fontWeight="300"
            lineHeight="1.7"
            maxW="460px"
            mx="auto"
          >
            Finished looking? Signing out closes these photos on this phone or
            computer. You will need the link or the password to open them again.
          </Text>
          <HStack mt={6} spacing={3} justify="center" flexWrap="wrap">
            <CTAButton
              onClick={() => setGallerySignOutOpen(true)}
              icon={FaSignOutAlt}
              variant="danger"
              size="sm"
            >
              Sign Out
            </CTAButton>
          </HStack>
        </Box>
      </Box>
      {/* Asks first, exactly as the full portal's does. Nothing is lost by
          signing out, but a guest who taps it by accident has to find the
          link again, and on a phone that is a real errand. */}
      <ConfirmDialog
        isOpen={gallerySignOutOpen}
        title="Sign out of this gallery?"
        body="You will need the link or the password to open these photos again."
        confirmLabel="Sign Out"
        cancelLabel="Keep Looking"
        danger
        onConfirm={() => {
          setGallerySignOutOpen(false);
          handleGalleryLogout();
        }}
        onCancel={() => setGallerySignOutOpen(false)}
      />
      <Footer />
    </>
  );
}
