"use client";

import React from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";

interface ShimmerButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
}

export function ShimmerButton({
  shimmerColor = "#ffffff",
  shimmerSize = "0.05em",
  shimmerDuration = "3s",
  borderRadius = "100px",
  background = "rgba(99, 102, 241, 0.1)",
  className,
  children,
  ...props
}: ShimmerButtonProps) {
  return (
    <button
      className={cn(
        "group relative flex items-center justify-center overflow-hidden whitespace-nowrap border border-white/10 px-6 py-3 text-white font-medium [background:var(--bg)] cursor-pointer",
        className
      )}
      style={
        {
          "--bg": background,
          borderRadius,
        } as React.CSSProperties
      }
      {...props}
    >
      {/* Shimmer overlay */}
      <div
        className="absolute inset-0 overflow-hidden rounded-[inherit]"
        style={{ borderRadius }}
      >
        <motion.div
          className="absolute -inset-full"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${shimmerColor} 50%, transparent 100%)`,
            width: "200%",
            height: "100%",
            opacity: 0.15,
          }}
          animate={{ x: ["-100%", "100%"] }}
          transition={{
            duration: parseFloat(shimmerDuration),
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div>
      {children}
    </button>
  );
}
