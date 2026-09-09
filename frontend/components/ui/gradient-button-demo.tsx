"use client";

import { GradientButton } from "@/components/ui/gradient-button";

export function GradientButtonDemo() {
  return (
    <div className="flex flex-wrap gap-4">
      <GradientButton>Get Started</GradientButton>
      <GradientButton variant="variant">Launch Scanner</GradientButton>
    </div>
  );
}

export default GradientButtonDemo;
