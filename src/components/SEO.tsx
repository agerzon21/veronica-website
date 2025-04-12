import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

const SEO = ({
  title = 'Vero Photography | Professional Photographer in Punta Cana',
  description = 'Professional photography services by Veronika Gerzon. Specializing in weddings, portraits, and events in Punta Cana and worldwide.',
  image = 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744340476/%D0%A4%D0%BE%D1%82%D0%BE_%D0%A2%D0%A4%D0%9F_%D0%9B%D0%B8%D0%B7%D0%B0_1491_apmb9t.jpg',
  url = 'https://veronica-photography.com',
  type = 'website',
}: SEOProps) => {
  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta charSet="utf-8" />

      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />

      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Photographer',
          name: 'Veronika Gerzon',
          image: image,
          url: url,
          description: description,
          address: {
            '@type': 'PostalAddress',
            addressLocality: 'Punta Cana',
            addressRegion: 'Dominican Republic',
            addressCountry: 'DO'
          },
          geo: {
            '@type': 'GeoCoordinates',
            latitude: '18.5601',
            longitude: '-68.3725'
          },
          sameAs: [
            'https://www.instagram.com/vero.kz/'
          ]
        })}
      </script>
    </Helmet>
  );
};

export default SEO; 