'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { animate, useMotionValue, MotionValue } from 'motion/react';

export const AURORA_COLORS = ['#13FFAA', '#1E67C6', '#CE84CF', '#DD335C'];

interface AuroraColorContextValue {
  color: MotionValue<string>;
  colors: string[];
}

const AuroraColorContext = createContext<AuroraColorContextValue | null>(null);

export function AuroraColorProvider({ children }: { children: React.ReactNode }) {
  const color = useMotionValue(AURORA_COLORS[0]);

  useEffect(() => {
    const controls = animate(color, AURORA_COLORS, {
      ease: 'easeInOut',
      duration: 10,
      repeat: Infinity,
      repeatType: 'mirror',
    });
    return () => controls.stop();
  }, [color]);

  return (
    <AuroraColorContext.Provider value={{ color, colors: AURORA_COLORS }}>
      {children}
    </AuroraColorContext.Provider>
  );
}

export function useAuroraColor(): MotionValue<string> {
  const context = useContext(AuroraColorContext);
  const fallbackColor = useMotionValue(AURORA_COLORS[0]);

  // If outside provider, run standalone loop as fallback
  useEffect(() => {
    if (!context) {
      const controls = animate(fallbackColor, AURORA_COLORS, {
        ease: 'easeInOut',
        duration: 10,
        repeat: Infinity,
        repeatType: 'mirror',
      });
      return () => controls.stop();
    }
  }, [context, fallbackColor]);

  return context ? context.color : fallbackColor;
}
