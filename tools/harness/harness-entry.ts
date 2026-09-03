/**
 * Verification harness: runs the real pipeline (parsers, grouper,
 * classifier, armness diffusion, seam marking, deformMesh) against an
 * actual scan and prints objective quality metrics per BF level.
 * Node-only; bundled by run-harness.mjs with '@' aliased to src/.
 */
import * as fs from 'node:fs';
import { parseCoreMeasuresCSV, parseBodyCompositionCSV } from '@/lib/pipeline/csvParser';
import {
  groupLandmarksIntoRings,
  extractArmReferencePoints,
} from '@/lib/pipeline/landmarkGrouper';
import {
  classifyVertices,
  computeArmThreshold,
  smoothArmnessField,
  markSeamBridges,
} from '@/lib/morph/segmentClassifier';
import { deformMesh } from '@/lib/morph/morphEngine';
import { computeAndroidness } from '@/lib/morph/sensitivityModel';
import type { LandmarkRing, SegmentOverrides } from '@/types/scan';
import { SEGMENT_ORDER } from '@/lib/constants/segmentDefs';

const [objPath, measuresPath, compPath] = process.argv.slice(2);

// ── Minimal OBJ parse (positions + faces) ──
const objText = fs.readFileSync(objPath, 'utf8');
const verts: number[] = [];
const faces: number[] = [];
for (const line of objText.split('\n')) {
  if (line.startsWith('v ')) {
    const p = line.trim().split(/\s+/);
    verts.push(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]));
  } else if (line.startsWith('f ')) {
    const p = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t.split('/')[0], 10) - 1);
    for (let k = 1; k + 1 < p.length + 0; k++) {
      if (p[k + 1] === undefined) break;
      faces.push(p[0], p[k], p[k + 1]);
    }
  }
}
const rawPositions = new Float32Array(verts);
const vertexCount = rawPositions.length / 3;

// ── Pipeline (mirrors useScanLoader) ──
const { measures, landmarks } = parseCoreMeasuresCSV(fs.readFileSync(measuresPath, 'utf8'));
const bodyComp = parseBodyCompositionCSV(fs.readFileSync(compPath, 'utf8'));
const rings = groupLandmarksIntoRings(landmarks);
const armRefs = extractArmReferencePoints(landmarks, rings);
const armThresholdMM = computeArmThreshold(rings);
const bindings = classifyVertices(rawPositions, rings, armThresholdMM, armRefs);

// normalize (same math as objParser.normalizeGeometry)
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < vertexCount; i++) {
  const x = rawPositions[i * 3], y = rawPositions[i * 3 + 1], z = rawPositions[i * 3 + 2];
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
}
const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
const scale = 1 / (maxY - minY);
const originalPositions = new Float32Array(vertexCount * 3);
for (let i = 0; i < vertexCount; i++) {
  originalPositions[i * 3] = (rawPositions[i * 3] - centerX) * scale;
  originalPositions[i * 3 + 1] = (rawPositions[i * 3 + 1] - minY) * scale;
  originalPositions[i * 3 + 2] = (rawPositions[i * 3 + 2] - centerZ) * scale;
}
const t = { centerX, centerZ, minY, scale };
const nRings: LandmarkRing[] = rings.map((ring) => ({
  ...ring,
  center: { x: (ring.center.x - t.centerX) * t.scale, y: (ring.center.y - t.minY) * t.scale, z: (ring.center.z - t.centerZ) * t.scale },
  height: (ring.height - t.minY) * t.scale,
  front: { x: (ring.front.x - t.centerX) * t.scale, y: (ring.front.y - t.minY) * t.scale, z: (ring.front.z - t.centerZ) * t.scale },
  back: { x: (ring.back.x - t.centerX) * t.scale, y: (ring.back.y - t.minY) * t.scale, z: (ring.back.z - t.centerZ) * t.scale },
  left: { x: (ring.left.x - t.centerX) * t.scale, y: (ring.left.y - t.minY) * t.scale, z: (ring.left.z - t.centerZ) * t.scale },
  right: { x: (ring.right.x - t.centerX) * t.scale, y: (ring.right.y - t.minY) * t.scale, z: (ring.right.z - t.centerZ) * t.scale },
  radius: { front: ring.radius.front * t.scale, back: ring.radius.back * t.scale, left: ring.radius.left * t.scale, right: ring.radius.right * t.scale },
}));
const armThreshold = armThresholdMM * t.scale;

