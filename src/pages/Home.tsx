import React from 'react';
import { Box } from '@chakra-ui/react';
import ImageCarousel from '../components/ImageCarousel';
import ParallaxSection from '../components/ParallaxSection';
import StatsSection from '../components/StatsSection';
import InstagramFeed from '../components/InstagramFeed';

const Home: React.FC = () => {
  const carouselImages = [
    {
      url: "/assets/photos/IMG_9840_xdmiic.webp",
      mobileUrl: "/assets/photos/IMG_9840_xdmiic.webp",
      position: "center 35%",
      mobilePosition: "40% 80%"
    },
    {
      url: "/assets/photos/765456_mqaert.webp",
      mobileUrl: "/assets/photos/765456_mqaert.webp",
      position: "center 30%",
      mobilePosition: "40% 40%"
    },
    {
      url: "/assets/photos/IMG_3711_zrqb93.webp",
      mobileUrl: "/assets/photos/IMG_3711_zrqb93.webp",
      position: "center 33%",
      mobilePosition: "center 43%"
    },
    {
      url: "/assets/photos/QC6C6660_копия_zqhxlw.webp",
      mobileUrl: "/assets/photos/QC6C6660_копия_zqhxlw.webp",
      position: "center 33%",
      mobilePosition: "35% 43%"
    },
    {
      url: "/assets/photos/_C6C3980_zzzpzo.webp",
      mobileUrl: "/assets/photos/_C6C3980_zzzpzo.webp",
      position: "center 38%",
      mobilePosition: "center 48%"
    },
    {
      url: "/assets/photos/IMG_8996_copy_y63gjs.webp",
      mobileUrl: "/assets/photos/IMG_8996_copy_y63gjs.webp",
      position: "center 50%",
      mobilePosition: "0% 60%"
    },
    {
      url: "/assets/photos/_C6C4657_xnvdyo.webp",
      mobileUrl: "/assets/photos/_C6C4657_xnvdyo.webp",
      position: "center 0%",
      mobilePosition: "37% 10%"
    },
    {
      url: "/assets/photos/05_rfvs8y.webp",
      mobileUrl: "/assets/photos/05_rfvs8y.webp",
      position: "center 40%",
      mobilePosition: "40% 50%"
    },
    {
      url: "/assets/photos/_C6C16373_l2cnrk.webp",
      mobileUrl: "/assets/photos/2500_ixvxpa.webp",
      position: "center 30%",
      mobilePosition: "center 40%"
    },
    {
      url: "/assets/photos/IMG_4618_fbdjzz.webp",
      mobileUrl: "/assets/photos/QC6C6905_copy_cgvysy.webp",
      position: "center 90%",
      mobilePosition: "center 80%"
    },
    {
      url: "/assets/photos/0066_ce14dy.webp",
      mobileUrl: "/assets/photos/0066_ce14dy.webp",
      position: "center 35%",
      mobilePosition: "center 45%"
    },
    {
      url: "/assets/photos/_C6C90411_bi7gse.webp",
      mobileUrl: "/assets/photos/_C6C90411_bi7gse.webp",
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
      <ImageCarousel images={carouselImages} />
      <StatsSection />
      <ParallaxSection
        imageUrl="/assets/photos/IMG_3709_w1cvak.webp"
        mobileImageUrl="/assets/photos/_C6C4032_fyviyu.webp"
        imagePosition="center 85%"
        mobileImagePosition="50% 10%"
      />
      <InstagramFeed />
    </Box>
  );
};

export default Home; 