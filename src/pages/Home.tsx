import React from 'react';
import { Box } from '@chakra-ui/react';
import ImageCarousel from '../components/ImageCarousel';
import ParallaxSection from '../components/ParallaxSection';
import StatsSection from '../components/StatsSection';
import InstagramFeed from '../components/InstagramFeed';

const Home: React.FC = () => {
  const carouselImages = [
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744394600/IMG_9840_xdmiic.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744394600/IMG_9840_xdmiic.jpg",
      position: "center 35%",
      mobilePosition: "40% 80%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744394695/765456_mqaert.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744394695/765456_mqaert.jpg",
      position: "center 30%",
      mobilePosition: "40% 40%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744427870/IMG_3711_zrqb93.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744427870/IMG_3711_zrqb93.jpg",
      position: "center 33%",
      mobilePosition: "center 43%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744392680/QC6C6660_%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F_zqhxlw.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744392680/QC6C6660_%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F_zqhxlw.jpg",
      position: "center 33%",
      mobilePosition: "35% 43%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744399932/_C6C3980_zzzpzo.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744399932/_C6C3980_zzzpzo.jpg",
      position: "center 38%",
      mobilePosition: "center 48%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744415150/IMG_8996_copy_y63gjs.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744415150/IMG_8996_copy_y63gjs.jpg",
      position: "center 50%",
      mobilePosition: "0% 60%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744416012/_C6C4657_xnvdyo.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744416012/_C6C4657_xnvdyo.jpg",
      position: "center 0%",
      mobilePosition: "37% 10%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744415004/05_rfvs8y.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744415004/05_rfvs8y.jpg",
      position: "center 40%",
      mobilePosition: "40% 50%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744416869/_C6C16373_l2cnrk.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744398816/2500_ixvxpa.jpg",
      position: "center 30%",
      mobilePosition: "center 40%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744418720/IMG_4618_fbdjzz.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744393565/QC6C6905_copy_cgvysy.jpg",
      position: "center 90%",
      mobilePosition: "center 80%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744416973/0066_ce14dy.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744416973/0066_ce14dy.jpg",
      position: "center 35%",
      mobilePosition: "center 45%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744420003/_C6C90411_bi7gse.jpg",
      mobileUrl: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744420003/_C6C90411_bi7gse.jpg",
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
        imageUrl="https://res.cloudinary.com/doj1fanx3/image/upload/v1744310086/IMG_3709_w1cvak.jpg"
        mobileImageUrl="https://res.cloudinary.com/doj1fanx3/image/upload/v1744397027/_C6C4032_fyviyu.jpg"
        imagePosition="center 85%"
        mobileImagePosition="50% 10%"
      />
      <InstagramFeed />
    </Box>
  );
};

export default Home; 