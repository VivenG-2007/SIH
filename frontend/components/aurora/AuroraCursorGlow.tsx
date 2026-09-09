'use client';

import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring, useMotionTemplate } from 'motion/react';
import { useAuroraColor } from '@/context/AuroraColorContext';

export function AuroraCursorGlow() {
  const [isTouch, setIsTouch] = useState(true);
  const color = useAuroraColor();

  const mouseX = useMotionValue(-500);
  const mouseY = useMotionValue(-500);

  const springConfig = { damping: 30, stiffness: 200, mass: 0.5 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  useEffect(() => {
    // Check if device has a fine pointer (mouse)
    const isFine = window.matchMedia('(pointer: fine)').matches;
    setIsTouch(!isFine);

    if (!isFine) return;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  if (isTouch) return null;

  return (
    <motion.div
      style={{
        left: smoothX,
        top: smoothY,
        background: useMotionTemplate`radial-gradient(350px circle at center, ${color} 0%, transparent 70%)`,
      }}
      className="fixed -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] pointer-events-none z-30 opacity-15 mix-blend-screen blur-2xl transition-opacity duration-300"
    />
  );
}

export default AuroraCursorGlow;
