# PROJECT_INSTRUCTIONS.md — ReCompose

## Product Vision

**ReCompose** is a research-grade, web-based body composition visualization platform. Users upload a 3D body scan and paired measurement data, then interactively explore what their body would look like at different body fat percentages — both globally and per body segment — using real-time morphing controls. The tool is designed for researchers, clinicians, and health professionals studying body composition, with a path to consumer use.

The name "ReCompose" is a deliberate double meaning: **re-compose** (reshape, reimagine your body) + **body composition** (the scientific foundation). Tagline: *"See your future form."*

The product should feel like a precision instrument — clinical rigor wrapped in a cinematic, modern interface.

---

## Architecture Overview

```
recompose/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout + providers
│   ├── page.tsx                  # Landing / upload page
│   ├── viewer/
│   │   └── page.tsx              # Main 3D viewer page
│   └── globals.css               # Tailwind + CSS variables
├── components/
│   ├── ui/                       # Reusable UI primitives
│   │   ├── GlobalSlider.tsx      # Master BF% slider
│   │   ├── RegionalPanel.tsx     # Collapsible segment sliders panel
│   │   ├── SegmentSlider.tsx     # Individual segment slider component
│   │   ├── MetricsPanel.tsx      # Right-side metrics display
│   │   ├── ViewControls.tsx      # Camera preset buttons
│   │   ├── ToggleBar.tsx         # Wireframe/ghost/segment toggles
│   │   ├── UploadZone.tsx        # Drag-and-drop file upload
│   │   └── FileValidator.tsx     # Upload validation feedback
│   ├── viewer/                   # 3D viewer components
│   │   ├── SceneCanvas.tsx       # R3F Canvas wrapper
│   │   ├── BodyMesh.tsx          # OBJ mesh renderer + morph
│   │   ├── GhostOverlay.tsx      # Original body wireframe ghost
│   │   ├── SegmentHighlight.tsx  # Hover-to-highlight segment regions
│   │   ├── Lighting.tsx          # Three-point light rig
│   │   ├── Ground.tsx            # Ground plane + grid
│   │   └── CameraRig.tsx        # Animated camera presets
│   └── layout/
│       ├── ViewerLayout.tsx      # Viewer page chrome
│       └── Header.tsx            # Minimal top bar
├── lib/
│   ├── pipeline/                 # Data ingestion
│   │   ├── objParser.ts          # OBJ file → Three.js geometry
│   │   ├── csvParser.ts          # CSV → structured data
│   │   ├── landmarkGrouper.ts    # Group landmarks into rings
│   │   └── validator.ts          # Validate file completeness
│   ├── morph/                    # Core morphing engine
│   │   ├── morphEngine.ts        # Main deformation algorithm
│   │   ├── ringInterpolation.ts  # Vertex ↔ ring assignment
│   │   ├── segmentClassifier.ts  # Classify vertices into 6 segments
│   │   ├── sensitivityModel.ts   # Regional BF sensitivity coefficients
│   │   ├── segmentBlending.ts    # Smooth transitions between segments
│   │   └── metricProjection.ts   # Project metrics at new BF%
│   ├── stores/                   # Zustand state
│   │   ├── scanStore.ts          # Loaded scan data
│   │   ├── morphStore.ts         # Global BF + regional overrides
│   │   └── viewStore.ts          # UI state (camera, toggles)
│   └── constants/
│       ├── designTokens.ts       # Colors, spacing, typography
│       ├── bodyRegions.ts        # Region definitions + metadata
│       └── segmentDefs.ts        # 6-segment definitions + ring mappings
├── hooks/
│   ├── useScanLoader.ts          # Orchestrates file loading
│   ├── useBodyMorph.ts           # Connects global + regional → mesh deformation
│   ├── useSegmentClassifier.ts   # Assigns vertices to segments on load
│   ├── useMetricProjection.ts    # Computes projected metrics
│   └── useCameraPresets.ts       # Animated camera transitions
├── workers/
│   └── objParserWorker.ts        # Off-thread OBJ parsing
├── public/
│   ├── sample/                   # Sample scan data for demo mode
│   └── fonts/
├── types/
│   └── scan.ts                   # TypeScript interfaces for all data
├── PROJECT_INSTRUCTIONS.md
└── README.md
```

