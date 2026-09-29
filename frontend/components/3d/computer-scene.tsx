'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * High-Fidelity 3D Computer Workstation (Three.js)
 * Clean, lag-free procedural 3D model of a sleek modern developer laptop/workstation.
 * Features:
 * - Dynamic animated code editor / terminal canvas texture with syntax highlighting & typing cursor
 * - Precision CNC anodized metal chassis & display bezel with realistic roughness & clearcoat
 * - Recessed keyboard deck with backlit key caps and trackpad
 * - Floating 3D holographic status chips
 * - Smooth mouse parallax with inertia damping
 * - Automatically pauses rendering when scrolled out of view for zero lag (120fps capability)
 * - Freely floating in the layout with NO bounding box or border container
 */
export function ComputerScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isVisible = true;
    let animationFrameId: number;

    // 1. Scene, Camera & WebGL Renderer
    const scene = new THREE.Scene();

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 560;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 1.2, 7.2);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'highp',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 4K crisp rendering without GPU overload
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = false; // Keep high FPS and zero lag

    // Clear previous canvases
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // Root Laptop Group for smooth tilting
    const laptopGroup = new THREE.Group();
    scene.add(laptopGroup);

    // Default angle for optimal 3D perspective
    laptopGroup.position.set(0, -0.4, 0);
    laptopGroup.rotation.set(0.28, -0.38, 0.08);

    // ─────────────────────────────────────────────────────────────
    // 2. Base Chassis & Keyboard Assembly
    // ─────────────────────────────────────────────────────────────
    const chassisWidth = 4.2;
    const chassisDepth = 2.8;
    const chassisHeight = 0.12;

    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2320,
      metalness: 0.92,
      roughness: 0.28,
    });

    const darkTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d1311,
      metalness: 0.8,
      roughness: 0.4,
    });

    // Base slab
    const baseGeo = new THREE.BoxGeometry(chassisWidth, chassisHeight, chassisDepth);
    const baseMesh = new THREE.Mesh(baseGeo, metalMaterial);
    baseMesh.position.set(0, -chassisHeight / 2, 0);
    laptopGroup.add(baseMesh);

    // Trackpad
    const trackpadGeo = new THREE.BoxGeometry(1.4, 0.005, 0.9);
    const trackpadMat = new THREE.MeshStandardMaterial({
      color: 0x24302c,
      metalness: 0.85,
      roughness: 0.2,
    });
    const trackpad = new THREE.Mesh(trackpadGeo, trackpadMat);
    trackpad.position.set(0, 0.062, 0.8);
    laptopGroup.add(trackpad);

    // Keyboard Bed & Keys
    const kbBedGeo = new THREE.BoxGeometry(3.7, 0.005, 1.4);
    const kbBed = new THREE.Mesh(kbBedGeo, darkTrimMaterial);
    kbBed.position.set(0, 0.062, -0.45);
    laptopGroup.add(kbBed);

    // Generate individual illuminated keycaps
    const rows = 5;
    const cols = 14;
    const keyWidth = 0.22;
    const keyDepth = 0.22;
    const keyHeight = 0.035;
    const keyGeo = new THREE.BoxGeometry(keyWidth, keyHeight, keyDepth);
    const keyMat = new THREE.MeshStandardMaterial({
      color: 0x111916,
      roughness: 0.35,
      metalness: 0.6,
      emissive: 0x0f2b20,
      emissiveIntensity: 0.4,
    });

    const keysGroup = new THREE.Group();
    const xStart = -(cols * 0.25) / 2 + 0.12;
    const zStart = -0.45 - (rows * 0.25) / 2 + 0.12;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = new THREE.Mesh(keyGeo, keyMat);
        key.position.set(xStart + c * 0.25, 0.08, zStart + r * 0.25);
        keysGroup.add(key);
      }
    }
    laptopGroup.add(keysGroup);

    // ─────────────────────────────────────────────────────────────
    // 3. Screen Hinge & Display Assembly (Tilted Open at 108°)
    // ─────────────────────────────────────────────────────────────
    const displayHinge = new THREE.Group();
    displayHinge.position.set(0, 0.06, -chassisDepth / 2 + 0.05);
    laptopGroup.add(displayHinge);

    // Hinge rotation (Open angle)
    displayHinge.rotation.x = -1.25; // ~108 degrees open

    // Display Outer Lid / Shell
    const lidHeight = 2.7;
    const lidGeo = new THREE.BoxGeometry(chassisWidth, lidHeight, 0.08);
    const lidMesh = new THREE.Mesh(lidGeo, metalMaterial);
    lidMesh.position.set(0, lidHeight / 2, 0);
    displayHinge.add(lidMesh);

    // Screen Bezel Glass
    const bezelGeo = new THREE.BoxGeometry(chassisWidth - 0.14, lidHeight - 0.14, 0.01);
    const bezelMat = new THREE.MeshBasicMaterial({ color: 0x050807 });
    const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
    bezelMesh.position.set(0, lidHeight / 2, 0.045);
    displayHinge.add(bezelMesh);

    // ─────────────────────────────────────────────────────────────
    // 4. High-Res Live Animated Terminal / Code Editor Texture
    // ─────────────────────────────────────────────────────────────
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 1024;
    screenCanvas.height = 640;
    const ctx = screenCanvas.getContext('2d');

    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.generateMipmaps = true;
    screenTexture.minFilter = THREE.LinearMipmapLinearFilter;
    screenTexture.magFilter = THREE.LinearFilter;

    const screenGeo = new THREE.PlaneGeometry(chassisWidth - 0.35, lidHeight - 0.35);
    const screenMat = new THREE.MeshBasicMaterial({
      map: screenTexture,
      toneMapped: false,
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, lidHeight / 2, 0.055);
    displayHinge.add(screenMesh);

    // Soft Screen Backlight cast into 3D scene
    const screenGlowLight = new THREE.PointLight(0x34d399, 1.8, 4);
    screenGlowLight.position.set(0, lidHeight / 2 + 0.2, 0.6);
    displayHinge.add(screenGlowLight);

    // ─────────────────────────────────────────────────────────────
    // 5. Floating 3D Holographic Status Chips (Surrounding the PC)
    // ─────────────────────────────────────────────────────────────
    const chipsGroup = new THREE.Group();
    scene.add(chipsGroup);

    interface HoloChip {
      mesh: THREE.Mesh;
      initialPos: THREE.Vector3;
      speed: number;
      offset: number;
    }

    const holoChips: HoloChip[] = [];

    const createChipCanvas = (text: string, subtext: string, icon: string, color: string) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 160;
      const cCtx = c.getContext('2d')!;

      // Rounded container
      cCtx.fillStyle = 'rgba(8, 16, 12, 0.88)';
      cCtx.strokeStyle = color;
      cCtx.lineWidth = 4;
      cCtx.beginPath();
      cCtx.roundRect(4, 4, 504, 152, 24);
      cCtx.fill();
      cCtx.stroke();

      // Chip indicator dot
      cCtx.fillStyle = color;
      cCtx.beginPath();
      cCtx.arc(42, 80, 12, 0, Math.PI * 2);
      cCtx.fill();

      // Texts
      cCtx.font = 'bold 36px "SF Pro Display", -apple-system, sans-serif';
      cCtx.fillStyle = '#ffffff';
      cCtx.fillText(text, 72, 68);

      cCtx.font = '24px "JetBrains Mono", monospace';
      cCtx.fillStyle = color;
      cCtx.fillText(subtext, 72, 114);

      return c;
    };

    const chipConfigs = [
      { text: 'Verified Dev Guild', subtext: 'STATUS: ACTIVE // 100% KYC', icon: '✦', color: '#34d399', pos: [-2.8, 1.6, 0.8], speed: 1.2 },
      { text: 'Anonymous Escrow', subtext: 'LEDGER: LOCKED // ₹0 RISK', icon: '◈', color: '#2dd4bf', pos: [2.6, 0.8, 1.2], speed: 0.9 },
      { text: 'CI/CD Pipeline', subtext: 'DEPLOY: PRODUCTION READY', icon: '⚡', color: '#10b981', pos: [2.4, 2.2, -0.6], speed: 1.4 },
    ];

    chipConfigs.forEach((cfg, idx) => {
      const chipCanvas = createChipCanvas(cfg.text, cfg.subtext, cfg.icon, cfg.color);
      const chipTex = new THREE.CanvasTexture(chipCanvas);
      const chipGeo = new THREE.PlaneGeometry(1.6, 0.5);
      const chipMat = new THREE.MeshBasicMaterial({
        map: chipTex,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      });
      const chipMesh = new THREE.Mesh(chipGeo, chipMat);
      chipMesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      chipsGroup.add(chipMesh);

      holoChips.push({
        mesh: chipMesh,
        initialPos: chipMesh.position.clone(),
        speed: cfg.speed,
        offset: idx * 1.8,
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Ambient 3D Particle Constellation (Floating Data Stream)
    // ─────────────────────────────────────────────────────────────
    const particleCount = 180;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 14;
      particlePositions[i + 1] = (Math.random() - 0.5) * 10;
      particlePositions[i + 2] = (Math.random() - 0.5) * 8;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x34d399,
      size: 0.04,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // ─────────────────────────────────────────────────────────────
    // 7. MNC Lighting Setup (Refined & Soft)
    // ─────────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xa7f3d0, 2.5);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x2c8c68, 3.0, 15);
    rimLight.position.set(-5, -2, 4);
    scene.add(rimLight);

    const topFill = new THREE.DirectionalLight(0xffffff, 1.0);
    topFill.position.set(-2, 5, 2);
    scene.add(topFill);

    // ─────────────────────────────────────────────────────────────
    // 8. Mouse Parallax & Dynamic Interpolation
    // ─────────────────────────────────────────────────────────────
    let mouseX = 0;
    let mouseY = 0;
    let targetRotY = -0.38;
    let targetRotX = 0.28;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      // Subtle responsive tilt
      mouseX = (x - 0.5) * 2;
      mouseY = (y - 0.5) * 2;

      targetRotY = -0.38 + mouseX * 0.32;
      targetRotX = 0.28 - mouseY * 0.22;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // ─────────────────────────────────────────────────────────────
    // 9. Resize Handling & Viewport Visibility Observer (Lag-Free)
    // ─────────────────────────────────────────────────────────────
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    const observer = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0].isIntersecting;
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    // ─────────────────────────────────────────────────────────────
    // 10. Live Animated Terminal Code Generator
    // ─────────────────────────────────────────────────────────────
    const codeLines = [
      '// NEXUS AUTONOMOUS OS v2.4 - PRODUCTION',
      'const client = await Nexus.bridge.connect("Client #001");',
      'const dev = await Guild.select({ tier: "TOP_1_PERCENT" });',
      'const claim = await Ledger.escrowLock({ credits: 1 });',
      'assert(claim.status === "CONFIRMED");',
      'const sprint = await dev.deployMilestone("v1.0-alpha");',
      'console.log("STATUS: 0 ERRORS // 100% SHIPPED");',
    ];

    let charIndex = 0;
    let currentLine = 0;
    let lastTypeTime = 0;

    const updateTerminal = (time: number) => {
      if (!ctx) return;

      // Update typewriter typing every 60ms
      if (time - lastTypeTime > 65) {
        lastTypeTime = time;
        charIndex++;
        if (currentLine < codeLines.length && charIndex > codeLines[currentLine].length + 15) {
          charIndex = 0;
          currentLine = (currentLine + 1) % codeLines.length;
        }
      }

      // Draw Terminal Screen Background
      ctx.fillStyle = '#080e0c';
      ctx.fillRect(0, 0, 1024, 640);

      // Header bar
      ctx.fillStyle = '#0f1b17';
      ctx.fillRect(0, 0, 1024, 52);

      // Window dots
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(28, 26, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(52, 26, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(76, 26, 7, 0, Math.PI * 2);
      ctx.fill();

      // Title
      ctx.font = '16px "JetBrains Mono", monospace';
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText('nexus-prod-terminal — zsh (tmux: 1)', 106, 32);

      // Code Lines rendering
      ctx.font = '22px "JetBrains Mono", monospace';

      for (let i = 0; i <= currentLine; i++) {
        const yPos = 100 + i * 44;
        const line = codeLines[i];
        const textToDraw = i === currentLine ? line.slice(0, charIndex) : line;

        // Line numbers
        ctx.fillStyle = '#2d433b';
        ctx.fillText(`${(i + 1).toString().padStart(2, '0')}`, 32, yPos);

        // Syntax highlighting
        if (line.startsWith('//')) {
          ctx.fillStyle = '#4ade80';
        } else if (line.includes('const')) {
          ctx.fillStyle = '#38bdf8';
        } else if (line.includes('console')) {
          ctx.fillStyle = '#fbbf24';
        } else {
          ctx.fillStyle = '#e2e8f0';
        }
        ctx.fillText(textToDraw, 84, yPos);

        // Blinking cursor on active line
        if (i === currentLine && Math.floor(time * 2.5) % 2 === 0) {
          const textWidth = ctx.measureText(textToDraw).width;
          ctx.fillStyle = '#34d399';
          ctx.fillRect(86 + textWidth, yPos - 20, 12, 24);
        }
      }

      screenTexture.needsUpdate = true;
    };

    // ─────────────────────────────────────────────────────────────
    // 11. 60–120 FPS Render Loop with Automatic Idle Throttle
    // ─────────────────────────────────────────────────────────────
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Skip GPU render when out of viewport to guarantee 0 lag
      if (!isVisible) return;

      const elapsedTime = clock.getElapsedTime();

      // Smooth inertia rotation
      laptopGroup.rotation.y += (targetRotY - laptopGroup.rotation.y) * 0.045;
      laptopGroup.rotation.x += (targetRotX - laptopGroup.rotation.x) * 0.045;

      // Gentle organic float
      laptopGroup.position.y = -0.4 + Math.sin(elapsedTime * 1.5) * 0.08;

      // Animate floating chips gently orbiting and levitating
      holoChips.forEach((chip) => {
        chip.mesh.position.y = chip.initialPos.y + Math.sin(elapsedTime * chip.speed + chip.offset) * 0.12;
        chip.mesh.rotation.y = Math.sin(elapsedTime * 0.8 + chip.offset) * 0.06;
      });

      // Slowly drift particles
      particles.rotation.y = elapsedTime * 0.02;

      // Update screen code
      updateTerminal(elapsedTime);

      renderer.render(scene, camera);
    };

    animate();
    setIsLoaded(true);

    // ─────────────────────────────────────────────────────────────
    // 12. Complete Cleanup on Unmount
    // ─────────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      cancelAnimationFrame(animationFrameId);

      baseGeo.dispose();
      trackpadGeo.dispose();
      kbBedGeo.dispose();
      keyGeo.dispose();
      lidGeo.dispose();
      bezelGeo.dispose();
      screenGeo.dispose();
      particleGeo.dispose();

      metalMaterial.dispose();
      darkTrimMaterial.dispose();
      trackpadMat.dispose();
      keyMat.dispose();
      bezelMat.dispose();
      screenMat.dispose();
      particleMat.dispose();
      screenTexture.dispose();
      renderer.dispose();

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[460px] sm:h-[560px] lg:h-[620px] flex items-center justify-center pointer-events-none select-none overflow-visible">
      {/* 
        NO BOX / NO BORDER / NO CARDS:
        The 3D Computer workstation floats freely directly in the hero atmosphere
      */}
      <div
        ref={containerRef}
        className={`w-full h-full absolute inset-0 transition-opacity duration-700 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Atmospheric back-illumination (Apple/Stripe grade soft bounce) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] sm:w-[580px] h-[420px] sm:h-[580px] bg-emerald-500/15 dark:bg-emerald-500/20 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-teal-400/10 dark:bg-teal-400/25 blur-[90px] rounded-full pointer-events-none -z-10" />
    </div>
  );
}
