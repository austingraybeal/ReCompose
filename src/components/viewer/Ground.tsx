'use client';

import { Grid } from '@react-three/drei';

/**
 * Ground plane with subtle grid — lighter to match brighter UI.
 */
export default function Ground() {
  return (
    <Grid
      args={[10, 10]}
      position={[0, -0.001, 0]}
      cellSize={0.1}
      cellThickness={0.5}
      cellColor="#3a3e4c"
      sectionSize={0.5}
      sectionThickness={1}
      sectionColor="#484c5c"
      fadeDistance={8}
      fadeStrength={1.5}
      infiniteGrid
    />
  );
}
