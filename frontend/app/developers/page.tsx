import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { CheckCircle2, ArrowRight, Code2, MapPin, Briefcase } from 'lucide-react';

export const metadata = {
  title: 'Verified Developer Network',
  description: 'Browse approved and verified software engineers, architects, and AI specialists.',
};

// Seed verified developer network
const verifiedDevelopers = [
  {
    id: 'dev-001',
    username: 'ritesh-lingamallu',
    display_name: 'Ritesh Lingamallu',
    role_title: 'Full Stack & AI Systems Architect',
    location: 'Hyderabad, India',
    experience: 8,
    verification_status: 'VERIFIED',
    bio: 'Founder & CEO. Specializing in high-concurrency systems, distributed ledgers, enterprise full-stack architecture, and machine learning pipelines.',
    skills: ['Next.js', 'TypeScript', 'PostgreSQL', 'Python', 'FastAPI', 'Redis', 'Docker'],
    projects_count: 5,
  },
  {
    id: 'dev-002',
    username: 'shiva-gopi',
    display_name: 'M. Shiva Gopi',
    role_title: 'Managing Director & DevOps Architect',
    location: 'Bangalore, India',
    experience: 7,
    verification_status: 'VERIFIED',
    bio: 'Managing Director. Cloud systems orchestrator, Kubernetes specialist, reliability engineering, and technical operations.',
    skills: ['Go', 'Kubernetes', 'AWS Cloud', 'Docker', 'Prometheus', 'Terraform', 'React'],
    projects_count: 4,
  },
  {
    id: 'dev-003',
    username: 'rahul-kumar',
    display_name: 'Rahul Kumar',
    role_title: 'Senior Backend Engineer',
    location: 'Delhi, India',
    experience: 5,
    verification_status: 'VERIFIED',
    bio: 'Specialist in distributed microservices, transactional databases, message queues, and high-performance APIs.',
    skills: ['Node.js', 'PostgreSQL', 'Kafka', 'TypeScript', 'GraphQL'],
    projects_count: 3,
  },
  {
    id: 'dev-004',
    username: 'sanjay-kumar',
    display_name: 'Sanjay Kumar',
    role_title: 'Lead Frontend & UI Engineer',
    location: 'Mumbai, India',
    experience: 4,
    verification_status: 'VERIFIED',
    bio: 'Design systems engineer focusing on accessible web applications, WebGL shaders, Framer Motion animations, and React performance.',
    skills: ['React', 'Next.js', 'Tailwind CSS', 'Three.js', 'Framer Motion'],
    projects_count: 3,
  },
];

export default function DevelopersPage() {
  const filters = ['All', 'Frontend', 'Backend', 'Full Stack', 'AI/ML', 'Mobile', 'DevOps', 'UI/UX', 'Data'];

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 space-y-12">
      {/* Header */}
      <div className="space-y-4 text-center max-w-2xl mx-auto">
        <Badge variant="default">Verified Talent</Badge>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          The Developer Network
        </h1>
        <p className="text-xs text-muted leading-relaxed">
          Every developer is rigorously verified, code-reviewed, and held to strict delivery standards.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {filters.map((filter, i) => (
          <button
            key={filter}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              i === 0
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-surface text-muted border border-border hover:text-foreground'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Developers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {verifiedDevelopers.map((dev) => (
          <Card key={dev.id} hoverEffect className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <Avatar fallback={dev.display_name} size="lg" />
                  <div>
                    <div className="flex items-center space-x-2">
                      <CardTitle className="text-base">
                        <Link href={`/developers/${dev.username}`} className="hover:text-accent transition-colors">
                          {dev.display_name}
                        </Link>
                      </CardTitle>
                      <Badge variant="success" size="sm">
                        Verified
                      </Badge>
                    </div>
                    <p className="text-xs font-medium text-accent mt-0.5">{dev.role_title}</p>
                  </div>
                </div>
              </div>

              <CardDescription className="pt-3 text-xs leading-relaxed line-clamp-2">
                {dev.bio}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex items-center space-x-4 text-xs text-muted">
                <span className="flex items-center space-x-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{dev.location}</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Briefcase className="h-3.5 w-3.5" />
                  <span>{dev.experience}+ years exp</span>
                </span>
                <span className="font-mono text-accent">{dev.projects_count} completed projects</span>
              </div>

              {/* Skills */}
              <div className="flex flex-wrap gap-1.5 pt-2">
                {dev.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded bg-surface-elevated px-2 py-0.5 text-[10px] font-mono text-muted border border-border/50"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-border pt-4">
              <span className="text-[11px] text-muted">Profile: @{dev.username}</span>
              <Link href={`/developers/${dev.username}`}>
                <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  View Profile
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
