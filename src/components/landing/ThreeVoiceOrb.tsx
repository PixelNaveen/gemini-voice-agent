import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface ThreeVoiceOrbProps {
  isActive?: boolean;
  size?: number;
  className?: string;
}

// Helper to safely probe WebGL availability without crashing or causing console spam
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export const ThreeVoiceOrb: React.FC<ThreeVoiceOrbProps> = ({
  isActive = true,
  size = 360,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglSupported, setWebglSupported] = useState<boolean>(true);

  useEffect(() => {
    // Quick preflight check
    if (!isWebGLAvailable()) {
      setWebglSupported(false);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let animationFrameId: number;
    let isDisposed = false;
    const width = container.clientWidth || size;
    const height = container.clientHeight || size;

    // Three scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 5;

    let renderer: THREE.WebGLRenderer | null = null;
    let canvasElement: HTMLCanvasElement | null = null;

    try {
      // Use standard canvas element and graceful context settings
      canvasElement = document.createElement('canvas');
      renderer = new THREE.WebGLRenderer({
        canvas: canvasElement,
        alpha: true,
        antialias: false, // Antialias off saves memory & prevents context creation failure
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
      });

      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      container.appendChild(canvasElement);
    } catch (err) {
      console.warn('WebGL context creation failed, using elegant CSS fallback:', err);
      setWebglSupported(false);
      return;
    }

    // Handle context loss gracefully
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(animationFrameId);
      setWebglSupported(false);
    };

    canvasElement.addEventListener('webglcontextlost', handleContextLost, false);

    // Geometry - Icosahedron lattice orb (optimized subdivision detail)
    const geometry = new THREE.IcosahedronGeometry(1.6, 12);
    const originalPositions = geometry.attributes.position.clone();

    // Material - Custom aesthetic wireframe with emerald sheen
    const material = new THREE.MeshStandardMaterial({
      color: 0x059669,
      wireframe: true,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x024530,
      emissiveIntensity: 0.5,
    });

    const orbMesh = new THREE.Mesh(geometry, material);
    scene.add(orbMesh);

    // Inner glowing sphere
    const innerGeometry = new THREE.SphereGeometry(1.2, 24, 24);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.35,
      wireframe: false,
    });
    const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
    scene.add(innerMesh);

    // Particle ring / floating sound energy dots
    const particleCount = 120;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const radius = 2.1 + Math.random() * 0.9;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.7;

      particlePositions[i * 3] = radius * Math.cos(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = radius * Math.sin(phi);
      particlePositions[i * 3 + 2] = radius * Math.cos(phi) * Math.sin(theta);
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x6ee7b7,
      size: 0.04,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x34d399, 2.0);
    dirLight1.position.set(4, 5, 3);
    scene.add(dirLight1);

    // Mouse interaction parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      mouseX = x * 1.2;
      mouseY = y * 1.2;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Animation loop using high-precision timer
    const startTime = performance.now();

    const animate = () => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = (performance.now() - startTime) * 0.001;

      // Smooth rotation with mouse lerp
      targetRotationY += (mouseX - targetRotationY) * 0.05;
      targetRotationX += (mouseY - targetRotationX) * 0.05;

      orbMesh.rotation.y = elapsedTime * 0.25 + targetRotationY;
      orbMesh.rotation.x = Math.sin(elapsedTime * 0.3) * 0.15 + targetRotationX;

      innerMesh.rotation.y = -elapsedTime * 0.15;
      innerMesh.rotation.z = Math.cos(elapsedTime * 0.2) * 0.1;

      particleSystem.rotation.y = elapsedTime * 0.08;
      particleSystem.rotation.x = Math.sin(elapsedTime * 0.1) * 0.05;

      // Vertex deformation for breathing / audio reactive effect
      const positions = geometry.attributes.position;
      const orig = originalPositions.array;
      const pulseMultiplier = isActive ? 1.0 : 0.4;
      const pulseRate = isActive ? 2.5 : 1.0;

      for (let i = 0; i < positions.count; i++) {
        const ox = orig[i * 3];
        const oy = orig[i * 3 + 1];
        const oz = orig[i * 3 + 2];

        const distance = Math.sqrt(ox * ox + oy * oy + oz * oz);
        const wave = Math.sin(distance * 4.0 - elapsedTime * pulseRate + ox * 2.0) * (0.08 * pulseMultiplier);

        const factor = 1 + wave / distance;
        positions.setXYZ(i, ox * factor, oy * factor, oz * factor);
      }
      positions.needsUpdate = true;

      // Glow intensity breath
      material.emissiveIntensity = 0.4 + Math.sin(elapsedTime * pulseRate) * 0.25 * pulseMultiplier;

      if (renderer) {
        renderer.render(scene, camera);
      }
    };

    animate();

    const handleResize = () => {
      if (!container || !renderer) return;
      const newWidth = container.clientWidth || size;
      const newHeight = container.clientHeight || size;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      isDisposed = true;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);

      if (canvasElement) {
        canvasElement.removeEventListener('webglcontextlost', handleContextLost);
        if (container.contains(canvasElement)) {
          container.removeChild(canvasElement);
        }
      }

      geometry.dispose();
      material.dispose();
      innerGeometry.dispose();
      innerMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();

      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer = null;
      }
    };
  }, [isActive, size]);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center pointer-events-none select-none ${className}`}
      style={{ width: '100%', height: '100%', minHeight: size }}
    >
      {/* Background ambient glow pulse */}
      <div className="absolute inset-0 m-auto w-64 h-64 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none animate-pulse" />

      {/* Elegant CSS geometric fallback if WebGL is unavailable or context lost in sandboxed iframe */}
      {!webglSupported && (
        <div className="relative flex items-center justify-center pointer-events-none">
          {/* Animated concentric rings */}
          <div className="w-64 h-64 rounded-full border border-emerald-500/30 animate-[spin_24s_linear_infinite]" />
          <div className="absolute w-52 h-52 rounded-full border border-dashed border-emerald-400/40 animate-[spin_16s_linear_infinite_reverse]" />
          <div className="absolute w-40 h-40 rounded-full border-2 border-emerald-500/20 bg-emerald-500/10 backdrop-blur-xs animate-pulse" />
          <div className="absolute w-28 h-28 rounded-full bg-radial from-emerald-400/30 to-transparent blur-md" />
        </div>
      )}
    </div>
  );
};