// adjacency from faces
const nb: Set<number>[] = new Array(vertexCount);
for (let i = 0; i < vertexCount; i++) nb[i] = new Set();
for (let i = 0; i < faces.length; i += 3) {
  const a = faces[i], b = faces[i + 1], c = faces[i + 2];
  if (a >= vertexCount || b >= vertexCount || c >= vertexCount) continue;
  nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
}
const adjacency = nb.map((s2) => new Uint32Array([...s2]));

smoothArmnessField(bindings, adjacency);
const pinned = markSeamBridges(bindings, adjacency, originalPositions);

const zeroOv = SEGMENT_ORDER.reduce((a, id) => { (a as Record<string, number>)[id] = 0; return a; }, {} as SegmentOverrides);
const androidness = computeAndroidness('female', bodyComp.waistToHipRatio);
console.log(`verts=${vertexCount} rings=${rings.length} pinned=${pinned} androidness=${androidness.toFixed(3)}`);

// ── Metrics helpers ──
const bustH = nRings.find((r) => r.name === 'Bust')!.height;
function widthProfile(pos: Float32Array, armMax: number): Map<number, number> {
  // per 0.02 y-bin, max |x| among vertices with armness <= armMax
  const out = new Map<number, number>();
  for (let i = 0; i < vertexCount; i++) {
    const a = bindings[i]?.armness ?? 0;
    if (a > armMax) continue;
    const y = Math.round(pos[i * 3 + 1] / 0.02) * 0.02;
    const x = Math.abs(pos[i * 3]);
    if (!out.has(y) || x > out.get(y)!) out.set(y, x);
  }
  return out;
}
function wallMap(pos: Float32Array): Map<number, number> {
  const torsoWall = new Map<number, number>();
  for (let i = 0; i < vertexCount; i++) {
    const a = bindings[i]?.armness ?? 0;
    if (a > 0.1) continue;
    const y = pos[i * 3 + 1];
    if (y < bustH - 0.12 || y > bustH) continue;
    const bin = Math.round(y / 0.01);
    const x = Math.abs(pos[i * 3]);
    if (!torsoWall.has(bin) || x > torsoWall.get(bin)!) torsoWall.set(bin, x);
  }
  return torsoWall;
}
const baseWall = wallMap(originalPositions);
function armStandoff(pos: Float32Array): number {
  // FLAP GROWTH: for arm-side vertices that hug the torso wall at baseline
  // (proud <= 6mm), how much MORE proud do they become after deformation?
  const wall = wallMap(pos);
  let worst = 0;
  for (let i = 0; i < vertexCount; i++) {
    const a = bindings[i]?.armness ?? 0;
    if (a < 0.2) continue;
    const y0 = originalPositions[i * 3 + 1];
    if (y0 < bustH - 0.12 || y0 > bustH) continue;
    const bin = Math.round(y0 / 0.01);
    const w0 = baseWall.get(bin);
    const w1 = wall.get(bin);
    if (w0 === undefined || w1 === undefined) continue;
    const proud0 = Math.abs(originalPositions[i * 3]) - w0;
    if (proud0 > 0.0037) continue; // only wall-hugging candidates (~6mm)
    const proud1 = Math.abs(pos[i * 3]) - w1;
    const growth = proud1 - Math.max(0, proud0);
    if (growth > worst) worst = growth;
  }
  return worst;
}
function armAxisDeviation(pos: Float32Array): number {
  // per 0.02 band, centroid x of high-armness verts on +x side; deviation
  // from straight chord top-band -> bottom-band
  const bands = new Map<number, { sx: number; n: number }>();
  for (let i = 0; i < vertexCount; i++) {
    const a = bindings[i]?.armness ?? 0;
    if (a < 0.9) continue;
    if (pos[i * 3] <= 0) continue;
    const y = pos[i * 3 + 1];
    if (y < 0.52 || y > bustH - 0.02) continue;
    const bin = Math.round(y / 0.02);
    const cur = bands.get(bin) ?? { sx: 0, n: 0 };
    cur.sx += pos[i * 3]; cur.n++;
    bands.set(bin, cur);
  }
  const keys = [...bands.keys()].sort((a, b) => a - b);
  if (keys.length < 3) return 0;
  const lo = keys[0], hi = keys[keys.length - 1];
  const cLo = bands.get(lo)!.sx / bands.get(lo)!.n;
  const cHi = bands.get(hi)!.sx / bands.get(hi)!.n;
  let dev = 0;
  for (const k of keys) {
    const f = (k - lo) / (hi - lo);
    const chord = cLo + f * (cHi - cLo);
    const c = bands.get(k)!.sx / bands.get(k)!.n;
    dev = Math.max(dev, Math.abs(c - chord));
  }
  return dev;
}
const kneeY = nRings.filter((r) => r.name.startsWith('Knee')).reduce((s2, r) => s2 + r.height, 0) / 2;
const hipWidestY = nRings.find((r) => r.name === 'HipWidest')!.height;
const midThighY = nRings.filter((r) => r.name.startsWith('MidLeftThigh') || r.name.startsWith('MidRightThigh')).reduce((s2, r) => s2 + r.height, 0) / 2;
const calfY = nRings.filter((r) => r.name.startsWith('Calf')).reduce((s2, r) => s2 + r.height, 0) / 2;

