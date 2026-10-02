'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ConnectedAccountsCard } from '@/components/ui/connected-accounts';
import { api } from '@/lib/api-client';

export default function SecuritySettingsPage() {
  const { addToast } = useToast();
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast('error', 'Validation Error', 'New passwords do not match.');
      return;
    }
    setIsSaving(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      addToast('success', 'Password Updated', 'Your security credentials have been updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Security & Connected Accounts</h1>
        <p className="text-xs text-muted mt-1">
          Manage your connected sign-in methods, provider links, and account security credentials.
        </p>
      </div>

      {/* Connected Accounts Section */}
      <ConnectedAccountsCard />

      {/* Password Management */}
      <form onSubmit={handlePasswordUpdate} className="space-y-6">
        <Card className="border border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Change Password</CardTitle>
            <CardDescription className="text-xs text-muted">
              Ensure your password meets the maximum strength security requirements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Current Password"
              type="password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="New Password"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Input
                label="Confirm New Password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
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
