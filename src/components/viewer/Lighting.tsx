'use client';

/**
 * Even, well-lit rig for clear body assessment.
 * Minimizes harsh shadows so the avatar is easy to see and evaluate.
 */
export default function Lighting() {
  return (
    <>
      {/* Key light — bright, from upper-right-front */}
      <directionalLight
        position={[3, 5, 3]}
        intensity={1.4}
        color="#ffffff"
      />
      {/* Fill light — from left, strong enough to eliminate deep shadows */}
      <directionalLight
        position={[-3, 3, 2]}
        intensity={1.0}
        color="#f0f4ff"
      />
      {/* Back fill — from behind-right */}
      <directionalLight
        position={[1, 3, -3]}
        intensity={0.8}
        color="#ffffff"
      />
      {/* Top light — reduces under-chin and under-arm shadows */}
      <directionalLight
        position={[0, 6, 0]}
        intensity={0.6}
        color="#ffffff"
      />
      {/* Ambient — strong base so nothing is truly dark */}
      <ambientLight intensity={0.55} color="#c8d0e0" />
    </>
  );
}
