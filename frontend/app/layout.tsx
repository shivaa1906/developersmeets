import type { Metadata } from 'next';
import '@/styles/globals.css';
import { siteConfig } from '@/config/site';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/hooks/use-auth';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { MeshBackground } from '@/components/ui/mesh-background';
import { MouseGlow } from '@/components/ui/mouse-glow';

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} | Developer-Powered Company Operating System`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    'developer platform',
    'software engineering company',
    'developer marketplace',
    'credit claim system',
    'enterprise development',
  ],
  authors: [
    { name: siteConfig.company.leadership.ceo.name },
    { name: siteConfig.company.leadership.md.name },
  ],
  metadataBase: new URL(siteConfig.url),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Corporation',
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
  founder: {
    '@type': 'Person',
    name: siteConfig.company.leadership.ceo.name,
    jobTitle: siteConfig.company.leadership.ceo.title,
  },
  director: {
    '@type': 'Person',
    name: siteConfig.company.leadership.md.name,
    jobTitle: siteConfig.company.leadership.md.title,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased selection:bg-accent/30 selection:text-white">
        <ToastProvider>
          <AuthProvider>
            <MeshBackground />
            <MouseGlow />
            <div className="relative z-10 flex min-h-screen flex-col">
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
