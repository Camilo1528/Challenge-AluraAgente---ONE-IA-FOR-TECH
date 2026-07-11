"use client";

import { cn } from "../../lib/utils";
import { motion, type MotionStyle } from "motion/react";

interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  borderWidth?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
  children?: React.ReactNode;
}

export function BorderBeam({
  className,
  size = 200,
  duration = 4,
  borderWidth = 1.5,
  colorFrom = "#6366f1",
  colorTo = "#a855f7",
  delay = 0,
}: BorderBeamProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 [border:calc(var(--border-width)*1px)_solid_transparent]",
        className
      )}
      style={
        {
          "--border-width": borderWidth,
          borderRadius: "inherit",
        } as MotionStyle
      }
    >
      <div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          mask: "linear-gradient(transparent, transparent)",
          WebkitMask: "linear-gradient(transparent, transparent)",
          border: `${borderWidth}px solid transparent`,
          borderRadius: "inherit",
        }}
      >
        <motion.div
          className="absolute"
          style={{
            width: size,
            height: size,
            background: `conic-gradient(from 0deg, transparent 0deg, ${colorFrom}, ${colorTo}, transparent 300deg)`,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            transformOrigin: "center",
            borderRadius: "50%",
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration,
            repeat: Infinity,
            ease: "linear",
            delay,
          }}
        />
      </div>
    </div>
  );
}
