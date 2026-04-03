#!/usr/bin/env python3
"""
Extract SMPL / SMPL-X model data from .pkl to browser-friendly JSON.

Usage (single model):
    python tools/extract_smpl.py model_neutral.pkl --gender neutral

Usage (all three at once — recommended):
    python tools/extract_smpl.py --all \\
        --male path/to/basicmodel_m_*.pkl \\
        --female path/to/basicmodel_f_*.pkl \\
        --neutral path/to/basicModel_neutral_*.pkl

Outputs go to public/models/smpl_{gender}.json so the app auto-loads them.

Requirements:
    pip install numpy

The .pkl files are NOT included in this repo — obtain them from:
    https://smpl.is.tue.mpg.de/ (SMPL)
    https://smpl-x.is.tue.mpg.de/ (SMPL-X)
"""

import argparse
import base64
import json
import pickle
import sys
from pathlib import Path

import numpy as np


MODELS_DIR = Path(__file__).parent.parent / "public" / "models"


def load_smpl_model(pkl_path: str) -> dict:
    """Load a SMPL/SMPL-X .pkl file."""
    with open(pkl_path, "rb") as f:
        model = pickle.load(f, encoding="latin1")
    return model


def encode_float32(arr: np.ndarray) -> str:
    """Encode numpy array as base64 Float32."""
    return base64.b64encode(arr.astype(np.float32).tobytes()).decode("ascii")


def encode_uint32(arr: np.ndarray) -> str:
    """Encode numpy array as base64 Uint32."""
    return base64.b64encode(arr.astype(np.uint32).tobytes()).decode("ascii")


def extract(pkl_path: str, num_components: int = 10, gender: str = "neutral") -> dict:
    """
    Extract SMPL model data into a JSON-serializable dict.

    The .pkl typically contains:
      - 'v_template': (V, 3) mean template vertices
      - 'shapedirs': (V, 3, K) shape blend shapes
      - 'f': (F, 3) face indices
      - 'weights': skinning weights (used to derive segment labels)
    """
    model = load_smpl_model(pkl_path)

    # Extract template vertices
    v_template = np.array(model["v_template"], dtype=np.float32)  # (V, 3)
    vertex_count = v_template.shape[0]
    print(f"  Vertices: {vertex_count}")

    # Extract shape blend shapes, truncate to requested components
    shapedirs = np.array(model["shapedirs"], dtype=np.float32)  # (V, 3, K_full)
    K_full = shapedirs.shape[2]
    K = min(num_components, K_full)
    print(f"  Shape components: {K} (of {K_full} available)")

    shapedirs = shapedirs[:, :, :K]  # (V, 3, K)

    # Reshape to (V*3, K) row-major for efficient JS multiplication
    shapedirs_flat = shapedirs.reshape(vertex_count * 3, K)

    # Extract faces
    faces = np.array(model["f"], dtype=np.uint32)  # (F, 3)
    face_count = faces.shape[0]
    print(f"  Faces: {face_count}")

    # Flatten
    v_template_flat = v_template.flatten()
    faces_flat = faces.flatten()

    # Build segment labels from skinning weights
    segment_labels = None
    if "segment_labels" in model:
        segment_labels = model["segment_labels"]
    elif "weights" in model:
        # SMPL joints: 0=pelvis, 1=l_hip, 2=r_hip, 3=spine1, 4=l_knee, 5=r_knee,
        # 6=spine2, 7=l_ankle, 8=r_ankle, 9=spine3, 10=l_foot, 11=r_foot,
        # 12=neck, 13=l_collar, 14=r_collar, 15=head, 16=l_shoulder, 17=r_shoulder,
        # 18=l_elbow, 19=r_elbow, 20=l_wrist, 21=r_wrist, 22=l_hand, 23=r_hand
        weights = np.array(model["weights"], dtype=np.float32)  # (V, 24)
        dominant_joint = np.argmax(weights, axis=1)

        joint_to_segment = {
            0: "hips", 1: "legs", 2: "legs", 3: "waist", 4: "legs", 5: "legs",
            6: "torso", 7: "legs", 8: "legs", 9: "torso", 10: "legs", 11: "legs",
            12: "shoulders", 13: "shoulders", 14: "shoulders", 15: "shoulders",
            16: "arms", 17: "arms", 18: "arms", 19: "arms",
            20: "arms", 21: "arms", 22: "arms", 23: "arms",
        }
        segment_labels = [joint_to_segment.get(int(j), "torso") for j in dominant_joint]

    result = {
        "vertexCount": int(vertex_count),
        "shapeComponentCount": int(K),
        "vTemplate": encode_float32(v_template_flat),
        "shapedirs": encode_float32(shapedirs_flat),
        "faces": encode_uint32(faces_flat),
        "faceCount": int(face_count),
        "gender": gender,
    }

    if segment_labels is not None:
        result["segmentLabels"] = segment_labels
        from collections import Counter
        dist = Counter(segment_labels)
        print(f"  Segments: {dict(dist)}")

    return result


def extract_and_save(pkl_path: str, gender: str, components: int, output: str = None):
    """Extract a single model and write to JSON."""
    out_path = output or str(MODELS_DIR / f"smpl_{gender}.json")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n[{gender}] Extracting {pkl_path} ...")
    data = extract(pkl_path, components, gender)

    with open(out_path, "w") as f:
        json.dump(data, f)

    size_mb = Path(out_path).stat().st_size / (1024 * 1024)
    print(f"  Written to {out_path} ({size_mb:.1f} MB)")


def main():
    parser = argparse.ArgumentParser(
        description="Extract SMPL model data to browser-friendly JSON"
    )

    # Single-model mode
    parser.add_argument("pkl_path", nargs="?", help="Path to SMPL .pkl file (single-model mode)")
    parser.add_argument("--output", "-o", default=None, help="Output JSON path")
    parser.add_argument(
        "--gender", "-g", default="neutral",
        choices=["neutral", "male", "female"],
        help="Model gender (single-model mode, default: neutral)"
    )
    parser.add_argument(
        "--components", "-k", type=int, default=10,
        help="Number of shape components to extract (default: 10)"
    )

    # Batch mode: extract all three at once
    parser.add_argument("--all", action="store_true", help="Extract all three gender models")
    parser.add_argument("--male", default=None, help="Path to male .pkl")
    parser.add_argument("--female", default=None, help="Path to female .pkl")
    parser.add_argument("--neutral", default=None, help="Path to neutral .pkl")

    args = parser.parse_args()

    if args.all:
        # Batch mode
        count = 0
        for gender, path in [("male", args.male), ("female", args.female), ("neutral", args.neutral)]:
            if path:
                if not Path(path).exists():
                    print(f"Warning: {path} not found, skipping {gender}", file=sys.stderr)
                    continue
                extract_and_save(path, gender, args.components)
                count += 1
        if count == 0:
            print("Error: provide at least one of --male, --female, --neutral with --all", file=sys.stderr)
            sys.exit(1)
        print(f"\nDone! Extracted {count} model(s) to {MODELS_DIR}/")
    else:
        # Single-model mode
        if not args.pkl_path:
            parser.print_help()
            sys.exit(1)

        pkl_path = Path(args.pkl_path)
        if not pkl_path.exists():
            print(f"Error: {pkl_path} not found", file=sys.stderr)
            sys.exit(1)

        extract_and_save(str(pkl_path), args.gender, args.components, args.output)

    print("\nThe app will auto-load these models on startup.")


if __name__ == "__main__":
    main()
