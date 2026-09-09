'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, useMotionTemplate } from 'motion/react';
import { ShieldCheck, Menu, X } from 'lucide-react';
import { useAuroraColor } from '@/context/AuroraColorContext';

interface NavItem {
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Product', href: '#product' },
  { label: 'Features', href: '#features' },
  { label: 'Stats', href: '#stats' },
  { label: 'Testimonials', href: '#testimonials' },
  { label: 'Pricing', href: '#pricing' },
];

export function AuroraNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const color = useAuroraColor();
  const borderBottom = useMotionTemplate`1px solid ${color}`;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.header
      style={{
        borderBottom: scrolled ? borderBottom : '1px solid transparent',
      }}
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-500 ${
        scrolled
          ? 'bg-gray-950/75 backdrop-blur-md shadow-2xl'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
            <ShieldCheck size={20} strokeWidth={2.2} />
          </div>
          <span className="font-display font-bold text-xl text-white tracking-tight">
            Patchline X <span className="font-mono text-xs opacity-75 font-normal">AI</span>
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item, idx) => (
            <Link
              key={item.label}
              href={item.href}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="relative px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              <span>{item.label}</span>
              {hoveredIndex === idx && (
                <motion.span
                  layoutId="auroraNavUnderline"
                  style={{ backgroundColor: color }}
                  className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full shadow-[0_0_12px_currentColor]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </Link>
          ))}
        </nav>

        {/* Action Button */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/login"
            className="text-xs font-mono text-gray-300 hover:text-white transition-colors"
          >
            Sign In
          </Link>
          <Link href="/login?mode=register">
            <motion.div
              style={{
                borderColor: color,
                boxShadow: useMotionTemplate`0 0 16px -2px ${color}`,
              }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="px-4 py-2 rounded-full border bg-white/5 text-xs font-mono font-semibold text-white backdrop-blur-sm cursor-pointer transition-colors hover:bg-white/10"
            >
              Get Started →
            </motion.div>
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          className="md:hidden p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden px-6 py-4 bg-gray-950/95 border-b border-white/10 backdrop-blur-xl space-y-3"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm text-gray-300 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
            <Link
              href="/login"
              className="text-center py-2 text-xs font-mono text-gray-300"
            >
              Sign In
            </Link>
            <Link
              href="/login?mode=register"
              className="text-center py-2.5 rounded-xl bg-white text-gray-950 font-mono text-xs font-semibold"
            >
              Launch Console
            </Link>
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}

export default AuroraNavbar;
