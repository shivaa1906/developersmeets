'use client';

import * as React from 'react';

interface HeroQuote {
  text: string;
  highlight?: string;
}

const HERO_QUOTES: HeroQuote[] = [
  {
    text: 'BUILD. CREATE. INNOVATE.',
    highlight: 'CREATE.',
  },
  {
    text: 'FIRST SOLVE THE PROBLEM. THEN WRITE THE CODE.',
    highlight: 'WRITE THE CODE.',
  },
  {
    text: 'SIMPLICITY IS PREREQUISITE FOR RELIABILITY.',
    highlight: 'SIMPLICITY',
  },
  {
    text: 'MAKE IT WORK. MAKE IT RIGHT. MAKE IT FAST.',
    highlight: 'MAKE IT FAST.',
  },
];

export function HeroHeadlineTypewriter() {
  const [quoteIndex, setQuoteIndex] = React.useState(0);
  const [displayedText, setDisplayedText] = React.useState(HERO_QUOTES[0].text);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isWaiting, setIsWaiting] = React.useState(true);

  const currentQuote = HERO_QUOTES[quoteIndex];

  React.useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isWaiting) {
      // Exactly 5 seconds display hold time before erasing
      timer = setTimeout(() => {
        setIsWaiting(false);
        setIsDeleting(true);
      }, 5000);
      return () => clearTimeout(timer);
    }

    if (isDeleting) {
      if (displayedText.length > 0) {
        timer = setTimeout(() => {
          setDisplayedText((prev) => prev.slice(0, -1));
        }, 22);
      } else {
        // Finished deleting, advance to next quote
        setIsDeleting(false);
        setQuoteIndex((prev) => (prev + 1) % HERO_QUOTES.length);
      }
      return () => clearTimeout(timer);
    }

    // Typing phase
    if (displayedText.length < currentQuote.text.length) {
      timer = setTimeout(() => {
        setDisplayedText(currentQuote.text.slice(0, displayedText.length + 1));
      }, 38);
    } else {
      // Completed typing full quote, begin 5-second pause
      setIsWaiting(true);
    }

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, isWaiting, currentQuote.text]);

  const renderHighlightedContent = () => {
    if (currentQuote.highlight && displayedText.includes(currentQuote.highlight)) {
      const parts = displayedText.split(currentQuote.highlight);
      return (
        <>
          <span>{parts[0]}</span>
          <span className="text-accent">{currentQuote.highlight}</span>
          <span>{parts.slice(1).join(currentQuote.highlight)}</span>
        </>
      );
    }
    return <span>{displayedText}</span>;
  };

  return (
    <div className="min-h-[110px] sm:min-h-[145px] md:min-h-[185px] flex items-center justify-center">
      <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-foreground uppercase max-w-5xl mx-auto leading-tight text-center">
        {renderHighlightedContent()}
        <span
          className="inline-block w-1.5 sm:w-2 md:w-2.5 h-7 sm:h-11 md:h-14 ml-1.5 sm:ml-2.5 bg-accent align-middle animate-pulse rounded-sm"
          style={{ animationDuration: '0.8s' }}
          aria-hidden="true"
        />
      </h1>
    </div>
  );
}

// Backwards compatibility alias
export const TypewriterQuotes = HeroHeadlineTypewriter;
