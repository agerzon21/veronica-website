import { useState, useEffect } from 'react';

interface CloudinaryImage {
  id: string;
  name: string;
  url: string;
}

type PageType = 'home' | 'gallery' | 'about' | 'contact';

// Predefined images for each section
const IMAGES = {
  home: [],
  gallery: [
    {
      id: 'veronica-photography/gallery/IMG_3712',
      name: 'Gallery Image 1',
      url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3712_uvjtxr.jpg'
    },
    {
      id: 'veronica-photography/gallery/IMG_3710',
      name: 'Gallery Image 2',
      url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3710_utj2oy.jpg'
    },
    {
      id: 'veronica-photography/gallery/IMG_3711',
      name: 'Gallery Image 3',
      url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310088/IMG_3711_yr6cby.jpg'
    },
    {
      id: 'veronica-photography/gallery/IMG_3709',
      name: 'Gallery Image 4',
      url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310086/IMG_3709_w1cvak.jpg'
    },
    {
      id: 'veronica-photography/gallery/IMG_3678',
      name: 'Gallery Image 5',
      url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310085/IMG_3678_hfzkpx.jpg'
    },
    {
      id: 'veronica-photography/gallery/IMG_6854',
      name: 'Gallery Image 6',
      url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310091/IMG_6854_gv0fis.jpg'
    }
  ],
  about: [],
  contact: []
};

export const useCloudinaryImages = (pageType: PageType = 'gallery') => {
  const [images, setImages] = useState<CloudinaryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLoading(true);
      setError(null);
      
      // Get images for the current page type
      const pageImages = IMAGES[pageType];
      console.log(`Loading ${pageType} images:`, pageImages);
      
      setImages(pageImages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load images';
      console.error('Error:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [pageType]);

  return { images, loading, error };
}; 