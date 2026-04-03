'use client';

import { forwardRef } from 'react';
import { Canvas } from '@react-three/fiber';
import Lighting from './Lighting';
import Ground from './Ground';
import CameraRig from './CameraRig';
import BodyMesh from './BodyMesh';
import GhostOverlay from './GhostOverlay';
import SegmentHighlight from './SegmentHighlight';

const SceneCanvas = forwardRef<HTMLCanvasElement>(function SceneCanvas(_props, ref) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ fov: 40, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        style={{ background: '#2a2e38' }}
        dpr={[1, 2]}
        ref={ref}
      >
        <Lighting />
        <Ground />
        <CameraRig />
        <BodyMesh />
        <GhostOverlay />
        <SegmentHighlight />
      </Canvas>
    </div>
  );
});

export default SceneCanvas;