function legColumnWidth(pos: Float32Array, yTarget: number): number {
  // width of the +x leg column at y: max x - min x among non-arm verts with x>0.01
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    if ((bindings[i]?.armness ?? 0) > 0.3) continue;
    const y = pos[i * 3 + 1];
    if (Math.abs(y - yTarget) > 0.012) continue;
    const x = pos[i * 3];
    if (x < 0.005) continue;
    if (x < lo) lo = x; if (x > hi) hi = x;
  }
  return hi > lo ? hi - lo : 0;
}
const waistY = nRings.find((r) => r.name === 'NarrowWaist')!.height;

/**
 * Curvature-bump metric over the waist->knee lateral silhouette: for each
 * interior 2cm bin, how far the width pokes above the average of its
 * neighbors (a lump) or dips below it (a crease). Returns the max bump and
 * dip in normalized units.
 */
function silhouetteSpikes(pos: Float32Array): { bump: number; dip: number } {
  const prof = widthProfile(pos, 0.3);
  const ys: number[] = [];
  for (let y = Math.round(kneeY / 0.02) * 0.02; y <= waistY + 1e-9; y += 0.02) {
    ys.push(Math.round(y / 50) * 50 === 0 ? Math.round(y * 50) / 50 : Math.round(y * 50) / 50);
  }
  let bump = 0;
  let dip = 0;
  for (let k = 1; k < ys.length - 1; k++) {
    const w0 = prof.get(ys[k - 1]);
    const w1 = prof.get(ys[k]);
    const w2 = prof.get(ys[k + 1]);
    if (w0 === undefined || w1 === undefined || w2 === undefined) continue;
    const mid = (w0 + w2) / 2;
    if (w1 - mid > bump) bump = w1 - mid;
    if (mid - w1 > dip) dip = mid - w1;
  }
  return { bump, dip };
}
const baseSpikes = silhouetteSpikes(originalPositions);

