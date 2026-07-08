"""Prepare Sentinel-2 RGB GeoTIFF, run optional SwinIR x4 SR, then apply CLAHE.

Input is the GeoTIFF exported from scripts/gee_sentinel2_composite.js with bands:
red, green, blue in reflectance range 0..1 or integer scaled reflectance.

Examples:
  python scripts/swinir_clahe_pipeline.py ^
    --input data/sentinel2_true_color_median_b432.tif ^
    --output data/sentinel2_true_color_swinir_clahe.tif

  python scripts/swinir_clahe_pipeline.py ^
    --input data/sentinel2_true_color_median_b432.tif ^
    --output data/sentinel2_true_color_swinir_clahe.tif ^
    --swinir-repo C:/models/SwinIR ^
    --model C:/models/SwinIR/001_classicalSR_DF2K_s64w8_SwinIR-M_x4.pth
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

import cv2
import numpy as np
import rasterio
from rasterio.transform import Affine


def percentile_stretch(rgb: np.ndarray, low: float = 2.0, high: float = 98.0) -> np.ndarray:
    out = np.empty_like(rgb, dtype=np.float32)
    for channel in range(3):
        band = rgb[..., channel]
        valid = band[np.isfinite(band)]
        if valid.size == 0:
            out[..., channel] = 0
            continue
        lo, hi = np.percentile(valid, [low, high])
        if hi <= lo:
            out[..., channel] = 0
            continue
        out[..., channel] = np.clip((band - lo) / (hi - lo), 0, 1)
    return (out * 255).round().astype(np.uint8)


def pad_to_multiple(image: np.ndarray, multiple: int = 64) -> tuple[np.ndarray, tuple[int, int]]:
    h, w = image.shape[:2]
    pad_h = (multiple - h % multiple) % multiple
    pad_w = (multiple - w % multiple) % multiple
    if pad_h == 0 and pad_w == 0:
        return image, (h, w)
    padded = cv2.copyMakeBorder(image, 0, pad_h, 0, pad_w, cv2.BORDER_REFLECT_101)
    return padded, (h, w)


def apply_clahe(rgb: np.ndarray, clip_limit: float = 2.0, tile_grid_size: int = 8) -> np.ndarray:
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(
        clipLimit=clip_limit,
        tileGridSize=(tile_grid_size, tile_grid_size),
    )
    enhanced_l = clahe.apply(l_channel)
    enhanced = cv2.merge((enhanced_l, a_channel, b_channel))
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2RGB)


def fallback_upscale(rgb: np.ndarray, scale: int) -> np.ndarray:
    h, w = rgb.shape[:2]
    return cv2.resize(rgb, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)


def run_swinir(rgb: np.ndarray, swinir_repo: Path, model_path: Path, scale: int, tile: int) -> np.ndarray:
    import torch

    model_file = swinir_repo / "models" / "network_swinir.py"
    if not model_file.exists():
        raise FileNotFoundError(f"Cannot find SwinIR network file: {model_file}")

    spec = importlib.util.spec_from_file_location("network_swinir", model_file)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import SwinIR network from {model_file}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["network_swinir"] = module
    spec.loader.exec_module(module)

    model = module.SwinIR(
        upscale=scale,
        in_chans=3,
        img_size=64,
        window_size=8,
        img_range=1.0,
        depths=[6, 6, 6, 6, 6, 6],
        embed_dim=180,
        num_heads=[6, 6, 6, 6, 6, 6],
        mlp_ratio=2,
        upsampler="pixelshuffle",
        resi_connection="1conv",
    )

    checkpoint = torch.load(model_path, map_location="cpu")
    state_dict = checkpoint.get("params", checkpoint.get("params_ema", checkpoint))
    model.load_state_dict(state_dict, strict=True)
    model.eval()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)

    padded, (orig_h, orig_w) = pad_to_multiple(rgb, tile)
    tensor = torch.from_numpy(np.transpose(padded.astype(np.float32) / 255.0, (2, 0, 1)))
    tensor = tensor.unsqueeze(0).to(device)

    with torch.no_grad():
        output = model(tensor).clamp_(0, 1)

    output_np = output.squeeze(0).cpu().numpy()
    output_np = np.transpose(output_np, (1, 2, 0))
    output_np = (output_np * 255.0).round().astype(np.uint8)
    return output_np[: orig_h * scale, : orig_w * scale, :]


def read_rgb(path: Path) -> tuple[np.ndarray, dict]:
    with rasterio.open(path) as src:
        profile = src.profile.copy()
        data = src.read([1, 2, 3]).astype(np.float32)
        rgb = np.transpose(data, (1, 2, 0))
    if rgb.max(initial=0) > 2:
        rgb = rgb / 10000.0
    return rgb, profile


def write_rgb(path: Path, rgb: np.ndarray, profile: dict, scale: int) -> None:
    output_profile = profile.copy()
    transform = output_profile.get("transform")
    if isinstance(transform, Affine):
        output_profile["transform"] = transform * Affine.scale(1 / scale, 1 / scale)

    output_profile.update(
        driver="GTiff",
        dtype="uint8",
        count=3,
        height=rgb.shape[0],
        width=rgb.shape[1],
        compress="deflate",
        predictor=2,
        tiled=True,
        blockxsize=256,
        blockysize=256,
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(path, "w", **output_profile) as dst:
        dst.write(np.transpose(rgb, (2, 0, 1)))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Input Sentinel-2 RGB GeoTIFF.")
    parser.add_argument("--output", required=True, type=Path, help="Output enhanced RGB GeoTIFF.")
    parser.add_argument("--scale", type=int, default=4, help="Super-resolution scale.")
    parser.add_argument("--swinir-repo", type=Path, help="Path to cloned SwinIR repo.")
    parser.add_argument("--model", type=Path, help="Path to SwinIR pretrained .pth model.")
    parser.add_argument("--tile", type=int, default=64, help="Padding multiple for SwinIR.")
    parser.add_argument("--clahe-clip", type=float, default=2.0, help="CLAHE clip limit.")
    parser.add_argument("--clahe-grid", type=int, default=8, help="CLAHE grid size.")
    parser.add_argument(
        "--fallback-upscale",
        action="store_true",
        help="Use bicubic x scale when SwinIR repo/model is not provided.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    reflectance_rgb, profile = read_rgb(args.input)
    normalized = percentile_stretch(reflectance_rgb)

    if args.swinir_repo and args.model:
        sr = run_swinir(normalized, args.swinir_repo, args.model, args.scale, args.tile)
    elif args.fallback_upscale:
        sr = fallback_upscale(normalized, args.scale)
    else:
        raise SystemExit("Provide --swinir-repo and --model, or use --fallback-upscale for testing.")

    enhanced = apply_clahe(sr, clip_limit=args.clahe_clip, tile_grid_size=args.clahe_grid)
    write_rgb(args.output, enhanced, profile, args.scale)
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
