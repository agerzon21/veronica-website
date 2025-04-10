import { useState, useEffect } from 'react';

interface Image {
  id: string;
  name: string;
  url: string;
}

export const useGoogleDriveImages = () => {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        setLoading(true);
        setError(null);
        setImages([]);
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