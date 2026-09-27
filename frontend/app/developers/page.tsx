'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { CheckCircle2, ArrowRight, Code2, MapPin, Briefcase, Search, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';

interface DeveloperItem {
  id: string;
  username: string;
  display_name: string;
  role_title: string;
  location?: string;
  experience?: number;
  verification_status?: string;
  bio?: string;
  skills?: string[] | { name: string; category?: string }[];
  completed_projects_count?: number;
  projects_count?: number;
  avatar_url?: string;
  profile_photo?: string;
  profile_image?: string;
}

export default function DevelopersPage() {
  const [developers, setDevelopers] = React.useState<DeveloperItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeFilter, setActiveFilter] = React.useState('All');
  const [searchQuery, setSearchQuery] = React.useState('');

  const filters = ['All', 'Frontend', 'Backend', 'Full Stack', 'AI/ML', 'Mobile', 'DevOps', 'UI/UX', 'Data'];

  const fetchLiveDevelopers = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ developers: DeveloperItem[] }>('/developers/public');
      setDevelopers(res.developers || []);
    } catch (_err) {
      setDevelopers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLiveDevelopers();
  }, [fetchLiveDevelopers]);

  // Client-side filtering
  const filteredDevelopers = React.useMemo(() => {
    return developers.filter((dev) => {
      // Category filter
      if (activeFilter !== 'All') {
        const titleMatch = (dev.role_title || '').toLowerCase().includes(activeFilter.toLowerCase());
        const skillMatch = Array.isArray(dev.skills) && dev.skills.some((s) => {
          const name = typeof s === 'string' ? s : s.name;
          return name.toLowerCase().includes(activeFilter.toLowerCase());
        });
        if (!titleMatch && !skillMatch) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (dev.display_name || '').toLowerCase().includes(q);
        const roleMatch = (dev.role_title || '').toLowerCase().includes(q);
        const bioMatch = (dev.bio || '').toLowerCase().includes(q);
        const skillMatch = Array.isArray(dev.skills) && dev.skills.some((s) => {
          const name = typeof s === 'string' ? s : s.name;
          return name.toLowerCase().includes(q);
        });
        if (!nameMatch && !roleMatch && !bioMatch && !skillMatch) return false;
      }

      return true;
    });
  }, [developers, activeFilter, searchQuery]);

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

      {/* Search & Filter Controls */}
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            placeholder="Search verified developers by name, role title, or tech stack..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-11"
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeFilter === filter
                  ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                  : 'bg-surface text-muted border border-border hover:text-foreground'
              }`}
            >
              {filter}
            </button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchLiveDevelopers}
            className="text-xs text-muted hover:text-foreground"
            title="Refresh developer listings"
            leftIcon={<RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Loading state or Developers Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin text-accent" />
          <p className="text-xs text-muted">Loading verified developer network...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredDevelopers.map((dev) => {
              const photoUrl = dev.profile_photo || dev.avatar_url || dev.profile_image || '';
              const projectCount = dev.completed_projects_count ?? dev.projects_count ?? 0;
              const skillsList: string[] = Array.isArray(dev.skills)
                ? dev.skills.map((s) => (typeof s === 'string' ? s : s.name))
                : [];

              return (
                <Card key={dev.id} hoverEffect className="flex flex-col justify-between">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3.5">
                        <Avatar
                          fallback={dev.display_name}
                          src={photoUrl}
                          size="lg"
                          className="border-2 border-accent/30 shadow-sm"
                        />
                        <div>
                          <div className="flex items-center space-x-2">
                            <CardTitle className="text-base font-bold">
                              <Link href={`/developers/${dev.username}`} className="hover:text-accent transition-colors">
                                {dev.display_name}
                              </Link>
                            </CardTitle>
                            <Badge variant="success" size="sm">
                              Verified
                            </Badge>
                          </div>
                          <p className="text-xs font-semibold text-accent mt-0.5">{dev.role_title}</p>
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
                        <span>{dev.location || 'Global / Remote'}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        <span>{dev.experience || 0}+ years exp</span>
                      </span>
                      <span className="font-mono text-accent font-medium">
                        {projectCount} completed project{projectCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Skills */}
                    {skillsList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {skillsList.map((skill) => (
                          <span
                            key={skill}
                            className="rounded bg-surface-elevated px-2 py-0.5 text-[10px] font-mono text-muted border border-border/50"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
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
              );
            })}
          </div>

          {filteredDevelopers.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <p className="text-sm font-semibold text-foreground">No developers found matching criteria.</p>
              <p className="text-xs text-muted">Try clearing the search or choosing a different filter.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveFilter('All');
                  setSearchQuery('');
                }}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </>
      )}

      {/* Developer Recruitment CTA */}
      <div className="rounded-xl border border-accent/30 bg-surface-elevated p-8 sm:p-10 text-center space-y-4 shadow-accent-glow max-w-4xl mx-auto">
        <Badge variant="default">Engineering Excellence</Badge>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Are you a world-class engineer?
        </h2>
        <p className="text-xs text-muted max-w-lg mx-auto leading-relaxed">
          Join the verified engineering network. Access verified client projects, anonymous merit-based claims, instant credit settlements, and permanent portfolio attribution.
        </p>
        <div className="pt-2">
          <Link href="/register/developer">
            <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Join Developer Network
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
