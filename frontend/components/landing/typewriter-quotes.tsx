'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HeroQuote {
  text: string;
  highlight?: string;
}

const HERO_QUOTES: HeroQuote[] = [
  {
    text: 'Building production-grade software with verified engineers.',
    highlight: 'verified engineers.',
  },
  {
    text: 'Zero-bias project matching. Guaranteed escrow delivery.',
    highlight: 'Guaranteed escrow delivery.',
  },
  {
    text: 'First solve the problem. Then write the code.',
    highlight: 'write the code.',
  },
  {
    text: 'Architected for reliability. Engineered for scale.',
    highlight: 'Engineered for scale.',
  },
];

/**
 * Optical Focus Fade Quote Rotator with Klydex Emerald Typography
 */
export function CinematicQuotes({ className }: { className?: string } = {}) {
  const [index, setIndex] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);

  React.useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % HERO_QUOTES.length);
    }, 4500);

    return () => clearInterval(interval);
  }, [isPaused]);

  const currentQuote = HERO_QUOTES[index];

  const renderHighlightedContent = () => {
    if (currentQuote.highlight && currentQuote.text.includes(currentQuote.highlight)) {
      const parts = currentQuote.text.split(currentQuote.highlight);
      return (
        <>
          <span>{parts[0]}</span>
          <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 dark:from-emerald-400 dark:via-teal-300 dark:to-emerald-500 bg-clip-text text-transparent font-extrabold">
            {currentQuote.highlight}
          </span>
          <span>{parts.slice(1).join(currentQuote.highlight)}</span>
        </>
      );
    }
    return <span>{currentQuote.text}</span>;
  };

  return (
    <div
      className="min-h-[110px] sm:min-h-[140px] md:min-h-[170px] flex flex-col items-center justify-center relative select-none w-full"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="w-full max-w-5xl mx-auto px-2 flex items-center justify-center overflow-hidden py-2">
        <AnimatePresence mode="wait">
          <motion.h1
            key={index}
            initial={{
              opacity: 0,
              filter: 'blur(14px)',
              scale: 0.97,
              y: 6,
            }}
            animate={{
              opacity: 1,
              filter: 'blur(0px)',
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              filter: 'blur(14px)',
              scale: 1.03,
              y: -6,
            }}
            transition={{
              duration: 0.65,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={`text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-4xl leading-[1.12] text-center will-change-[transform,filter,opacity] ${className || ''}`}
          >
            {renderHighlightedContent()}
          </motion.h1>
        </AnimatePresence>
      </div>

      {/* Subtle indicator dots */}
      <div className="flex items-center space-x-2 mt-3">
        {HERO_QUOTES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-1.5 transition-all duration-300 rounded-full ${
              i === index
                ? 'w-7 bg-emerald-500 dark:bg-emerald-400'
                : 'w-2 bg-border hover:bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
