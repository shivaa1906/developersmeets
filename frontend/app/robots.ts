import { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard/',
        '/admin/',
        '/api/',
        '/workspace/',
        '/community/',
        '/support/',
        '/chat/',
        '/claims/',
        '/marketplace/',
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
