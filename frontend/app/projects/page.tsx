import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Code, ExternalLink, Calendar, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Public Projects Showcase',
  description: 'Explore completed and published projects engineered by our verified developer network.',
  alternates: {
    canonical: `${siteConfig.url}/projects`,
  },
  openGraph: {
    title: `Public Projects Showcase | ${siteConfig.name}`,
    description: 'Explore completed and published projects engineered by our verified developer network.',
    url: `${siteConfig.url}/projects`,
    siteName: siteConfig.name,
    type: 'website',
  },
};

// Seed showcase data adhering to PRD requirements
const featuredProjects = [
  {
    id: 'prj-001',
    project_number: 'PRJ-2026-0001',
    slug: 'ai-ecommerce-platform',
    title: 'Autonomous AI E-Commerce Engine',
    description:
      'High-throughput distributed commerce system with real-time vector search, dynamic pricing automation, and multi-tenant billing.',
    category: 'AI/ML',
    technologies: ['Next.js 14', 'Python', 'PostgreSQL', 'FastAPI', 'Redis'],
    status: 'PUBLISHED',
    timeline: '45 Days',
    lead_developer: {
      name: 'Ritesh Lingamallu',
      username: 'ritesh-lingamallu',
      role: 'Lead Architect',
    },
    contributors: [
      { name: 'Rahul Kumar', username: 'rahul-kumar' },
      { name: 'Sanjay Kumar', username: 'sanjay-kumar' },
    ],
  },
  {
    id: 'prj-002',
    project_number: 'PRJ-2026-0002',
    slug: 'cloud-devops-orchestrator',
    title: 'Cloud Infrastructure Orchestrator',
    description:
      'Automated multi-cloud cluster manager with GitOps integration, vulnerability scanning, and cost telemetry.',
    category: 'Enterprise',
    technologies: ['Go', 'Kubernetes', 'Docker', 'React', 'Prometheus'],
    status: 'PUBLISHED',
    timeline: '30 Days',
    lead_developer: {
      name: 'M. Shiva Gopi',
      username: 'shiva-gopi',
      role: 'Systems Architect',
    },
    contributors: [{ name: 'Aakash Verma', username: 'aakash-verma' }],
  },
  {
    id: 'prj-003',
    project_number: 'PRJ-2026-0003',
    slug: 'fintech-escrow-ledger',
    title: 'Cryptographic Ledger & Escrow Protocol',
    description:
      'High-performance transactional ledger with automated double-entry verification and microsecond settlement.',
    category: 'SaaS',
    technologies: ['TypeScript', 'Node.js', 'PostgreSQL', 'Tailwind CSS'],
    status: 'PUBLISHED',
    timeline: '35 Days',
    lead_developer: {
      name: 'Ritesh Lingamallu',
      username: 'ritesh-lingamallu',
      role: 'Lead Engineer',
    },
    contributors: [],
  },
];

export default function ProjectsPage() {
  const categories = ['All', 'Web', 'Mobile', 'AI/ML', 'SaaS', 'Enterprise', 'Automation', 'UI/UX'];

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 space-y-12">
      {/* Header */}
      <div className="space-y-4 text-center max-w-2xl mx-auto">
        <Badge variant="default">Verified Portfolio</Badge>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Completed Projects
        </h1>
        <p className="text-xs text-muted leading-relaxed">
          Public showcases of completed projects engineered by verified developers. Client identities remain strictly private.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {categories.map((cat, i) => (
          <button
            key={cat}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              i === 0
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-surface text-muted border border-border hover:text-foreground'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Project Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {featuredProjects.map((project) => (
          <Card key={project.id} hoverEffect className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-muted">{project.project_number}</span>
                <Badge variant="success" size="sm">
                  {project.status}
                </Badge>
              </div>
              <CardTitle className="hover:text-accent transition-colors">
                <Link href={`/projects/${project.slug}`}>{project.title}</Link>
              </CardTitle>
              <CardDescription className="line-clamp-3">{project.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Technologies */}
              <div className="flex flex-wrap gap-1.5">
                {project.technologies.map((tech) => (
                  <span
                    key={tech}
                    className="rounded bg-surface-elevated px-2 py-0.5 text-[10px] font-mono text-muted border border-border/50"
                  >
                    {tech}
                  </span>
                ))}
              </div>

              {/* Developer Attribution (Clickable) */}
              <div className="rounded-lg bg-surface-elevated/80 p-3 border border-border space-y-1.5 text-xs">
                <div className="text-[10px] uppercase font-semibold text-muted tracking-wider">
                  Built By
                </div>
                <div className="flex items-center space-x-2">
                  <Link
                    href={`/developers/${project.lead_developer.username}`}
                    className="font-semibold text-accent hover:underline flex items-center space-x-1"
                  >
                    <span>{project.lead_developer.name}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                  <span className="text-[10px] text-muted">({project.lead_developer.role})</span>
                </div>

                {project.contributors.length > 0 && (
                  <div className="text-[11px] text-muted pt-1 border-t border-border/40">
                    <span>With: </span>
                    {project.contributors.map((c, idx) => (
                      <span key={c.username}>
                        <Link
                          href={`/developers/${c.username}`}
                          className="text-foreground hover:text-accent underline-offset-2 hover:underline"
                        >
                          {c.name}
                        </Link>
                        {idx < project.contributors.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-between">
              <span className="text-[11px] text-muted flex items-center space-x-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>{project.timeline}</span>
              </span>
              <Link href={`/projects/${project.slug}`}>
                <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Case Study
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
