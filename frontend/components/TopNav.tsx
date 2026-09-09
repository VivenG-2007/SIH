'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ShieldCheck, LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ThemeToggle from './ThemeToggle';

const LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#solutions', label: 'Solutions' },
  { href: '#architecture', label: 'Docs' },
  { href: '#pricing', label: 'Pricing' },
];

export default function TopNav() {
  const { user, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setScrolled(y > 24);
      if (y > lastY.current + 4 && y > 120) {
        setHidden(true);
      } else if (y < lastY.current - 4 || y < 120) {
        setHidden(false);
      }
      lastY.current = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-transform duration-300 ${
        hidden ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <div
        className={`transition-all duration-300 border-b ${
          scrolled
            ? 'bg-bg-base/85 backdrop-blur-nav border-border-default shadow-sm'
            : 'bg-transparent border-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-accent-cyan-soft border border-accent-cyan/30 flex items-center justify-center text-accent-cyan shadow-sm group-hover:scale-105 transition-transform">
              <ShieldCheck size={18} strokeWidth={2.2} />
            </div>
            <span className="font-display font-bold text-lg text-text-primary tracking-tight">
              Patchline X <span className="text-accent-cyan font-mono text-xs">AI</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-xs font-medium">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-text-secondary hover:text-text-primary transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 bg-accent-cyan text-white font-medium rounded-lg px-3.5 py-2 text-xs font-mono hover:bg-accent-cyan-strong transition-all shadow-sm active:scale-95"
                >
                  <LayoutDashboard size={14} />
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                  }}
                  title="Log out"
                  className="inline-flex items-center gap-1 text-xs font-mono text-text-secondary hover:text-accent-rose transition-colors px-2 py-1"
                >
                  <LogOut size={13} />
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-xs font-mono text-text-secondary hover:text-text-primary transition-colors px-2">
                  Sign in
                </Link>
                <Link
                  href="/login?mode=register"
                  className="bg-accent-cyan text-white font-medium rounded-lg px-4 py-2 text-xs font-mono hover:bg-accent-cyan-strong transition-all shadow-sm active:scale-95"
                >
                  Start Scanning
                </Link>
              </>
            )}
          </div>

          <button
            className="md:hidden text-text-primary p-1"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-bg-base z-50 animate-fade-in flex flex-col">
          <div className="h-16 flex items-center justify-between px-6 border-b border-border-default">
            <span className="font-display font-bold text-text-primary">Patchline X AI</span>
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="text-text-primary p-1">
              <X size={22} strokeWidth={1.75} />
            </button>
          </div>
          <nav className="flex flex-col px-6 py-8 gap-2 flex-1">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="text-base text-text-primary py-3 border-b border-border-default font-medium"
              >
                {l.label}
              </a>
            ))}
            <div className="flex items-center justify-between py-4 mt-2">
              <span className="text-sm text-text-secondary">Interface Theme</span>
              <ThemeToggle />
            </div>
            <div className="mt-auto space-y-3 pt-6">
              {user ? (
                <>
                  <div className="text-xs font-mono text-text-muted text-center truncate">
                    {user.email}
                  </div>
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="block text-center bg-accent-cyan text-white rounded-xl py-3 text-xs font-mono font-medium shadow-md"
                  >
                    Go to Dashboard
                  </Link>
                  <button
                    onClick={async () => {
                      setMobileOpen(false);
                      await logout();
                    }}
                    className="w-full text-center border border-accent-rose/30 text-accent-rose rounded-xl py-3 text-xs font-mono bg-accent-rose-soft"
                  >
                    Log Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="block text-center border border-border-default rounded-xl py-3 text-xs font-mono text-text-primary bg-bg-card"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/login?mode=register"
                    onClick={() => setMobileOpen(false)}
                    className="block text-center bg-accent-cyan text-white rounded-xl py-3 text-xs font-mono font-medium shadow-md"
                  >
                    Start Scanning
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
