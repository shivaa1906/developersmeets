'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';

export default function DashboardProfilePage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    displayName: user?.name || '',
    roleTitle: '',
    experience: '3',
    availability: 'AVAILABLE' as 'AVAILABLE' | 'BUSY' | 'ON_PROJECT' | 'UNAVAILABLE',
    bio: '',
    githubUrl: '',
    linkedinUrl: '',
    portfolioUrl: '',
    skills: '',
  });

  React.useEffect(() => {
    apiClient
      .get<{ developer: any }>('/developers/me')
      .then((res) => {
        if (res.developer) {
          const dev = res.developer;
          setForm({
            displayName: dev.display_name || '',
            roleTitle: dev.role_title || '',
            experience: String(dev.experience || 0),
            availability: dev.availability || 'AVAILABLE',
            bio: dev.bio || '',
            githubUrl: dev.github_url || '',
            linkedinUrl: dev.linkedin_url || '',
            portfolioUrl: dev.portfolio_url || '',
            skills: Array.isArray(dev.skills)
              ? dev.skills.map((s: any) => (typeof s === 'string' ? s : s.name)).join(', ')
              : '',
          });
        }
      })
      .catch(() => {
        // Fallback default
        setForm((prev) => ({
          ...prev,
          displayName: user?.name || 'Verified Developer',
          roleTitle: 'Full Stack & Distributed Systems Engineer',
          experience: '5',
          bio: 'Specializing in high-throughput cloud backends, PostgreSQL transaction ledgers, Next.js, and autonomous AI systems.',
          githubUrl: 'https://github.com',
          linkedinUrl: 'https://linkedin.com',
          portfolioUrl: 'https://developer.dev',
          skills: 'TypeScript, Next.js, React, Node.js, Go, PostgreSQL, Docker, Redis',
        }));
      });
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiClient.patch('/developers/profile', {
        displayName: form.displayName,
        roleTitle: form.roleTitle,
        bio: form.bio,
        experience: Number(form.experience),
        availability: form.availability,
        githubUrl: form.githubUrl,
        linkedinUrl: form.linkedinUrl,
        portfolioUrl: form.portfolioUrl,
        skills: form.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      addToast('success', 'Profile Updated', 'Your developer profile details have been saved.');
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Unable to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const isVerified = user?.verificationStatus === 'VERIFIED' || user?.role === 'CEO' || user?.role === 'MD';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Developer Profile</h1>
        <p className="text-xs text-muted mt-1">
          Manage your public developer persona, skills, experience, and platform availability.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Identity & Credentials</CardTitle>
                <CardDescription>Your public developer credentials and current availability</CardDescription>
              </div>
              <Badge variant={isVerified ? 'success' : 'warning'}>
                {isVerified ? 'VERIFIED DEVELOPER' : 'PENDING VERIFICATION'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Display Name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
              />
              <Input
                label="Professional Role Title"
                value={form.roleTitle}
                onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Years of Experience"
                type="number"
                value={form.experience}
                onChange={(e) => setForm({ ...form, experience: e.target.value })}
                required
              />
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Availability Status</label>
                <select
                  value={form.availability}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      availability: e.target.value as any,
                    })
                  }
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="AVAILABLE">AVAILABLE (Open to project claims)</option>
                  <option value="BUSY">BUSY (Limited capacity)</option>
                  <option value="ON_PROJECT">ON_PROJECT (Currently active on workspace)</option>
                  <option value="UNAVAILABLE">UNAVAILABLE (Not taking new projects)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="GitHub URL"
                value={form.githubUrl}
                onChange={(e) => setForm({ ...form, githubUrl: e.target.value })}
              />
              <Input
                label="LinkedIn URL"
                value={form.linkedinUrl}
                onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
              />
              <Input
                label="Portfolio URL"
                value={form.portfolioUrl}
                onChange={(e) => setForm({ ...form, portfolioUrl: e.target.value })}
              />
            </div>

            <Textarea
              label="Professional Bio"
              rows={3}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />

            <Input
              label="Core Skills (Comma separated)"
              value={form.skills}
              onChange={(e) => setForm({ ...form, skills: e.target.value })}
              required
            />
          </CardContent>
          <CardFooter className="flex justify-end border-t border-border pt-4">
            <Button type="submit" isLoading={isSaving}>
              Save Profile Changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
