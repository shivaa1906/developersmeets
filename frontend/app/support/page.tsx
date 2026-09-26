'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LifeBuoy,
  ShieldCheck,
  Clock,
  ArrowRight,
  HelpCircle,
  AlertTriangle,
  FolderGit2,
  Lock,
  ChevronDown,
} from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  {
    question: 'How does post-completion support work?',
    answer:
      'When a project is completed and approved, the original project chat is closed and sealed. If you require post-delivery troubleshooting, configuration assistance, or defect remediation, you can open a dedicated Support Ticket. A tripartite Support Bridge is then instantiated linking you, a platform Support Agent, and the original Technical Developer.',
  },
  {
    question: 'What is a Support Bridge?',
    answer:
      'A Support Bridge is a secure, realtime channel mediated by platform leadership and support staff. It enables technical developers to investigate code-level inquiries without exposing client personal identities or private contact details.',
  },
  {
    question: 'Can I request new feature development through Support?',
    answer:
      'No. The Support system is reserved strictly for bug fixes, maintenance, and post-delivery assistance for completed projects. Any new development, scope expansions, or new applications must be initiated as a new project through the project marketplace.',
  },
  {
    question: 'How are client and developer identities protected?',
    answer:
      'All support bridges use strict identity masking. Clients appear as anonymous client tags (e.g. Client #001) and developers appear as Technical Developers. Direct contact details (emails, phone numbers, external handles) are automatically scrubbed.',
  },
  {
    question: 'What are the response time SLAs?',
    answer:
      'Urgent priority tickets receive initial response within 2 hours. High priority within 6 hours, Normal priority within 24 hours, and Low priority within 48 hours.',
  },
];

export default function PublicSupportPage() {
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-accent/30 bg-accent/10 text-accent text-xs font-mono">
            <LifeBuoy className="h-3.5 w-3.5" />
            <span>Post-Completion Assistance & SLA Support</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Nexus <span className="text-accent">Support Center</span>
          </h1>
          <p className="max-w-2xl mx-auto text-sm sm:text-base text-muted">
            Dedicated post-delivery assistance, mediated technical bridges, and engineering support for your projects.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/dashboard/support?action=create">
              <Button size="default" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Create Support Ticket
              </Button>
            </Link>
            <Link href="/dashboard/support">
              <Button size="default" variant="secondary">
                View My Tickets
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="default" variant="outline">
                Contact Helpdesk
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-border/80 bg-surface/50 backdrop-blur-sm">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-2">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Mediated Support Bridges</CardTitle>
              <CardDescription className="text-xs">
                Post-completion conversations are securely mediated by platform agents, connecting clients and lead developers seamlessly.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/80 bg-surface/50 backdrop-blur-sm">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-status-info/10 border border-status-info/20 flex items-center justify-center text-status-info mb-2">
                <Clock className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Guaranteed Response SLAs</CardTitle>
              <CardDescription className="text-xs">
                Round-the-clock incident response across 4 severity tiers: Urgent (&lt;2h), High (&lt;6h), Normal (&lt;24h), and Low (&lt;48h).
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/80 bg-surface/50 backdrop-blur-sm">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-status-success/10 border border-status-success/20 flex items-center justify-center text-status-success mb-2">
                <Lock className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Identity Shielded</CardTitle>
              <CardDescription className="text-xs">
                Complete anonymity guarantees. Client and developer personal contact information is never leaked or indexed.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Scope Protection Banner */}
        <Card className="border-status-warning/30 bg-status-warning/5 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="h-9 w-9 rounded-lg bg-status-warning/10 border border-status-warning/30 flex items-center justify-center text-status-warning shrink-0 mt-0.5 sm:mt-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Need New Features or Major Upgrades?</h3>
                <p className="text-xs text-muted mt-0.5">
                  Support tickets are strictly reserved for troubleshooting, bug fixes, and post-delivery maintenance. To develop new capabilities, submit a project via the marketplace.
                </p>
              </div>
            </div>
            <Link href="/dashboard/projects">
              <Button size="sm" variant="outline" className="border-status-warning/40 text-status-warning hover:bg-status-warning/10 shrink-0" rightIcon={<FolderGit2 className="h-3.5 w-3.5" />}>
                Start New Project
              </Button>
            </Link>
          </div>
        </Card>

        {/* SLA Tiers Table */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-accent" />
            <h2 className="text-lg font-bold text-foreground">Service Level Agreement (SLA) Matrix</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg border border-status-danger/30 bg-status-danger/5 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-status-danger border-status-danger/40">URGENT</Badge>
                <span className="text-xs font-mono font-bold text-status-danger">&lt; 2 Hours</span>
              </div>
              <p className="text-xs text-muted">Critical system outages, data loss, or blocking production failures.</p>
            </div>

            <div className="p-4 rounded-lg border border-status-warning/30 bg-status-warning/5 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-status-warning border-status-warning/40">HIGH</Badge>
                <span className="text-xs font-mono font-bold text-status-warning">&lt; 6 Hours</span>
              </div>
              <p className="text-xs text-muted">Core workflow degradation or severe non-blocking defects.</p>
            </div>

            <div className="p-4 rounded-lg border border-accent/30 bg-accent/5 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-accent border-accent/40">NORMAL</Badge>
                <span className="text-xs font-mono font-bold text-accent">&lt; 24 Hours</span>
              </div>
              <p className="text-xs text-muted">Minor anomalies, cosmetic issues, or general configuration queries.</p>
            </div>

            <div className="p-4 rounded-lg border border-border bg-surface/40 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-muted border-border">LOW</Badge>
                <span className="text-xs font-mono font-bold text-muted">&lt; 48 Hours</span>
              </div>
              <p className="text-xs text-muted">General documentation requests and non-urgent questions.</p>
            </div>
          </div>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <HelpCircle className="h-4 w-4 text-accent" />
            <h2 className="text-lg font-bold text-foreground">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="rounded-lg border border-border bg-surface/40 transition-colors overflow-hidden"
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between p-4 text-left text-xs sm:text-sm font-medium text-foreground hover:text-accent focus:outline-none"
                    aria-expanded={isOpen}
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted transition-transform duration-200 ${
                        isOpen ? 'transform rotate-180 text-accent' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 text-xs text-muted border-t border-border/50 pt-3 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
