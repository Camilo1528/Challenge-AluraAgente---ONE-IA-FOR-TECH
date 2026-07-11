"use client";

import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

interface ParticlesProps {
  className?: string;
  quantity?: number;
  staticity?: number;
  ease?: number;
  size?: number;
  refresh?: boolean;
  color?: string;
  vx?: number;
  vy?: number;
}

export function Particles({
  className = "",
  quantity = 100,
  staticity = 50,
  ease = 50,
  size = 0.4,
  refresh = false,
  color = "#ffffff",
  vx = 0,
  vy = 0,
}: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const circles = useRef<Circle[]>([]);
  const mouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;

  type Circle = {
    x: number;
    y: number;
    translateX: number;
    translateY: number;
    size: number;
    alpha: number;
    targetAlpha: number;
    dx: number;
    dy: number;
    magnetism: number;
  };

  useEffect(() => {
    if (canvasRef.current) {
      context.current = canvasRef.current.getContext("2d");
    }
    initCanvas();
    animate();
    window.addEventListener("resize", initCanvas);

    const handleMouseMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const { w, h } = canvasSize.current;
        const centerX = w / 2;
        const centerY = h / 2;

        for (const circle of circles.current) {
          const dx = mouse.current.x - circle.x - centerX;
          const dy = mouse.current.y - circle.y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 200;

          if (dist < maxDist) {
            const force = (maxDist - dist) / maxDist;
            circle.dx += (dx / dist) * force * 0.01;
            circle.dy += (dy / dist) * force * 0.01;
          }
        }
      }
    };
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("resize", initCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [color]);

  useEffect(() => {
    initCanvas();
  }, [refresh]);

  const initCanvas = () => {
    resizeCanvas();
    drawParticles();
  };

  const resizeCanvas = () => {
    if (canvasContainerRef.current && canvasRef.current && context.current) {
      circles.current.length = 0;
      canvasSize.current.w = canvasContainerRef.current.offsetWidth;
      canvasSize.current.h = canvasContainerRef.current.offsetHeight;
      canvasRef.current.width = canvasSize.current.w * dpr;
      canvasRef.current.height = canvasSize.current.h * dpr;
      canvasRef.current.style.width = `${canvasSize.current.w}px`;
      canvasRef.current.style.height = `${canvasSize.current.h}px`;
      context.current.scale(dpr, dpr);
    }
  };

  const circleParams = (): Circle => {
    const x = Math.floor(Math.random() * canvasSize.current.w);
    const y = Math.floor(Math.random() * canvasSize.current.h);
    const translateX = 0;
    const translateY = 0;
    const pSize = Math.floor(Math.random() * 2) + size;
    const alpha = 0;
    const targetAlpha = parseFloat((Math.random() * 0.6 + 0.1).toFixed(1));
    const dx = (Math.random() - 0.5) * 0.1;
    const dy = (Math.random() - 0.5) * 0.1;
    const magnetism = 0.1 + Math.random() * 4;
    return {
      x,
      y,
      translateX,
      translateY,
      size: pSize,
      alpha,
      targetAlpha,
      dx,
      dy,
      magnetism,
    };
  };

  const drawCircle = (circle: Circle, i: number) => {
    if (context.current) {
      context.current.save();
      context.current.translate(
        circle.translateX + circle.x,
        circle.translateY + circle.y,
      );
      context.current.beginPath();
      context.current.arc(0, 0, circle.size, 0, Math.PI * 2);
      context.current.fillStyle = color;
      context.current.globalAlpha = circle.alpha;
      context.current.fill();
      context.current.restore();
    }
  };

  const drawParticles = () => {
    if (!context.current) return;
    circles.current.length = 0;
    for (let i = 0; i < quantity; i++) {
      circles.current.push(circleParams());
    }
  };

  const animate = () => {
    if (!context.current) return;
    context.current.clearRect(
      0,
      0,
      canvasSize.current.w,
      canvasSize.current.h,
    );

    circles.current.forEach((circle: Circle, i: number) => {
      // Handle the alpha
      const edge = [
        circle.x + circle.translateX - circle.size, // distance from left edge
        canvasSize.current.w - circle.x - circle.translateX - circle.size, // distance from right edge
        circle.y + circle.translateY - circle.size, // distance from top edge
        canvasSize.current.h - circle.y - circle.translateY - circle.size, // distance from bottom edge
      ];
      const closestEdge = edge.reduce((a, b) => Math.min(a, b));
      const remappingClosestEdge = parseFloat(
        ((1 - closestEdge / canvasSize.current.w) * 100).toFixed(2),
      );

      if (remappingClosestEdge > staticity) {
        circle.alpha += (circle.targetAlpha - circle.alpha) * (ease / 100);
      } else {
        circle.alpha += (0 - circle.alpha) * (ease / 100);
      }

      circle.x += circle.dx + vx;
      circle.y += circle.dy + vy;
      circle.translateX +=
        (mouse.current.x / (staticity / circle.magnetism) -
          circle.translateX) *
        (ease / 100);
      circle.translateY +=
        (mouse.current.y / (staticity / circle.magnetism) -
          circle.translateY) *
        (ease / 100);

      // circle gets eaten
      if (
        circle.x < -circle.size ||
        circle.x > canvasSize.current.w + circle.size ||
        circle.y < -circle.size ||
        circle.y > canvasSize.current.h + circle.size
      ) {
        // remove the circle
        circles.current.splice(i, 1);
        // create a new one
        const newCircle = circleParams();
        circles.current.push(newCircle);
      }

      drawCircle(circle, i);
    });
    window.requestAnimationFrame(animate);
  };

  return (
    <div
      className={cn("pointer-events-none", className)}
      ref={canvasContainerRef}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="size-full" />
    </div>
  );
}
