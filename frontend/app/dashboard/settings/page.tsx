'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ThemeSettingsCard } from '@/components/ui/theme-selector';
import { ConnectedAccountsCard } from '@/components/ui/connected-accounts';

export default function DashboardSettingsPage() {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      addToast('success', 'Settings Saved', 'Your account preferences have been updated.');
    }, 600);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account & System Settings</h1>
        <p className="text-xs text-muted mt-1">Configure your visual appearance, security, and credentials.</p>
      </div>

      {/* Visual Theme Selection (System, Bright, Dark) */}
      <ThemeSettingsCard />

      {/* Connected Accounts & Multi-Provider Sign-in */}
      <ConnectedAccountsCard />

      {/* Security Credentials */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security & Authentication</CardTitle>
            <CardDescription>Update your login credentials and security tokens</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input label="Current Password" type="password" placeholder="••••••••" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="New Password" type="password" placeholder="••••••••" />
              <Input label="Confirm New Password" type="password" placeholder="••••••••" />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t border-border pt-4">
            <Button type="submit" isLoading={isSaving}>
              Update Password
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
