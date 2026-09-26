'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className }) => {
  return (
    <div className={cn('flex space-x-1 border-b border-border', className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'group relative flex items-center px-4 py-2.5 text-xs font-medium tracking-wide transition-colors focus-visible:outline-none',
              isActive
                ? 'text-accent'
                : 'text-muted hover:text-foreground'
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'bg-surface-elevated text-muted group-hover:text-foreground'
                )}
              >
                {tab.count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent shadow-[0_0_8px_rgba(0,240,255,0.6)]" />
            )}
          </button>
        );
      })}
    </div>
  );
};
