import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Github,
  Linkedin,
  Globe,
  Award,
  Briefcase,
  MapPin,
  Calendar,
} from 'lucide-react';

interface DeveloperProfileProps {
  params: { username: string };
}

async function getDeveloper(username: string) {
  const backendTarget = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000';

  try {
    const res = await fetch(`${backendTarget}/api/developers/profile/${username}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (!data.developer) {
      return null;
    }
    const d = data.developer;

    return {
      name: d.display_name || d.name,
      username: d.username,
      role: d.role_title || d.role,
      location: d.location || 'Global / Remote',
      experience: d.experience !== undefined ? d.experience : 0,
      verification_status: d.verification_status || 'VERIFIED',
      bio: d.bio || '',
      avatar: d.profile_photo || d.avatar_url || d.profile_image || null,
      skills: Array.isArray(d.skills)
        ? d.skills.map((s: any) => (typeof s === 'string' ? s : s.name))
        : [],
      certifications: Array.isArray(d.certifications)
        ? d.certifications.map((c: any) => (typeof c === 'string' ? c : c.name))
        : [],
      achievements: [
        'Verified Platform Engineering Specialist',
        'Direct project delivery signoff',
      ],
      github: d.github_url || d.github,
      linkedin: d.linkedin_url || d.linkedin,
      portfolio: d.portfolio_url || d.portfolio,
      associatedProjects: Array.isArray(d.attributedProjects) && d.attributedProjects.length > 0
        ? d.attributedProjects.map((p: any) => ({
            slug: p.slug,
            title: p.title,
            project_number: p.project_number,
            role: p.project_role || 'Contributor',
            timeline: p.timeline || 'Enterprise',
            category: p.category || 'Engineering',
            status: 'PUBLISHED',
          }))
        : [],
    };
  } catch (_err) {
    return null;
  }
}

export async function generateMetadata({ params }: DeveloperProfileProps): Promise<Metadata> {
  const dev = await getDeveloper(params.username);

  if (!dev) {
    return {
      title: 'Developer Not Found',
      robots: { index: false, follow: false },
    };
  }

  const title = `${dev.name} | ${dev.role}`;
  const description = dev.bio?.slice(0, 160) || `${dev.name} - Verified Engineer on ${siteConfig.name}`;
  const canonicalUrl = `${siteConfig.url}/developers/${params.username}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: siteConfig.name,
      type: 'profile',
      images: [
        {
          url: `${siteConfig.url}/og-developer.png`,
          width: 1200,
          height: 630,
          alt: dev.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: dev.verification_status === 'VERIFIED',
      follow: dev.verification_status === 'VERIFIED',
    },
  };
}

export default async function DeveloperDetailPage({ params }: DeveloperProfileProps) {
  const dev = await getDeveloper(params.username);

  if (!dev) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 space-y-12">
      {/* Back button */}
      <div>
        <Link href="/developers">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to Developer Network
          </Button>
        </Link>
      </div>

      {/* Profile Header */}
      <div className="rounded-2xl border border-border bg-surface-elevated p-8 relative overflow-hidden shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center space-x-5">
            <Avatar fallback={dev.name} src={dev.avatar} size="xl" className="border-2 border-accent/40 shadow-md" />
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{dev.name}</h1>
                <Badge variant="success" size="sm">
                  Verified Developer
                </Badge>
              </div>
              <p className="text-sm font-semibold text-accent">{dev.role}</p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted pt-1">
                <span className="flex items-center space-x-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{dev.location}</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Briefcase className="h-3.5 w-3.5" />
                  <span>{dev.experience} Years Experience</span>
                </span>
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="flex items-center space-x-3">
            {dev.github && (
              <a
                href={dev.github}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg p-2.5 bg-surface border border-border text-muted hover:text-foreground hover:border-accent/40 transition-colors"
                title="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
            )}
            {dev.linkedin && (
              <a
                href={dev.linkedin}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg p-2.5 bg-surface border border-border text-muted hover:text-foreground hover:border-accent/40 transition-colors"
                title="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            )}
            {dev.portfolio && (
              <a
                href={dev.portfolio}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg p-2.5 bg-surface border border-border text-muted hover:text-foreground hover:border-accent/40 transition-colors"
                title="Portfolio"
              >
                <Globe className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-xs sm:text-sm text-muted leading-relaxed">{dev.bio}</p>
        </div>
      </div>

      {/* Skills & Certifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Skills */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Technical Proficiencies</CardTitle>
            <CardDescription>Verified tech stack competencies</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {dev.skills.map((skill: string) => (
                <span
                  key={skill}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-mono text-foreground"
                >
                  {skill}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Certifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Certifications & Honors</CardTitle>
            <CardDescription>Industry verified credentials</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {dev.certifications?.map((cert: string, idx: number) => (
              <div key={idx} className="flex items-start space-x-2 text-xs text-muted">
                <Award className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                <span>{cert}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Associated Projects (ONLY projects associated with this developer!) */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Projects by {dev.name}</h2>
          <p className="text-xs text-muted mt-1">
            Completed projects verified and published in the company portfolio.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {dev.associatedProjects.map((p: any) => (
            <Card key={p.slug} hoverEffect className="flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-muted">{p.project_number}</span>
                  <Badge variant="success" size="sm">
                    {p.status}
                  </Badge>
                </div>
                <CardTitle className="text-base hover:text-accent transition-colors">
                  <Link href={`/projects/${p.slug}`}>{p.title}</Link>
                </CardTitle>
                <CardDescription>Role: {p.role}</CardDescription>
              </CardHeader>
              <CardFooter className="flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs text-muted flex items-center space-x-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{p.timeline}</span>
                </span>
                <Link href={`/projects/${p.slug}`}>
                  <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                    View Project
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
