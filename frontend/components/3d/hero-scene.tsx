'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export function HeroScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene, Camera & Renderer
    const scene = new THREE.Scene();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || 600;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 8.5);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Clear canvas child if any exists
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // 2. Center 3D Geometry: Futuristic Faceted Polyhedron + Wireframe
    const geometry = new THREE.IcosahedronGeometry(2.3, 1);

    // Outer crystalline glass material (Emerald tinted)
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1f7a55,
      emissive: 0x0b332b,
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.85,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.65,
      flatShading: true,
    });
    const icosahedronMesh = new THREE.Mesh(geometry, glassMaterial);
    scene.add(icosahedronMesh);

    // Wireframe overlay for architectural tech aesthetics
    const wireframeGeo = new THREE.WireframeGeometry(geometry);
    const wireframeMat = new THREE.LineBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      opacity: 0.55,
      linewidth: 1,
    });
    const wireframeLines = new THREE.LineSegments(wireframeGeo, wireframeMat);
    icosahedronMesh.add(wireframeLines);

    // Inner glowing core
    const innerGeo = new THREE.OctahedronGeometry(1.2, 0);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x2c8c68,
      emissive: 0x2c8c68,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.9,
      wireframe: true,
    });
    const innerCore = new THREE.Mesh(innerGeo, innerMat);
    icosahedronMesh.add(innerCore);

    // 3. Orbital Ring with Glowing Nodes (Klydex Satellite Network)
    const ringGroup = new THREE.Group();
    scene.add(ringGroup);

    const ringRadius = 3.6;
    const ringGeo = new THREE.BufferGeometry();
    const ringPoints: THREE.Vector3[] = [];
    const ringSegments = 90;
    for (let i = 0; i <= ringSegments; i++) {
      const theta = (i / ringSegments) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(theta) * ringRadius, 0, Math.sin(theta) * ringRadius));
    }
    ringGeo.setFromPoints(ringPoints);

    const ringMaterial = new THREE.LineBasicMaterial({
      color: 0x2c8c68,
      transparent: true,
      opacity: 0.35,
    });
    const ring = new THREE.Line(ringGeo, ringMaterial);
    ringGroup.add(ring);

    // Secondary Tilted Ring
    const ringGroup2 = new THREE.Group();
    ringGroup2.rotation.x = Math.PI / 3;
    ringGroup2.rotation.y = Math.PI / 6;
    scene.add(ringGroup2);
    const ring2 = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({
      color: 0x6ee7b7,
      transparent: true,
      opacity: 0.25,
    }));
    ringGroup2.add(ring2);

    // Orbital Nodes (Satellite spheres)
    const nodeCount = 6;
    const nodeSpheres: THREE.Mesh[] = [];
    const nodeGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0xa7f3d0 });

    for (let i = 0; i < nodeCount; i++) {
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      ringGroup.add(node);
      nodeSpheres.push(node);
    }

    // 4. Background Particle Constellation
    const particleCount = 220;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 18;
      particlePositions[i + 1] = (Math.random() - 0.5) * 14;
      particlePositions[i + 2] = (Math.random() - 0.5) * 12;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMaterial = new THREE.PointsMaterial({
      color: 0x34d399,
      size: 0.05,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // 5. Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const primaryLight = new THREE.DirectionalLight(0x2c8c68, 2.8);
    primaryLight.position.set(5, 6, 7);
    scene.add(primaryLight);

    const cyanRimLight = new THREE.PointLight(0x5eead4, 2.2, 20);
    cyanRimLight.position.set(-6, -4, 4);
    scene.add(cyanRimLight);

    const emeraldBottomLight = new THREE.PointLight(0x0b332b, 3.5, 15);
    emeraldBottomLight.position.set(0, -5, -3);
    scene.add(emeraldBottomLight);

    // 6. Mouse Interaction & Inertia Parallax
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

      targetRotationY = mouseX * 0.45;
      targetRotationX = -mouseY * 0.35;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // 7. Responsive Resize
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // 8. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth damped rotation tracking mouse
      icosahedronMesh.rotation.y += 0.004;
      icosahedronMesh.rotation.x += 0.002;
      icosahedronMesh.rotation.y += (targetRotationY - icosahedronMesh.rotation.y) * 0.035;
      icosahedronMesh.rotation.x += (targetRotationX - icosahedronMesh.rotation.x) * 0.035;

      // Inner core reverse rotation
      innerCore.rotation.y = -elapsedTime * 0.4;
      innerCore.rotation.z = elapsedTime * 0.25;

      // Orbiting satellite rings
      ringGroup.rotation.y = elapsedTime * 0.15;
      ringGroup.rotation.z = Math.sin(elapsedTime * 0.2) * 0.15;
      ringGroup2.rotation.x = Math.PI / 3 + Math.cos(elapsedTime * 0.25) * 0.15;

      // Position nodes around the ring
      nodeSpheres.forEach((node, idx) => {
        const offset = (idx / nodeCount) * Math.PI * 2;
        const angle = elapsedTime * 0.4 + offset;
        node.position.x = Math.cos(angle) * ringRadius;
        node.position.z = Math.sin(angle) * ringRadius;
        node.position.y = Math.sin(angle * 2) * 0.3;
      });

      // Slowly rotate particle field
      particles.rotation.y = elapsedTime * 0.02;
      particles.rotation.x = Math.sin(elapsedTime * 0.015) * 0.05;

      renderer.render(scene, camera);
    };

    animate();
    setIsLoaded(true);

    // Cleanup
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);

      geometry.dispose();
      glassMaterial.dispose();
      wireframeGeo.dispose();
      wireframeMat.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      ringGeo.dispose();
      ringMaterial.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full min-h-[520px] lg:min-h-[640px] flex items-center justify-center pointer-events-none select-none overflow-hidden">
      <div
        ref={containerRef}
        className={`w-full h-full absolute inset-0 transition-opacity duration-1000 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Radial soft emerald glow backdrop */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[480px] h-[340px] sm:h-[480px] bg-emerald-500/15 dark:bg-emerald-500/20 blur-[100px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] h-[220px] bg-teal-400/10 dark:bg-teal-400/25 blur-[70px] rounded-full pointer-events-none -z-10" />
    </div>
  );
}
