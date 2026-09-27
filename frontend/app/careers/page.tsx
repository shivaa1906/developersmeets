import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ArrowRight, Code, ShieldCheck, Terminal, Cpu } from 'lucide-react';

export const metadata = {
  title: 'Careers & Developer Admissions',
  description: 'Join Nexus Engineering Corp network as a verified engineer or core team member.',
};

export default function CareersPage() {
  const roles = [
    {
      title: 'Full Stack Systems Engineer',
      type: 'Network & Core',
      location: 'Remote (Global)',
      skills: ['TypeScript', 'Next.js', 'PostgreSQL', 'Distributed Systems'],
      description: 'Design and deploy scalable web and transactional platforms with rigorous ledger mechanics.',
    },
    {
      title: 'Machine Learning Infrastructure Engineer',
      type: 'Network & Core',
      location: 'Remote',
      skills: ['Python', 'FastAPI', 'PyTorch', 'Vector Databases', 'Docker'],
      description: 'Build inference endpoints, model evaluation pipelines, and vector retrieval systems.',
    },
    {
      title: 'Site Reliability & Kubernetes Specialist',
      type: 'Network & Core',
      location: 'Remote',
      skills: ['Kubernetes', 'Go', 'AWS', 'Terraform', 'Prometheus'],
      description: 'Maintain multi-cluster orchestration, automated provisioning, and sub-second failovers.',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 space-y-16">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <Badge variant="default">Talent Admissions</Badge>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Build With The Network
        </h1>
        <p className="text-xs text-muted leading-relaxed">
          We operate on strict meritocracy. Every developer submits technical credentials, completes code verification, and earns access to the project marketplace and community.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <ShieldCheck className="h-6 w-6 text-accent mb-2" />
            <CardTitle className="text-base">1. Application</CardTitle>
            <CardDescription>
              Submit GitHub, LinkedIn, past projects, and code samples during registration.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <Terminal className="h-6 w-6 text-electric-purple mb-2" />
            <CardTitle className="text-base">2. Executive Review</CardTitle>
            <CardDescription>
              Direct review by CEO M. Shiva Gopi and MD Ritesh Lingamallu for standards adherence.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <Cpu className="h-6 w-6 text-status-success mb-2" />
            <CardTitle className="text-base">3. Verification & Marketplace</CardTitle>
            <CardDescription>
              Gain access to claim marketplace projects, earn credits, and build public attributions.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-bold text-foreground">Open Engineering Tracks</h2>
        <div className="space-y-4">
          {roles.map((role) => (
            <Card key={role.title} hoverEffect className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-foreground">{role.title}</h3>
                  <Badge variant="outline" size="sm">
                    {role.type}
                  </Badge>
                </div>
                <p className="text-xs text-muted">{role.description}</p>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {role.skills.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-surface-elevated px-2 py-0.5 text-[10px] font-mono text-muted border border-border"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="shrink-0">
                <Link href="/register">
                  <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                    Apply as Developer
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
