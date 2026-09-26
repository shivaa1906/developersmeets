'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import { Terminal, Briefcase, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function ClientRegisterPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { login: setAuthSession } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [formData, setFormData] = React.useState({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    password: '',
    confirmPassword: '',
  });

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
      const res = await apiClient.post<{ token: string; user: any; client: any; redirectUrl?: string }>(
        '/auth/register/client',
        {
          fullName: formData.fullName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || undefined,
          companyName: formData.companyName.trim() || undefined,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
        }
      );

      if (res.token && res.user) {
        setAuthSession(res.token, res.user);
      }

      addToast(
        'success',
        'Account Created Successfully',
        `Welcome to Nexus! Your client identifier is ${res.client?.client_number || res.user?.clientNumber || 'Client'}.`
      );

      router.push(res.redirectUrl || '/dashboard');
    } catch (err: any) {
      addToast('error', 'Registration Failed', err.message || 'Unable to complete client registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <div className="text-center space-y-2">
        <Link href="/" className="inline-flex items-center space-x-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent shadow-accent-glow">
            <Terminal className="h-5 w-5" />
          </div>
          <span className="text-base font-bold tracking-wider text-foreground">
            NEXUS<span className="text-accent">.DEV</span>
          </span>
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Hire Verified Developers</h1>
        <p className="text-xs text-muted max-w-md mx-auto">
          Create your client account to submit software projects, review competitive developer proposals, and manage delivery through secure workspaces.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Briefcase className="h-4 w-4 text-accent" />
              <span>Client Organization Onboarding</span>
            </div>
            <Badge variant="success">Instant Activation</Badge>
          </CardTitle>
          <CardDescription>
            Enter your organization details below to access the verified developer marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Name / Primary Contact"
                placeholder="Jane Doe"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />
              <Input
                label="Company Name (Optional)"
                placeholder="Acme Retail, LLC"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Work Email"
                type="email"
                placeholder="jane@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <Input
                label="Phone Number (Optional)"
                type="tel"
                placeholder="+1 (555) 019-2834"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Password"
                type="password"
                placeholder="At least 8 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={8}
              />
              <Input
                label="Confirm Password"
                type="password"
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                minLength={8}
              />
            </div>

            <div className="p-3 bg-surface-raised rounded-md border border-border flex items-start space-x-2 text-[11px] text-muted">
              <ShieldCheck className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <span>
                Your identity is shielded during the initial proposal phase. Developers interact with your project through an anonymous company tag until selection.
              </span>
            </div>

            <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
              Create Client Account & Go to Dashboard
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex items-center justify-between text-xs text-muted border-t border-border pt-4">
          <Link href="/login" className="hover:text-foreground">
            Already registered? <span className="text-accent hover:underline font-medium">Sign In</span>
          </Link>
          <Link href="/register" className="text-muted hover:text-foreground">
            Applying as developer? <span className="text-accent hover:underline font-medium">Developer Portal</span>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
