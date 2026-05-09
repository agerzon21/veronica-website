import React from 'react';
import { Box } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import ImageCarousel from '../components/ImageCarousel';
import ParallaxSection from '../components/ParallaxSection';
import StatsSection from '../components/StatsSection';
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
      mobilePosition: "center 43%"
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
      url: "/assets/photos/weddings/passionate-kiss-by-sea.webp",
      mobileUrl: "/assets/photos/weddings/passionate-kiss-by-sea.webp",
      position: "center 50%",
      mobilePosition: "0% 60%"
    },
    {
      url: "/assets/photos/weddings/couple-embracing-greenery.webp",
      mobileUrl: "/assets/photos/weddings/couple-embracing-greenery.webp",
      position: "center 0%",
      mobilePosition: "37% 10%"
    },
    {
      url: "/assets/photos/weddings/newlyweds-running-sea.webp",
      mobileUrl: "/assets/photos/weddings/newlyweds-running-sea.webp",
      position: "center 40%",
      mobilePosition: "40% 50%"
    },
    {
      url: "/assets/photos/family/elegant-family-studio-portrait-black.webp",
      mobileUrl: "/assets/photos/portraits/lace-pink-dress-blue-glacier.webp",
      position: "center 30%",
      mobilePosition: "center 40%"
    },
    {
      url: "/assets/photos/family/large-family-beach-gathering.webp",
      mobileUrl: "/assets/photos/portraits/green-eyes-palm-leaves.webp",
      position: "center 90%",
      mobilePosition: "center 80%"
    },
    {
      url: "/assets/photos/family/family-white-beach.webp",
      mobileUrl: "/assets/photos/family/family-white-beach.webp",
      position: "center 35%",
      mobilePosition: "center 45%"
    },
    {
      url: "/assets/photos/maternity/pregnant-friends-colorful-dresses.webp",
      mobileUrl: "/assets/photos/maternity/pregnant-friends-colorful-dresses.webp",
      position: "center 40%",
      mobilePosition: "center 50%"
    }
  ];

  return (
    <Box
      position="relative"
      width="100%"
      overflow="hidden"
    >
      <Helmet>
        <meta property="og:image" content="https://vero.photography/assets/photos/site/contact-bg.webp" />
      </Helmet>
      <ImageCarousel images={carouselImages} />
      <StatsSection />
      <ParallaxSection
        imageUrl="/assets/photos/site/home-cta-bg.webp"
        mobileImageUrl="/assets/photos/portraits/white-dress-lighthouse.webp"
        imagePosition="center 85%"
        mobileImagePosition="50% 10%"
      />
      <InstagramFeed />
      <GoogleReviewsSection />
    </Box>
  );
};

export default Home;
