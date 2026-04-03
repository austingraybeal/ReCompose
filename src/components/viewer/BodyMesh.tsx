'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useScanStore } from '@/lib/stores/scanStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { deformMesh } from '@/lib/morph/morphEngine';
import type { Mesh, Intersection } from 'three';
import { Color, BufferAttribute } from 'three';

const MESH_COLOR = new Color('#c4a882');

const SEGMENT_COLORS: Record<string, Color> = {
  shoulders: new Color('#4ac8e8'),
  arms: new Color('#5de8d0'),
  torso: new Color('#4acfa0'),
  waist: new Color('#f0c84a'),
  hips: new Color('#f0764a'),
  thighs: new Color('#e879a8'),
  legs: new Color('#a78bfa'),
};

export default function BodyMesh() {
  const meshRef = useRef<Mesh>(null);
  const scanData = useScanStore((s) => s.scanData);
  const originalBodyFat = useMorphStore((s) => s.originalBodyFat);
  const globalBodyFat = useMorphStore((s) => s.globalBodyFat);
  const segmentOverrides = useMorphStore((s) => s.segmentOverrides);
  const wireframe = useViewStore((s) => s.wireframe);
  const segmentHighlight = useViewStore((s) => s.segmentHighlight);
  const hoveredSegment = useViewStore((s) => s.hoveredSegment);
  const setHoveredSegment = useViewStore((s) => s.setHoveredSegment);
  const setFocusedSegment = useViewStore((s) => s.setFocusedSegment);

  // Clone geometry ONCE when scanData changes, not every render
  const clonedGeometry = useMemo(() => {
    if (!scanData) return null;
    return scanData.geometry.clone();
  }, [scanData]);

  // Apply morph deformation
  useFrame(() => {
    if (!meshRef.current || !scanData || !clonedGeometry) return;

    const positions = clonedGeometry.getAttribute('position');
    if (!positions) return;

    const posArray = positions.array as Float32Array;
    const deltaBodyFat = globalBodyFat - originalBodyFat;

    deformMesh(
      posArray,
      scanData.originalPositions,
      scanData.vertexBindings,
      scanData.rings,
      deltaBodyFat,
      segmentOverrides
    );

    positions.needsUpdate = true;
    clonedGeometry.computeVertexNormals();
  });

  // Apply segment highlight colors
  useEffect(() => {
    if (!clonedGeometry || !scanData) return;

    if (segmentHighlight) {
      const colors = new Float32Array(scanData.vertexBindings.length * 3);
      for (let i = 0; i < scanData.vertexBindings.length; i++) {
        const seg = scanData.vertexBindings[i].segmentId;
        const isHovered = hoveredSegment === seg;
        const color = SEGMENT_COLORS[seg] ?? MESH_COLOR;
        const intensity = isHovered ? 1.0 : 0.3;
        colors[i * 3] = color.r * intensity + MESH_COLOR.r * (1 - intensity);
        colors[i * 3 + 1] = color.g * intensity + MESH_COLOR.g * (1 - intensity);
        colors[i * 3 + 2] = color.b * intensity + MESH_COLOR.b * (1 - intensity);
      }
      clonedGeometry.setAttribute('color', new BufferAttribute(colors, 3));
    } else {
      clonedGeometry.deleteAttribute('color');
    }
  }, [scanData, clonedGeometry, segmentHighlight, hoveredSegment]);

  if (!scanData || !clonedGeometry) return null;

  const handlePointerMove = (e: { intersections: Intersection[] }) => {
    if (!segmentHighlight || !scanData) return;
    const intersection = e.intersections[0];
    if (!intersection?.face) {
      setHoveredSegment(null);
      return;
    }
    const idx = intersection.face.a;
    const binding = scanData.vertexBindings[idx];
    if (binding) {
      setHoveredSegment(binding.segmentId);
    }
  };

  const handlePointerOut = () => {
    setHoveredSegment(null);
  };

  const handleClick = (e: { intersections: Intersection[] }) => {
    if (!segmentHighlight || !scanData) return;
    const intersection = e.intersections[0];
    if (!intersection?.face) return;
    const idx = intersection.face.a;
    const binding = scanData.vertexBindings[idx];
    if (binding) {
      setFocusedSegment(binding.segmentId);
    }
  };

  return (
    <mesh
      ref={meshRef}
      geometry={clonedGeometry}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <meshStandardMaterial
        color={MESH_COLOR}
        roughness={0.7}
        metalness={0.05}
        wireframe={wireframe}
        vertexColors={segmentHighlight}
      />
    </mesh>
  );
}
