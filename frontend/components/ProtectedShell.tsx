'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  FolderGit2,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  GitPullRequest,
  Settings,
  LogOut,
  CircleDot,
  Menu,
  X,
  ChevronRight,
  Bell,
  Search,
  Activity,
  DollarSign,
  Workflow,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getConnectionStatus } from '@/lib/api';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import CommandSearch from './CommandSearch';
import LoadingScreen from './LoadingScreen';

const NAV = [
  { href: '/dashboard',        label: 'Risk Command Center', icon: LayoutDashboard },
  { href: '/scenario',         label: 'What-If Story',       icon: Workflow },
  { href: '/simulation',       label: 'Portfolio Simulation', icon: Activity },
  { href: '/assessment',       label: 'Quick Assessment',    icon: DollarSign },
  { href: '/scanner',          label: 'Telemetry & Scans',   icon: ScanSearch },
  { href: '/scanner/history',  label: 'Vulnerabilities',     icon: ShieldAlert },
  { href: '/upload',           label: 'Autonomous Fixer',    icon: Sparkles },
  { href: '/jira',             label: 'PRs & Verification',  icon: GitPullRequest },
];


function PatchlinexLogo() {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 relative"
      style={{ background: '#17121D', border: '1px solid #302A38', boxShadow: '0 0 12px rgba(168,85,247,0.18)' }}>
      {/* Patchline X ◈ mark */}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2L16 9L9 16L2 9L9 2Z" stroke="url(#logoGrad)" strokeWidth="1.5" fill="none"/>
        <path d="M9 5L13 9L9 13L5 9L9 5Z" fill="url(#logoGrad)" opacity="0.7"/>
        <defs>
          <linearGradient id="logoGrad" x1="2" y1="2" x2="16" y2="16">
            <stop offset="0%" stopColor="#A855F7"/>
            <stop offset="100%" stopColor="#EC4899"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function SidebarContent({
  pathname,
  setupIncomplete,
  expanded,
  onNavigate,
}: {
  pathname: string | null;
  setupIncomplete: boolean;
  expanded: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* Logo header */}
      <div className="h-14 flex items-center px-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border-divider)' }}>
        <Link href="/dashboard" className="flex items-center gap-3 group" onClick={onNavigate}>
          <PatchlinexLogo />
          <div
            className="overflow-hidden whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              opacity: expanded ? 1 : 0,
              maxWidth: expanded ? '160px' : '0px',
              transform: expanded ? 'translateX(0)' : 'translateX(-8px)',
            }}
          >
            <div className="font-sans font-bold text-[15px] tracking-tight"
              style={{ color: 'var(--foreground)' }}>
              Patch<span style={{ background: 'linear-gradient(135deg,#A855F7,#EC4899)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Line</span>
            </div>
            <div className="text-[10px] font-mono flex items-center gap-1.5"
              style={{ color: '#22C55E' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-dot inline-block" />
              Engine Online
            </div>
          </div>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={!expanded ? label : undefined}
              className={`pl-nav-item ${active ? 'active' : ''}`}
            >
              <span className="pl-nav-icon shrink-0">
                <Icon size={17} strokeWidth={1.7} />
              </span>
              <span
                className="text-[13px] font-medium truncate transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                  opacity: expanded ? 1 : 0,
                  maxWidth: expanded ? '160px' : '0px',
                  transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
                  display: 'inline-block',
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {setupIncomplete && (
          <Link
            href="/onboarding"
            onClick={onNavigate}
            title={!expanded ? 'Finish Setup' : undefined}
            className="pl-nav-item"
            style={{
              marginTop: 8,
              border: '1px dashed rgba(234,179,8,0.35)',
              color: '#EAB308',
            }}
          >
            <CircleDot size={16} strokeWidth={2} className="shrink-0" />
            <span
              className="text-[13px] truncate transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                opacity: expanded ? 1 : 0,
                maxWidth: expanded ? '160px' : '0px',
                transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
                display: 'inline-block',
              }}
            >
              Finish Setup
            </span>
          </Link>
        )}
      </nav>

      {/* Settings + bottom */}
      <div className="px-2 pb-3 shrink-0 space-y-0.5" style={{ borderTop: '1px solid var(--border-divider)', paddingTop: 8 }}>
        <Link
          href="/onboarding"
          onClick={onNavigate}
          title={!expanded ? 'Settings' : undefined}
          className="pl-nav-item"
        >
          <Settings size={17} strokeWidth={1.7} className="shrink-0" />
          <span
            className="text-[13px] font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              opacity: expanded ? 1 : 0,
              maxWidth: expanded ? '160px' : '0px',
              transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
              display: 'inline-block',
            }}
          >
            Settings
          </span>
        </Link>
      </div>

    </>
  );
}

