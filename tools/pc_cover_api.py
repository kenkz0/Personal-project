#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import time
from collections import OrderedDict
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from hashlib import sha256
from threading import Lock
from urllib.parse import urlparse

import geopandas as gpd
import numpy as np
import planetary_computer
import pystac_client
import rioxarray  # noqa: F401
import stackstac
from shapely.geometry import shape


STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "21600"))
CACHE_MAX_ITEMS = int(os.environ.get("CACHE_MAX_ITEMS", "64"))
CACHE: OrderedDict[str, tuple[float, dict]] = OrderedDict()
CACHE_LOCK = Lock()
CLOUD_SCL = {3, 8, 9, 10, 11}
INVALID_SCL = {0, 1, 3, 8, 9, 10, 11}

YIELD_TABLES = {
    "paper4": {1: (2, 4, 6), 2: (15, 21, 28), 3: (45, 58, 70), 4: (80, 98, 115)},
    "paper5": {1: (2, 4, 5), 2: (14, 20, 25), 3: (38, 50, 60), 4: (65, 80, 95), 5: (95, 115, 135)},
    "timber8": {1: (2, 3, 4), 2: (10, 15, 20), 3: (28, 38, 48), 4: (50, 65, 80), 5: (70, 88, 105), 6: (100, 120, 140), 7: (130, 152, 175), 8: (165, 192, 220)},
    "large10": {1: (1, 2, 3), 2: (8, 13, 18), 3: (25, 34, 42), 4: (45, 58, 70), 5: (65, 80, 95), 6: (90, 108, 125), 7: (120, 140, 160), 8: (150, 175, 200), 9: (180, 210, 240), 10: (220, 255, 290)},
}

SOIL_FACTORS = {"basalt": 1.15, "red_yellow": 1.05, "gray": 0.95, "rocky_slope": 0.80}
RAIN_FACTORS = {"drought": 0.80, "dry": 0.90, "normal": 1.00, "good": 1.05}


def ndvi_factor(ndvi: float) -> tuple[float, str]:
    if not math.isfinite(ndvi):
        return 1.0, "Unknown"
    if ndvi < 0.45:
        return 0.70, "Very poor"
    if ndvi < 0.60:
        return 0.85, "Poor"
    if ndvi < 0.75:
        return 1.00, "Medium"
    if ndvi < 0.85:
        return 1.10, "Good"
    return 1.20, "Very good"


def make_gdf(geojson: dict) -> gpd.GeoDataFrame:
    geometry = geojson.get("geometry", geojson)
    geom = shape(geometry)
    return gpd.GeoDataFrame({"id": [1]}, geometry=[geom], crs="EPSG:4326")


def rounded_geometry(value):
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, list):
        return [rounded_geometry(item) for item in value]
    if isinstance(value, dict):
        return {key: rounded_geometry(value[key]) for key in sorted(value)}
    return value


def cache_key(payload: dict) -> str:
    options = payload.get("options", {})
    stable_options = {
        key: options.get(key)
        for key in (
            "model",
            "age",
            "soil",
            "rainfall",
            "priceVndM3",
            "daysBack",
            "sceneCloudMax",
            "maxItems",
            "epsg",
            "resolution",
        )
    }
    geometry = payload.get("geojson", {}).get("geometry", payload.get("geojson", {}))
    stable_payload = {
        "geometry": rounded_geometry(geometry),
        "options": stable_options,
        "date": date.today().isoformat(),
    }
    raw = json.dumps(stable_payload, sort_keys=True, separators=(",", ":"))
    return sha256(raw.encode("utf-8")).hexdigest()


def cache_get(key: str):
    now = time.time()
    with CACHE_LOCK:
        cached = CACHE.get(key)
        if not cached:
            return None
        created_at, value = cached
        if now - created_at > CACHE_TTL_SECONDS:
            CACHE.pop(key, None)
            return None
        CACHE.move_to_end(key)
        cloned = json.loads(json.dumps(value))
        cloned["cache"] = {"hit": True, "ttl_seconds": CACHE_TTL_SECONDS}
        return cloned


def cache_set(key: str, value: dict):
    with CACHE_LOCK:
        CACHE[key] = (time.time(), json.loads(json.dumps(value)))
        CACHE.move_to_end(key)
        while len(CACHE) > CACHE_MAX_ITEMS:
            CACHE.popitem(last=False)


