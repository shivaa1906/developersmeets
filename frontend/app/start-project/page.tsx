'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  Briefcase,
  ShieldCheck,
  AlertCircle,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowRight,
  Code2,
  Clock,
  Coins,
  FileCode,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'Web Application', label: 'Web Application (Full Stack / Frontend / Backend)' },
  { value: 'Mobile Application', label: 'Mobile Application (iOS / Android / React Native)' },
  { value: 'AI / Machine Learning', label: 'AI / Machine Learning & Intelligent Automation' },
  { value: 'Cloud & Infrastructure', label: 'Cloud Architecture & DevOps CI/CD' },
  { value: 'API & Microservices', label: 'API Development & Microservices Architecture' },
  { value: 'Enterprise Software', label: 'Enterprise Software (ERP / CRM / Custom Tooling)' },
  { value: 'Blockchain & Web3', label: 'Blockchain & Smart Contracts' },
  { value: 'Cybersecurity', label: 'Cybersecurity, Pentesting & Code Audit' },
];

const PROJECT_TYPES = [
  { value: 'Milestone-Based Fixed Price', label: 'Milestone-Based Fixed Price (Recommended)' },
  { value: 'Dedicated Engineering Team', label: 'Dedicated Engineering Team (Monthly Sprint)' },
  { value: 'Architecture & Technical Advisory', label: 'Architecture & Technical Advisory' },
];

const TIMELINE_OPTIONS = [
  { value: '2-4 Weeks', label: 'Rapid Sprint: 2–4 Weeks' },
  { value: '1-2 Months', label: 'Standard: 1–2 Months' },
  { value: '2-3 Months', label: 'Comprehensive: 2–3 Months' },
  { value: '3-6 Months', label: 'Enterprise Scale: 3–6 Months' },
  { value: '6+ Months', label: 'Long-term Initiative: 6+ Months' },
];

const SUGGESTED_SKILLS = [
  'React',
  'Next.js',
  'Node.js',
  'TypeScript',
  'PostgreSQL',
  'Python',
  'Docker',
  'AWS',
  'TailwindCSS',
  'GraphQL',
  'Redis',
  'FastAPI',
];