export default function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [setupIncomplete, setSetupIncomplete] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    getConnectionStatus().then(({ githubConnected, jiraConnected }) => {
      setSetupIncomplete(!githubConnected || !jiraConnected);
    });
  }, [user, pathname]);

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileNavOpen(false);
  }

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center font-mono text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent-cyan pulse-dot" />
          <span>Authenticating…</span>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const pathSegments = (pathname || '/').split('/').filter(Boolean);

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>

      {/* Desktop Backdrop Dim & Blur Overlay (fades in behind floating sidebar on hover/expansion) */}
      <div
        className={`hidden md:block fixed inset-0 z-40 transition-all duration-300 pointer-events-none ${
          sidebarExpanded
            ? 'opacity-100 bg-black/30 dark:bg-black/60 backdrop-blur-[3px]'
            : 'opacity-0 bg-transparent'
        }`}
      />

      {/* Desktop Floating Card Sidebar (overlay panel at z-50) */}
      <aside
        className={`hidden md:flex flex-col fixed top-2 left-2 bottom-2 z-50 rounded-2xl overflow-hidden backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          sidebarExpanded
            ? 'w-[235px] shadow-[0_12px_48px_rgba(0,0,0,0.5)] ring-1 ring-border-strong'
            : 'w-[64px] shadow-lg ring-1 ring-border-default'
        }`}
        style={{
          background: 'var(--sidebar-bg)',
        }}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <SidebarContent
          pathname={pathname}
          setupIncomplete={setupIncomplete}
          expanded={sidebarExpanded}
        />
        {/* User avatar at bottom */}
        <div className="px-2 pb-3 shrink-0" style={{ borderTop: '1px solid var(--border-divider)', paddingTop: 8 }}>
          <div
            className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all"
            style={{
              overflow: 'hidden',
              ...(sidebarExpanded ? {} : { justifyContent: 'center' }),
            }}
          >
            <div
              className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-mono text-[11px] font-bold"
              style={{
                background: 'linear-gradient(135deg,#A855F7,#C026D3)',
                color: '#fff',
                minWidth: 28,
              }}
            >
              {user.email.slice(0, 1).toUpperCase()}
            </div>
            {sidebarExpanded && (
              <div className="min-w-0 flex-1 animate-fade-in">
                <div className="text-[12px] font-mono truncate" style={{ color: 'var(--foreground)' }}>
                  {user.email}
                </div>
              </div>
            )}
            {sidebarExpanded && (
              <button
                onClick={handleLogout}
                aria-label="Log out"
                title="Log out to landing page"
                className="shrink-0 transition-colors p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 animate-fade-in"
                style={{ color: 'var(--muted)' }}
              >
                <LogOut size={13} strokeWidth={1.7} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className="relative w-[220px] max-w-[80vw] flex flex-col animate-slide-in-right z-50"
            style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border-divider)' }}
          >
            <button
              className="absolute top-3 right-3 p-1.5 rounded-lg z-10"
              style={{ color: 'var(--muted)' }}
              onClick={() => setMobileNavOpen(false)}
            >
              <X size={16} />
            </button>
            <SidebarContent
              pathname={pathname}
              setupIncomplete={setupIncomplete}
              expanded
              onNavigate={() => setMobileNavOpen(false)}
            />
            <div className="px-3 py-3 shrink-0" style={{ borderTop: '1px solid var(--border-divider)' }}>
              <div className="text-[11px] font-mono truncate mb-2" style={{ color: 'var(--muted)' }}>
                {user.email}
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-mono"
                style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.25)', color: '#F43F5E' }}
              >
                <LogOut size={13} />
                Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Skip link for Accessibility / Lighthouse */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-1.5 focus:bg-primary focus:text-white focus:rounded-md focus:font-mono focus:text-xs"
      >
        Skip to main content
      </a>

      {/* Main content column (constant md:pl-[80px] so main UI NEVER shifts or resizes) */}
      <main id="main-content" className="flex-1 min-w-0 flex flex-col md:pl-[80px]">

        {/* Top header */}
        <header
          className="h-14 shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 sticky top-0 z-30 backdrop-blur-nav transition-colors"
          style={{
            background: 'var(--header-bg)',
            borderBottom: '1px solid var(--header-border)',
          }}
        >

          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              className="md:hidden transition-colors p-1"
              style={{ color: 'var(--muted)' }}
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={19} strokeWidth={1.7} />
            </button>

            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-[12px] font-mono" style={{ color: 'var(--muted-2)' }}>
              <Link href="/dashboard" className="hover:text-foreground transition-colors" style={{ color: 'inherit' }}>
                Patchline X
              </Link>
              {pathSegments.map((seg, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <ChevronRight size={10} />
                  <span
                    className="capitalize transition-colors"
                    style={{ color: i === pathSegments.length - 1 ? 'var(--foreground)' : 'inherit', fontWeight: i === pathSegments.length - 1 ? 600 : 400 }}
                  >
                    {seg}
                  </span>
                </span>
              ))}
            </nav>

            {/* Search */}
            <div className="w-full max-w-xs ml-auto sm:ml-4">
              <CommandSearch />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <NotificationBell />
            <button
              type="button"
              onClick={handleLogout}
              title="Log out to landing page"
              aria-label="Log out of application"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all hover:bg-black/10 dark:hover:bg-white/10"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                color: 'var(--muted)',
              }}
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
