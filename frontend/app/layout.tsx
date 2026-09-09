import type { Metadata, Viewport } from 'next';
import { Geist, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/components/ToastNotification';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
  display: 'swap',
  preload: true,
});
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  preload: true,
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: 'Patchline X — Autonomous Vulnerability Remediation & Security Intelligence',
  description:
    'AI-reviewed security scans with human-approved, tested pull requests. Find it. Fix it. Verify it. Ship it.',
  keywords: ['security scanner', 'vulnerability remediation', 'SAST', 'AI patch generation', 'OWASP', 'CWE'],
  authors: [{ name: 'Patchline X AI' }],
  metadataBase: new URL('https://patchlinex.ai'),
  openGraph: {
    title: 'Patchline X — Autonomous Vulnerability Remediation',
    description: 'Find it. Fix it. Verify it. Ship it. Zero-regression automated security patches.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#070609' },
    { media: '(prefers-color-scheme: light)', color: '#F7F7F9' },
  ],
};

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('patchlinex_theme')||localStorage.getItem('patchlinex-theme');var m=s==='light'||s==='dark'||s==='system'?s:'dark';var r=m==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):m;var root=document.documentElement;root.setAttribute('data-theme',r);root.setAttribute('data-theme-mode',m);if(r==='dark'){root.classList.add('dark');root.classList.remove('light')}else{root.classList.add('light');root.classList.remove('dark')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* Anti-flicker pre-hydration script */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* DNS prefetch / preconnect for external resources */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
      </head>
      <body className="antialiased min-h-screen bg-bg-base text-text-primary" suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
