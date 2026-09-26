'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import { Shield, Terminal, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function ContactPage() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submittedProject, setSubmittedProject] = React.useState<{ projectNumber: string } | null>(null);

  const [form, setForm] = React.useState({
    title: '',
    category: 'AI/ML',
    timeline: '30 Days',
    budgetMin: '50000',
    budgetMax: '80000',
    description: '',
    technologies: 'React, Node.js, PostgreSQL, Docker',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      addToast('error', 'Authentication Required', 'Please register or log in as a Client to submit projects.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post<{ message: string; projectNumber: string }>('/projects/submit', {
        title: form.title,
        category: form.category,
        description: form.description,
        budgetMin: Number(form.budgetMin),
        budgetMax: Number(form.budgetMax),
        timeline: form.timeline,
        requirements: ['Architecture Review', 'Core Implementation', 'Unit & End-to-End Tests'],
        requiredTechnologies: form.technologies.split(',').map((t) => t.trim()),
      });

      setSubmittedProject({ projectNumber: res.projectNumber });
      addToast(
        'success',
        'Project Submitted Successfully',
        `Registered as ${res.projectNumber}. Our executive leadership will review and approve for marketplace claims.`
      );
    } catch (err: any) {
      addToast('error', 'Submission Failed', err.message || 'Unable to submit project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 space-y-12">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <Badge variant="default">Client Gateway</Badge>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Start a Project
        </h1>
        <p className="text-xs text-muted leading-relaxed">
          Submit your product requirements. Our executive leadership reviews and publishes your project into the marketplace under strict client anonymity (e.g. Client #001).
        </p>
      </div>

      {submittedProject ? (
        <Card className="max-w-2xl mx-auto text-center p-8 space-y-6 border-accent/40 bg-surface-elevated">
          <div className="inline-flex p-4 rounded-full bg-accent/20 text-accent mx-auto">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Project Successfully Submitted!</h2>
            <p className="text-sm font-mono text-accent">{submittedProject.projectNumber}</p>
            <p className="text-xs text-muted max-w-md mx-auto">
              Your project has been recorded in the executive queue. Once approved by CEO Ritesh Lingamallu or MD M. Shiva Gopi, verified developers will claim slots and submit proposals.
            </p>
          </div>
          <div className="flex justify-center gap-4 pt-4">
            <Button variant="secondary" onClick={() => setSubmittedProject(null)}>
              Submit Another Project
            </Button>
            <Link href="/dashboard/projects">
              <Button>View in Dashboard</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Submission Form */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Project Specifications</CardTitle>
                <CardDescription>
                  Provide detailed scope. Anonymous developer selection begins upon approval.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    label="Project Title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. AI-Powered Inventory Forecast Engine"
                    required
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select
                      label="Category"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      options={[
                        { label: 'AI/ML Engineering', value: 'AI/ML' },
                        { label: 'Web Application', value: 'Web' },
                        { label: 'Enterprise Systems', value: 'Enterprise' },
                        { label: 'Cloud Infrastructure', value: 'Cloud' },
                        { label: 'Mobile Application', value: 'Mobile' },
                      ]}
                    />
                    <Input
                      label="Estimated Timeline"
                      value={form.timeline}
                      onChange={(e) => setForm({ ...form, timeline: e.target.value })}
                      placeholder="e.g. 30 to 45 Days"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Budget Min (₹)"
                      type="number"
                      value={form.budgetMin}
                      onChange={(e) => setForm({ ...form, budgetMin: e.target.value })}
                      placeholder="50000"
                      required
                    />
                    <Input
                      label="Budget Max (₹)"
                      type="number"
                      value={form.budgetMax}
                      onChange={(e) => setForm({ ...form, budgetMax: e.target.value })}
                      placeholder="80000"
                      required
                    />
                  </div>

                  <Textarea
                    label="Detailed Technical Description"
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Detail your architecture requirements, user personas, and target integrations..."
                    required
                  />

                  <Input
                    label="Required Technologies (Comma separated)"
                    value={form.technologies}
                    onChange={(e) => setForm({ ...form, technologies: e.target.value })}
                    placeholder="React, Node.js, PostgreSQL, Docker"
                    required
                  />

                  <div className="pt-2">
                    <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
                      Submit Project for Executive Review
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-6">
            <Card className="bg-surface-elevated">
              <CardHeader>
                <div className="flex items-center space-x-2 text-accent">
                  <Shield className="h-4 w-4" />
                  <span className="text-xs uppercase font-bold tracking-wider">Privacy Guaranteed</span>
                </div>
                <CardTitle className="text-base pt-1">Anonymity Architecture</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-muted leading-relaxed">
                <p>
                  During claiming, proposal review, and evaluation, your personal and corporate details remain shielded.
                </p>
                <div className="rounded-lg bg-surface p-3 border border-border space-y-1 font-mono text-[11px]">
                  <div className="text-accent">Client Identity: Client #001</div>
                  <div className="text-muted">Developers: Developer #01, #02...</div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-surface-elevated">
              <CardHeader>
                <div className="flex items-center space-x-2 text-foreground">
                  <Terminal className="h-4 w-4 text-electric-purple" />
                  <span className="text-xs uppercase font-bold tracking-wider">Executive Review</span>
                </div>
                <CardTitle className="text-base pt-1">Direct Governance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted">
                <p>Every submitted project is personally reviewed by:</p>
                <p className="font-semibold text-foreground">CEO: Ritesh Lingamallu</p>
                <p className="font-semibold text-foreground">MD: M. Shiva Gopi</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
