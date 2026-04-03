'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSmplStore } from '@/lib/stores/smplStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { computeShapeWithSegments } from '@/lib/smpl/shapeEngine';
import { mapToBetas } from '@/lib/smpl/parameterMapper';
import type { Mesh } from 'three';
import { BufferGeometry, BufferAttribute, Color } from 'three';
import type { SegmentOverrides } from '@/types/scan';

const MESH_COLOR = new Color('#bccad8');

/**
 * Renders an SMPL parametric body model with real-time PCA deformation.
 * This replaces BodyMesh when an SMPL model is loaded.
 */
export default function SMPLMesh() {
  const meshRef = useRef<Mesh>(null);
  const modelData = useSmplStore((s) => s.modelData);
  const mappingConfig = useSmplStore((s) => s.mappingConfig);
  const useSmpl = useSmplStore((s) => s.useSmpl);
  const originalBodyFat = useMorphStore((s) => s.originalBodyFat);
  const globalBodyFat = useMorphStore((s) => s.globalBodyFat);
  const segmentOverrides = useMorphStore((s) => s.segmentOverrides);
  const wireframe = useViewStore((s) => s.wireframe);

  // Create geometry once from model faces
  const geometry = useMemo(() => {
    if (!modelData) return null;

    const geo = new BufferGeometry();

    // Set initial positions from template
    const positions = new Float32Array(modelData.vTemplate);
    geo.setAttribute('position', new BufferAttribute(positions, 3));

    // Set face indices
    geo.setIndex(new BufferAttribute(modelData.faces, 1));

    geo.computeVertexNormals();
    return geo;
  }, [modelData]);

  // Reusable output buffer for deformation
  const outputBuffer = useMemo(() => {
    if (!modelData) return null;
    return new Float32Array(modelData.vertexCount * 3);
  }, [modelData]);

  // Real-time PCA deformation
  useFrame(() => {
    if (!modelData || !geometry || !outputBuffer || !useSmpl) return;

    const deltaBodyFat = globalBodyFat - originalBodyFat;

    // Map UI values to SMPL betas
    const betas = mapToBetas(
      deltaBodyFat,
      segmentOverrides as SegmentOverrides,
      modelData.shapeComponentCount,
      mappingConfig
    );

    // Compute deformed shape
    const result = computeShapeWithSegments(
      modelData,
      betas,
      segmentOverrides as Record<string, number>,
      outputBuffer
    );

    // Update geometry positions
    const posAttr = geometry.getAttribute('position') as BufferAttribute;
    (posAttr.array as Float32Array).set(result.positions);
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  if (!modelData || !geometry || !useSmpl) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={MESH_COLOR}
        roughness={0.7}
        metalness={0.05}
        wireframe={wireframe}
      />
    </mesh>
  );
}