export default function StartProjectPage() {
  const router = useRouter();
  const { user, isLoading, isDeveloper, isSupport, isClient, isExecutive } = useAuth();
  const { addToast } = useToast();

  // Form state
  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState('Web Application');
  const [projectType, setProjectType] = React.useState('Milestone-Based Fixed Price');
  const [description, setDescription] = React.useState('');
  const [requirements, setRequirements] = React.useState<string[]>([
    'Responsive and mobile-first responsive user interface',
    'Robust authentication and role-based access control',
  ]);
  const [newRequirement, setNewRequirement] = React.useState('');
  const [technologies, setTechnologies] = React.useState<string[]>(['React', 'TypeScript', 'Node.js', 'PostgreSQL']);
  const [newTech, setNewTech] = React.useState('');
  const [budgetMin, setBudgetMin] = React.useState('50000');
  const [budgetMax, setBudgetMax] = React.useState('150000');
  const [timeline, setTimeline] = React.useState('1-2 Months');
  const [referenceLinks, setReferenceLinks] = React.useState('');
  const [additionalNotes, setAdditionalNotes] = React.useState('');

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submittedProject, setSubmittedProject] = React.useState<{
    projectId: string;
    projectNumber: string;
    title: string;
    status: string;
  } | null>(null);

  // Authentication redirect for unauthenticated guest users
  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login?next=/start-project');
    }
  }, [isLoading, user, router]);

  // Loading skeleton while checking session
  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl space-y-4 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 border border-accent/30 text-accent animate-pulse">
            <Briefcase className="h-6 w-6 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Checking authentication session...</h2>
          <p className="text-xs text-muted">Validating your cryptographic credentials and access privileges.</p>
        </div>
      </div>
    );
  }

  // Guest redirection indicator
  if (!user) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-surface-elevated border border-border text-accent">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Authentication Required</h2>
          <p className="text-xs text-muted">
            Redirecting you to secure login. Once authenticated, you will return directly to start your project.
          </p>
        </div>
      </div>
    );
  }

  // Developer Option B Notice
  if (isDeveloper && !isExecutive) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-xl border-accent/30 bg-surface/80">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 border border-accent/40 text-accent">
              <Code2 className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl font-bold text-foreground">
              Developer Account Detected
            </CardTitle>
            <CardDescription className="text-sm text-muted">
              Start a project is available to client accounts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-muted leading-relaxed">
            <div className="p-4 rounded-lg bg-surface-elevated border border-border space-y-2">
              <p className="text-foreground font-medium">
                You are currently signed in as a verified developer (<span className="text-accent font-mono">{user.name || user.email}</span>).
              </p>
              <p>
                As an engineering partner in our network, you can claim open project slots, submit technical proposals, and build high-impact software.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-end pt-2">
            <Link href="/dashboard" className="w-full sm:w-auto">
              <Button variant="outline" size="sm" className="w-full">
                Return to Dashboard
              </Button>
            </Link>
            <Link href="/dashboard/projects" className="w-full sm:w-auto">
              <Button size="sm" className="w-full" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                Browse Project Marketplace
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Support Account Notice
  if (isSupport && !isExecutive && !isClient) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-xl border-border bg-surface/80">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated border border-border text-muted">
              <AlertCircle className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl font-bold text-foreground">
              Support Specialist Portal
            </CardTitle>
            <CardDescription className="text-sm text-muted">
              Start a project is available to client accounts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted text-center">
            <p>
              Support accounts cannot commission or submit client projects.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center pt-2">
            <Link href="/admin/support">
              <Button size="sm">
                Open Support Management Queue
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Handlers for requirements & technologies
  const handleAddRequirement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequirement.trim()) return;
    if (requirements.includes(newRequirement.trim())) {
      addToast('info', 'Duplicate Requirement', 'This requirement is already in your list.');
      return;
    }
    setRequirements([...requirements, newRequirement.trim()]);
    setNewRequirement('');
  };

  const handleRemoveRequirement = (index: number) => {
    setRequirements(requirements.filter((_, i) => i !== index));
  };

  const handleAddTech = (tech: string) => {
    const clean = tech.trim();
    if (!clean) return;
    if (technologies.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      return;
    }
    setTechnologies([...technologies, clean]);
    setNewTech('');
  };

  const handleRemoveTech = (tech: string) => {
    setTechnologies(technologies.filter((t) => t !== tech));
  };

  // Submit project handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      addToast('error', 'Validation Error', 'Project title is required.');
      return;
    }

    if (!description.trim()) {
      addToast('error', 'Validation Error', 'Project description is required.');
      return;
    }

    if (requirements.length === 0) {
      addToast('error', 'Validation Error', 'Please include at least one specification requirement.');
      return;
    }

    const min = Number(budgetMin);
    const max = Number(budgetMax);

    if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0) {
      addToast('error', 'Invalid Budget', 'Budget minimum and maximum must be positive numbers.');
      return;
    }

    if (min > max) {
      addToast('error', 'Invalid Budget Range', 'Budget minimum cannot exceed budget maximum.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        title: title.trim(),
        category,
        projectType,
        description: description.trim(),
        requirements,
        requiredTechnologies: technologies,
        budgetMin: min,
        budgetMax: max,
        timeline,
        additionalRequirements: additionalNotes.trim() || undefined,
        referenceLinks: referenceLinks.trim() || undefined,
      };

      const res = await apiClient.post<{
        projectId: string;
        projectNumber: string;
        status: string;
        message?: string;
      }>('/projects', payload);

      setSubmittedProject({
        projectId: res.projectId,
        projectNumber: res.projectNumber,
        title: title.trim(),
        status: res.status || 'SUBMITTED',
      });

      addToast(
        'success',
        'Project Submitted!',
        `Successfully registered as ${res.projectNumber}. Review has been scheduled.`
      );
    } catch (err: any) {
      addToast('error', 'Submission Failed', err.message || 'Unable to submit project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success view
  if (submittedProject) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-2xl border-accent/40 bg-surface/90 shadow-2xl">
          <CardHeader className="text-center space-y-3 pb-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 border border-accent/40 text-accent shadow-accent-glow">
              <CheckCircle2 className="h-8 w-8 text-status-success" />
            </div>
            <div className="space-y-1">
              <span className="font-mono text-xs uppercase tracking-widest text-accent font-semibold">
                {submittedProject.projectNumber}
              </span>
              <CardTitle className="text-2xl font-bold text-foreground">
                Project Submitted Successfully
              </CardTitle>
              <CardDescription className="text-xs text-muted max-w-lg mx-auto">
                Your project specification has been securely submitted under your authenticated identity and scheduled for engineering review.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="rounded-xl border border-border bg-surface-elevated p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <span className="text-muted">Project Title</span>
                <span className="font-semibold text-foreground">{submittedProject.title}</span>
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <span className="text-muted">Category</span>
                <Badge variant="outline" size="sm">{category}</Badge>
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <span className="text-muted">Budget Window</span>
                <span className="font-mono text-foreground font-semibold">
                  ₹{Number(budgetMin).toLocaleString()} – ₹{Number(budgetMax).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <span className="text-muted">Status</span>
                <Badge variant="success" size="sm">
                  {submittedProject.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Client Account</span>
                <span className="font-mono text-accent">
                  {user.clientNumber || user.name || user.email}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-surface border border-border/80 flex items-start space-x-3 text-xs text-muted">
              <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <p>
                Our technical architects will inspect your requirements, match optimal verified engineering teams, and prepare marketplace claim slots. You will receive updates directly on your dashboard.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-end border-t border-border pt-5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSubmittedProject(null);
                setTitle('');
                setDescription('');
                setAdditionalNotes('');
              }}
            >
              Submit Another Project
            </Button>
            <Link href="/dashboard/projects">
              <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                Go to Projects Dashboard
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Display user badge description
  const userIdentityLabel = isExecutive
    ? `${user.role} Executive Leadership (${user.name || user.email})`
    : `Client Account: ${user.clientNumber || 'Client'} (${user.name || user.email})`;

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Badge variant="outline" size="sm" className="font-mono text-[10px]">
            AUTHENTICATED CLIENT FLOW
          </Badge>
          <span className="text-xs text-muted">•</span>
          <span className="text-xs text-muted flex items-center space-x-1">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            <span>Cryptographically Verified Identity</span>
          </span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Start a Project
        </h1>
        <p className="text-sm text-muted max-w-3xl">
          Commission your software project on Nexus Engineering. Define specifications, set budgets, and access verified developers with milestone escrow guarantees.
        </p>

        {/* Identity Banner */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-accent/30 bg-accent/5 text-xs text-muted">
          <div className="flex items-center space-x-2.5">
            <div className="h-2.5 w-2.5 rounded-full bg-accent animate-pulse" />
            <span>Submitting as: <strong className="text-foreground">{userIdentityLabel}</strong></span>
          </div>
          <span className="font-mono text-[10px] text-accent font-semibold hidden sm:inline">
            UID: {user.publicUid || user.uid || user.id?.slice(0, 16)}
          </span>
        </div>
      </div>

      {/* Main Submission Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 1: Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2 text-accent text-xs font-semibold uppercase tracking-wider">
              <Layers className="h-4 w-4" />
              <span>Project Core Identity</span>
            </div>
            <CardTitle className="text-lg">Basic Project Information</CardTitle>
            <CardDescription className="text-xs">
              Provide clear, high-level context so lead engineers understand the project vision.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <Input
              label="Project Title *"
              placeholder="e.g. Real-Time High-Frequency Algorithmic Order Management System"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Engineering Category *"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={CATEGORIES}
              />

              <Select
                label="Contract Engagement Model *"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                options={PROJECT_TYPES}
              />
            </div>

            <Textarea
              label="Summary & Objectives *"
              rows={4}
              placeholder="Describe the problem, functional goals, core user personas, and target outcomes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </CardContent>
        </Card>

        {/* Section 2: Requirements & Tech */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2 text-accent text-xs font-semibold uppercase tracking-wider">
              <FileCode className="h-4 w-4" />
              <span>Technical Architecture</span>
            </div>
            <CardTitle className="text-lg">Specifications & Technology Requirements</CardTitle>
            <CardDescription className="text-xs">
              List atomic functional requirements and technologies essential for successful delivery.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Dynamic Requirements List */}
            <div className="space-y-3">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted">
                Key Technical Requirements * ({requirements.length} defined)
              </label>

              <div className="space-y-2">
                {requirements.map((req, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated border border-border text-xs group"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-[10px] text-accent font-semibold w-5">
                        #{idx + 1}
                      </span>
                      <span className="text-foreground">{req}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRequirement(idx)}
                      className="text-muted hover:text-status-danger p-1 transition-colors"
                      title="Remove requirement"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add requirement input */}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  placeholder="Add specific specification (e.g. Real-time WebSocket synchronization with sub-50ms latency)"
                  value={newRequirement}
                  onChange={(e) => setNewRequirement(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddRequirement(e);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleAddRequirement}
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Technologies */}
            <div className="space-y-3 pt-3 border-t border-border">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted">
                Preferred Technology Stack & Tools ({technologies.length})
              </label>

              <div className="flex flex-wrap gap-2">
                {technologies.map((tech) => (
                  <span
                    key={tech}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-md bg-surface-elevated border border-border text-xs font-mono text-foreground"
                  >
                    <span>{tech}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTech(tech)}
                      className="text-muted hover:text-status-danger ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {/* Suggested quick clicks */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-muted">Quick add recommendations:</span>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_SKILLS.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => handleAddTech(skill)}
                      disabled={technologies.includes(skill)}
                      className="text-[10px] font-mono px-2 py-0.5 rounded border border-border/70 hover:border-accent hover:text-accent disabled:opacity-40 transition-colors"
                    >
                      + {skill}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Input
                  placeholder="Custom tech stack (e.g. Rust, Kafka, Kubernetes, Flutter)"
                  value={newTech}
                  onChange={(e) => setNewTech(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTech(newTech);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAddTech(newTech)}
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                >
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Commercials & Timeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2 text-accent text-xs font-semibold uppercase tracking-wider">
              <Coins className="h-4 w-4" />
              <span>Investment & Delivery</span>
            </div>
            <CardTitle className="text-lg">Commercial Parameters</CardTitle>
            <CardDescription className="text-xs">
              Establish your target budget range in INR (₹) and delivery expectations.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Budget Minimum (₹ INR) *"
                type="number"
                min="1000"
                step="5000"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                required
              />

              <Input
                label="Budget Maximum (₹ INR) *"
                type="number"
                min="1000"
                step="5000"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                required
              />

              <Select
                label="Target Timeline *"
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                options={TIMELINE_OPTIONS}
              />
            </div>

            <Input
              label="Design / Specification URLs (Optional)"
              placeholder="e.g. Figma prototype, PRD document link, or GitHub repository"
              value={referenceLinks}
              onChange={(e) => setReferenceLinks(e.target.value)}
            />

            <Textarea
              label="Additional Notes or Security Constraints (Optional)"
              rows={3}
              placeholder="Special compliance requirements, IP assignment notes, SLA guarantees, or timezone preferences..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
            />
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row items-center justify-between border-t border-border pt-5 gap-4">
            <div className="text-xs text-muted">
              <span>All payments are milestone-backed and held in Escrow until client approval.</span>
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <Link href="/dashboard" className="w-full sm:w-auto">
                <Button variant="outline" size="sm" type="button" className="w-full">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                isLoading={isSubmitting}
                rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? 'Submitting Project...' : 'Submit Project for Review'}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
