import { siteConfig } from '@/config/site';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ShieldCheck, Cpu, Code2, Users, CheckCircle2 } from 'lucide-react';

export const metadata = {
  title: 'Company & Leadership',
  description: 'Learn about Nexus Engineering Corp, executive leadership, and our operating model.',
};

export default function CompanyPage() {
  const leadership = siteConfig.company.leadership;

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 space-y-16">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <Badge variant="default">About Nexus</Badge>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Engineered for Technical Excellence
        </h1>
        <p className="text-base text-muted leading-relaxed">
          Nexus is a hybrid developer-powered technology company. We combine an elite internal engineering core with an exclusive, verified developer network and a credit-backed anonymous project marketplace.
        </p>
      </div>

      {/* Leadership Section */}
      <div className="space-y-8">
        <div className="text-center max-w-xl mx-auto">
          <Badge variant="outline">Executive Governance</Badge>
          <h2 className="mt-2 text-2xl font-bold text-foreground">Leadership</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <Card className="border-accent/40 bg-surface-elevated">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-accent font-bold text-lg">
                  RL
                </div>
                <div>
                  <CardTitle>{leadership.ceo.name}</CardTitle>
                  <p className="text-xs font-semibold text-accent">{leadership.ceo.title}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted leading-relaxed">
              <p>{leadership.ceo.bio}</p>
              <ul className="space-y-1.5 pt-2 border-t border-border">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                  <span>Platform governance & developer verification</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                  <span>Financial credit ledger & payment operations</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                  <span>Executive client strategy & dispute resolution</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-electric-purple/40 bg-surface-elevated">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-electric-purple/20 text-electric-purple font-bold text-lg">
                  SG
                </div>
                <div>
                  <CardTitle>{leadership.md.name}</CardTitle>
                  <p className="text-xs font-semibold text-electric-purple">{leadership.md.title}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted leading-relaxed">
              <p>{leadership.md.bio}</p>
              <ul className="space-y-1.5 pt-2 border-t border-border">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-electric-purple" />
                  <span>Engineering team & milestone oversight</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-electric-purple" />
                  <span>Business operations & capacity planning</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-electric-purple" />
                  <span>Performance monitoring & operational analytics</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t border-border">
        <Card>
          <CardHeader>
            <ShieldCheck className="h-6 w-6 text-accent mb-2" />
            <CardTitle>Zero Bias Selection</CardTitle>
            <CardDescription>
              Client identities and developer personal tags remain completely anonymous until selection, guaranteeing merit-based decisions.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Cpu className="h-6 w-6 text-electric-purple mb-2" />
            <CardTitle>Atomic Ledger Escrow</CardTitle>
            <CardDescription>
              Credits are deducted upon claim and automatically refunded via ledger transactions if another developer is selected.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Code2 className="h-6 w-6 text-status-success mb-2" />
            <CardTitle>Verified Attribution</CardTitle>
            <CardDescription>
              Once completed, projects become public showcase items linking directly back to the verified developers who engineered them.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
