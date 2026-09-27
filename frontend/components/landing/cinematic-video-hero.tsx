'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ArrowRight,
  Cpu,
  ShieldCheck,
  Coins,
  Radio,
  Terminal,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CinematicQuotes } from '@/components/landing/typewriter-quotes';

export function CinematicVideoHero() {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = React.useState(true);
  const [isMuted, setIsMuted] = React.useState(true);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(8);
  const [isVideoLoaded, setIsVideoLoaded] = React.useState(false);

  // Handle video playback synchronization
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };

    const onLoadedMetadata = () => {
      setDuration(video.duration || 8);
      setIsVideoLoaded(true);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * video.duration;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <section ref={containerRef} className="relative pt-12 md:pt-16 pb-16 overflow-hidden">
      {/* Cinematic Ambient Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-accent/20 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[400px] h-[350px] bg-electric-purple/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Top HUD Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div className="inline-flex items-center space-x-2 rounded-full border border-accent/40 bg-accent/10 backdrop-blur-md px-3.5 py-1 text-xs font-semibold text-accent shadow-[0_0_15px_rgba(2,132,199,0.25)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            <span className="font-mono uppercase tracking-wider text-[11px]">Developer Company OS 2.0</span>
          </div>

          <div className="hidden sm:flex items-center space-x-3 text-[11px] font-mono text-muted">
            <span className="flex items-center gap-1.5 border border-border/80 bg-surface/70 backdrop-blur-md px-2.5 py-1 rounded-md">
              <Radio className="h-3 w-3 text-emerald-500 animate-pulse" />
              <span>LIVE PROTOCOL: ACTIVE</span>
            </span>
            <span className="border border-border/80 bg-surface/70 backdrop-blur-md px-2.5 py-1 rounded-md">
              FEED // 1080P 24FPS
            </span>
            <span className="border border-border/80 bg-surface/70 backdrop-blur-md px-2.5 py-1 rounded-md text-accent">
              ATOMIC LEDGER: VERIFIED
            </span>
          </div>
        </div>

        {/* Headline with Infosys-style Optical Blur Autoloop Quotes */}
        <div className="text-center mb-8">
          <CinematicQuotes />
          <p className="mt-4 text-base sm:text-lg md:text-xl text-muted max-w-2xl mx-auto font-normal leading-relaxed">
            Developer-powered technology company building mission-critical digital products. Verified talent, anonymous project claims, credit ledgers, and seamless execution.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/projects">
              <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Explore Projects
              </Button>
            </Link>
            <Link href="/join-developer">
              <Button variant="secondary" size="lg">
                Join Developer Network
              </Button>
            </Link>
            <Link href="/start-project">
              <Button variant="outline" size="lg">
                Start a Project
              </Button>
            </Link>
          </div>
        </div>

        {/* 🎬 MAIN CINEMATIC VIDEO STAGE (Visual Experience) */}
        <div className="relative mt-12 rounded-2xl md:rounded-3xl border border-accent/40 bg-surface-elevated/90 shadow-[0_20px_70px_-15px_rgba(2,132,199,0.3)] overflow-hidden transition-all duration-500 group">
          {/* Top Film Reel HUD Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border/70 bg-surface/80 backdrop-blur-md z-20 relative">
            <div className="flex items-center space-x-2">
              <span className="h-2.5 w-2.5 rounded-full bg-status-danger/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-status-warning/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-status-success/80" />
              <span className="ml-2 font-mono text-[11px] font-semibold tracking-wider text-muted uppercase">
                SCENE // 01: DEVELOPER FLOW STATE
              </span>
            </div>
            <div className="flex items-center space-x-2 font-mono text-xs text-muted">
              <span className="hidden md:inline-block text-[11px] text-accent/90">
                CAM_A // NEURAL WORKSPACE
              </span>
              <span className="px-2 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-bold uppercase">
                HDR 4K
              </span>
            </div>
          </div>

          {/* Video Container with Overlaid Holographic Elements */}
          <div className="relative aspect-[16/9] sm:aspect-[21/9] md:aspect-[16/7] w-full bg-black overflow-hidden select-none">
            <video
              ref={videoRef}
              src="/videos/hero-developer.mp4"
              poster="/videos/hero-developer-poster.jpg"
              autoPlay
              loop
              muted={isMuted}
              playsInline
              className="w-full h-full object-cover object-center filter contrast-[1.05] brightness-95 transform scale-[1.02] transition-transform duration-1000 group-hover:scale-100"
            />

            {/* Subtle Futuristic Film Overlay Gradients */}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/40 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-transparent to-background/60 pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.6)_100%)] pointer-events-none" />

            {/* Holographic Floating Widget 1: IDE & Live Code (Inspired by holographic code in video) */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="absolute top-4 left-4 sm:top-8 sm:left-8 hidden md:block max-w-xs rounded-xl border border-cyan-400/40 bg-black/60 backdrop-blur-xl p-3.5 shadow-[0_8px_32px_rgba(0,240,255,0.15)] text-left z-20 pointer-events-auto"
            >
              <div className="flex items-center justify-between pb-2 border-b border-cyan-400/20 mb-2">
                <div className="flex items-center space-x-1.5 text-cyan-400 text-xs font-mono">
                  <Terminal className="h-3.5 w-3.5" />
                  <span className="font-bold">escrow.bridge.ts</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  ONLINE
                </span>
              </div>
              <div className="font-mono text-[11px] text-cyan-100/90 leading-relaxed space-y-1">
                <p className="text-slate-400">{'// Anonymous selection'}</p>
                <p>
                  <span className="text-purple-400">const</span> bridge ={' '}
                  <span className="text-yellow-300">await</span> escrow(
                  <span className="text-sky-300">&apos;PRJ-2026&apos;</span>);
                </p>
                <p className="text-emerald-300">✓ 100% Verified Developer</p>
              </div>
            </motion.div>

            {/* Holographic Floating Widget 2: Neural Flow & AI Co-pilot (Inspired by holographic icons) */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="absolute top-4 right-4 sm:top-8 sm:right-8 hidden md:block max-w-xs rounded-xl border border-electric-purple/40 bg-black/60 backdrop-blur-xl p-3.5 shadow-[0_8px_32px_rgba(124,58,237,0.2)] text-left z-20 pointer-events-auto"
            >
              <div className="flex items-center justify-between pb-2 border-b border-purple-400/20 mb-2">
                <div className="flex items-center space-x-1.5 text-purple-400 text-xs font-mono">
                  <Cpu className="h-3.5 w-3.5" />
                  <span className="font-bold">NEURAL FLOW // 2.0</span>
                </div>
                <span className="text-[10px] font-mono text-purple-300 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/30">
                  LOCKED
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-200">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-slate-400">Flow State:</span>
                  <span className="text-accent font-bold">Synchronized</span>
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-slate-400">AI Co-Pilot:</span>
                  <span className="text-emerald-400 font-bold">Active</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1">
                  <div className="bg-gradient-to-r from-accent to-purple-500 h-full w-[94%]" />
                </div>
              </div>
            </motion.div>

            {/* Holographic Floating Widget 3: Live Anonymous Transaction (Center Bottom) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="absolute bottom-16 left-1/2 -translate-x-1/2 hidden lg:flex items-center space-x-4 rounded-full border border-white/20 bg-black/70 backdrop-blur-xl px-5 py-2 shadow-2xl z-20"
            >
              <div className="flex items-center space-x-2 text-xs font-mono text-slate-200">
                <Coins className="h-3.5 w-3.5 text-yellow-400" />
                <span className="font-bold">₹50 / Claim Credit</span>
              </div>
              <span className="h-3 w-px bg-white/20" />
              <div className="flex items-center space-x-2 text-xs font-mono text-slate-200">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Instant Auto-Refunds</span>
              </div>
              <span className="h-3 w-px bg-white/20" />
              <div className="flex items-center space-x-2 text-xs font-mono text-accent">
                <Activity className="h-3.5 w-3.5 animate-pulse" />
                <span>Anonymous Bridge Enabled</span>
              </div>
            </motion.div>

            {/* Video Controls Bar Overlay (Play, Mute, Scrubber, Fullscreen) */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 sm:p-4 z-30 flex flex-col gap-2">
              {/* Scrubbable Timeline Progress */}
              <div
                onClick={handleSeek}
                className="w-full h-1.5 sm:h-2 bg-white/20 hover:bg-white/30 rounded-full cursor-pointer relative overflow-hidden transition-all group/scrub"
              >
                <div
                  className="h-full bg-gradient-to-r from-accent via-sky-400 to-indigo-500 rounded-full relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover/scrub:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Bottom Controller Buttons */}
              <div className="flex items-center justify-between text-white text-xs font-mono">
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Pause video' : 'Play video'}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors focus:outline-none"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors focus:outline-none"
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-accent" />}
                  </button>

                  <span className="text-[11px] text-slate-300">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="hidden sm:inline-block text-[11px] text-slate-400">
                    AI DEVELOPER EXPERIENCE REEL
                  </span>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors focus:outline-none"
                  >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Lower Glass Console: Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border/60 bg-surface/90 border-t border-border/80">
            <div className="p-4 sm:p-5 text-left">
              <div className="text-2xl sm:text-3xl font-bold text-accent font-mono">100%</div>
              <div className="text-xs text-muted mt-1 uppercase tracking-wider font-semibold">Verified Developers</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Strict KYC & tech screening</div>
            </div>
            <div className="p-4 sm:p-5 text-left">
              <div className="text-2xl sm:text-3xl font-bold text-foreground font-mono">₹50 / Cr</div>
              <div className="text-xs text-muted mt-1 uppercase tracking-wider font-semibold">Configurable Claims</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Pay only to submit verified bids</div>
            </div>
            <div className="p-4 sm:p-5 text-left">
              <div className="text-2xl sm:text-3xl font-bold text-electric-purple font-mono">Atomic</div>
              <div className="text-xs text-muted mt-1 uppercase tracking-wider font-semibold">Automatic Refunds</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Zero credit risk if unselected</div>
            </div>
            <div className="p-4 sm:p-5 text-left">
              <div className="text-2xl sm:text-3xl font-bold text-foreground font-mono">Private</div>
              <div className="text-xs text-muted mt-1 uppercase tracking-wider font-semibold">Anonymous Bridge</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Zero bias client-dev matching</div>
            </div>
          </div>
        </div>

        {/* 🎬 CINEMATIC SCENE / STORYLINE NAVIGATOR (Like Chapters of a Film) */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-3 p-2 rounded-2xl border border-border/70 bg-surface/50 backdrop-blur-md max-w-4xl mx-auto text-xs font-mono">
          <span className="text-[10px] text-muted px-2 uppercase font-semibold">Scene Index:</span>
          <a
            href="#protocol"
            className="px-3 py-1.5 rounded-lg border border-transparent hover:border-accent/40 hover:bg-accent/10 transition-colors text-foreground"
          >
            01 // The Architecture
          </a>
          <a
            href="#technologies"
            className="px-3 py-1.5 rounded-lg border border-transparent hover:border-accent/40 hover:bg-accent/10 transition-colors text-foreground"
          >
            02 // Tech Stack
          </a>
          <a
            href="#pipeline"
            className="px-3 py-1.5 rounded-lg border border-transparent hover:border-accent/40 hover:bg-accent/10 transition-colors text-foreground"
          >
            03 // Ecosystem Pipeline
          </a>
          <a
            href="#leadership"
            className="px-3 py-1.5 rounded-lg border border-transparent hover:border-accent/40 hover:bg-accent/10 transition-colors text-foreground"
          >
            04 // Leadership
          </a>
          <a
            href="#cta"
            className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 font-semibold hover:bg-accent/25 transition-colors"
          >
            05 // Launch Project →
          </a>
        </div>
      </div>
    </section>
  );
}
