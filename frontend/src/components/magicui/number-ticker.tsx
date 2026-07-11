"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { cn } from "../../lib/utils";

interface NumberTickerProps {
  value: number;
  direction?: "up" | "down";
  delay?: number;
  className?: string;
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
}

export function NumberTicker({
  value,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  prefix = "",
  suffix = "",
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px" });
  const [displayValue, setDisplayValue] = useState(
    direction === "up" ? 0 : value,
  );
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!inView) return;

    const startTime = Date.now() + delay * 1000;
    const duration = 2000;

    const animate = () => {
      const now = Date.now();
      if (now < startTime) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      const start = direction === "up" ? 0 : value;
      const end = direction === "up" ? value : 0;
      const current = start + (end - start) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [inView, value, direction, delay]);

  return (
    <span
      ref={ref}
      className={cn("tabular-nums tracking-tight", className)}
    >
      {prefix}{displayValue.toLocaleString(undefined, {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      })}{suffix}
    </span>
  );
}
