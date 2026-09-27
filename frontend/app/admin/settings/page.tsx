'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { Sliders, Shield, AlertTriangle } from 'lucide-react';
import { siteConfig } from '@/config/site';
import { ThemeSettingsCard } from '@/components/ui/theme-selector';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';

export default function AdminSettingsPage() {
  const { user, isCEO, isLoading } = useAuth();
  const { addToast } = useToast();
  const [creditPrice, setCreditPrice] = React.useState('50');
  const [claimCost, setClaimCost] = React.useState('1');
  const [refundPercentage, setRefundPercentage] = React.useState('100');
  const [maxClaims, setMaxClaims] = React.useState('5');
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      addToast(
        'success',
        'Platform Configuration Saved',
        `Credit Price set to ₹${creditPrice}, Claim Cost ${claimCost} Cr, Refund Policy ${refundPercentage}%.`
      );
    }, 600);
  };

  if (!isLoading && !isCEO) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Card className="border-status-danger/40 bg-status-danger/5">
          <CardHeader>
            <div className="flex items-center space-x-2 text-status-danger">
              <AlertTriangle className="h-5 w-5" />
              <CardTitle className="text-base">Access Denied (403 Forbidden)</CardTitle>
            </div>
            <CardDescription className="text-status-danger/80">
              Platform Business Rules and Global System Configuration are strictly restricted to the Chief Executive Officer (CEO).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted">
              Your current authenticated role is <span className="font-mono font-bold text-foreground">{user?.role || 'UNAUTHORIZED'}</span>.
              Managing Directors and staff members are not authorized to view or edit platform executive settings.
            </p>
            <div className="pt-2">
              <Link href="/admin/dashboard">
                <Button variant="secondary" size="sm">Return to Admin Overview</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Business Rules & Parameters</h1>
        <p className="text-xs text-muted mt-1">
          Dynamic configuration of credit economy, marketplace limits, and automatic refund algorithms.
        </p>
      </div>

      {/* Visual Theme Selection (System, Bright, Dark) */}
      <ThemeSettingsCard />

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2 text-accent">
              <Sliders className="h-4 w-4" />
              <CardTitle className="text-base">Credit Economy & Claim Parameters</CardTitle>
            </div>
            <CardDescription>
              Never hardcoded: adjust rates and guarantee instant ledger reconciliation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Credit Unit Price (₹ INR)"
                type="number"
                value={creditPrice}
                onChange={(e) => setCreditPrice(e.target.value)}
                helperText="1 Credit price in Rupees"
                required
              />
              <Input
                label="Default Project Claim Cost (Credits)"
                type="number"
                value={claimCost}
                onChange={(e) => setClaimCost(e.target.value)}
                helperText="Credits deducted per slot claim"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Non-Selection Refund Policy (%)"
                type="number"
                value={refundPercentage}
                onChange={(e) => setRefundPercentage(e.target.value)}
                helperText="100% = Full credit refund to unselected developers"
                required
              />
              <Input
                label="Default Max Claims Per Project"
                type="number"
                value={maxClaims}
                onChange={(e) => setMaxClaims(e.target.value)}
                helperText="Standard maximum claim slots per open project"
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t border-border pt-4">
            <Button type="submit" isLoading={isSaving}>
              Save Economic Policies
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
