'use client';

import React from 'react';
import { motion, useMotionTemplate } from 'motion/react';
import { useAuroraColor } from '@/context/AuroraColorContext';

export interface AuroraSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  label?: string;
}

const SIZES = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-10 h-10 border-3',
  xl: 'w-16 h-16 border-4',
};

export function AuroraSpinner({ size = 'md', className = '', label }: AuroraSpinnerProps) {
  const color = useAuroraColor();
  const borderStyle = useMotionTemplate`${color}`;

  return (
    <div className={`inline-flex flex-col items-center justify-center gap-3 ${className}`}>
      <motion.div
        style={{
          borderColor: borderStyle,
          borderTopColor: 'transparent',
        }}
        className={`rounded-full animate-spin ${SIZES[size]}`}
        role="status"
        aria-label="Loading"
      />
      {label && (
        <span className="text-xs font-mono text-gray-400 tracking-wider">
          {label}
        </span>
      )}
    </div>
  );
}

export default AuroraSpinner;
