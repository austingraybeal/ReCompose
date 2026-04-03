'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSmplStore } from '@/lib/stores/smplStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { computeShape } from '@/lib/smpl/shapeEngine';
import { mapToBetas } from '@/lib/smpl/parameterMapper';
import type { Mesh } from 'three';
import { BufferGeometry, BufferAttribute, Color, Box3, Vector3 } from 'three';
import type { SegmentOverrides } from '@/types/scan';

const MESH_COLOR = new Color('#bccad8');

/**
 * Renders an SMPL parametric body model with real-time PCA deformation.
 * Normalizes the SMPL mesh to unit height centered at origin (matching scan normalization).
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

  // Compute normalization transform from SMPL raw coords to scene coords.
  // SMPL vertices are in meters, roughly centered at origin, ~1.7m tall.
  // We need to scale to unit height and position feet at y=0.
  const normalization = useMemo(() => {
    if (!modelData) return null;

    const vt = modelData.vTemplate;
    let minY = Infinity, maxY = -Infinity;
    let sumX = 0, sumZ = 0;

    for (let i = 0; i < modelData.vertexCount; i++) {
      const y = vt[i * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX += vt[i * 3];
      sumZ += vt[i * 3 + 2];
    }

    const height = maxY - minY;
    const scale = height > 0 ? 1.0 / height : 1.0;
    const centerX = sumX / modelData.vertexCount;
    const centerZ = sumZ / modelData.vertexCount;

    return { scale, minY, centerX, centerZ };
  }, [modelData]);

  // Create geometry once from model faces
  const geometry = useMemo(() => {
    if (!modelData || !normalization) return null;

    const geo = new BufferGeometry();

    // Create normalized positions from template
    const positions = new Float32Array(modelData.vertexCount * 3);
    for (let i = 0; i < modelData.vertexCount; i++) {
      positions[i * 3] = (modelData.vTemplate[i * 3] - normalization.centerX) * normalization.scale;
      positions[i * 3 + 1] = (modelData.vTemplate[i * 3 + 1] - normalization.minY) * normalization.scale;
      positions[i * 3 + 2] = (modelData.vTemplate[i * 3 + 2] - normalization.centerZ) * normalization.scale;
    }

    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setIndex(new BufferAttribute(modelData.faces, 1));
    geo.computeVertexNormals();
    return geo;
  }, [modelData, normalization]);

  // Reusable output buffer for deformation (raw SMPL coords)
  const outputBuffer = useMemo(() => {
    if (!modelData) return null;
    return new Float32Array(modelData.vertexCount * 3);
  }, [modelData]);

  // Real-time PCA deformation
  useFrame(() => {
    if (!modelData || !geometry || !outputBuffer || !useSmpl || !normalization) return;

    const deltaBodyFat = globalBodyFat - originalBodyFat;

    // Map UI values to SMPL betas
    const betas = mapToBetas(
      deltaBodyFat,
      segmentOverrides as SegmentOverrides,
      modelData.shapeComponentCount,
      mappingConfig
    );

    // Compute deformed shape (in raw SMPL coordinates)
    const result = computeShape(modelData, betas, outputBuffer);

    // Normalize deformed positions to scene coordinates
    const posAttr = geometry.getAttribute('position') as BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < modelData.vertexCount; i++) {
      arr[i * 3] = (result.positions[i * 3] - normalization.centerX) * normalization.scale;
      arr[i * 3 + 1] = (result.positions[i * 3 + 1] - normalization.minY) * normalization.scale;
      arr[i * 3 + 2] = (result.positions[i * 3 + 2] - normalization.centerZ) * normalization.scale;
    }

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