---

## Design System

### Brand Identity
- **Name:** ReCompose
- **Tagline:** "See your future form."
- **Tone:** Precision meets possibility. Clinical but not cold. Cinematic but not flashy.

### Color Tokens (CSS Variables)

```css
:root {
  /* Backgrounds */
  --rc-bg-primary: #0a0b0f;
  --rc-bg-surface: #14161d;
  --rc-bg-elevated: #1a1d28;
  --rc-bg-hover: #1e2130;

  /* Borders */
  --rc-border-default: #1e2130;
  --rc-border-subtle: #15171f;
  --rc-border-accent: rgba(62, 207, 180, 0.3);
  --rc-border-active: rgba(62, 207, 180, 0.6);

  /* Text */
  --rc-text-primary: #e8e9ed;
  --rc-text-secondary: #9ca0b0;
  --rc-text-dim: #6b7080;
  --rc-text-inverse: #0a0b0f;

  /* Accent */
  --rc-accent: #3ecfb4;
  --rc-accent-dim: rgba(62, 207, 180, 0.12);
  --rc-accent-glow: rgba(62, 207, 180, 0.35);

  /* Body fat spectrum (slider track + mesh tinting) */
  --rc-bf-lean: #3ecfb4;
  --rc-bf-mid: #f0c84a;
  --rc-bf-high: #f0764a;
  --rc-bf-very-high: #e0445a;

  /* Deltas */
  --rc-delta-positive: #f0764a;
  --rc-delta-negative: #3ecfb4;
  --rc-delta-neutral: #6b7080;

  /* Segment highlight colors */
  --rc-seg-shoulders: #4ac8e8;
  --rc-seg-arms: #5de8d0;
  --rc-seg-torso: #4acfa0;
  --rc-seg-waist: #f0c84a;
  --rc-seg-hips: #f0764a;
  --rc-seg-legs: #a78bfa;

  /* Shadows */
  --rc-shadow-panel: 0 8px 32px rgba(0, 0, 0, 0.5);
  --rc-shadow-glow: 0 0 20px rgba(62, 207, 180, 0.2);
}
```

### Typography

```css
--rc-font-mono: 'Space Mono', 'SF Mono', 'Fira Code', monospace;
--rc-font-body: 'DM Sans', 'SF Pro', -apple-system, sans-serif;

--rc-text-xs: 10px;
--rc-text-sm: 12px;
--rc-text-base: 14px;
--rc-text-lg: 18px;
--rc-text-xl: 28px;
--rc-text-hero: 48px;
```

### Spacing
4px base grid. Panel padding: 16-24px. Gaps: 8px tight, 12px default, 20px loose, 32px section.

### Animation Principles
- **Mesh morphing:** Lerp vertex positions over 120ms
- **Number changes:** Spring animation (framer-motion, damping: 20, stiffness: 200)
- **Camera transitions:** Ease-in-out over 600ms
- **Panel hover/focus:** 150ms ease-out
- **Slider thumb:** Scale 1.15 on active, 100ms transition
- **Segment highlight on hover:** Fade in tint 200ms, fade out 300ms
- **Regional panel expand/collapse:** 300ms ease-in-out with height animation

### Component Guidelines
- Panels: `border-radius: 12px`, 1px border, surface background, `backdrop-filter: blur(20px)`
- Buttons: Ghost style default, filled on hover
- Labels: ALL CAPS, `letter-spacing: 2px`, dim color
- Monospace values: `font-weight: 700`
- Active regional sliders (value ≠ 0): accent border glow to show override is active

---

## Core Algorithm: Mesh Morphing Engine

### Overview
The morph engine deforms a 3D body mesh using two layers of control: a global body fat slider and six regional segment sliders. The global slider drives proportional whole-body changes. Regional sliders apply additional per-segment offsets for fine-grained control.

### The Six Body Segments

