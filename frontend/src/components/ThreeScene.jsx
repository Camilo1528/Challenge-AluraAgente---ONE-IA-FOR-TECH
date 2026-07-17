"use client";

import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  TorusKnot,
  Float,
  MeshDistortMaterial,
} from "@react-three/drei";
import * as THREE from "three";

function FloatingShape() {
  const meshRef = useRef(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.2;
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <TorusKnot
        ref={meshRef}
        args={[1, 0.3, 128, 32]}
        position={[0, 0, 0]}
      >
        <MeshDistortMaterial
          color="#6366f1"
          emissive="#a855f7"
          emissiveIntensity={0.3}
          roughness={0.2}
          metalness={0.8}
          wireframe={false}
          transparent
          opacity={0.85}
          distort={0.15}
          speed={2}
        />
      </TorusKnot>
    </Float>
  );
}

function FloatingParticles({ count = 80 }) {
  const particlesRef = useRef(null);
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    return pos;
  }, [count]);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.02;
      particlesRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.01) * 0.1;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#818cf8"
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} color="#818cf8" />
      <directionalLight position={[-5, -5, -5]} intensity={0.4} color="#a855f7" />
      <pointLight position={[0, 0, 3]} intensity={0.5} color="#6366f1" />
      <FloatingShape />
      <FloatingParticles count={80} />
    </>
  );
}

export default function ThreeScene({ className = "" }) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 4], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
