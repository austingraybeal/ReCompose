#!/usr/bin/env python3
"""
Extract SMPL / SMPL-X model data from .pkl to browser-friendly JSON.

Usage:
    python tools/extract_smpl.py <model.pkl> [--output path.json] [--components 10]

By default, outputs to public/models/smpl_neutral.json so the app auto-loads it.

Example:
    python tools/extract_smpl.py ~/Downloads/basicModel_neutral_lbs_10_207_0_v1.0.0.pkl

This reads the standard SMPL .pkl format (as distributed by MPI) and outputs
a JSON file with base64-encoded typed arrays that the app fetches on boot.

Requirements:
    pip install numpy

The .pkl files are NOT included in this repo — you must obtain them from:
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
      - 'J_regressor': joint regressor (not needed for shape-only)
      - 'weights': skinning weights (not needed for shape-only)
      - 'posedirs': pose blend shapes (not needed for shape-only)
      - 'kintree_table': kinematic tree (not needed for shape-only)
    """
    model = load_smpl_model(pkl_path)

    # Extract template vertices
    v_template = np.array(model["v_template"], dtype=np.float32)  # (V, 3)
    vertex_count = v_template.shape[0]
    print(f"Vertices: {vertex_count}")

    # Extract shape blend shapes, truncate to requested components
    shapedirs = np.array(model["shapedirs"], dtype=np.float32)  # (V, 3, K_full)
    K_full = shapedirs.shape[2]
    K = min(num_components, K_full)
    print(f"Shape components: {K} (of {K_full} available)")

    shapedirs = shapedirs[:, :, :K]  # (V, 3, K)

    # Reshape to (V*3, K) row-major for efficient JS multiplication
    shapedirs_flat = shapedirs.reshape(vertex_count * 3, K)

    # Extract faces
    faces = np.array(model["f"], dtype=np.uint32)  # (F, 3)
    face_count = faces.shape[0]
    print(f"Faces: {face_count}")

    # Flatten template vertices to [x0,y0,z0, x1,y1,z1, ...]
    v_template_flat = v_template.flatten()

    # Flatten faces to [i0,i1,i2, ...]
    faces_flat = faces.flatten()

    # Build segment labels from SMPL vertex segmentation if available
    segment_labels = None
    if "segment_labels" in model:
        segment_labels = model["segment_labels"]
    elif "weights" in model:
        # Derive approximate segments from skinning weights
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
        # Print segment distribution
        from collections import Counter
        dist = Counter(segment_labels)
        print(f"Segment distribution: {dict(dist)}")

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Extract SMPL model data to browser-friendly JSON"
    )
    parser.add_argument("pkl_path", help="Path to SMPL .pkl file")
    parser.add_argument(
        "--output", "-o", default=None,
        help="Output JSON path (default: same name with .json extension)"
    )
    parser.add_argument(
        "--components", "-k", type=int, default=10,
        help="Number of shape components to extract (default: 10)"
    )
    parser.add_argument(
        "--gender", "-g", default="neutral",
        choices=["neutral", "male", "female"],
        help="Model gender (default: neutral)"
    )

    args = parser.parse_args()

    pkl_path = Path(args.pkl_path)
    if not pkl_path.exists():
        print(f"Error: {pkl_path} not found", file=sys.stderr)
        sys.exit(1)

    # Default: output to public/models/ for auto-loading by the app
    default_output = Path(__file__).parent.parent / "public" / "models" / "smpl_neutral.json"
    output_path = args.output or str(default_output)

    print(f"Extracting {pkl_path} ...")
    data = extract(str(pkl_path), args.components, args.gender)

    with open(output_path, "w") as f:
        json.dump(data, f)

    size_mb = Path(output_path).stat().st_size / (1024 * 1024)
    print(f"Written to {output_path} ({size_mb:.1f} MB)")
    print("Load this file in the ReCompose UI under Settings > Load SMPL Model")


if __name__ == "__main__":
    main()