def stac_items(gdf: gpd.GeoDataFrame, days_back: int, scene_cloud_max: float, max_items: int):
    geom = gdf.geometry.iloc[0].__geo_interface__
    start = (date.today() - timedelta(days=days_back)).isoformat()
    end = (date.today() + timedelta(days=1)).isoformat()
    catalog = pystac_client.Client.open(STAC_URL)
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        intersects=geom,
        datetime=f"{start}/{end}",
        query={"eo:cloud_cover": {"lt": scene_cloud_max}},
        max_items=max_items,
    )
    items = list(search.items())
    items.sort(key=lambda item: item.datetime, reverse=True)
    return [planetary_computer.sign(item) for item in items]


def clip_item(item, gdf: gpd.GeoDataFrame, epsg: int, resolution: float):
    bounds = tuple(gdf.total_bounds)
    stack = stackstac.stack(
        [item],
        assets=["B04", "B08", "SCL"],
        bounds_latlon=bounds,
        epsg=epsg,
        resolution=resolution,
        dtype="float64",
        fill_value=np.nan,
        rescale=False,
    )
    scene = stack.isel(time=0).rio.write_crs(f"EPSG:{epsg}")
    gdf_clip = gdf.to_crs(scene.rio.crs)
    return scene.rio.clip(gdf_clip.geometry, gdf_clip.crs, drop=True, all_touched=True)


def metrics_for_clipped(clipped, resolution: float) -> dict:
    red = clipped.sel(band="B04").compute().values.astype("float64")
    nir = clipped.sel(band="B08").compute().values.astype("float64")
    scl = clipped.sel(band="SCL").compute().values
    scl_ok = np.isfinite(scl)
    invalid = np.isin(scl, list(INVALID_SCL)) | ~scl_ok
    cloud = np.isin(scl, list(CLOUD_SCL)) & scl_ok
    valid = ~invalid & np.isfinite(red) & np.isfinite(nir)

    # Sentinel-2 L2A PB >= 04.00 stores BOA reflectance with an additive offset.
    denominator = nir + red - 2000.0
    ndvi = np.full(red.shape, np.nan, dtype="float64")
    np.divide(nir - red, denominator, out=ndvi, where=valid & (denominator != 0))
    ndvi = np.clip(ndvi, -1, 1)

    valid_count = int(valid.sum())
    if valid_count == 0:
        raise ValueError("No valid Sentinel-2 pixels inside polygon.")

    pixel_ha = (resolution * resolution) / 10000.0
    aoi_pixel_count = int(scl_ok.sum())
    tree = valid & (ndvi >= 0.45)
    dense = valid & (ndvi >= 0.60)
    fvc = np.clip((ndvi - 0.20) / (0.86 - 0.20), 0, 1) ** 2

    return {
        "aoi_area_ha": float(aoi_pixel_count * pixel_ha),
        "valid_area_ha": float(valid_count * pixel_ha),
        "aoi_cloud_pct": float(cloud.sum() / max(aoi_pixel_count, 1) * 100),
        "valid_pixel_pct": float(valid_count / max(aoi_pixel_count, 1) * 100),
        "tree_cover_pct": float(tree.sum() / valid_count * 100),
        "tree_area_ha": float(tree.sum() * pixel_ha),
        "dense_canopy_pct": float(dense.sum() / valid_count * 100),
        "dense_area_ha": float(dense.sum() * pixel_ha),
        "fvc_density_pct": float(np.nanmean(fvc[valid]) * 100),
        "mean_ndvi": float(np.nanmean(ndvi[valid])),
    }


