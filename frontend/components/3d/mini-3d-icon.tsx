'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type Mini3DIconType = 'cube' | 'shield' | 'quantum' | 'database' | 'layers' | 'computer';

interface Mini3DIconProps {
  type: Mini3DIconType;
  className?: string;
  size?: number;
  color?: number;
}

/**
 * High-definition 3D WebGL Icon rendered with Three.js
 * Provides genuine 3D tactile interaction for cards and headers.
 * Lag-free: Uses low-drawcall geometries, clamped pixel ratio,
 * and IntersectionObserver to immediately pause when out of view.
 */
export function Mini3DIcon({
  type = 'cube',
  className = '',
  size = 56,
  color = 0x34d399,
}: Mini3DIconProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isVisible = true;
    let animId: number;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 0, 4.2);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // Group to hold the icon mesh
    const iconGroup = new THREE.Group();
    scene.add(iconGroup);

    // Material with high-tech metallic finish
    const primaryMat = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0x0b332b,
      emissiveIntensity: 0.4,
    });

    const wireMat = new THREE.LineBasicMaterial({
      color: 0xa7f3d0,
      transparent: true,
      opacity: 0.7,
    });

    let meshDispose: () => void = () => {};

    // ─────────────────────────────────────────────────────────────
    // Icon Geometries by Type
    // ─────────────────────────────────────────────────────────────
    if (type === 'cube') {
      const boxGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
      const boxMesh = new THREE.Mesh(boxGeo, primaryMat);
      const wireGeo = new THREE.WireframeGeometry(boxGeo);
      const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
      iconGroup.add(boxMesh);
      iconGroup.add(wireMesh);

      meshDispose = () => {
        boxGeo.dispose();
        wireGeo.dispose();
      };
    } else if (type === 'shield') {
      const shieldGeo = new THREE.OctahedronGeometry(1.3, 0);
      const shieldMesh = new THREE.Mesh(shieldGeo, primaryMat);
      const wireGeo = new THREE.WireframeGeometry(shieldGeo);
      const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
      iconGroup.add(shieldMesh);
      iconGroup.add(wireMesh);

      meshDispose = () => {
        shieldGeo.dispose();
        wireGeo.dispose();
      };
    } else if (type === 'quantum') {
      const coreGeo = new THREE.SphereGeometry(0.5, 16, 16);
      const coreMesh = new THREE.Mesh(coreGeo, primaryMat);
      iconGroup.add(coreMesh);

      const torusGeo = new THREE.TorusGeometry(1.2, 0.05, 12, 32);
      const ring1 = new THREE.Mesh(torusGeo, primaryMat);
      const ring2 = new THREE.Mesh(torusGeo, primaryMat);
      ring2.rotation.x = Math.PI / 2.3;
      ring2.rotation.y = Math.PI / 3;

      iconGroup.add(ring1);
      iconGroup.add(ring2);

      meshDispose = () => {
        coreGeo.dispose();
        torusGeo.dispose();
      };
    } else if (type === 'database') {
      const cylGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.35, 24);
      const disk1 = new THREE.Mesh(cylGeo, primaryMat);
      const disk2 = new THREE.Mesh(cylGeo, primaryMat);
      const disk3 = new THREE.Mesh(cylGeo, primaryMat);
      disk1.position.y = 0.55;
      disk2.position.y = 0;
      disk3.position.y = -0.55;

      iconGroup.add(disk1);
      iconGroup.add(disk2);
      iconGroup.add(disk3);

      meshDispose = () => {
        cylGeo.dispose();
      };
    } else if (type === 'layers') {
      const planeGeo = new THREE.BoxGeometry(1.6, 0.1, 1.6);
      const layer1 = new THREE.Mesh(planeGeo, primaryMat);
      const layer2 = new THREE.Mesh(planeGeo, primaryMat);
      const layer3 = new THREE.Mesh(planeGeo, primaryMat);
      layer1.position.y = 0.5;
      layer2.position.y = 0;
      layer3.position.y = -0.5;

      iconGroup.add(layer1);
      iconGroup.add(layer2);
      iconGroup.add(layer3);

      meshDispose = () => {
        planeGeo.dispose();
      };
    } else if (type === 'computer') {
      // Mini laptop model
      const baseGeo = new THREE.BoxGeometry(1.5, 0.08, 1.1);
      const base = new THREE.Mesh(baseGeo, primaryMat);
      base.position.y = -0.3;

      const screenGeo = new THREE.BoxGeometry(1.5, 1.0, 0.06);
      const screenMat = new THREE.MeshBasicMaterial({ color: 0x052e22 });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.set(0, 0.25, -0.5);
      screen.rotation.x = 0.2;

      iconGroup.add(base);
      iconGroup.add(screen);

      meshDispose = () => {
        baseGeo.dispose();
        screenGeo.dispose();
        screenMat.dispose();
      };
    }

    // Dynamic studio lighting
    const amb = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0x6ee7b7, 2.5);
    dir.position.set(2, 3, 4);
    scene.add(dir);

    // Pause when scrolled off screen
    const observer = new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting;
    });
    observer.observe(container);

    let speed = 0.015;
    const handleEnter = () => { speed = 0.05; };
    const handleLeave = () => { speed = 0.015; };

    container.addEventListener('mouseenter', handleEnter);
    container.addEventListener('mouseleave', handleLeave);

    const clock = new THREE.Clock();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const dt = clock.getDelta();
      iconGroup.rotation.y += speed;
      iconGroup.rotation.x += speed * 0.4;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
      container.removeEventListener('mouseenter', handleEnter);
      container.removeEventListener('mouseleave', handleLeave);

      meshDispose();
      primaryMat.dispose();
      wireMat.dispose();
      renderer.dispose();

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [type, size, color]);

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size }}
      className={`relative inline-flex items-center justify-center shrink-0 select-none pointer-events-auto cursor-pointer ${className}`}
    />
  );
}
