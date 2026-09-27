'use client';

import * as React from 'react';
import { Quote, Sparkles } from 'lucide-react';

interface QuoteItem {
  text: string;
  author: string;
  role: string;
}

const QUOTES: QuoteItem[] = [
  {
    text: 'First, solve the problem. Then, write the code.',
    author: 'John Johnson',
    role: 'Software Architect & Engineering Pioneer',
  },
  {
    text: 'Simplicity is prerequisite for reliability.',
    author: 'Edsger W. Dijkstra',
    role: 'Turing Award Winner & Computer Scientist',
  },
  {
    text: 'Make it work, make it right, make it fast.',
    author: 'Kent Beck',
    role: 'Software Engineer & Agile Methodology Pioneer',
  },
  {
    text: 'Good programmers write code that humans can understand.',
    author: 'Martin Fowler',
    role: 'Chief Scientist & Enterprise Systems Author',
  },
];

export function TypewriterQuotes() {
  const [quoteIndex, setQuoteIndex] = React.useState(0);
  const [displayedText, setDisplayedText] = React.useState('');
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isWaiting, setIsWaiting] = React.useState(false);

  const currentQuote = QUOTES[quoteIndex];

  React.useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isWaiting) {
      // 5-second hold time after fully typing the quote
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
        // Finished deleting, transition to next quote
        setIsDeleting(false);
        setQuoteIndex((prev) => (prev + 1) % QUOTES.length);
      }
      return () => clearTimeout(timer);
    }

    // Typing phase
    if (displayedText.length < currentQuote.text.length) {
      timer = setTimeout(() => {
        setDisplayedText(currentQuote.text.slice(0, displayedText.length + 1));
      }, 40);
    } else {
      // Finished typing full quote, start 5-second display pause
      setIsWaiting(true);
    }

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, isWaiting, currentQuote.text]);

  return (
    <div className="w-full max-w-3xl mx-auto my-8 px-4">
      <div className="relative rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-surface-card overflow-hidden">
        {/* Decorative corner accent badge */}
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
          <div className="inline-flex items-center space-x-2 text-xs font-semibold text-accent uppercase tracking-wider">
            <Quote className="h-4 w-4" />
            <span>Engineering Philosophy</span>
          </div>

          {/* Indicator dots for 4 quotes */}
          <div className="flex items-center space-x-1.5" aria-label={`Quote ${quoteIndex + 1} of ${QUOTES.length}`}>
            {QUOTES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === quoteIndex
                    ? 'w-6 bg-accent'
                    : 'w-1.5 bg-muted/40'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Typed quote container with fixed minimum height to prevent layout shifts */}
        <div className="min-h-[72px] sm:min-h-[84px] flex items-center">
          <p className="text-lg sm:text-2xl font-medium tracking-tight text-foreground font-mono leading-relaxed">
            &ldquo;{displayedText}&rdquo;
            <span
              className="inline-block w-2 sm:w-2.5 h-5 sm:h-6 ml-1 bg-accent align-middle animate-pulse"
              style={{ animationDuration: '0.8s' }}
              aria-hidden="true"
            />
          </p>
        </div>

        {/* Author metadata footer */}
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-foreground">{currentQuote.author}</span>
            <span className="text-muted">•</span>
            <span className="text-muted hidden sm:inline">{currentQuote.role}</span>
          </div>
          <span className="text-[11px] font-mono text-muted/70 bg-surface-elevated px-2 py-0.5 rounded border border-border">
            auto-loop • 5s
          </span>
        </div>
      </div>
    </div>
  );
}
