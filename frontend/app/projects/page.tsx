'use client';

import * as React from 'react';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { ArrowRight, ExternalLink, Calendar, RefreshCw, Briefcase, AlertCircle } from 'lucide-react';

interface PublishedProjectItem {
  id: string;
  project_number: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  timeline: string;
  required_technologies: string[];
  status: string;
  created_at: string;
  lead_dev_username?: string;
  lead_dev_name?: string;
  lead_dev_avatar?: string;
  lead_dev_title?: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = React.useState<PublishedProjectItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeCategory, setActiveCategory] = React.useState('All');

  const categories = ['All', 'Web', 'Mobile', 'AI/ML', 'SaaS', 'Enterprise', 'Automation', 'UI/UX'];

  const fetchPublishedProjects = React.useCallback(async (category: string) => {
    setLoading(true);
    setError(null);
    try {
      const url =
        category === 'All'
          ? '/projects/published'
          : `/projects/published?category=${encodeURIComponent(category)}`;
      const res = await apiClient.get<{ projects: PublishedProjectItem[] }>(url);
      setProjects(res.projects || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load published showcase projects.');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPublishedProjects(activeCategory);
  }, [fetchPublishedProjects, activeCategory]);

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
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                : 'bg-surface text-muted border border-border hover:text-foreground'
            }`}
          >
            {cat}
          </button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => fetchPublishedProjects(activeCategory)}
          className="text-xs text-muted hover:text-foreground"
          title="Refresh projects"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin text-accent" />
          <p className="text-xs text-muted">Retrieving published projects showcase...</p>
        </div>
      ) : error ? (
        <div className="text-center py-16 space-y-3">
          <AlertCircle className="h-8 w-8 text-status-danger mx-auto" />
          <p className="text-sm font-semibold text-foreground">{error}</p>
          <Button size="sm" variant="outline" onClick={() => fetchPublishedProjects(activeCategory)}>
            Retry Loading
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Briefcase className="h-10 w-10 text-muted mx-auto opacity-40" />
          <p className="text-sm font-semibold text-foreground">
            No published projects found for &quot;{activeCategory}&quot;
          </p>
          <p className="text-xs text-muted max-w-md mx-auto">
            Once client projects complete production milestones and receive executive verification for public portfolio display, they will appear here.
          </p>
          {activeCategory !== 'All' && (
            <Button size="sm" variant="outline" onClick={() => setActiveCategory('All')}>
              Show All Categories
            </Button>
          )}
        </div>
      ) : (
        /* Project Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const techs = Array.isArray(project.required_technologies)
              ? project.required_technologies
              : [];

            return (
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
                  {techs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {techs.map((tech) => (
                        <span
                          key={tech}
                          className="rounded bg-surface-elevated px-2 py-0.5 text-[10px] font-mono text-muted border border-border/50"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Developer Attribution (Clickable) */}
                  {project.lead_dev_username && (
                    <div className="rounded-lg bg-surface-elevated/80 p-3 border border-border space-y-1.5 text-xs">
                      <div className="text-[10px] uppercase font-semibold text-muted tracking-wider">
                        Built By
                      </div>
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/developers/${project.lead_dev_username}`}
                          className="font-semibold text-accent hover:underline flex items-center space-x-1"
                        >
                          <span>{project.lead_dev_name || project.lead_dev_username}</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        {project.lead_dev_title && (
                          <span className="text-[10px] text-muted">({project.lead_dev_title})</span>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="flex items-center justify-between border-t border-border pt-4">
                  <span className="text-[11px] text-muted flex items-center space-x-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{project.timeline || 'Enterprise Escrow'}</span>
                  </span>
                  <Link href={`/projects/${project.slug}`}>
                    <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                      Case Study
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
