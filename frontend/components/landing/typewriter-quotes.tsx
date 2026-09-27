'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HeroQuote {
  text: string;
  highlight?: string;
}

const HERO_QUOTES: HeroQuote[] = [
  {
    text: 'Build. Create. Innovate.',
    highlight: 'Innovate.',
  },
  {
    text: 'First solve the problem. Then write the code.',
    highlight: 'write the code.',
  },
  {
    text: 'Simplicity is prerequisite for reliability.',
    highlight: 'reliability.',
  },
  {
    text: 'Make it work. Make it right. Make it fast.',
    highlight: 'Make it fast.',
  },
];

/**
 * Cinematic Gaussian Blur & Focus Fade Quote Rotator
 * Replicates the optical focus, motion blur, and smooth dissolution
 * seen in the modern Infosys Topaz/Cobalt enterprise showcase video.
 */
export function CinematicQuotes() {
  const [index, setIndex] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);

  React.useEffect(() => {
    if (isPaused) return;

    // 5-second autoloop interval
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % HERO_QUOTES.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isPaused]);

  const currentQuote = HERO_QUOTES[index];

  const renderHighlightedContent = () => {
    if (currentQuote.highlight && currentQuote.text.includes(currentQuote.highlight)) {
      const parts = currentQuote.text.split(currentQuote.highlight);
      return (
        <>
          <span>{parts[0]}</span>
          <span className="bg-gradient-to-r from-accent via-sky-500 to-indigo-600 dark:from-accent dark:via-sky-400 dark:to-indigo-400 bg-clip-text text-transparent font-black">
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
      className="min-h-[120px] sm:min-h-[160px] md:min-h-[210px] flex flex-col items-center justify-center relative select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="w-full max-w-5xl mx-auto px-4 flex items-center justify-center overflow-hidden py-4">
        <AnimatePresence mode="wait">
          <motion.h1
            key={index}
            initial={{
              opacity: 0,
              filter: 'blur(18px)',
              scale: 0.96,
              y: 8,
            }}
            animate={{
              opacity: 1,
              filter: 'blur(0px)',
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              filter: 'blur(18px)',
              scale: 1.04,
              y: -8,
            }}
            transition={{
              duration: 0.75,
              ease: [0.16, 1, 0.3, 1], // Cinematic optical lens ease curve
            }}
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-foreground max-w-5xl leading-[1.15] text-center will-change-[transform,filter,opacity] drop-shadow-sm"
          >
            {renderHighlightedContent()}
          </motion.h1>
        </AnimatePresence>
      </div>

      {/* Subtle Cinematic Progress Dots */}
      <div className="flex items-center justify-center space-x-2 mt-2">
        {HERO_QUOTES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Jump to quote ${i + 1}`}
            className="group py-2 px-1 focus:outline-none"
          >
            <span
              className={`block h-1.5 rounded-full transition-all duration-500 ${
                i === index
                  ? 'w-8 bg-accent shadow-[0_0_12px_rgba(59,130,246,0.5)]'
                  : 'w-2 bg-muted/30 group-hover:bg-muted/60'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// Backwards compatibility aliases for existing imports
export const HeroHeadlineTypewriter = CinematicQuotes;
export const TypewriterQuotes = CinematicQuotes;
