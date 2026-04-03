'use client';

/**
 * Three-point light rig: key light, fill light, rim light.
 */
export default function Lighting() {
  return (
    <>
      {/* Key light — warm, from upper-right-front */}
      <directionalLight
        position={[3, 4, 2]}
        intensity={1.2}
        color="#fff5e6"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {/* Fill light — cool, softer, from left */}
      <directionalLight
        position={[-2, 2, 1]}
        intensity={0.5}
        color="#e0e8ff"
      />
      {/* Rim light — from behind */}
      <directionalLight
        position={[0, 3, -3]}
        intensity={0.7}
        color="#ffffff"
      />
      {/* Ambient base */}
      <ambientLight intensity={0.25} color="#8090a0" />
    </>
  );
}
