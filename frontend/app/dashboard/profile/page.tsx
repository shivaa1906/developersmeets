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
    displayName: user?.name || 'Verified Developer',
    roleTitle: 'Full Stack & Distributed Systems Engineer',
    experience: '5',
    bio: 'Specializing in high-throughput cloud backends, PostgreSQL transaction ledgers, Next.js, and autonomous AI systems.',
    githubUrl: 'https://github.com',
    linkedinUrl: 'https://linkedin.com',
    portfolioUrl: 'https://developer.dev',
    skills: 'TypeScript, Next.js, React, Node.js, Go, PostgreSQL, Docker, Redis',
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiClient.patch('/developers/profile', {
        displayName: form.displayName,
        roleTitle: form.roleTitle,
        bio: form.bio,
        experience: Number(form.experience),
        githubUrl: form.githubUrl,
        linkedinUrl: form.linkedinUrl,
        portfolioUrl: form.portfolioUrl,
        skills: form.skills.split(',').map((s) => s.trim()),
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Years of Experience"
                type="number"
                value={form.experience}
                onChange={(e) => setForm({ ...form, experience: e.target.value })}
                required
              />
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
