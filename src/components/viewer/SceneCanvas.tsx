'use client';

import { Canvas } from '@react-three/fiber';
import Lighting from './Lighting';
import Ground from './Ground';
import CameraRig from './CameraRig';
import BodyMesh from './BodyMesh';
import GhostOverlay from './GhostOverlay';
import SegmentHighlight from './SegmentHighlight';

export default function SceneCanvas() {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ fov: 40, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#0a0b0f' }}
        dpr={[1, 2]}
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
}