```typescript
export interface SegmentDef {
  id: string;
  label: string;
  icon: string;
  rings: string[];           // Which landmark rings belong to this segment
  color: string;             // Highlight color
  yRange: [number, number];  // Approximate Y-height range in mm
  isLateral?: boolean;       // True for Arms (uses X-distance, not Y-height alone)
}

export const SEGMENTS: SegmentDef[] = [
  {
    id: 'shoulders',
    label: 'Shoulders',
    icon: '🦴',
    rings: ['Collar', 'OverArm'],
    color: 'var(--rc-seg-shoulders)',
    yRange: [1180, 1380],
  },
  {
    id: 'arms',
    label: 'Arms',
    icon: '💪',
    rings: [],  // Arms are classified by X-distance, not rings
    color: 'var(--rc-seg-arms)',
    yRange: [0, 1280],
    isLateral: true,
  },
  {
    id: 'torso',
    label: 'Torso',
    icon: '🫁',
    rings: ['Bust', 'BustWithDrop', 'UnderBust'],
    color: 'var(--rc-seg-torso)',
    yRange: [1070, 1180],
  },
  {
    id: 'waist',
    label: 'Waist',
    icon: '⭕',
    rings: ['Waist', 'WaistAt50', 'StomachFP', 'StomachMax', 'Abdomen'],
    color: 'var(--rc-seg-waist)',
    yRange: [860, 1070],
  },
  {
    id: 'hips',
    label: 'Hips',
    icon: '🍑',
    rings: ['Seat', 'Hip', 'HipWidest'],
    color: 'var(--rc-seg-hips)',
    yRange: [700, 860],
  },
  {
    id: 'legs',
    label: 'Legs',
    icon: '🦵',
    rings: [
      'UpperLeftThigh', 'UpperRightThigh',
      'MidLeftThigh', 'MidRightThigh',
      'ActualMidLeftThigh', 'ActualMidRightThigh',
      'KneeLeftLeg', 'KneeRightLeg',
      'ActualKneeLeftLeg', 'ActualKneeRightLeg',
      'UnderKneeLeftLeg', 'UnderKneeRightLeg',
      'CalfLeftLeg', 'CalfRightLeg',
      'AnkleLeftLeg', 'AnkleRightLeg',
      'ActualAnkleLeftLeg', 'ActualAnkleRightLeg',
    ],
    color: 'var(--rc-seg-legs)',
    yRange: [0, 700],
  },
];
```

### Step-by-Step Algorithm

#### 1. Preprocessing (on scan load)

```
A. Ring Processing:
  For each of the 33 landmark cross-section rings:
    1. Identify 4 cardinal points (Front, Back, Left, Right)
    2. Compute ring center = average of 4 points
    3. Compute ring height = average Y of 4 points
    4. Compute radial distances from center to each cardinal point
    5. Assign a body region tag + sensitivity coefficient
    6. Assign to a segment (Shoulders/Arms/Torso/Waist/Hips/Legs)

B. Vertex Classification:
  Compute the torso half-width threshold:
    torsoHalfWidth = average of |Bust.Left.x - BustCenter.x| and |Bust.Right.x - BustCenter.x|
    armThreshold = torsoHalfWidth * 1.05  (5% buffer)

  For each mesh vertex:
    1. If |vertex.x - centerAxis.x| > armThreshold AND vertex.y > ankleHeight:
       → Classify as "arms" segment
    2. Else: find closest ring(s) by Y-height
       → Classify into the segment that owns those rings
    3. For vertices in transition zones between segments (within 30mm of boundary):
       → Store blend weights to both adjacent segments
    4. Store per-vertex: { segmentId, ringAboveIdx, ringBelowIdx, ringWeight, radialAngle, radialDistance, blendWeights? }
```

#### 2. Deformation (per frame, when any slider changes)

```
Inputs:
  - deltaBodyFat = globalSliderBF - originalBF
  - segmentOverrides = { shoulders: 0, arms: 0, torso: 0, waist: 0, hips: 0, legs: 0 }

For each ring:
  ringSensitivity = RING_SENSITIVITY[ring.name]
  globalScale = 1 + (deltaBodyFat * ringSensitivity / 100)
  segmentId = ring.segment
  regionalScale = 1 + (segmentOverrides[segmentId] / 100)
  combinedScale = globalScale * regionalScale

For each vertex:
  1. Get bound rings (above, below) and interpolation weight
  2. Interpolate combined scale between the two rings
  3. If vertex is in a transition zone, blend scale with adjacent segment's scale
  4. Apply non-uniform angular scaling:
     angularScale = interpolate based on vertex's radial angle:
       - Front (0°): combinedScale * 1.15
       - Back (180°): combinedScale * 0.90
       - Left (90°) / Right (270°): combinedScale * 1.00
       - Smooth cosine interpolation between these
  5. newPos = ringCenter + radialDirection * originalDistance * angularScale
  6. Keep Y coordinate unchanged

Recompute vertex normals.
```

