'use client';

import React from 'react';
import {
  Code2,
  Cpu,
  Database,
  Layers,
  Server,
  Shield,
  Zap,
  Boxes,
  Globe,
  GitBranch,
  Terminal,
  Workflow,
} from 'lucide-react';

interface TechItem {
  name: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TECHNOLOGIES: TechItem[] = [
  { name: 'Next.js 14 App Router', category: 'Frontend', icon: Layers },
  { name: 'TypeScript Strict', category: 'Core', icon: Code2 },
  { name: 'Python AI / PyTorch', category: 'Intelligence', icon: Cpu },
  { name: 'PostgreSQL 16 Enterprise', category: 'Data', icon: Database },
  { name: 'Three.js 3D WebGL', category: 'Graphics', icon: Boxes },
  { name: 'Docker & Kubernetes', category: 'DevOps', icon: Server },
  { name: 'Prisma Transaction Ledgers', category: 'ORM', icon: GitBranch },
  { name: 'Redis Micro-Queues', category: 'Cache', icon: Zap },
  { name: 'Tailwind CSS Modern', category: 'Styling', icon: Globe },
  { name: 'Zero-Bias Anonymous Escrow', category: 'Security', icon: Shield },
  { name: 'n8n Workflow Automation', category: 'Orchestration', icon: Workflow },
  { name: 'Linux Kernel Cloud', category: 'Infra', icon: Terminal },
];

export function MarqueeTicker() {
  // Duplicate array to create a seamless infinite scrolling loop
  const duplicatedTechs = [...TECHNOLOGIES, ...TECHNOLOGIES];

  return (
    <div className="relative w-full overflow-hidden border-y border-border/80 bg-surface/40 dark:bg-black/40 backdrop-blur-md py-4 select-none">
      {/* Edge gradient masks for smooth fade in/out */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-24 sm:w-40 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-24 sm:w-40 bg-gradient-to-l from-background to-transparent" />

      <div className="flex w-max animate-marquee hover:[animation-play-state:paused] space-x-6">
        {duplicatedTechs.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={`${item.name}-${index}`}
              className="flex items-center space-x-3 rounded-full border border-border/70 dark:border-emerald-500/20 bg-surface-elevated/80 dark:bg-[#121915]/80 px-4 py-2 shadow-sm transition-all hover:border-emerald-500/50 hover:bg-emerald-500/10 group cursor-default"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500/20 group-hover:scale-110 transition-transform">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="font-mono text-xs font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                {item.name}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80 bg-surface dark:bg-black/60 px-2 py-0.5 rounded border border-border/40">
                {item.category}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