function report(label: string, deltaBF: number) {
  const pos = new Float32Array(originalPositions);
  deformMesh(pos, originalPositions, bindings, nRings, deltaBF, zeroOv, adjacency, 'female', armThreshold, androidness);
  const prof = widthProfile(pos, 0.3);
  // monotone check knee->hipwidest
  let dipMax = 0; let runMax = 0;
  const ys: number[] = [];
  for (let y = Math.round(kneeY / 0.02) * 0.02; y <= hipWidestY + 1e-9; y += 0.02) ys.push(Math.round(y / 0.02) * 0.02);
  let peak = -Infinity;
  for (let k = ys.length - 1; k >= 0; k--) { // from hip down to knee widths should not RISE after a dip
    const w = prof.get(ys[k]);
    if (w === undefined) continue;
    if (w > peak) peak = w; // widest so far moving down
  }
  // dip metric: for each y between, dip = max(0, min(w_above_max, w_below_max) - w(y))
  for (let k = 1; k < ys.length - 1; k++) {
    const w = prof.get(ys[k]); if (w === undefined) continue;
    let above = -Infinity, below = -Infinity;
    for (let m = k + 1; m < ys.length; m++) { const v = prof.get(ys[m]); if (v !== undefined) above = Math.max(above, v); }
    for (let m = 0; m < k; m++) { const v = prof.get(ys[m]); if (v !== undefined) below = Math.max(below, v); }
    const dip = Math.min(above, below) - w;
    if (dip > dipMax) dipMax = dip;
    runMax = Math.max(runMax, dip);
  }
  const thighW = legColumnWidth(pos, midThighY);
  const calfW = legColumnWidth(pos, calfY);
  const kneeW = legColumnWidth(pos, kneeY);
  const baseThigh = legColumnWidth(originalPositions, midThighY);
  const baseCalf = legColumnWidth(originalPositions, calfY);
  const baseKnee = legColumnWidth(originalPositions, kneeY);
  const spikes = silhouetteSpikes(pos);
  console.log(
    `${label}: latDip(knee..hip)=${(dipMax * 1641).toFixed(1)}mm ` +
    `bumpDelta=${((spikes.bump - baseSpikes.bump) * 1641).toFixed(1)}mm ` +
    `dipDelta=${((spikes.dip - baseSpikes.dip) * 1641).toFixed(1)}mm ` +
    `armStandoff=${(armStandoff(pos) * 1641).toFixed(1)}mm ` +
    `armAxisDev=${(armAxisDeviation(pos) * 1641).toFixed(1)}mm | ` +
    `thighW ${(thighW / baseThigh - 1) * 100 | 0}% kneeW ${(kneeW / baseKnee - 1) * 100 | 0}% calfW ${(calfW / baseCalf - 1) * 100 | 0}% ` +
    `taper(thigh/calf) ${(thighW / calfW).toFixed(2)} (base ${(baseThigh / baseCalf).toFixed(2)})`,
  );
}
report('BF 30->30 ( 0)', 0);
report('BF 30-> 5 (-25)', -25);
report('BF 30->55 (+25)', +25);

// ── Full-sweep gate: no silhouette lump/crease beyond natural + 3mm at
// any BF step in either direction. This is the regression gate that
// protects each direction while the other is tuned.
console.log('--- sweep gate (waist->knee curvature, tolerance 3mm) ---');
let pass = true;
for (let d = -25; d <= 25; d += 5) {
  if (d === 0) continue;
  const pos = new Float32Array(originalPositions);
  deformMesh(pos, originalPositions, bindings, nRings, d, zeroOv, adjacency, 'female', armThreshold, androidness);
  const sp = silhouetteSpikes(pos);
  const bumpD = (sp.bump - baseSpikes.bump) * 1641;
  const dipD = (sp.dip - baseSpikes.dip) * 1641;
  const ok = bumpD <= 3 && dipD <= 3;
  if (!ok) pass = false;
  console.log(`  d=${d >= 0 ? '+' : ''}${d}: bumpDelta=${bumpD.toFixed(1)}mm dipDelta=${dipD.toFixed(1)}mm ${ok ? 'OK' : 'FAIL'}`);
}
console.log(pass ? 'SWEEP GATE: PASS' : 'SWEEP GATE: FAIL');
if (!pass) process.exit(1);