#### 3. Regional Sensitivity Coefficients

```typescript
export const RING_SENSITIVITY: Record<string, number> = {
  // Shoulders segment
  HeadCircum: 0.00,
  Collar: 0.10,
  OverArm: 0.40,

  // Torso segment
  Bust: 0.55,
  BustWithDrop: 0.55,
  UnderBust: 0.65,

  // Waist segment (highest — primary fat depot)
  Waist: 1.50,
  WaistAt50: 1.50,
  StomachFP: 1.60,
  StomachMax: 1.60,
  Abdomen: 1.40,

  // Hips segment
  Seat: 1.10,
  Hip: 1.05,
  HipWidest: 1.00,

  // Legs segment (gradient: high proximal → low distal)
  UpperLeftThigh: 0.80,
  UpperRightThigh: 0.80,
  MidLeftThigh: 0.50,
  ActualMidLeftThigh: 0.50,
  MidRightThigh: 0.50,
  ActualMidRightThigh: 0.50,
  KneeLeftLeg: 0.15,
  KneeRightLeg: 0.15,
  ActualKneeLeftLeg: 0.15,
  ActualKneeRightLeg: 0.15,
  UnderKneeLeftLeg: 0.12,
  UnderKneeRightLeg: 0.12,
  CalfLeftLeg: 0.20,
  CalfRightLeg: 0.20,
  AnkleLeftLeg: 0.05,
  AnkleRightLeg: 0.05,
  ActualAnkleLeftLeg: 0.05,
  ActualAnkleRightLeg: 0.05,
};

// Arm vertices use a flat sensitivity since they aren't ring-based
export const ARM_SENSITIVITY = 0.35;
```

**Note:** These are initial estimates based on published allometric scaling. The system must be designed so coefficients are easily tunable. Phase 2 includes a "research mode" panel for adjusting them in real time.

#### 4. Segment Interaction Model

```typescript
// Zustand store shape
interface MorphState {
  originalBodyFat: number;            // From scan (e.g., 23.19)
  globalBodyFat: number;              // Current slider value
  segmentOverrides: {                 // Per-segment additional offsets
    shoulders: number;                // -50 to +50
    arms: number;
    torso: number;
    waist: number;
    hips: number;
    legs: number;
  };
  lockProportional: boolean;          // When true, regional sliders follow global

  // Actions
  setGlobalBodyFat: (bf: number) => void;
  setSegmentOverride: (segment: string, value: number) => void;
  resetRegionalOverrides: () => void;
  toggleLockProportional: () => void;
}
```

**Interaction rules:**
- `setGlobalBodyFat`: Updates global BF. If `lockProportional` is ON, resets all overrides to 0. If OFF, overrides are preserved.
- `setSegmentOverride`: Only affects the one segment. Does not change global slider.
- `resetRegionalOverrides`: Sets all 6 overrides to 0.
- The final deformation for any vertex = `f(globalDelta, ringSensitivity) * g(segmentOverride)`

#### 5. Metric Projection

When sliders move, project what key metrics would be:

```
deltaFatMass = (globalBF - originalBF) / 100 * originalWeight
estimatedWeight = originalWeight + deltaFatMass
  (adjusted further by regional overrides — waist/hip overrides affect weight more)

estimatedBMI = estimatedWeight_kg / (height_m)^2

estimatedWaist = originalWaistCirc * waistCombinedScale
estimatedHip = originalHipCirc * hipCombinedScale
estimatedWHR = estimatedWaist / estimatedHip
```

---

## UI Layout Specification

