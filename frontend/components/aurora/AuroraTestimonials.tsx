'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Quote, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuroraColor } from '@/context/AuroraColorContext';

export interface TestimonialItem {
  id: string;
  quote: string;
  author: string;
  role: string;
  company: string;
}

const DEFAULT_TESTIMONIALS: TestimonialItem[] = [
  {
    id: 't1',
    quote: 'Patchline X transformed our security compliance workflow. It found a critical IDOR vulnerability in staging and opened an isolated PR in less than two minutes.',
    author: 'Alex Rivera',
    role: 'VP of Engineering',
    company: 'FinScale Technologies',
  },
  {
    id: 't2',
    quote: 'The deterministic AST regression gate gives our team absolute confidence that AI-synthesized patches will never break existing production behavior.',
    author: 'Elena Rostova',
    role: 'Principal Security Architect',
    company: 'CloudShield Global',
  },
  {
    id: 't3',
    quote: 'The dual-theme UI and 8-stage stepper made security audits transparent and engaging for both our engineering leads and executive staff.',
    author: 'Marcus Vance',
    role: 'Chief Information Security Officer',
    company: 'Aether Infrastructure',
  },
];

export function AuroraTestimonials({ testimonials = DEFAULT_TESTIMONIALS }: { testimonials?: TestimonialItem[] }) {
  const [current, setCurrent] = useState(0);
  const color = useAuroraColor();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [testimonials.length]);

  const next = () => setCurrent((prev) => (prev + 1) % testimonials.length);
  const prev = () => setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length);

  const t = testimonials[current];

  return (
    <div className="relative max-w-4xl mx-auto px-6 py-12">
      <div className="relative p-8 sm:p-12 rounded-3xl bg-gray-900/60 border border-white/10 backdrop-blur-xl shadow-2xl text-center overflow-hidden">
        {/* Decorative Quote Icon */}
        <div className="w-12 h-12 mx-auto mb-6 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-300">
          <Quote size={24} strokeWidth={1.5} />
        </div>

        <div className="min-h-[140px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="space-y-6"
            >
              <p className="text-base sm:text-xl font-medium text-gray-100 leading-relaxed italic max-w-2xl mx-auto">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div>
                <div className="font-display font-bold text-white text-base">{t.author}</div>
                <div className="text-xs font-mono text-gray-400 mt-0.5">
                  {t.role} · <span className="text-gray-300 font-semibold">{t.company}</span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation & Dots */}
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous testimonial"
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-2">
            {testimonials.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrent(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className="relative p-1 focus:outline-none"
              >
                {idx === current ? (
                  <motion.div
                    layoutId="activeTestimonialDot"
                    style={{ backgroundColor: color }}
                    className="w-6 h-2 rounded-full shadow-[0_0_10px_currentColor]"
                  />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-white/20 hover:bg-white/40 transition-colors" />
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={next}
            aria-label="Next testimonial"
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuroraTestimonials;
