'use client';

import React, { useEffect, useRef } from 'react';

interface EngineeringGridBackgroundProps {
  pointerX?: number; // -1 to 1
  pointerY?: number; // -1 to 1
  className?: string;
}

export function EngineeringGridBackground({
  pointerX = 0,
  pointerY = 0,
  className = '',
}: EngineeringGridBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: pointerX, y: pointerY, currentX: 0, currentY: 0 });

  useEffect(() => {
    pointerRef.current.x = pointerX;
    pointerRef.current.y = pointerY;
  }, [pointerX, pointerY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // Grid spacing & particle parameters
    const gridSize = 48;
    const particleCount = 28;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      size: Math.random() * 1.5 + 0.8,
      alpha: Math.random() * 0.35 + 0.15,
    }));

    const render = () => {
      animId = requestAnimationFrame(render);

      // Smooth pointer interpolation
      pointerRef.current.currentX += (pointerRef.current.x - pointerRef.current.currentX) * 0.04;
      pointerRef.current.currentY += (pointerRef.current.y - pointerRef.current.currentY) * 0.04;

      const offsetX = pointerRef.current.currentX * 14;
      const offsetY = pointerRef.current.currentY * 14;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Subtle Architectural Grid
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.045)';
      ctx.lineWidth = 1;

      // Vertical lines
      const startX = (offsetX % gridSize) - gridSize;
      for (let x = startX; x < width + gridSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal lines
      const startY = (offsetY % gridSize) - gridSize;
      for (let y = startY; y < height + gridSize; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 2. Precision Crosshair Nodes at Intersections
      ctx.fillStyle = 'rgba(52, 211, 153, 0.22)';
      for (let x = startX; x < width + gridSize; x += gridSize * 2) {
        for (let y = startY; y < height + gridSize; y += gridSize * 2) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Floating Engineering Particles & Vectors
      ctx.fillStyle = 'rgba(110, 231, 183, 0.4)';
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x + offsetX * 0.5, p.y + offsetY * 0.5, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden select-none -z-10 ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full block" />
      {/* Soft atmospheric emerald depth gradient */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-emerald-500/[0.07] blur-[140px] rounded-full pointer-events-none" />
    </div>
  );
}
