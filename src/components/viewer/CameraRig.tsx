'use client';

import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useViewStore } from '@/lib/stores/viewStore';
import { Vector3 } from 'three';

const PRESET_POSITIONS: Record<string, [number, number, number]> = {
  front: [0, 0.5, 2.5],
  side: [2.5, 0.5, 0],
  back: [0, 0.5, -2.5],
  quarter: [1.8, 0.6, 1.8],
};

const TARGET = new Vector3(0, 0.45, 0);

function CameraAnimator() {
  const { camera } = useThree();
  const cameraPreset = useViewStore((s) => s.cameraPreset);
  const animating = useRef(false);
  const startPos = useRef(new Vector3());
  const endPos = useRef(new Vector3());
  const progress = useRef(0);

  useEffect(() => {
    const pos = PRESET_POSITIONS[cameraPreset];
    if (!pos) return;

    startPos.current.copy(camera.position);
    endPos.current.set(pos[0], pos[1], pos[2]);
    progress.current = 0;
    animating.current = true;
  }, [cameraPreset, camera]);

  useFrame((_, delta) => {
    if (!animating.current) return;

    progress.current += delta / 0.6;
    const t = Math.min(progress.current, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    camera.position.lerpVectors(startPos.current, endPos.current, ease);
    camera.lookAt(TARGET);

    if (t >= 1) animating.current = false;
  });

  useEffect(() => {
    camera.position.set(0, 0.5, 2.5);
    camera.lookAt(TARGET);
  }, [camera]);

  return null;
}

export default function CameraRig() {
  return (
    <>
      <CameraAnimator />
      <OrbitControls
        target={[0, 0.45, 0]}
        maxPolarAngle={Math.PI / 2}
        minDistance={1}
        maxDistance={6}
        enablePan={false}
        dampingFactor={0.08}
        enableDamping
      />
    </>
  );
}
