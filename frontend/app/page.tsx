import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Workflow,
  Coins,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { CinematicQuotes } from '@/components/landing/typewriter-quotes';

export default function HomePage() {
  const leadership = siteConfig.company.leadership;

  const sampleTechnologies = [
    'Next.js 14',
    'TypeScript',
    'PostgreSQL',
    'Python AI/ML',
    'Docker',
    'Tailwind CSS',
    'Supabase',
    'Three.js',
    'GraphQL',
    'Rust',
    'Kubernetes',
    'AWS Cloud',
  ];

  return (
    <div className="flex flex-col space-y-24 pb-20">
      {/* 🎬 HERO SECTION WITH BACKGROUND VIDEO */}
      <section className="relative min-h-[92vh] flex flex-col justify-center items-center overflow-hidden pt-28 pb-20">
        {/* Full-bleed Background Video */}
        <div className="absolute inset-0 w-full h-full -z-10 overflow-hidden pointer-events-none select-none">
          <video
            autoPlay
            loop
            muted
            playsInline
            poster="/videos/hero-developer-poster.jpg"
            className="w-full h-full object-cover object-center filter brightness-[0.72] contrast-[1.08]"
          >
            <source src="/videos/hero-developer.mp4" type="video/mp4" />
          </video>
          {/* Subtle Dark Vignette & Gradient Overlays for Maximum Legibility */}
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[0.5px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-black/20 to-black/60" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/40 via-transparent to-background/40" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center flex flex-col items-center justify-center">
          <div className="inline-flex items-center space-x-2 rounded-full border border-accent/40 bg-accent/15 backdrop-blur-md px-3.5 py-1 text-xs font-semibold text-accent mb-6 shadow-[0_0_15px_rgba(2,132,199,0.3)]">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="font-mono uppercase tracking-wider text-[11px]">Developer Company Operating System 2.0</span>
          </div>

          {/* Autolooping Quotes with Infosys-style Optical Blur & Focus */}
          <CinematicQuotes />

          <p className="mt-6 text-base sm:text-lg md:text-xl text-slate-200 max-w-2xl mx-auto font-normal leading-relaxed drop-shadow-sm">
            Developer-powered technology company building mission-critical digital products. Verified talent, anonymous project claims, credit ledgers, and seamless execution.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/projects">
              <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Explore Projects
              </Button>
            </Link>
            <Link href="/join-developer">
              <Button variant="secondary" size="lg" className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md">
                Join Developer Network
              </Button>
            </Link>
            <Link href="/start-project">
              <Button variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10 backdrop-blur-md">
                Start a Project
              </Button>
            </Link>
          </div>

          {/* Quick metric stats in frosted glass cards */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto border-t border-white/15 pt-10 text-left w-full">
            <div className="p-4 rounded-xl bg-black/40 backdrop-blur-md border border-white/15 shadow-xl">
              <div className="text-2xl sm:text-3xl font-bold text-accent font-mono">100%</div>
              <div className="text-xs text-slate-300 mt-1 uppercase tracking-wider font-semibold">Verified Developers</div>
            </div>
            <div className="p-4 rounded-xl bg-black/40 backdrop-blur-md border border-white/15 shadow-xl">
              <div className="text-2xl sm:text-3xl font-bold text-white font-mono">₹50 / Cr</div>
              <div className="text-xs text-slate-300 mt-1 uppercase tracking-wider font-semibold">Configurable Claim Credit</div>
            </div>
            <div className="p-4 rounded-xl bg-black/40 backdrop-blur-md border border-white/15 shadow-xl">
              <div className="text-2xl sm:text-3xl font-bold text-electric-purple font-mono">Atomic</div>
              <div className="text-xs text-slate-300 mt-1 uppercase tracking-wider font-semibold">Ledger & Auto-Refunds</div>
            </div>
            <div className="p-4 rounded-xl bg-black/40 backdrop-blur-md border border-white/15 shadow-xl">
              <div className="text-2xl sm:text-3xl font-bold text-white font-mono">Private</div>
              <div className="text-xs text-slate-300 mt-1 uppercase tracking-wider font-semibold">Anonymous Project Bridge</div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. THE PROTOCOL & ARCHITECTURE */}
      <section id="protocol" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <Badge variant="default">The Architecture</Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Software Company + Developer Network + Client Ecosystem
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              We reimagined how digital products are commissioned, claimed, and delivered. By isolating client and developer identities during selection, matching technical proficiencies through strict eligibility filters, and escrowing project claims via credit ledgers, we eliminate bias and assure technical delivery.
            </p>
            <div className="space-y-3 pt-2">
              <div className="flex items-start space-x-3">
                <CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <p className="text-xs text-muted leading-relaxed">
                  <strong className="text-foreground">Anonymous Selection:</strong> Clients interact with Developer #01, #02, #03 without premature bias until selection.
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <p className="text-xs text-muted leading-relaxed">
                  <strong className="text-foreground">Guaranteed Fair Refunds:</strong> Developers not selected immediately receive full automated credit ledger refunds.
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <p className="text-xs text-muted leading-relaxed">
                  <strong className="text-foreground">Public Attribution:</strong> Completed projects showcase verified developers, driving portfolio reputation.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <span className="h-3 w-3 rounded-full bg-status-danger/70" />
                <span className="h-3 w-3 rounded-full bg-status-warning/70" />
                <span className="h-3 w-3 rounded-full bg-status-success/70" />
              </div>
              <span className="text-[11px] font-mono text-muted">transaction-ledger.ts</span>
            </div>
            <pre className="text-xs font-mono text-slate-200 overflow-x-auto p-4 bg-slate-900 rounded-lg leading-relaxed border border-slate-800 shadow-inner">
              <code>{`// Core Business Transaction
await db.$transaction(async (tx) => {
  // 1. Lock developer credit account
  const account = await tx.creditAccounts.lock(devId);
  // 2. Consume 1 claim credit
  await tx.credits.deduct({ devId, amount: 1 });
  // 3. Create anonymous bridge (Client #001 ↔ Developer #01)
  await tx.conversations.createAnonymousBridge({
    project: "PRJ-2026-0001",
    clientTag: "Client #001",
    devTag: "Developer #01"
  });
  // 4. On non-selection: atomic refund +1 credit
});`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* 3. INDUSTRIAL TECHNOLOGIES */}
      <section id="technologies" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center scroll-mt-20">
        <Badge variant="outline" className="mb-4">
          Tech Stack
        </Badge>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Built With Modern Industrial Technologies
        </h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3 max-w-4xl mx-auto">
          {sampleTechnologies.map((tech) => (
            <span
              key={tech}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-mono text-foreground hover:border-accent/40 transition-colors"
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* 4. ECOSYSTEM PIPELINE */}
      <section id="pipeline" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Badge variant="default" className="mb-3">
            Ecosystem Pipeline
          </Badge>
          <h2 className="text-3xl font-bold text-foreground">How The Platform Works</h2>
          <p className="mt-2 text-xs text-muted">
            From client submission to developer claim, anonymous proposal comparison, and verified public delivery.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card hoverEffect>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent mb-2">
                <Workflow className="h-5 w-5" />
              </div>
              <CardTitle>1. Submission & Review</CardTitle>
              <CardDescription>
                Client posts requirements. Platform generates PRJ-2026-0001 & Client #001. Admin reviews and approves for marketplace.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card hoverEffect>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-electric-purple/10 border border-electric-purple/30 flex items-center justify-center text-electric-purple mb-2">
                <Coins className="h-5 w-5" />
              </div>
              <CardTitle>2. Credit Claim & Anonymity</CardTitle>
              <CardDescription>
                Verified developers claim slots using credits. Private anonymous chats open. Proposals submitted without personal bias.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card hoverEffect>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-status-success/10 border border-status-success/30 flex items-center justify-center text-status-success mb-2">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle>3. Selection & Delivery</CardTitle>
              <CardDescription>
                Client selects lead developer. Unselected developers get 100% credit refunds automatically. Project workspace commences.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* 5. EXECUTIVE GOVERNANCE & LEADERSHIP */}
      <section id="leadership" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 border-t border-border pt-16 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Badge variant="outline" className="mb-3">
            Governance
          </Badge>
          <h2 className="text-3xl font-bold text-foreground">Company Leadership</h2>
          <p className="mt-2 text-xs text-muted">
            Direct executive oversight across developer verification, project claims, and platform integrity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* CEO */}
          <Card className="border-accent/30 bg-surface-elevated">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-accent font-bold text-base">
                  RL
                </div>
                <div>
                  <CardTitle>{leadership.ceo.name}</CardTitle>
                  <p className="text-xs font-semibold text-accent">{leadership.ceo.title}</p>
                </div>
              </div>
              <CardDescription className="text-xs leading-relaxed text-muted pt-2">
                {leadership.ceo.bio} Full administrative control, user governance, payment management, and community moderation.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* MD */}
          <Card className="border-electric-purple/30 bg-surface-elevated">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-electric-purple/20 text-electric-purple font-bold text-base">
                  SG
                </div>
                <div>
                  <CardTitle>{leadership.md.name}</CardTitle>
                  <p className="text-xs font-semibold text-electric-purple">{leadership.md.title}</p>
                </div>
              </div>
              <CardDescription className="text-xs leading-relaxed text-muted pt-2">
                {leadership.md.bio} Technical execution, developer team operations, client milestone visibility, and analytics.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* 6. CALL TO ACTION */}
      <section id="cta" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-mt-20">
        <div className="rounded-2xl border border-accent/30 bg-gradient-to-b from-surface-elevated via-surface to-surface-elevated p-8 md:p-12 text-center relative overflow-hidden shadow-surface-card">
          <div className="absolute top-0 right-0 w-72 h-72 bg-accent/10 blur-[90px] rounded-full pointer-events-none" />
          <h2 className="text-3xl font-extrabold text-foreground sm:text-4xl">
            Ready to Build The Future?
          </h2>
          <p className="mt-3 text-sm text-muted max-w-xl mx-auto">
            Whether you are an enterprise client commissioning mission-critical software or a top-tier engineer seeking verified credit-backed projects.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/join-developer">
              <Button size="lg">Join as Verified Developer</Button>
            </Link>
            <Link href="/start-project">
              <Button variant="secondary" size="lg">
                Submit a Client Project
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
