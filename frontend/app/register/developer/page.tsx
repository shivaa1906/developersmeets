'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Terminal, Shield, CheckCircle2, ArrowRight, Code2, Globe, Github, Linkedin, Award, Cpu } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export default function RegisterDeveloperPage() {
  const { addToast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const [formData, setFormData] = React.useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    profilePhoto: '',
    location: '',
    developerRole: 'Full Stack Engineer',
    experience: '3',
    skills: 'System Design, Microservices, REST APIs',
    programmingLanguages: 'TypeScript, Python, SQL',
    frameworks: 'React, Next.js, Node.js, Express',
    databases: 'PostgreSQL, Redis',
    cloud: 'AWS, Docker',
    aiml: '',
    uiux: 'Tailwind CSS, Figma',
    githubUrl: '',
    linkedinUrl: '',
    portfolioUrl: '',
    leetcodeUrl: '',
    kaggleUrl: '',
    otherLinks: '',
    bio: '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password.length < 8) {
      addToast('error', 'Password Too Short', 'Password must be at least 8 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      addToast('error', 'Password Mismatch', 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await apiClient.post('/auth/register/developer', {
        fullName: formData.fullName.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        profilePhoto: formData.profilePhoto.trim() || undefined,
        location: formData.location.trim(),
        roleTitle: formData.developerRole,
        experience: formData.experience,
        skills: formData.skills,
        programmingLanguages: formData.programmingLanguages,
        frameworks: formData.frameworks,
        databases: formData.databases,
        cloud: formData.cloud,
        aiml: formData.aiml || undefined,
        uiux: formData.uiux || undefined,
        githubUrl: formData.githubUrl.trim(),
        linkedinUrl: formData.linkedinUrl.trim() || undefined,
        portfolioUrl: formData.portfolioUrl.trim() || undefined,
        leetcodeUrl: formData.leetcodeUrl.trim() || undefined,
        kaggleUrl: formData.kaggleUrl.trim() || undefined,
        otherLinks: formData.otherLinks.trim() || undefined,
        bio: formData.bio.trim(),
      });

      setSubmitted(true);
      addToast(
        'success',
        'Application Submitted',
        'Your profile status is PENDING_DEVELOPER_APPROVAL. Executive leadership will review your credentials.'
      );
    } catch (err: any) {
      addToast('error', 'Registration Failed', err.message || 'Failed to submit developer application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
        <Card className="max-w-md text-center p-6 space-y-4 border-warning/40 shadow-accent-glow">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-warning/10 text-status-warning border border-status-warning/30">
            <Shield className="h-7 w-7" />
          </div>
          <Badge variant="warning">PENDING_DEVELOPER_APPROVAL</Badge>
          <h2 className="text-xl font-bold text-foreground">Application Under Executive Review</h2>
          <p className="text-xs text-muted leading-relaxed">
            Thank you for applying to the Nexus Developer Network. To preserve technical integrity, every applicant undergoes direct review by executive leadership before gaining marketplace claiming and private community access.
          </p>
          <div className="rounded-lg bg-surface-elevated p-3 border border-border text-left text-xs text-muted space-y-1">
            <div className="font-semibold text-foreground flex items-center space-x-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
              <span>What happens next:</span>
            </div>
            <p>1. Executive leadership verifies your technical profiles and proof of work.</p>
            <p>2. Upon approval, your profile unlocks claim slots and credit settlements.</p>
            <p>3. You will receive an email confirmation and can sign in to your dashboard.</p>
          </div>
          <div className="pt-2 flex flex-col space-y-2">
            <Link href="/login">
              <Button size="sm" className="w-full">
                Proceed to Sign In
              </Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" size="sm" className="w-full">
                Return to Home
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      {/* Brand & Title */}
      <div className="text-center space-y-2">
        <Link href="/" className="inline-flex items-center space-x-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
            <Terminal className="h-5 w-5" />
          </div>
          <span className="text-base font-bold tracking-wider text-foreground">
            NEXUS<span className="text-accent">.DEV</span>
          </span>
        </Link>
        <div className="pt-1">
          <Badge variant="default" size="sm">
            Verified Talent Intake
          </Badge>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Join the Developer Network
        </h1>
        <p className="text-xs text-muted max-w-lg mx-auto">
          Apply to build enterprise digital systems, claim project slots with 100% refundable credits, and gain permanent public attributions.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Engineer Candidate Application</span>
            <span className="text-xs font-mono text-muted">All Fields Encrypted</span>
          </CardTitle>
          <CardDescription>
            Complete your technical profile. Unapproved applicants will not receive marketplace or community access until executive verification.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section 1: Basic Identity & Security */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wider flex items-center space-x-1.5">
                <Code2 className="h-3.5 w-3.5" />
                <span>1. Identity & Credentials</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Full Legal Name"
                  placeholder="Rahul Kumar"
                  value={formData.fullName}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  required
                />
                <Input
                  label="Unique Username"
                  placeholder="rahul-kumar"
                  value={formData.username}
                  onChange={(e) => handleChange('username', e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="rahul@example.com"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                />
                <Input
                  label="Phone Number"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Password"
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  required
                  minLength={8}
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Re-enter password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Location (City, Country)"
                  placeholder="Bengaluru, India"
                  value={formData.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                  required
                />
                <Input
                  label="Profile Photo URL (Optional)"
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={formData.profilePhoto}
                  onChange={(e) => handleChange('profilePhoto', e.target.value)}
                />
              </div>
            </div>

            {/* Section 2: Role & Experience */}
            <div className="space-y-4 pt-2 border-t border-border">
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wider flex items-center space-x-1.5">
                <Award className="h-3.5 w-3.5" />
                <span>2. Professional Role & Experience</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">Developer Role</label>
                  <select
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                    value={formData.developerRole}
                    onChange={(e) => handleChange('developerRole', e.target.value)}
                  >
                    <option value="Full Stack Engineer">Full Stack Engineer</option>
                    <option value="Backend Architect">Backend Architect</option>
                    <option value="Frontend Engineer">Frontend Engineer</option>
                    <option value="AI / ML Systems Engineer">AI / ML Systems Engineer</option>
                    <option value="DevOps & Cloud Architect">DevOps & Cloud Architect</option>
                    <option value="Mobile Systems Engineer">Mobile Systems Engineer</option>
                    <option value="Systems & Security Engineer">Systems & Security Engineer</option>
                  </select>
                </div>

                <Input
                  label="Years of Experience"
                  type="number"
                  min={0}
                  max={40}
                  placeholder="3"
                  value={formData.experience}
                  onChange={(e) => handleChange('experience', e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Section 3: Technical Skills & Tools */}
            <div className="space-y-4 pt-2 border-t border-border">
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wider flex items-center space-x-1.5">
                <Cpu className="h-3.5 w-3.5" />
                <span>3. Technical Skills & Stack</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Programming Languages"
                  placeholder="TypeScript, Python, Go, Rust, Java"
                  value={formData.programmingLanguages}
                  onChange={(e) => handleChange('programmingLanguages', e.target.value)}
                  required
                />
                <Input
                  label="Frameworks & Runtimes"
                  placeholder="React, Next.js, Node.js, FastAPI, Django"
                  value={formData.frameworks}
                  onChange={(e) => handleChange('frameworks', e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Databases & Caching"
                  placeholder="PostgreSQL, Redis, MongoDB, Elasticsearch"
                  value={formData.databases}
                  onChange={(e) => handleChange('databases', e.target.value)}
                  required
                />
                <Input
                  label="Cloud & DevOps Tools"
                  placeholder="AWS, Docker, Kubernetes, Terraform, CI/CD"
                  value={formData.cloud}
                  onChange={(e) => handleChange('cloud', e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="AI / ML Tools (Optional)"
                  placeholder="PyTorch, LangChain, OpenAI, Hugging Face"
                  value={formData.aiml}
                  onChange={(e) => handleChange('aiml', e.target.value)}
                />
                <Input
                  label="UI / UX & Design Tools (Optional)"
                  placeholder="Tailwind CSS, Figma, Framer Motion"
                  value={formData.uiux}
                  onChange={(e) => handleChange('uiux', e.target.value)}
                />
              </div>

              <Input
                label="Core Architectural Skills"
                placeholder="System Design, Microservices, REST APIs, GraphQL, Kafka"
                value={formData.skills}
                onChange={(e) => handleChange('skills', e.target.value)}
                required
              />
            </div>

            {/* Section 4: Public Profiles & Portfolios */}
            <div className="space-y-4 pt-2 border-t border-border">
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wider flex items-center space-x-1.5">
                <Globe className="h-3.5 w-3.5" />
                <span>4. Public Profiles & Proof of Work</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="GitHub Profile URL"
                  type="url"
                  placeholder="https://github.com/..."
                  value={formData.githubUrl}
                  onChange={(e) => handleChange('githubUrl', e.target.value)}
                  required
                />
                <Input
                  label="LinkedIn URL (Optional)"
                  type="url"
                  placeholder="https://linkedin.com/in/..."
                  value={formData.linkedinUrl}
                  onChange={(e) => handleChange('linkedinUrl', e.target.value)}
                />
                <Input
                  label="Portfolio / Website URL (Optional)"
                  type="url"
                  placeholder="https://myportfolio.dev"
                  value={formData.portfolioUrl}
                  onChange={(e) => handleChange('portfolioUrl', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="LeetCode Profile (Optional)"
                  type="url"
                  placeholder="https://leetcode.com/u/..."
                  value={formData.leetcodeUrl}
                  onChange={(e) => handleChange('leetcodeUrl', e.target.value)}
                />
                <Input
                  label="Kaggle Profile (Optional)"
                  type="url"
                  placeholder="https://kaggle.com/..."
                  value={formData.kaggleUrl}
                  onChange={(e) => handleChange('kaggleUrl', e.target.value)}
                />
                <Input
                  label="Other Relevant Links (Optional)"
                  placeholder="Twitter, Substack, Blog..."
                  value={formData.otherLinks}
                  onChange={(e) => handleChange('otherLinks', e.target.value)}
                />
              </div>
            </div>

            {/* Section 5: Bio */}
            <div className="space-y-4 pt-2 border-t border-border">
              <Textarea
                label="Engineering Bio & Specialization"
                rows={3}
                placeholder="Summarize your engineering background, complex distributed systems you have architected, and technical specialties..."
                value={formData.bio}
                onChange={(e) => handleChange('bio', e.target.value)}
              />
            </div>

            {/* Notice */}
            <div className="rounded-lg bg-surface-elevated p-3 border border-border text-xs text-muted leading-relaxed">
              <span className="font-semibold text-foreground">Note on Verification Gate:</span> Submitting this application places your account in <span className="font-mono text-status-warning">PENDING_DEVELOPER_APPROVAL</span>. You may log in to monitor your application, but project claims and private developer community access will remain locked until executive verification.
            </div>

            <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
              Submit Application to Executive Review
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted">
        <span>Already verified or have an account? </span>
        <Link href="/login" className="text-accent hover:underline font-semibold">
          Sign In
        </Link>
        <span className="mx-2">•</span>
        <span>Looking to hire developers? </span>
        <Link href="/register/client" className="text-accent hover:underline font-semibold">
          Client Registration
        </Link>
      </div>
    </div>
  );
}