```
┌─────────────────────────────────────────────────────────┐
│  [ReCompose]          [Wireframe] [Ghost] [Segments]    │
├────────┬───────────────────────────────────┬────────────┤
│        │                                   │ METRICS    │
│ CAMERA │                                   │            │
│ [Front]│         3D BODY VIEWER            │ Weight     │
│ [Side] │                                   │ BMI        │
│ [Back] │         (OrbitControls)           │ Waist      │
│ [¾]    │                                   │ Hip        │
│        │                                   │ WHR        │
│────────│                                   │            │
│SEGMENTS│                                   │            │
│(expand)│                                   │            │
│ 🦴 ---|│                                   │            │
│ 💪 ---|│                                   │            │
│ 🫁 ---|│                                   │            │
│ ⭕ ---|│                                   │            │
│ 🍑 ---|│                                   │            │
│ 🦵 ---|│                                   │            │
│[Reset] │                                   │            │
├────────┴───────────────────────────────────┴────────────┤
│                      ▲ ACTUAL                            │
│              ████████▓░░░░░░░░░░░░░                     │
│                    23.2% Body Fat                        │
│              5% ─────────────────── 55%                  │
└─────────────────────────────────────────────────────────┘
```

**Mobile layout:** Global slider stays at bottom. Metrics collapse to a horizontal scroll. Regional controls move to a swipe-up bottom sheet. Camera presets become swipe gestures.

---

## Data Format Specification

### Core Measures CSV
```
type,enum,name,valid,value (metric),x (mm),y (mm),z (mm)
measure,0,CollarCircumference,True,32.29,,,
landmark,0,CrotchPoint,True,,-11.536,696.780,-73.980
```
- **Measure rows:** `type=measure`, value in column 5, no xyz
- **Landmark rows:** `type=landmark`, xyz in mm, no value
- Landmarks: `[Region][Direction]` where Direction ∈ {Front, Back, Left, Right}

### Body Composition CSV
```
name,value
BodyFat,23.19
```

### OBJ Mesh
- Standard Wavefront OBJ. 10K–100K vertices.
- Coordinate system: X = lateral (+ left), Y = vertical (+ up), Z = anterior-posterior (+ front)
- Units: millimeters. Same coordinate space as landmarks.

---

## Development Phases

### Phase 1: MVP (Current Sprint)
- [ ] Project scaffolding (Next.js, Tailwind, R3F, Zustand)
- [ ] File upload + parsing pipeline
- [ ] 3D mesh viewer with lighting and camera controls
- [ ] Morph engine: vertex binding + real-time deformation
- [ ] Global body fat slider with metric projection
- [ ] Regional segment sliders (6 segments)
- [ ] Vertex-to-segment classification (including arm detection)
- [ ] Segment transition blending
- [ ] Ghost overlay (original vs. morphed)
- [ ] Segment highlight mode (hover to identify regions)
- [ ] Camera presets (Front/Side/Back/¾)
- [ ] Deploy to Vercel

### Phase 2: Polish & Research Tools
- [ ] Laplacian smoothing after deformation
- [ ] Measurement tape visualization (circumference lines on mesh)
- [ ] Screenshot / export (capture current view as PNG)
- [ ] Side-by-side comparison mode (two BF values simultaneously)
- [ ] Time-series mode: upload multiple scans, see progression
- [ ] Research mode panel: adjustable sensitivity coefficients per ring
- [ ] Deformation heatmap visualization
- [ ] Per-segment metric breakdowns (segmental lean mass, regional fat estimates)

### Phase 3: Advanced Features
- [ ] Sex-specific deformation models (male vs. female fat patterns)
- [ ] Left/right leg and arm independent control (split from linked)
- [ ] Texture mapping (skin-like material from scan photos)
- [ ] Multi-compartment model: fat / muscle / bone visualization
- [ ] Integration with common scanners (Fit3D, Styku, Size Stream)
- [ ] Database backend for longitudinal tracking
- [ ] User accounts + HIPAA-compliant storage
- [ ] API for programmatic access (research batch processing)

### Phase 4: Commercialization
- [ ] White-label configuration for clinics and research labs
- [ ] PDF report generation (before/after with metrics)
- [ ] Health platform integrations (Apple Health, Google Fit)
- [ ] Scan-to-avatar pipeline (photos → mesh via AI, no scanner needed)
- [ ] IRB-ready export formats

---

## Quality Standards

