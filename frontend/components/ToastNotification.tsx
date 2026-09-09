'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const duration = toast.duration ?? 4500;
      const newToast: Toast = { ...toast, id };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const config = {
    success: {
      icon: CheckCircle2,
      border: 'border-accent-emerald/40',
      bg: 'bg-bg-card',
      text: 'text-accent-emerald',
      badge: 'bg-accent-emerald-soft text-accent-emerald',
    },
    error: {
      icon: AlertCircle,
      border: 'border-accent-rose/40',
      bg: 'bg-bg-card',
      text: 'text-accent-rose',
      badge: 'bg-accent-rose-soft text-accent-rose',
    },
    warning: {
      icon: AlertTriangle,
      border: 'border-accent-amber/40',
      bg: 'bg-bg-card',
      text: 'text-accent-amber',
      badge: 'bg-accent-amber-soft text-accent-amber',
    },
    info: {
      icon: Info,
      border: 'border-accent-cyan/40',
      bg: 'bg-bg-card',
      text: 'text-accent-cyan',
      badge: 'bg-accent-cyan-soft text-accent-cyan',
    },
  }[toast.type];

  const Icon = config.icon;

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border ${config.border} ${config.bg} shadow-2xl backdrop-blur-md animate-slide-in-right transition-all`}
      role="alert"
    >
      <div className={`w-8 h-8 rounded-lg ${config.badge} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon size={16} strokeWidth={2.2} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary leading-snug">{toast.title}</div>
        {toast.message && (
          <div className="text-xs text-text-secondary mt-1 leading-relaxed">{toast.message}</div>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={toast.action.onClick}
            className="mt-2 text-xs font-mono font-medium text-accent-cyan hover:underline inline-block"
          >
            {toast.action.label} →
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Close notification"
        className="text-text-muted hover:text-text-primary transition-colors shrink-0 p-1"
      >
        <X size={14} />
      </button>
    </div>
  );
}
