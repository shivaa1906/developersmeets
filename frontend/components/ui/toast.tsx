'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextType {
  toasts: ToastMessage[];
  addToast: (type: ToastType, title: string, description?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const addToast = React.useCallback((type: ToastType, title: string, description?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className={cn(
                'pointer-events-auto flex items-start space-x-3 w-80 rounded-lg border p-4 shadow-xl backdrop-blur-md',
                toast.type === 'success' && 'border-status-success/40 bg-surface-elevated text-status-success',
                toast.type === 'error' && 'border-status-danger/40 bg-surface-elevated text-status-danger',
                toast.type === 'info' && 'border-accent/40 bg-surface-elevated text-accent'
              )}
            >
              <div className="mt-0.5">
                {toast.type === 'success' && <CheckCircle2 className="h-5 w-5" />}
                {toast.type === 'error' && <AlertCircle className="h-5 w-5" />}
                {toast.type === 'info' && <Info className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{toast.title}</p>
                {toast.description && <p className="mt-1 text-xs text-muted">{toast.description}</p>}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-muted hover:text-foreground transition-colors p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