def estimate_value(metrics: dict, options: dict) -> dict:
    model = options.get("model", "timber8")
    age = int(options.get("age", 4))
    soil = options.get("soil", "red_yellow")
    rain = options.get("rainfall", "normal")
    price = float(options.get("priceVndM3", 900000))

    table = YIELD_TABLES.get(model, YIELD_TABLES["timber8"])
    age = min(max(age, min(table)), max(table))
    base_min, base_mid, base_max = table[age]
    soil_factor = SOIL_FACTORS.get(soil, 1.0)
    rain_factor = RAIN_FACTORS.get(rain, 1.0)
    health_factor, health_label = ndvi_factor(metrics["mean_ndvi"])
    area = metrics["tree_area_ha"]

    def volume(base: float) -> float:
        return base * soil_factor * health_factor * rain_factor * area

    volumes = {"p10_m3": volume(base_min), "p50_m3": volume(base_mid), "p90_m3": volume(base_max)}
    return {
        "model": model,
        "age": age,
        "soil": soil,
        "rainfall": rain,
        "price_vnd_m3": price,
        "health_label": health_label,
        "soil_factor": soil_factor,
        "ndvi_factor": health_factor,
        "rainfall_factor": rain_factor,
        "base_yield_m3_ha": {"p10": base_min, "p50": base_mid, "p90": base_max},
        **volumes,
        "p10_value_vnd": volumes["p10_m3"] * price,
        "p50_value_vnd": volumes["p50_m3"] * price,
        "p90_value_vnd": volumes["p90_m3"] * price,
    }


def calculate(payload: dict) -> dict:
    options = payload.get("options", {})
    gdf = make_gdf(payload["geojson"])
    items = stac_items(
        gdf,
        int(options.get("daysBack", 1095)),
        float(options.get("sceneCloudMax", 10)),
        int(options.get("maxItems", 8)),
    )
    if not items:
        raise ValueError("No Sentinel-2 scenes found for polygon.")

    evaluated = []
    evaluated_metrics = []
    selected = None
    selected_metrics = None
    epsg = int(options.get("epsg", 32648))
    resolution = float(options.get("resolution", 10))

    for item in items:
        try:
            metrics = metrics_for_clipped(clip_item(item, gdf, epsg, resolution), resolution)
        except Exception as exc:  # noqa: BLE001
            evaluated.append({
                "item_id": item.id,
                "datetime": item.datetime.isoformat() if item.datetime else None,
                "eo_cloud_cover": item.properties.get("eo:cloud_cover"),
                "error": str(exc),
            })
            evaluated_metrics.append(None)
            continue
        row = {
            "item_id": item.id,
            "datetime": item.datetime.isoformat() if item.datetime else None,
            "eo_cloud_cover": item.properties.get("eo:cloud_cover"),
            "aoi_cloud_pct": metrics["aoi_cloud_pct"],
            "valid_pixel_pct": metrics["valid_pixel_pct"],
        }
        evaluated.append(row)
        evaluated_metrics.append(metrics)
        if metrics["aoi_cloud_pct"] <= 5 and metrics["valid_pixel_pct"] >= 90:
            selected = item
            selected_metrics = metrics
            break

    if selected is None:
        valid_indexes = [index for index, metrics in enumerate(evaluated_metrics) if metrics is not None]
        if not valid_indexes:
            raise ValueError("No valid Sentinel-2 pixels inside polygon.")
        best_index = sorted(
            valid_indexes,
            key=lambda i: (evaluated[i]["aoi_cloud_pct"], -evaluated[i]["valid_pixel_pct"]),
        )[0]
        selected = items[best_index]
        selected_metrics = evaluated_metrics[best_index]

    valuation = estimate_value(selected_metrics, options)
    return {
        "source": "Microsoft Planetary Computer STAC + stackstac",
        "method": "GeoJSON intersects, stackstac B04/B08/SCL, rioxarray clip, NDVI threshold cover",
        "selected_scene": {
            "item_id": selected.id,
            "datetime": selected.datetime.isoformat() if selected.datetime else None,
            "eo_cloud_cover": selected.properties.get("eo:cloud_cover"),
        },
        "metrics": selected_metrics,
        "valuation": valuation,
        "evaluated": evaluated,
        "cache": {"hit": False, "ttl_seconds": CACHE_TTL_SECONDS},
    }


class Handler(BaseHTTPRequestHandler):
    def _headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, ngrok-skip-browser-warning")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            self._headers()
            self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
            return
        self._headers(404)
        self.wfile.write(json.dumps({"error": "not found"}).encode("utf-8"))

    def do_POST(self):
        if urlparse(self.path).path != "/api/cover":
            self._headers(404)
            self.wfile.write(json.dumps({"error": "not found"}).encode("utf-8"))
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            key = cache_key(payload)
            result = cache_get(key)
            if result is None:
                result = calculate(payload)
                cache_set(key, result)
            self._headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            self._headers(500)
            self.wfile.write(json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8"))


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print("PC cover API listening on http://127.0.0.1:8765")
    server.serve_forever()


if __name__ == "__main__":
    main()
