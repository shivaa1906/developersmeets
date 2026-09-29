import React from 'react';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HeroScene } from '@/components/3d/hero-scene';
import { TiltCard } from '@/components/3d/tilt-card';
import { MarqueeTicker } from '@/components/landing/marquee-ticker';
import { CinematicQuotes } from '@/components/landing/typewriter-quotes';
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Cpu,
  Layers,
  Globe,
  Lock,
  Workflow,
  Zap,
  CheckCircle2,
  Code2,
  Terminal,
  ExternalLink,
  ChevronRight,
  Server,
  Database,
  Users,
  Award,
} from 'lucide-react';

export default function HomePage() {
  const leadership = siteConfig.company.leadership;

  return (
    <div className="flex flex-col space-y-24 sm:space-y-32 pb-24 overflow-hidden">
      {/* ─────────────────────────────────────────────────────────────
          1. 3D HERO SECTION (VIDEO REMOVED — INTERACTIVE 3D WEBGL HERO)
         ───────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex flex-col justify-center items-center overflow-hidden pt-28 pb-16">
        {/* Subtle architectural grid pattern */}
        <div className="absolute inset-0 bg-grid-subtle pointer-events-none -z-20 opacity-70" />

        {/* Ambient emerald radial mesh gradients */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-emerald-500/10 dark:bg-emerald-500/15 blur-[120px] rounded-full pointer-events-none -z-10" />
        <div className="absolute bottom-10 right-10 w-[400px] h-[300px] bg-teal-500/10 dark:bg-teal-500/10 blur-[100px] rounded-full pointer-events-none -z-10" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          {/* Top Live Availability Badge (Klydex style) */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center space-x-2.5 rounded-full border border-emerald-500/30 dark:border-emerald-400/25 bg-emerald-500/10 dark:bg-emerald-950/40 backdrop-blur-md px-4 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 shadow-sm shadow-emerald-500/10 transition-all hover:border-emerald-500/50">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono uppercase tracking-wider text-[11px]">
                AVAILABLE FOR NEW PROJECTS // TOP 1% VERIFIED GUILD
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Hero Typography & CTA */}
            <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
              <div className="w-full">
                <CinematicQuotes className="text-left" />
              </div>

              <p className="text-base sm:text-lg md:text-xl text-muted leading-relaxed max-w-2xl font-normal">
                Nexus is a developer-powered technology company engineering mission-critical web applications, AI automation systems, and distributed platforms with anonymous credit escrow and guaranteed delivery.
              </p>

              {/* Primary Action Button Cluster */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2">
                <Link href="/start-project">
                  <Button
                    size="lg"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-600/25 border-0 hover:shadow-emerald-500/40 transition-all hover:-translate-y-0.5"
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    Start a Project
                  </Button>
                </Link>
                <Link href="/projects">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-border hover:border-emerald-500/50 bg-surface/80 hover:bg-surface-elevated backdrop-blur-sm transition-all"
                  >
                    Explore Shipped Work
                  </Button>
                </Link>
                <Link href="/join-developer">
                  <Button
                    size="lg"
                    variant="ghost"
                    className="text-muted hover:text-emerald-600 dark:hover:text-emerald-400 font-mono text-xs"
                  >
                    Join Developer Guild →
                  </Button>
                </Link>
              </div>

              {/* Verified Trust Badges */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 pt-4 text-xs font-mono text-muted">
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>100% Verified Engineers</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>Zero-Bias Escrow Ledger</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Zap className="h-4 w-4 text-emerald-500" />
                  <span>Instant Credit Refunds</span>
                </div>
              </div>
            </div>

            {/* Right Column: 3D Interactive Three.js Polyhedron Canvas */}
            <div className="lg:col-span-5 relative w-full flex items-center justify-center">
              <div className="w-full max-w-[500px] h-[440px] sm:h-[520px] relative rounded-3xl border border-emerald-500/20 dark:border-emerald-400/20 bg-gradient-to-b from-surface/60 to-surface-elevated/40 dark:from-emerald-950/20 dark:to-black/40 backdrop-blur-xl shadow-2xl overflow-hidden p-2">
                {/* 3D WebGL Canvas Component */}
                <HeroScene />

                {/* Floating 3D Micro-Badges */}
                <div className="absolute top-4 left-4 z-20 pointer-events-none">
                  <div className="flex items-center space-x-2 rounded-lg bg-surface/90 dark:bg-black/80 border border-border/80 dark:border-emerald-500/30 px-3 py-1.5 shadow-lg backdrop-blur-md">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="font-mono text-[11px] text-foreground font-semibold">
                      WebGL 3D Core Active
                    </span>
                  </div>
                </div>

                <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
                  <div className="flex items-center space-x-2 rounded-lg bg-surface/90 dark:bg-black/80 border border-border/80 dark:border-emerald-500/30 px-3 py-1.5 shadow-lg backdrop-blur-md">
                    <Code2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="font-mono text-[11px] text-muted-foreground font-medium">
                      Drag / Move cursor to tilt
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Item Live Metric Strip (3D Tilt Cards) */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            <TiltCard maxTilt={8} className="p-5 rounded-xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-lg">
              <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">150+</div>
              <div className="text-xs text-foreground font-semibold mt-1 uppercase tracking-wider">Shipped Systems</div>
              <div className="text-[11px] text-muted mt-0.5">Production-grade deployments</div>
            </TiltCard>

            <TiltCard maxTilt={8} className="p-5 rounded-xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-lg">
              <div className="text-3xl font-extrabold text-foreground font-mono">100%</div>
              <div className="text-xs text-foreground font-semibold mt-1 uppercase tracking-wider">Verified Talent</div>
              <div className="text-[11px] text-muted mt-0.5">Strict KYC & tech screening</div>
            </TiltCard>

            <TiltCard maxTilt={8} className="p-5 rounded-xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-lg">
              <div className="text-3xl font-extrabold text-emerald-500 font-mono">₹0</div>
              <div className="text-xs text-foreground font-semibold mt-1 uppercase tracking-wider">Unselected Risk</div>
              <div className="text-[11px] text-muted mt-0.5">100% automated credit refunds</div>
            </TiltCard>

            <TiltCard maxTilt={8} className="p-5 rounded-xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-lg">
              <div className="text-3xl font-extrabold text-teal-500 dark:text-teal-400 font-mono">99.8%</div>
              <div className="text-xs text-foreground font-semibold mt-1 uppercase tracking-wider">Satisfaction</div>
              <div className="text-[11px] text-muted mt-0.5">Milestone verified delivery</div>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          2. MARQUEE TECH TICKER (KLYDEX INFINITE HORIZONTAL STRIP)
         ───────────────────────────────────────────────────────────── */}
      <section className="w-full">
        <MarqueeTicker />
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. BENTO GRID OF CAPABILITIES & PROTOCOL (KLYDEX STYLE)
         ───────────────────────────────────────────────────────────── */}
      <section id="capabilities" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="outline" className="mb-3 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-mono uppercase tracking-wider text-[11px]">
            [ CAPABILITIES & PROTOCOL ]
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            High-Performance Engineering Built for Global Scale
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted">
            From modern responsive web applications to autonomous AI workflows and cryptographic credit escrow ledgers.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-12 gap-6">
          {/* Card 1: Web Platforms & Distributed Systems (Large 8-col) */}
          <TiltCard
            maxTilt={6}
            className="lg:col-span-8 p-8 rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold tracking-widest uppercase">
                  01 // FULL-STACK ARCHITECTURE
                </span>
                <span className="text-[11px] font-mono text-muted bg-surface-elevated dark:bg-black/50 px-2.5 py-1 rounded border border-border/50">
                  NEXT.JS 14 + REACT
                </span>
              </div>
              <h3 className="text-2xl font-bold text-foreground">
                Enterprise Web Platforms & Microservices
              </h3>
              <p className="mt-3 text-sm text-muted leading-relaxed max-w-2xl">
                We engineer scalable, SEO-optimized web applications with modern Next.js 14 App Router, TypeScript, server components, and sub-100ms API response latency. Designed to support millions of concurrent users without breaking.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-border/60 flex flex-wrap gap-3">
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Server-Side Rendering
              </span>
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-surface-elevated dark:bg-black/60 text-muted-foreground border border-border/60">
                Real-Time WebSockets
              </span>
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-surface-elevated dark:bg-black/60 text-muted-foreground border border-border/60">
                High-Concurrency DB Pools
              </span>
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-surface-elevated dark:bg-black/60 text-muted-foreground border border-border/60">
                Edge Caching
              </span>
            </div>
          </TiltCard>

          {/* Card 2: AI Agents & Automation (4-col) */}
          <TiltCard
            maxTilt={6}
            className="lg:col-span-4 p-8 rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold tracking-widest uppercase">
                  02 // INTELLIGENCE
                </span>
                <Cpu className="h-5 w-5 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold text-foreground">
                AI Agents & Workflow Automation
              </h3>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                Autonomous LLM agent pipelines, function-calling workflows, vector embeddings, and n8n integrations that automate tedious manual operations with 99.9% uptime.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-border/60 flex flex-col space-y-2">
              <div className="flex items-center space-x-2 text-xs text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Multi-turn streaming chat & tools</span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Automated ETL & data cleaning</span>
              </div>
            </div>
          </TiltCard>

          {/* Card 3: Anonymous Escrow Protocol (Large 6-col with interactive transaction ledger) */}
          <TiltCard
            maxTilt={6}
            className="lg:col-span-6 p-8 rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold tracking-widest uppercase">
                  03 // CORE PROTOCOL
                </span>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  PATENTED LEDGER
                </span>
              </div>
              <h3 className="text-xl font-bold text-foreground">
                Anonymous Escrow & Credit Claims
              </h3>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                Clients evaluate Developer #01, #02, #03 based purely on technical merit and architecture. Credit claims prevent spam, and unselected bids trigger automated atomic refunds.
              </p>
            </div>

            {/* Interactive Transaction Ledger Snippet */}
            <div className="mt-6 rounded-xl border border-border/80 dark:border-emerald-500/30 bg-[#070b09] p-4 text-xs font-mono text-slate-200 overflow-x-auto shadow-inner">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 text-[10px] text-muted-foreground">
                <span>transaction-ledger.ts</span>
                <span className="text-emerald-400">STATUS: RECONCILED</span>
              </div>
              <pre className="text-[11px] text-emerald-400/90 leading-relaxed">
{`await db.$transaction(async (tx) => {
  // 1. Lock developer claim credit
  await tx.credits.deduct({ devId, amount: 1 });
  // 2. Open anonymous bridge
  await tx.bridge.open({ client: "Client #001", dev: "Dev #01" });
  // 3. On unselected: 100% instant refund
  await tx.refund.ensureZeroRisk({ devId });
});`}
              </pre>
            </div>
          </TiltCard>

          {/* Card 4: Top 1% Developer Guild (6-col) */}
          <TiltCard
            maxTilt={6}
            className="lg:col-span-6 p-8 rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold tracking-widest uppercase">
                  04 // VERIFICATION MATRIX
                </span>
                <Users className="h-5 w-5 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold text-foreground">
                Strict 4-Tier Developer Verification
              </h3>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                Every engineer in the Nexus guild passes through live coding challenges, identity verification, past delivery audits, and peer architecture reviews before being allowed to claim projects.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 pt-4 border-t border-border/60">
              <div className="p-3 rounded-lg bg-surface-elevated dark:bg-black/50 border border-border/60">
                <div className="font-mono text-xs font-bold text-emerald-500">Tier 1: Identity & KYC</div>
                <div className="text-[11px] text-muted mt-0.5">Government ID & fraud checks</div>
              </div>
              <div className="p-3 rounded-lg bg-surface-elevated dark:bg-black/50 border border-border/60">
                <div className="font-mono text-xs font-bold text-emerald-500">Tier 2: Code Screening</div>
                <div className="text-[11px] text-muted mt-0.5">Algorithmic & system design</div>
              </div>
              <div className="p-3 rounded-lg bg-surface-elevated dark:bg-black/50 border border-border/60">
                <div className="font-mono text-xs font-bold text-emerald-500">Tier 3: Repo Deep Dive</div>
                <div className="text-[11px] text-muted mt-0.5">Production git history audits</div>
              </div>
              <div className="p-3 rounded-lg bg-surface-elevated dark:bg-black/50 border border-border/60">
                <div className="font-mono text-xs font-bold text-emerald-500">Tier 4: Live Peer Review</div>
                <div className="text-[11px] text-muted mt-0.5">Final executive guild pass</div>
              </div>
            </div>
          </TiltCard>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. 4-STEP EXECUTION PROCESS (KLYDEX 01-04 TIMELINE)
         ───────────────────────────────────────────────────────────── */}
      <section id="process" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-3 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-mono uppercase tracking-wider text-[11px]">
            [ HOW WE EXECUTE ]
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            The 4-Step Engineering Pipeline
          </h2>
          <p className="mt-3 text-sm text-muted">
            Predictable, transparent, and deterministic. From scope blueprint to production delivery.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Step 1 */}
          <TiltCard maxTilt={8} className="p-6 rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-lg flex flex-col justify-between">
            <div>
              <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-4">
                01 //
              </div>
              <h3 className="text-lg font-bold text-foreground">Discovery & Specs</h3>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                Client submits project requirements. The system generates PRJ identifier, sets budget thresholds, and prepares technical milestones.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-border/60 font-mono text-[11px] text-muted-foreground">
              MILESTONE SPECIFICATION
            </div>
          </TiltCard>

          {/* Step 2 */}
          <TiltCard maxTilt={8} className="p-6 rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-lg flex flex-col justify-between">
            <div>
              <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-4">
                02 //
              </div>
              <h3 className="text-lg font-bold text-foreground">Anonymous Claim</h3>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                Verified developers claim project slots using credits. Private anonymous bridges open to review architectural plans without bias.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-border/60 font-mono text-[11px] text-muted-foreground">
              ESCROW CREDIT LOCK
            </div>
          </TiltCard>

          {/* Step 3 */}
          <TiltCard maxTilt={8} className="p-6 rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-lg flex flex-col justify-between">
            <div>
              <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-4">
                03 //
              </div>
              <h3 className="text-lg font-bold text-foreground">Agile Sprints</h3>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                Client selects lead developer. Unselected developers instantly receive full automated refunds. Development commences with CI/CD.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-border/60 font-mono text-[11px] text-muted-foreground">
              BI-WEEKLY DEMO BUILDS
            </div>
          </TiltCard>

          {/* Step 4 */}
          <TiltCard maxTilt={8} className="p-6 rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-lg flex flex-col justify-between">
            <div>
              <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-4">
                04 //
              </div>
              <h3 className="text-lg font-bold text-foreground">Production Launch</h3>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                Final security audit, automated tests pass, zero-downtime deployment, public developer attribution, and escrow release.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-border/60 font-mono text-[11px] text-muted-foreground">
              ZERO-DOWNTIME GO-LIVE
            </div>
          </TiltCard>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. FEATURED 3D PROJECTS SHOWCASE (SHIPPED SYSTEMS)
         ───────────────────────────────────────────────────────────── */}
      <section id="projects" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
          <div>
            <Badge variant="outline" className="mb-3 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-mono uppercase tracking-wider text-[11px]">
              [ PRODUCTION WORK ]
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              Featured Flagship Deployments
            </h2>
            <p className="mt-2 text-sm text-muted max-w-xl">
              Real platforms built and shipped through the Nexus developer network with verified attribution.
            </p>
          </div>
          <Link href="/projects">
            <Button variant="outline" className="border-border hover:border-emerald-500/50" rightIcon={<ArrowRight className="h-4 w-4" />}>
              View All Projects
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Project 1 */}
          <TiltCard maxTilt={8} className="rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-xl overflow-hidden group">
            <div className="h-44 bg-gradient-to-br from-emerald-950/80 via-emerald-900/40 to-black p-6 flex flex-col justify-between border-b border-border/60">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-emerald-400 bg-black/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  PRJ-2026-001
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300">
                  SHIPPED
                </span>
              </div>
              <div>
                <span className="text-xs font-mono text-slate-300">FinTech Escrow Engine</span>
                <h4 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">
                  Nexus Ledger & Credit Gateway
                </h4>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted leading-relaxed">
                High-throughput distributed ledger handling concurrent claim locks, atomic refunds, and cryptographic identity anonymization.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-elevated dark:bg-black/40 text-foreground border border-border/40">
                  PostgreSQL 16
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-elevated dark:bg-black/40 text-foreground border border-border/40">
                  TypeScript
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-elevated dark:bg-black/40 text-foreground border border-border/40">
                  Prisma ORM
                </span>
              </div>
            </div>
          </TiltCard>

          {/* Project 2 */}
          <TiltCard maxTilt={8} className="rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-xl overflow-hidden group">
            <div className="h-44 bg-gradient-to-br from-teal-950/80 via-teal-900/40 to-black p-6 flex flex-col justify-between border-b border-border/60">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-teal-400 bg-black/60 px-2 py-0.5 rounded border border-teal-500/30">
                  PRJ-2026-002
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-teal-300">
                  SHIPPED
                </span>
              </div>
              <div>
                <span className="text-xs font-mono text-slate-300">AI Automation Suite</span>
                <h4 className="text-lg font-bold text-white group-hover:text-teal-300 transition-colors">
                  Autonomous Multi-Agent Copilot
                </h4>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted leading-relaxed">
                Real-time streaming agentic assistant with autonomous tool calling, vector database retrieval, and background execution queues.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-elevated dark:bg-black/40 text-foreground border border-border/40">
                  Python AI
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-elevated dark:bg-black/40 text-foreground border border-border/40">
                  LangGraph
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-elevated dark:bg-black/40 text-foreground border border-border/40">
                  FastAPI
                </span>
              </div>
            </div>
          </TiltCard>

          {/* Project 3 */}
          <TiltCard maxTilt={8} className="rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-surface dark:bg-[#121815] shadow-xl overflow-hidden group">
            <div className="h-44 bg-gradient-to-br from-slate-900 via-emerald-950/40 to-black p-6 flex flex-col justify-between border-b border-border/60">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-emerald-400 bg-black/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  PRJ-2026-003
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300">
                  SHIPPED
                </span>
              </div>
              <div>
                <span className="text-xs font-mono text-slate-300">3D Interactive Platform</span>
                <h4 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">
                  WebGL Logistics Command Hub
                </h4>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted leading-relaxed">
                Global real-time telemetry dashboard with interactive 3D globe visualization, container route tracking, and automated dispatch alerts.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-elevated dark:bg-black/40 text-foreground border border-border/40">
                  Three.js
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-elevated dark:bg-black/40 text-foreground border border-border/40">
                  WebSockets
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-elevated dark:bg-black/40 text-foreground border border-border/40">
                  Docker
                </span>
              </div>
            </div>
          </TiltCard>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          6. EXECUTIVE GOVERNANCE & LEADERSHIP (KLYDEX CARDS)
         ───────────────────────────────────────────────────────────── */}
      <section id="leadership" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 border-t border-border/80 pt-20 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-3 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-mono uppercase tracking-wider text-[11px]">
            [ GOVERNANCE & OVERSIGHT ]
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            Company Leadership
          </h2>
          <p className="mt-3 text-sm text-muted">
            Direct executive governance ensuring developer screening, credit ledger stability, and high-standard delivery.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* CEO Card */}
          <TiltCard maxTilt={6} className="p-8 rounded-2xl border border-border/80 dark:border-emerald-500/25 bg-surface dark:bg-[#121815] shadow-xl">
            <div className="flex items-center space-x-4 mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-lg font-mono">
                SG
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">{leadership.ceo.name}</h3>
                <p className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {leadership.ceo.title} ({leadership.ceo.role})
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted pt-2">
              {leadership.ceo.bio} Direct administrative control, user governance, payment management, and community moderation.
            </p>
            <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
              <span>ADMINISTRATIVE GOVERNANCE</span>
              <span className="text-emerald-500 font-semibold">VERIFIED</span>
            </div>
          </TiltCard>

          {/* MD Card */}
          <TiltCard maxTilt={6} className="p-8 rounded-2xl border border-border/80 dark:border-emerald-500/25 bg-surface dark:bg-[#121815] shadow-xl">
            <div className="flex items-center space-x-4 mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-600 dark:text-teal-400 font-bold text-lg font-mono">
                RL
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">{leadership.md.name}</h3>
                <p className="text-xs font-mono font-semibold text-teal-600 dark:text-teal-400">
                  {leadership.md.title} ({leadership.md.role})
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted pt-2">
              {leadership.md.bio} Technical execution, developer team operations, client milestone visibility, and analytics.
            </p>
            <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
              <span>OPERATIONS & ARCHITECTURE</span>
              <span className="text-teal-500 font-semibold">VERIFIED</span>
            </div>
          </TiltCard>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          7. HIGH-CONVERSION BOTTOM CALL TO ACTION (KLYDEX STYLE)
         ───────────────────────────────────────────────────────────── */}
      <section id="cta" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-[#101914] via-[#0b130f] to-[#070c09] text-white p-8 md:p-14 text-center relative overflow-hidden shadow-2xl">
          {/* Radial ambient glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/15 blur-[100px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-500/10 blur-[100px] rounded-full pointer-events-none" />

          <div className="inline-flex items-center space-x-2 rounded-full border border-emerald-500/30 bg-emerald-950/60 px-4 py-1.5 text-xs font-mono text-emerald-300 mb-6">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>COMMISSION YOUR NEXT SYSTEM WITH ZERO RISK</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight max-w-3xl mx-auto leading-tight">
            Ready to Build Your Next Breakthrough System?
          </h2>

          <p className="mt-4 text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Whether you are an enterprise client commissioning mission-critical software or a top-tier engineer seeking verified credit-backed projects.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link href="/start-project">
              <Button
                size="lg"
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold shadow-lg shadow-emerald-500/25 border-0 hover:shadow-emerald-400/40 transition-all hover:-translate-y-0.5"
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Submit a Project
              </Button>
            </Link>
            <Link href="/join-developer">
              <Button
                size="lg"
                variant="outline"
                className="border-white/20 hover:border-emerald-400/60 bg-white/5 hover:bg-white/10 text-white backdrop-blur-md transition-all"
              >
                Join as Verified Developer
              </Button>
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-8 text-xs font-mono text-slate-400 border-t border-white/10 pt-8">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>100% KYC Verified Engineers</span>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="h-4 w-4 text-emerald-400" />
              <span>Zero Credit Risk on Non-Selection</span>
            </div>
            <div className="flex items-center space-x-2">
              <Lock className="h-4 w-4 text-emerald-400" />
              <span>Bank-Grade Ledger Security</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
