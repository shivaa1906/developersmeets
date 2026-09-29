'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Enterprise 3D WebGL Spatial Core
 * Engineered with Three.js for ultra-smooth 60fps performance on 4K & Retina displays.
 * Precision geometric architecture with smooth physics-based mouse inertia.
 */
export function HeroScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene & Setup
    const scene = new THREE.Scene();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || 580;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 9);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // 2. Precision Geometric Monolith (Architectural Polyhedron)
    const monolithGroup = new THREE.Group();
    scene.add(monolithGroup);

    // Outer Precision Shell (Icosahedron with subdivision)
    const outerGeo = new THREE.IcosahedronGeometry(2.1, 1);
    const outerMat = new THREE.MeshPhysicalMaterial({
      color: 0x13382c,
      emissive: 0x071c15,
      emissiveIntensity: 0.4,
      roughness: 0.12,
      metalness: 0.85,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.72,
      flatShading: true,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    monolithGroup.add(outerMesh);

    // Crisp Architectural Wireframe Accents
    const wireframeGeo = new THREE.WireframeGeometry(outerGeo);
    const wireframeMat = new THREE.LineBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.45,
    });
    const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
    outerMesh.add(wireframe);

    // Inner Cryptographic Core
    const innerGeo = new THREE.OctahedronGeometry(1.15, 0);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.9,
      wireframe: true,
    });
    const innerCore = new THREE.Mesh(innerGeo, innerMat);
    outerMesh.add(innerCore);

    // 3. Precision Concentric Orbital Rings
    const ringRadius1 = 3.3;
    const ringGeo1 = new THREE.BufferGeometry();
    const ringPoints1: THREE.Vector3[] = [];
    const segments = 100;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      ringPoints1.push(new THREE.Vector3(Math.cos(angle) * ringRadius1, 0, Math.sin(angle) * ringRadius1));
    }
    ringGeo1.setFromPoints(ringPoints1);

    const ringMat1 = new THREE.LineBasicMaterial({
      color: 0x2dd4bf,
      transparent: true,
      opacity: 0.35,
    });
    const ring1 = new THREE.Line(ringGeo1, ringMat1);
    ring1.rotation.x = Math.PI / 3.5;
    scene.add(ring1);

    // Secondary Gyroscope Ring
    const ringRadius2 = 3.7;
    const ringGeo2 = new THREE.BufferGeometry();
    const ringPoints2: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      ringPoints2.push(new THREE.Vector3(Math.cos(angle) * ringRadius2, 0, Math.sin(angle) * ringRadius2));
    }
    ringGeo2.setFromPoints(ringPoints2);

    const ringMat2 = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.25,
    });
    const ring2 = new THREE.Line(ringGeo2, ringMat2);
    ring2.rotation.y = Math.PI / 4;
    ring2.rotation.x = -Math.PI / 4;
    scene.add(ring2);

    // Orbital Satellite Nodes
    const nodeCount = 4;
    const nodeSpheres: THREE.Mesh[] = [];
    const nodeGeo = new THREE.SphereGeometry(0.065, 16, 16);
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x6ee7b7 });

    for (let i = 0; i < nodeCount; i++) {
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      scene.add(node);
      nodeSpheres.push(node);
    }

    // 4. Balanced Studio Lighting (Lag-Free & Realistic)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x34d399, 2.4);
    keyLight.position.set(6, 6, 8);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x0f766e, 2.0, 18);
    fillLight.position.set(-6, -4, 4);
    scene.add(fillLight);

    // 5. Physics-Based Mouse Inertia & Smooth Damping
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const clientX = event.clientX - rect.left;
      const clientY = event.clientY - rect.top;
      mouseX = (clientX / rect.width) * 2 - 1;
      mouseY = -(clientY / rect.height) * 2 + 1;

      targetRotationY = mouseX * 0.4;
      targetRotationX = -mouseY * 0.3;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // 6. Responsive Resize Handling
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // 7. Animation Loop (Strict 60 FPS)
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth auto-rotation coupled with mouse damping
      monolithGroup.rotation.y += 0.003;
      monolithGroup.rotation.x += 0.0015;
      monolithGroup.rotation.y += (targetRotationY - monolithGroup.rotation.y) * 0.04;
      monolithGroup.rotation.x += (targetRotationX - monolithGroup.rotation.x) * 0.04;

      // Reverse inner core rotation
      innerCore.rotation.y = -elapsedTime * 0.3;
      innerCore.rotation.z = elapsedTime * 0.2;

      // Orbiting rings
      ring1.rotation.z = elapsedTime * 0.12;
      ring2.rotation.z = -elapsedTime * 0.1;

      // Position satellite nodes along orbit 1
      nodeSpheres.forEach((node, idx) => {
        const offset = (idx / nodeCount) * Math.PI * 2;
        const angle = elapsedTime * 0.35 + offset;
        const x = Math.cos(angle) * ringRadius1;
        const y = Math.sin(angle) * ringRadius1 * Math.sin(Math.PI / 3.5);
        const z = Math.sin(angle) * ringRadius1 * Math.cos(Math.PI / 3.5);
        node.position.set(x, y, z);
      });

      renderer.render(scene, camera);
    };

    animate();
    setIsLoaded(true);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);

      outerGeo.dispose();
      outerMat.dispose();
      wireframeGeo.dispose();
      wireframeMat.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      ringGeo1.dispose();
      ringMat1.dispose();
      ringGeo2.dispose();
      ringMat2.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      renderer.dispose();

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full min-h-[460px] sm:min-h-[540px] flex items-center justify-center select-none overflow-hidden">
      <div
        ref={containerRef}
        className={`w-full h-full absolute inset-0 transition-opacity duration-700 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Clean soft ambient back-glow (Zero distracting color animation) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-emerald-500/10 dark:bg-emerald-500/15 blur-[90px] rounded-full pointer-events-none -z-10" />
    </div>
  );
}
