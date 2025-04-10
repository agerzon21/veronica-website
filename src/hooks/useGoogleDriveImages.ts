import { useState, useEffect } from 'react';

interface ImageData {
  url: string;
  name: string;
  id: string;
  category: string;
}

// Main folder ID from Veronica's Google Drive
const MAIN_FOLDER_ID = '1WTfWq2xfGs16yZHCtGXNMJckrLt_cWSQ';

// Known subfolder names
export type ImageCategory = 'gallery' | 'portfolio' | 'events' | 'portraits' | 'weddings';

export const useGoogleDriveImages = (category?: ImageCategory) => {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        // For testing, let's use the main folder ID to construct a URL
        const testImages = [
          {
            id: MAIN_FOLDER_ID,
            name: 'Test Image',
            url: `https://drive.google.com/uc?export=view&id=${MAIN_FOLDER_ID}`,
            category: 'gallery'
          }
        ];

        setImages(testImages);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching images:', error);
        setError('Error loading images from Google Drive');
        setLoading(false);
      }
    };

    fetchImages();
  }, [category]);

  return { images, loading, error };
}; 