### Performance
- First meaningful paint: < 2 seconds
- OBJ parse + load: < 3 seconds for 50K vertex mesh
- Morph frame time: < 16ms (60fps)
- Slider interaction: zero perceived latency
- Segment classification: < 500ms on load

### Code Quality
- TypeScript strict mode, no `any`
- JSDoc on all morph engine functions
- Unit tests: CSV parsing, landmark grouping, segment classification, deformation math, metric projection
- Integration test: load sample → classify segments → apply global morph → apply regional override → verify vertex displacement

### Browser Support
- Chrome 90+, Safari 16+, Firefox 100+, Edge 90+
- WebGL 2.0 required (graceful fallback if unavailable)
- Mobile Safari and Chrome (touch orbit controls)

---

## Security & Privacy

Body scan data is sensitive biometric information. Even for MVP:
- Never persist uploaded data to any server — all processing client-side
- No analytics that capture body metrics
- Clear Zustand store on page unload
- Display privacy notice on upload: "Your scan data never leaves your device."
- Future phases with storage: HIPAA compliance mandatory

---

## Tech Stack

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14+ (App Router) | Best React DX, Vercel integration |
| 3D Engine | Three.js via @react-three/fiber | Declarative scene, React hooks |
| State | Zustand | Minimal boilerplate, R3F compatible |
| Styling | Tailwind CSS + CSS Variables | Rapid iteration + token consistency |
| Animation | Framer Motion (UI) + Three.js lerp (3D) | Best-in-class per domain |
| Parsing | PapaParse (CSV) + OBJLoader (mesh) | Battle-tested |
| Deployment | Vercel | Zero-config Next.js hosting |
| Package Manager | pnpm | Fast, strict |

---

## Body Image Assessment Protocol (BIDS)

### Overview

The Body Image Discrepancy Score (BIDS) protocol is the core clinical feature of ReCompose. It uses the existing 3D body morphing interface as a perceptual assessment instrument — participants adjust the avatar to match their body perception, and the system quantifies the gap between perception and reality.

This methodology is validated in published literature: mobile digital imaging analysis (DIA) platforms using 3D avatars adjustable by body fat percentage have demonstrated strong validity (r = .96 correlation with DXA-derived body fat) for body image distortion and dissatisfaction assessment.

### Three-Task Protocol

Each assessment consists of three sequential tasks using the same viewer and slider controls:

| Task | Instruction | What It Measures |
|------|-------------|-----------------|
| **Perceived** | "Adjust the body to match how you believe your body currently looks." | Body image accuracy / distortion |
| **Ideal** | "Adjust the body to show your ideal body — how you would most like to look." | Body image dissatisfaction |
| **Partner** | "Adjust the body to show what a romantic partner would find most attractive." | Internalized attractiveness norms |

Each task starts with the avatar reset to the actual scan values. The participant uses the global BF% slider and/or the six regional segment sliders. Upon confirmation, the system records the final slider state, full adjustment trajectory (timestamped slider events), task duration, and reset count.

### Scoring Model

Three primary scores, all in body fat percentage units:

```
BIDS-D (Distortion) = perceived.globalBF - actual.BF
  Positive → participant perceives body as fatter than actual
  Negative → participant perceives body as thinner than actual

BIDS-S (Dissatisfaction) = ideal.globalBF - perceived.globalBF
  Negative → participant desires thinner body than perceived
  Positive → participant desires larger body than perceived

BIDS-P (Partner Discrepancy) = partner.globalBF - perceived.globalBF
  Measures gap between self-perception and perceived external standards
```

Additionally, **per-segment distortion** is calculated from the six regional slider values, revealing which body regions drive the distortion (e.g., waist-focused distortion suggests central adiposity concern).

### Clinical Thresholds (Preliminary)

| Magnitude (|BIDS-D|) | Interpretation |
|---|---|
| 0–2 BF% | Normal range — minor perceptual variance |
| 2–5 BF% | Mild distortion — may warrant monitoring |
| 5–10 BF% | Moderate distortion — clinical flag |
| >10 BF% | Severe distortion — strong indicator for further assessment |

**These thresholds are initial estimates and must be calibrated through validation studies.** The threshold value should be stored as a configurable constant.

