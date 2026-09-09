'use client';

import React, { useRef } from 'react';
import { motion, useInView } from 'motion/react';

export interface AuroraRevealProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  yOffset?: number;
  className?: string;
  once?: boolean;
}

export function AuroraReveal({
  children,
  delay = 0,
  duration = 0.6,
  yOffset = 40,
  className = '',
  once = true,
}: AuroraRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, margin: '-50px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: yOffset }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: yOffset }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1], // easeOut
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default AuroraReveal;
