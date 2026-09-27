import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: 'Verified Developer Network',
  description: 'Browse approved and verified software engineers, architects, and AI specialists.',
  alternates: {
    canonical: `${siteConfig.url}/developers`,
  },
  openGraph: {
    title: `Verified Developer Network | ${siteConfig.name}`,
    description: 'Browse approved and verified software engineers, architects, and AI specialists.',
    url: `${siteConfig.url}/developers`,
    siteName: siteConfig.name,
    type: 'website',
  },
};

export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