### Data Schema

```typescript
interface AssessmentRecord {
  id: string;                          // UUID
  timestamp: string;                   // ISO 8601
  scanId: string;

  actual: {
    bodyFat: number;
    weight: number;
    bmi: number;
    waistCirc: number;
    hipCirc: number;
    whr: number;
  };

  tasks: {
    perceived: TaskResult;
    ideal: TaskResult;
    partner: TaskResult;
  };

  scores: BIDSScores;
}

interface TaskResult {
  taskType: 'perceived' | 'ideal' | 'partner';
  finalState: {
    globalBodyFat: number;
    segmentOverrides: Record<string, number>;  // shoulders, arms, torso, waist, hips, legs
  };
  adjustmentTrajectory: AdjustmentEvent[];
  durationMs: number;
  resetCount: number;
}

interface AdjustmentEvent {
  timestamp: number;      // ms since task start
  control: string;        // 'global' | segment name
  value: number;
}

interface BIDSScores {
  distortion: number;
  dissatisfaction: number;
  partnerDiscrepancy: number;
  distortionMagnitude: number;
  dissatisfactionMagnitude: number;
  segmentDistortions: Array<{
    segmentId: string;
    label: string;
    perceivedDelta: number;
    idealDelta: number;
    partnerDelta: number;
  }>;
  maxDistortionSegment: string;
  maxDissatisfactionSegment: string;
  perceivedTaskDuration: number;
  idealTaskDuration: number;
  partnerTaskDuration: number;
  totalAssessmentDuration: number;
  clinicalFlag: boolean;
}
```

### Assessment Mode UI Behavior

When assessment mode is active:
- **Hide** the metrics panel (weight, BMI, WHR, etc.) to prevent numerical anchoring
- **Show** progress indicator (3 steps), instruction card, confirm button
- **Show** "Reset to Actual" button for each task
- **Disable** auto-rotate on orbit controls
- All morph controls (global slider, regional sliders, camera presets) remain fully functional
- After all three tasks: show results summary with captured 3D renders, scores, and regional breakdown

### Output Artifacts

1. **In-app results summary** — scores, 3D render comparison, regional breakdown, clinical flag
2. **PDF report** — professional clinical document suitable for medical records
3. **JSON export** — full AssessmentRecord including adjustment trajectories
4. **CSV export** — scores table for statistical analysis

### File Structure Additions

```
lib/
  assessment/
    scoring.ts              # BIDS calculation logic
    assessmentProtocol.ts   # Task sequencing and flow management
    reportGenerator.ts      # PDF report creation
    dataExport.ts           # JSON/CSV export utilities
  stores/
    assessmentStore.ts      # Zustand store for assessment state
components/
  assessment/
    AssessmentWelcome.tsx    # Consent/intro screen
    AssessmentProgress.tsx   # Step indicator (1/2/3)
    TaskInstructions.tsx     # Per-task instruction card
    ConfirmButton.tsx        # Task confirmation with micro-animation
    ResultsSummary.tsx       # Post-assessment scores + renders
    ScoreCard.tsx            # Individual score display component
    RegionalBreakdown.tsx    # Segment-level distortion visualization
    ReportDownload.tsx       # PDF + data export buttons
```

### Privacy & Ethics

- All assessment data is processed and stored client-side only (MVP)
- No biometric data is transmitted to external servers
- Participant should provide informed consent before starting assessment
- The assessment is not a diagnostic tool — it is a measurement instrument
- Clinical flag thresholds are preliminary and should not be used for diagnosis without clinician interpretation
- Consider adding: "If you are experiencing distress about your body image, please speak with a healthcare professional" in the results screen

## References

- Amazon Halo Body (discontinued 2023) — original "Future Me"
- CAESAR Anthropometric Database — body measurement statistics
- NHANES Body Measures — population-level body composition
- SlicerMorph — 3D Slicer geometric morphometrics extension
- SMPL/SMPL-X — parametric human body model (reference, not used directly)
- Fit3D ProScanner / Styku S100 — common .obj scan sources

---

*This document is the single source of truth for ReCompose. Update as decisions evolve.*

---

*This document is the single source of truth for ReCompose. Update as decisions evolve.*
