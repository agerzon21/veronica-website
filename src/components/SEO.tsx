import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  keywords?: string[];
}

const SEO = ({
  title = 'Vero Photography | Professional Photographer in Punta Cana & Worldwide',
  description = 'Professional photography services by Veronika Gerzon. Specializing in weddings, portraits, family sessions, and maternity photography in Punta Cana and worldwide. Creating timeless memories through artistic and emotional storytelling.',
  image = '/assets/photos/Vero.webp',
  url = 'https://vero.photography',
  type = 'website',
  keywords = [
    // Business & Personal Branding Keywords
    'Vero Photography',
    'Veronika Gerzon',
    'Vero Photography Punta Cana',
    'Veronika Gerzon Photography',
    'Vero Photography DR',
    'Veronika Gerzon Photographer',
    'Vero Photography Dominican Republic',
    'Veronika Gerzon Wedding Photographer',
    'Vero Photography Wedding',
    'Veronika Gerzon Portraits',
    'Vero Photography Portraits',
    'Veronika Gerzon Family Photography',
    'Vero Photography Family',
    'Veronika Gerzon Maternity',
    'Vero Photography Maternity',
    'Vero Photography Website',
    'Veronika Gerzon Portfolio',
    'Vero Photography Portfolio',
    'Veronika Gerzon Gallery',
    'Vero Photography Gallery',
    'Vero Photography Contact',
    'Veronika Gerzon Contact',
    'Vero Photography Booking',
    'Veronika Gerzon Booking',
    'Vero Photography Services',
    'Veronika Gerzon Services',
    'Vero Photography Packages',
    'Veronika Gerzon Packages',
    'Vero Photography Reviews',
    'Veronika Gerzon Reviews',

    // Punta Cana Specific Keywords
    'Punta Cana Photographer',
    'Wedding Photography Punta Cana',
    'Portrait Photography Punta Cana',
    'Family Photography Punta Cana',
    'Maternity Photography Punta Cana',
    'Beach Photography Punta Cana',
    'Resort Photography Punta Cana',
    'Caribbean Photographer',
    'Dominican Republic Photographer',
    'Luxury Beach Wedding Photography Punta Cana',
    'Destination Wedding Photographer Punta Cana',
    'Professional Resort Photographer Punta Cana',
    'Tropical Wedding Photography Dominican Republic',
    'Beach Portrait Session Punta Cana',
    'Resort Family Photos Punta Cana',
    'Luxury Maternity Photography Punta Cana',
    'Professional Event Photography Punta Cana',
    'Caribbean Destination Photographer',
    'Punta Cana Wedding Photojournalist',
    'Resort Lifestyle Photography Punta Cana',
    'Luxury Resort Wedding Photography Punta Cana',
    'Professional Beach Portrait Photography Punta Cana',
    'Tropical Destination Wedding Photographer Punta Cana',
    'Caribbean Beach Wedding Photography',
    'Punta Cana Resort Wedding Photography',
    'Luxury Caribbean Wedding Photography',
    'Professional Punta Cana Photographer',
    'Tropical Beach Portrait Photography Punta Cana',
    'Caribbean Destination Wedding Photography',
    'Luxury Punta Cana Wedding Photography',
    
    // Wedding Photography Keywords
    'Destination Wedding Photographer',
    'Wedding Photography',
    'Beach Wedding Photography',
    'Luxury Wedding Photography',
    'Intimate Wedding Photography',
    'Wedding Photojournalism',
    'Candid Wedding Photography',
    'Artistic Wedding Photos',
    'Luxury Destination Wedding Photography',
    'Beach Wedding Photo Session',
    'Intimate Wedding Ceremony Photography',
    'Wedding Day Photo Coverage',
    'Professional Wedding Photojournalist',
    'Artistic Wedding Photo Session',
    'Luxury Wedding Photo Package',
    'Destination Wedding Photo Coverage',
    'Wedding Photography Services',
    'Professional Wedding Photo Session',
    'Wedding Photo Storytelling',
    'Wedding Photo Documentary',
    'Luxury Wedding Photo Coverage',
    'Professional Wedding Photography Services',
    'Artistic Wedding Photo Coverage',
    'Destination Wedding Photo Session',
    'Beach Wedding Photo Coverage',
    'Intimate Wedding Photo Session',
    'Wedding Photo Storytelling Session',
    'Professional Wedding Photo Package',
    'Luxury Wedding Photo Session',
    'Wedding Photo Documentary Coverage',
    
    // Portrait Photography Keywords
    'Professional Portrait Photography',
    'Contemporary Portrait Photography',
    'Natural Light Portraits',
    'Lifestyle Portrait Photography',
    'Environmental Portraits',
    'Fashion Photography',
    'Editorial Photography',
    'Luxury Portrait Photography',
    'Professional Headshot Photography',
    'Natural Light Portrait Session',
    'Environmental Portrait Photography',
    'Lifestyle Portrait Session',
    'Contemporary Portrait Session',
    'Professional Portrait Photo Session',
    'Artistic Portrait Photography',
    'Editorial Portrait Session',
    'Fashion Portrait Photography',
    'Professional Portrait Photo Package',
    'Luxury Portrait Photo Session',
    'Portrait Photography Services',
    'Luxury Portrait Photo Coverage',
    'Professional Portrait Photo Services',
    'Artistic Portrait Photo Session',
    'Natural Light Portrait Coverage',
    'Environmental Portrait Session',
    'Lifestyle Portrait Coverage',
    'Contemporary Portrait Coverage',
    'Professional Portrait Photo Coverage',
    'Artistic Portrait Photo Coverage',
    'Editorial Portrait Coverage',
    
    // Family Photography Keywords
    'Family Portrait Photography',
    'Family Beach Portraits',
    'Multi-Generation Family Photos',
    'Candid Family Photography',
    'Modern Family Portraits',
    'Family Lifestyle Photography',
    'Luxury Family Photography',
    'Professional Family Photo Session',
    'Beach Family Portrait Session',
    'Multi-Generation Family Portrait',
    'Candid Family Photo Session',
    'Modern Family Photo Package',
    'Family Lifestyle Photo Session',
    'Professional Family Photography',
    'Family Portrait Photo Package',
    'Luxury Family Photo Session',
    'Family Photography Services',
    'Professional Family Photo Coverage',
    'Family Photo Storytelling',
    'Family Photo Documentary',
    'Luxury Family Photo Coverage',
    'Professional Family Photo Services',
    'Artistic Family Photo Session',
    'Beach Family Photo Coverage',
    'Multi-Generation Family Coverage',
    'Candid Family Photo Coverage',
    'Modern Family Photo Session',
    'Family Lifestyle Photo Coverage',
    'Professional Family Photo Package',
    'Family Portrait Photo Coverage',
    
    // Maternity Photography Keywords
    'Maternity Photography',
    'Pregnancy Photo Session',
    'Beach Maternity Photos',
    'Artistic Maternity Portraits',
    'Natural Maternity Photography',
    'Luxury Maternity Photography',
    'Professional Maternity Photo Session',
    'Beach Maternity Portrait Session',
    'Artistic Maternity Photo Session',
    'Natural Maternity Photo Package',
    'Professional Maternity Photography',
    'Maternity Portrait Photo Session',
    'Luxury Maternity Photo Package',
    'Maternity Photography Services',
    'Professional Maternity Photo Coverage',
    'Maternity Photo Storytelling',
    'Maternity Photo Documentary',
    'Pregnancy Portrait Photography',
    'Expecting Mother Photography',
    'Maternity Photo Session Package',
    'Luxury Maternity Photo Coverage',
    'Professional Maternity Photo Services',
    'Artistic Maternity Photo Coverage',
    'Beach Maternity Photo Session',
    'Natural Maternity Photo Coverage',
    'Pregnancy Photo Coverage',
    'Expecting Mother Photo Session',
    'Maternity Portrait Photo Coverage',
    'Professional Maternity Photo Package',
    'Luxury Maternity Photo Session',
    
    // Style & Approach Keywords
    'Fine Art Photography',
    'Documentary Photography',
    'Natural Light Specialist',
    'Emotional Storytelling',
    'Timeless Photography',
    'Luxury Photography Services',
    'International Photographer',
    'Travel Photography',
    'Artistic Photography Style',
    'Professional Photojournalism',
    'Natural Light Photography',
    'Emotional Photo Storytelling',
    'Timeless Photo Style',
    'Luxury Photo Services',
    'International Photo Coverage',
    'Travel Photo Services',
    'Fine Art Photo Style',
    'Documentary Photo Approach',
    'Professional Photo Services',
    'Artistic Photo Style',
    'Luxury Photo Coverage',
    'Professional Photo Coverage',
    'Artistic Photo Coverage',
    'Natural Light Photo Style',
    'Emotional Photo Coverage',
    'Timeless Photo Coverage',
    'International Photo Style',
    'Travel Photo Coverage',
    'Fine Art Photo Coverage',
    'Documentary Photo Coverage',
    
    // Location Keywords
    'Destination Photographer',
    'Beach Photography',
    'Resort Photography',
    'Tropical Wedding Photography',
    'US Wedding Photographer',
    'Worldwide Photography Services',
    'International Destination Photographer',
    'Beach Photo Session',
    'Resort Photo Coverage',
    'Tropical Photo Session',
    'US Photo Services',
    'Worldwide Photo Coverage',
    'International Photo Services',
    'Destination Photo Session',
    'Beach Photo Coverage',
    'Resort Photo Session',
    'Tropical Photo Coverage',
    'US Photo Session',
    'Worldwide Photo Session',
    'International Photo Coverage',
    'Luxury Destination Photography',
    'Professional Beach Photography',
    'Artistic Resort Photography',
    'Natural Tropical Photography',
    'Professional US Photography',
    'Luxury Worldwide Photography',
    'International Beach Photography',
    'Destination Resort Photography',
    'Tropical Beach Photography',
    'US Destination Photography'
  ],
}: SEOProps) => {
  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords.join(', ')} />
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      <meta charSet="utf-8" />
      <meta name="language" content="English" />
      <meta name="revisit-after" content="7 days" />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={url} />

      {/* Mobile Specific Meta Tags */}
      <meta name="theme-color" content="#000000" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black" />
      <meta name="format-detection" content="telephone=no" />

      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Vero Photography" />
      <meta property="og:locale" content="en_US" />
      <meta property="og:locale:alternate" content="es_DO" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Vero Photography - Professional Photographer" />
    </Helmet>
  );
};

export default SEO; 