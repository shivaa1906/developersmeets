import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, ExternalLink, Calendar, ShieldCheck, CheckCircle2, User, Users } from 'lucide-react';

interface ProjectDetailProps {
  params: { slug: string };
}

// Data repository matching PRD
const projectCatalog: Record<string, any> = {
  'ai-ecommerce-platform': {
    project_number: 'PRJ-2026-0001',
    title: 'Autonomous AI E-Commerce Engine',
    category: 'AI/ML',
    description:
      'A multi-tenant scalable commerce engine powered by generative product recommendations, automated markdown optimization, vector catalog indexing, and real-time inventory synchronization across multi-region clusters.',
    technologies: ['Next.js 14', 'Python', 'PostgreSQL', 'FastAPI', 'Redis', 'Docker'],
    status: 'PUBLISHED',
    timeline: '45 Days',
    budget_range: 'Enterprise Escrow',
    lead_developer: {
      name: 'Ritesh Lingamallu',
      username: 'ritesh-lingamallu',
      role: 'Lead Architect',
      skills: ['Full Stack', 'System Architecture', 'PostgreSQL'],
    },
    contributors: [
      { name: 'Rahul Kumar', username: 'rahul-kumar', role: 'Backend Engineer' },
      { name: 'Sanjay Kumar', username: 'sanjay-kumar', role: 'Frontend Specialist' },
    ],
    deliverables: [
      'Sub-50ms vector search for 500,000+ inventory items',
      'Automated double-entry credit ledger and checkout gateway integration',
      'Anonymous client support bridge transition',
      'Role-based granular administrative dashboard',
    ],
  },
  'cloud-devops-orchestrator': {
    project_number: 'PRJ-2026-0002',
    title: 'Cloud Infrastructure Orchestrator',
    category: 'Enterprise',
    description:
      'Automated multi-cloud cluster manager with GitOps integration, vulnerability scanning, and cost telemetry.',
    technologies: ['Go', 'Kubernetes', 'Docker', 'React', 'Prometheus'],
    status: 'PUBLISHED',
    timeline: '30 Days',
    budget_range: 'Enterprise Escrow',
    lead_developer: {
      name: 'M. Shiva Gopi',
      username: 'shiva-gopi',
      role: 'Systems Architect',
      skills: ['Go', 'Kubernetes', 'Cloud Operations'],
    },
    contributors: [{ name: 'Aakash Verma', username: 'aakash-verma', role: 'DevOps Specialist' }],
    deliverables: [
      'Dynamic workload autoscale policy orchestration',
      'Granular cost anomaly reporting engine',
      'Zero-downtime blue/green deployment controller',
    ],
  },
  'fintech-escrow-ledger': {
    project_number: 'PRJ-2026-0003',
    title: 'Cryptographic Ledger & Escrow Protocol',
    category: 'SaaS',
    description:
      'High-performance transactional ledger with automated double-entry verification and microsecond settlement.',
    technologies: ['TypeScript', 'Node.js', 'PostgreSQL', 'Tailwind CSS'],
    status: 'PUBLISHED',
    timeline: '35 Days',
    budget_range: 'Enterprise Escrow',
    lead_developer: {
      name: 'Ritesh Lingamallu',
      username: 'ritesh-lingamallu',
      role: 'Lead Engineer',
      skills: ['TypeScript', 'Fintech Architecture'],
    },
    contributors: [],
    deliverables: [
      'Deterministic credit transaction balancing',
      'Configurable refund policy engine',
      'Strict audit log immutability',
    ],
  },
};

