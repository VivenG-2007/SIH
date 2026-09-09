'use client';

import React from 'react';
import { motion, useMotionTemplate } from 'motion/react';
import { useAuroraColor } from '@/context/AuroraColorContext';

export interface AuroraDividerProps {
  className?: string;
  withGlow?: boolean;
}

export function AuroraDivider({ className = '', withGlow = true }: AuroraDividerProps) {
  const color = useAuroraColor();

  const background = useMotionTemplate`linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`;
  const glow = useMotionTemplate`0 0 20px ${color}`;

  return (
    <div className={`relative w-full py-8 overflow-hidden flex items-center justify-center ${className}`}>
      <motion.div
        style={{
          background,
          boxShadow: withGlow ? glow : 'none',
        }}
        className="w-full h-[1px] opacity-70"
      />
    </div>
  );
}

export default AuroraDivider;
