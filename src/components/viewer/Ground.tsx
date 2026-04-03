'use client';

import { Grid } from '@react-three/drei';

/**
 * Ground plane with subtle grid.
 */
export default function Ground() {
  return (
    <Grid
      args={[10, 10]}
      position={[0, -0.001, 0]}
      cellSize={0.1}
      cellThickness={0.5}
      cellColor="#1e2130"
      sectionSize={0.5}
      sectionThickness={1}
      sectionColor="#2a2d3a"
      fadeDistance={8}
      fadeStrength={1.5}
      infiniteGrid
    />
  );
}