async function getProject(slug: string) {
  if (projectCatalog[slug]) {
    return projectCatalog[slug];
  }
  try {
    const res = await fetch(`http://127.0.0.1:5000/api/projects/published/${slug}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.project) return null;
    const p = data.project;
    return {
      project_number: p.project_number,
      title: p.title,
      category: p.category,
      description: p.description,
      technologies: Array.isArray(p.required_technologies) ? p.required_technologies : [],
      status: p.status,
      timeline: p.timeline || 'Enterprise',
      budget_range: 'Enterprise Escrow',
      lead_developer: {
        name: p.lead_dev_name || 'Verified Developer',
        username: p.lead_dev_username || 'developer',
        role: p.lead_dev_title || 'Lead Architect',
        skills: [],
      },
      contributors: [],
      deliverables: ['Production milestone delivered', 'Verified completion signoff'],
    };
  } catch (_err) {
    return null;
  }
}

export async function generateMetadata({ params }: ProjectDetailProps): Promise<Metadata> {
  const project = await getProject(params.slug);

  if (!project) {
    return {
      title: 'Project Not Found',
      robots: { index: false, follow: false },
    };
  }

  const title = `${project.title} | ${siteConfig.name}`;
  const description = project.description?.slice(0, 160) || `${project.title} engineered by ${siteConfig.name}`;
  const canonicalUrl = `${siteConfig.url}/projects/${params.slug}`;

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
      type: 'article',
      images: [
        {
          url: `${siteConfig.url}/og-project.png`,
          width: 1200,
          height: 630,
          alt: project.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: project.status === 'PUBLISHED',
      follow: project.status === 'PUBLISHED',
    },
  };
}

export default async function ProjectDetailPage({ params }: ProjectDetailProps) {
  const project = await getProject(params.slug);

  if (!project) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 space-y-12">
      {/* Back button */}
      <div>
        <Link href="/projects">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to Projects Showcase
          </Button>
        </Link>
      </div>

      {/* Hero Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-muted">{project.project_number}</span>
          <Badge variant="success">{project.status}</Badge>
          <Badge variant="outline">{project.category}</Badge>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-foreground">{project.title}</h1>
        <p className="text-sm text-muted leading-relaxed max-w-3xl">{project.description}</p>
      </div>

      {/* Attribution & Metadata Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Lead Developer Card */}
        <Card className="border-accent/40 bg-surface-elevated md:col-span-2">
          <CardHeader>
            <div className="flex items-center space-x-2 text-accent">
              <User className="h-4 w-4" />
              <span className="text-xs uppercase font-bold tracking-wider">Lead Developer Attribution</span>
            </div>
            <CardTitle className="text-xl pt-2">
              <Link
                href={`/developers/${project.lead_developer.username}`}
                className="hover:text-accent transition-colors flex items-center space-x-2"
              >
                <span>Built by {project.lead_developer.name}</span>
                <ExternalLink className="h-4 w-4 text-accent" />
              </Link>
            </CardTitle>
            <CardDescription>{project.lead_developer.role}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            {project.contributors.length > 0 && (
              <div className="pt-3 border-t border-border">
                <span className="font-semibold text-muted uppercase tracking-wider text-[10px] block mb-2">
                  Engineering Contributors
                </span>
                <div className="flex flex-wrap gap-2">
                  {project.contributors.map((contributor: any) => (
                    <Link
                      key={contributor.username}
                      href={`/developers/${contributor.username}`}
                      className="rounded-lg bg-surface px-3 py-1.5 border border-border text-foreground hover:border-accent/40 transition-colors flex items-center space-x-1.5"
                    >
                      <Users className="h-3 w-3 text-muted" />
                      <span>{contributor.name}</span>
                      <span className="text-muted text-[10px]">({contributor.role})</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Meta Card */}
        <Card className="bg-surface-elevated">
          <CardHeader>
            <span className="text-xs uppercase font-bold tracking-wider text-muted">Delivery Meta</span>
            <CardTitle className="text-base">Project Scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <span className="text-muted block text-[10px] uppercase">Timeline</span>
              <span className="font-semibold text-foreground">{project.timeline}</span>
            </div>
            <div>
              <span className="text-muted block text-[10px] uppercase">Client Identity</span>
              <span className="text-muted italic">Confidential (Private)</span>
            </div>
            <div className="pt-2 border-t border-border flex items-center space-x-2 text-status-success text-[11px]">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Full milestone completion approved</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Technologies */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-foreground">Technology Architecture</h3>
        <div className="flex flex-wrap gap-2">
          {project.technologies.map((t: string) => (
            <span
              key={t}
              className="rounded-lg border border-border bg-surface px-3.5 py-1.5 text-xs font-mono text-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Key Deliverables */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-foreground">Milestones Delivered</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {project.deliverables.map((item: string, idx: number) => (
            <div
              key={idx}
              className="flex items-start space-x-3 rounded-lg border border-border bg-surface p-4 text-xs"
            >
              <CheckCircle2 className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <span className="text-muted leading-relaxed">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
