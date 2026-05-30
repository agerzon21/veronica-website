import React from 'react';
import { Box } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import HeroSection from '../components/HeroSection';
import GoogleReviewsSection from '../components/GoogleReviewsSection';
import InstagramFeed from '../components/InstagramFeed';

const Home: React.FC = () => {
  const carouselImages = [
    {
      url: "/assets/photos/portraits/tropical-bikini-pose-bamboo.webp",
      mobileUrl: "/assets/photos/portraits/tropical-bikini-pose-bamboo.webp",
      position: "center 35%",
      mobilePosition: "40% 80%"
    },
    {
      url: "/assets/photos/portraits/shadow-play-portrait.webp",
      mobileUrl: "/assets/photos/portraits/shadow-play-portrait.webp",
      position: "center 30%",
      mobilePosition: "40% 40%"
    },
    {
      url: "/assets/photos/portraits/girl-embracing-palm-leaf.webp",
      mobileUrl: "/assets/photos/portraits/girl-embracing-palm-leaf.webp",
      position: "center 33%",
      mobilePosition: "center 43%",
      desktopSkip: true
    },
    {
      url: "/assets/photos/portraits/ocean-swimming-joy.webp",
      mobileUrl: "/assets/photos/portraits/ocean-swimming-joy.webp",
      position: "center 33%",
      mobilePosition: "35% 43%"
    },
    {
      url: "/assets/photos/weddings/winged-couple-fantasy-portrait.webp",
      mobileUrl: "/assets/photos/weddings/winged-couple-fantasy-portrait.webp",
      position: "center 38%",
      mobilePosition: "center 48%"
    },
    {
      url: "/assets/photos/weddings/wedding-party-seafoam.webp",
      mobileUrl: "/assets/photos/weddings/wedding-party-seafoam.webp",
      position: "center 50%",
      mobilePosition: "0% 60%",
      mobileSkip: true, // doesn't crop well to portrait LCD — desktop only
    },
    {
      url: "/assets/photos/weddings/newlyweds-running-sea.webp",
      mobileUrl: "/assets/photos/weddings/newlyweds-running-sea.webp",
      position: "center 40%",
      mobilePosition: "40% 50%",
      desktopSkip: true
    },
    {
      url: "/assets/photos/family/elegant-family-studio-portrait-black.webp",
      mobileUrl: "/assets/photos/portraits/lace-pink-dress-blue-glacier.webp",
      position: "center 30%",
      mobilePosition: "center 40%"
    },
    // ── Trial batch — will be culled down to 12 desktop / 12 mobile. Position
    //    values are placeholder defaults; tune the cropping per photo as needed.
    // Desktop-only
    {
      url: "/assets/photos/weddings/couple-back-camera-ocean-view.webp",
      mobileUrl: "/assets/photos/weddings/couple-back-camera-ocean-view.webp",
      position: "center 35%",
      mobilePosition: "center 45%",
      mobileSkip: true,
    },
    {
      url: "/assets/photos/weddings/wedding-kiss-pink-sunset.webp",
      mobileUrl: "/assets/photos/weddings/wedding-kiss-pink-sunset.webp",
      position: "center 35%",
      mobilePosition: "center 45%",
      mobileSkip: true,
    },
    {
      url: "/assets/photos/weddings/confident-bride-bouquet.webp",
      mobileUrl: "/assets/photos/weddings/confident-bride-bouquet.webp",
      position: "center 35%",
      mobilePosition: "center 45%",
      mobileSkip: true,
    },
    {
      url: "/assets/photos/family/family-camping-adventure.webp",
      mobileUrl: "/assets/photos/family/family-camping-adventure.webp",
      position: "center 35%",
      mobilePosition: "center 45%",
      mobileSkip: true,
    },
    // Mobile-only
    {
      url: "/assets/photos/weddings/bride-groom-under-veil-smiles.webp",
      mobileUrl: "/assets/photos/weddings/bride-groom-under-veil-smiles.webp",
      position: "center 35%",
      mobilePosition: "center 45%",
      desktopSkip: true,
    },
    {
      url: "/assets/photos/portraits/friendship-tree-roots.webp",
      mobileUrl: "/assets/photos/portraits/friendship-tree-roots.webp",
      position: "center 35%",
      mobilePosition: "center 45%",
      desktopSkip: true,
    },
    // Both
    {
      url: "/assets/photos/weddings/lotus-pond-reflection-newlyweds.webp",
      mobileUrl: "/assets/photos/weddings/lotus-pond-reflection-newlyweds.webp",
      position: "center 35%",
      mobilePosition: "center 45%",
    },
    {
      url: "/assets/photos/portraits/woman-poppy-petals-floating.webp",
      mobileUrl: "/assets/photos/portraits/woman-poppy-petals-floating.webp",
      position: "center 35%",
      mobilePosition: "center 45%",
      desktopSkip: true
    },
    {
      url: "/assets/photos/portraits/yellow-tank-top-sunflower-field.webp",
      mobileUrl: "/assets/photos/portraits/yellow-tank-top-sunflower-field.webp",
      position: "center 35%",
      mobilePosition: "center 45%",
    },
  ];

  return (
    <Box
      position="relative"
      width="100%"
    >
      <Helmet>
        <meta property="og:image" content="https://vero.photography/assets/photos/site/contact-bg.webp" />
      </Helmet>
      <HeroSection images={carouselImages} />
      <InstagramFeed />
      <GoogleReviewsSection />
    </Box>
  );
};

export default Home;
