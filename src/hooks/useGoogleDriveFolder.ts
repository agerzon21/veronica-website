import { useState, useEffect } from 'react';

interface Image {
  id: string;
  name: string;
  url: string;
}

// Images from Google Drive
const IMAGES = [
  {
    id: '1mDeFMejQkKyBhWDv2astpfUQICffsBH5',
    name: 'IMG_3678',
    url: 'https://lh3.googleusercontent.com/d/1mDeFMejQkKyBhWDv2astpfUQICffsBH5'
  }
];

export const useGoogleDriveFolder = () => {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('Loading images:', IMAGES);
        setImages(IMAGES);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch images');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchImages();
  }, []);

  return { images, loading, error };
}; 