import { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteConfig.url;

  const routes = [
    '',
    '/company',
    '/projects',
    '/projects/ai-ecommerce-platform',
    '/projects/cloud-devops-orchestrator',
    '/projects/fintech-escrow-ledger',
    '/developers',
    '/developers/ritesh-lingamallu',
    '/developers/shiva-gopi',
    '/developers/rahul-kumar',
    '/developers/sanjay-kumar',
    '/careers',
    '/contact',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1.0 : route.startsWith('/projects') || route.startsWith('/developers') ? 0.8 : 0.6,
  }));
}
