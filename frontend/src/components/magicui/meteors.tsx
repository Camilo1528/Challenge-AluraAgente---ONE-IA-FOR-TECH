"use client";

import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

interface MeteorsProps {
  number?: number;
  className?: string;
}

export function Meteors({ number = 20, className }: MeteorsProps) {
  const meteorsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!meteorsRef.current) return;
    const container = meteorsRef.current;
    const meteorElements = container.querySelectorAll<HTMLSpanElement>(".meteor");

    meteorElements.forEach((meteor) => {
      const delay = Math.random() * 5;
      const duration = Math.random() * 3 + 2;
      const left = Math.random() * 100;
      const size = Math.random() * 2 + 1;

      meteor.style.left = `${left}%`;
      meteor.style.width = `${size * 50}px`;
      meteor.style.height = `${size}px`;
      meteor.style.animationDelay = `${delay}s`;
      meteor.style.animationDuration = `${duration}s`;
    });
  }, [number]);

  return (
    <div
      ref={meteorsRef}
      className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}
      aria-hidden="true"
    >
      {Array.from({ length: number }).map((_, i) => (
        <span
          key={i}
          className="meteor absolute h-0.5 w-[50px] -translate-y-1/2 animate-meteor rounded-full"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.6), rgba(168, 85, 247, 0.8))",
            top: "-10%",
            boxShadow: "0 0 4px 1px rgba(99, 102, 241, 0.3)",
          }}
        />
      ))}
    </div>
  );
}
