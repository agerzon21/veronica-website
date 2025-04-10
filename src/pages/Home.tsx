import React from 'react';
import { Box } from '@chakra-ui/react';
import ImageCarousel from '../components/ImageCarousel';
import ParallaxSection from '../components/ParallaxSection';
import StatsSection from '../components/StatsSection';

const Home: React.FC = () => {
  const carouselImages = [
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3712_uvjtxr.jpg",
      position: "center 45%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3710_utj2oy.jpg",
      position: "center 45%"
    },
    {
      url: "https://res.cloudinary.com/doj1fanx3/image/upload/v1744310088/IMG_3711_yr6cby.jpg",
      position: "center 35%"
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
        text="Book your appointment today!"
        imagePosition="center 85%"
      />
    </Box>
  );
};

export default Home; 