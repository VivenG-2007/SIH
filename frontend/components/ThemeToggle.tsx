'use client';

import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme, ThemeMode } from '@/context/ThemeContext';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
    { mode: 'dark', label: 'Dark (Obsidian)', icon: Moon },
    { mode: 'light', label: 'Light (Enterprise)', icon: Sun },
    { mode: 'system', label: 'System Theme', icon: Monitor },
  ];

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        suppressHydrationWarning
        onClick={() => setDropdownOpen((prev) => !prev)}
        aria-label={`Current theme: ${theme}. Click to change theme.`}
        title={`Current theme: ${theme} (${resolvedTheme})`}
        className={`relative w-8 h-8 rounded-lg border border-border-default bg-bg-card hover:bg-bg-subtle text-text-secondary hover:text-text-primary transition-all flex items-center justify-center shadow-sm ${className}`}
      >
        {resolvedTheme === 'dark' ? (
          <Moon size={15} strokeWidth={1.75} className="text-accent-cyan transition-transform duration-300" />
        ) : (
          <Sun size={15} strokeWidth={1.75} className="text-accent-amber transition-transform duration-300" />
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl bg-bg-card border border-border-default shadow-xl py-1.5 z-50 animate-fade-rise-in">
          <div className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-text-muted border-b border-border-default mb-1">
            Interface Theme
          </div>
          {options.map(({ mode, label, icon: Icon }) => {
            const isSelected = theme === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setTheme(mode);
                  setDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-left ${
                  isSelected
                    ? 'bg-accent-cyan-soft text-accent-cyan font-medium'
                    : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={14} strokeWidth={1.75} />
                  <span>{label}</span>
                </div>
                {isSelected && <Check size={13} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
