import { useState, useEffect } from 'react';

interface ImageData {
  url: string;
  name: string;
  id: string;
  category: string;
  fallbackUrls?: string[];
}

// Known subfolder names
export type ImageCategory = 'gallery' | 'portfolio' | 'events' | 'portraits' | 'weddings';

// Folder IDs from Veronica's Google Drive
const FOLDER_IDS: Partial<Record<ImageCategory, string>> = {
  events: '1_BDY8hIaX0vTRtNDYkSnUrqFaCcRRL-Y',
  // We'll add other folder IDs as we get them
};

// Test image IDs for each category
const TEST_IMAGES: Partial<Record<ImageCategory, string>> = {
  events: '1mDeFMejQkKyBhWDv2astpfUQICffsBH5',
  // We'll add other image IDs as we get them
};

export const useGoogleDriveImages = (category?: ImageCategory) => {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        console.log('Fetching images for category:', category);
        
        if (!category) {
          console.log('No category specified');
          setLoading(false);
          return;
        }

        const imageId = TEST_IMAGES[category];
        console.log('Image ID:', imageId);
        
        if (!imageId) {
          console.log('No image ID found for category:', category);
          setError(`No image found for category: ${category}`);
          setLoading(false);
          return;
        }

        // Try different URL formats
        const imageUrls = [
          `https://drive.google.com/uc?export=view&id=${imageId}`,
          `https://drive.google.com/thumbnail?id=${imageId}`,
          `https://drive.google.com/file/d/${imageId}/preview`
        ];

        console.log('Trying image URLs:', imageUrls);
        
        const testImages = [
          {
            id: imageId,
            name: 'Test Image',
            url: imageUrls[0], // Start with the first URL format
            category: category,
            fallbackUrls: imageUrls.slice(1) // Store other URL formats as fallbacks
          }
        ];

        console.log('Setting images:', testImages);
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