#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import time
from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from hashlib import sha256
from pathlib import Path
from threading import Lock
from urllib.parse import urlparse
from uuid import UUID

import geopandas as gpd
import numpy as np
import planetary_computer
import psycopg
from psycopg.rows import dict_row
import pystac_client
import rioxarray  # noqa: F401
import stackstac
from shapely.geometry import shape


STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8765"))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "21600"))
CACHE_MAX_ITEMS = int(os.environ.get("CACHE_MAX_ITEMS", "64"))
CACHE: OrderedDict[str, tuple[float, dict]] = OrderedDict()
CACHE_LOCK = Lock()
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
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


def db_enabled() -> bool:
    return bool(DATABASE_URL)


def db_connect():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def init_db():
    if not db_enabled():
        return
    schema_path = Path(__file__).with_name("schema.sql")
    with db_connect() as conn:
        with conn.cursor() as cur:
            statements = [part.strip() for part in schema_path.read_text(encoding="utf-8").split(";")]
            for statement in statements:
                if statement:
                    cur.execute(statement)
        conn.commit()


def require_user_key(handler: BaseHTTPRequestHandler) -> str:
    user_key = handler.headers.get("X-User-Key", "").strip()
    if not user_key:
        raise ValueError("Missing X-User-Key header.")
    return user_key[:160]


def get_or_create_user(cur, external_id: str):
    cur.execute(
        """
        INSERT INTO users (external_id, display_name)
        VALUES (%s, %s)
        ON CONFLICT (external_id) DO UPDATE
          SET updated_at = now()
        RETURNING id, external_id, display_name, email, created_at, updated_at
        """,
        (external_id, "Lâm Kính Demo User"),
    )
    return cur.fetchone()


def row_to_plot(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "sourceName": row["source_name"],
        "kmlText": row["kml_text"],
        "geojson": row["geojson"],
        "ring": row["ring"],
        "holes": row["holes"],
        "bounds": row["bounds"],
        "center": row["center"],
        "area": row["area_ha"],
        "drawn": row["drawn"],
        "analysis": row["analysis"],
        "analysisItem": row["analysis_item"],
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
        "updatedAt": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }


def is_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (TypeError, ValueError):
        return False


def json_hash(value) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return sha256(raw.encode("utf-8")).hexdigest()


def cover_hashes(payload: dict) -> tuple[str, str]:
    geometry = payload.get("geojson", {}).get("geometry", payload.get("geojson", {}))
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
    return json_hash(rounded_geometry(geometry)), json_hash(stable_options)


def db_cached_cover(payload: dict, user_key: str | None):
    if not db_enabled():
        return None
    plot_id = payload.get("plot_id")
    geometry_hash, options_hash = cover_hashes(payload)
    created_after = datetime.now(timezone.utc) - timedelta(seconds=CACHE_TTL_SECONDS)
    with db_connect() as conn:
        with conn.cursor() as cur:
            user = get_or_create_user(cur, user_key or "anonymous")
            if plot_id and is_uuid(plot_id):
                cur.execute(
                    """
                    SELECT result
                    FROM cover_analysis
                    WHERE user_id = %s AND plot_id = %s AND options_hash = %s AND created_at >= %s
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (user["id"], plot_id, options_hash, created_after),
                )
            else:
                cur.execute(
                    """
                    SELECT result
                    FROM cover_analysis
                    WHERE user_id = %s AND geometry_hash = %s AND options_hash = %s AND created_at >= %s
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (user["id"], geometry_hash, options_hash, created_after),
                )
            row = cur.fetchone()
        conn.commit()
    if not row:
        return None
    result = json.loads(json.dumps(row["result"]))
    result["cache"] = {"hit": True, "ttl_seconds": CACHE_TTL_SECONDS, "store": "postgres"}
    return result


def db_store_cover(payload: dict, result: dict, user_key: str | None):
    if not db_enabled():
        return
    plot_id = payload.get("plot_id")
    if plot_id and not is_uuid(plot_id):
        plot_id = None
    geometry_hash, options_hash = cover_hashes(payload)
    selected_scene = result.get("selected_scene") or {}
    scene_datetime = selected_scene.get("datetime")
    with db_connect() as conn:
        with conn.cursor() as cur:
            user = get_or_create_user(cur, user_key or "anonymous")
            cur.execute(
                """
                INSERT INTO cover_analysis (
                  user_id, plot_id, geometry_hash, options_hash, options, result,
                  source, selected_scene_id, selected_scene_datetime
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user["id"],
                    plot_id,
                    geometry_hash,
                    options_hash,
                    json.dumps(payload.get("options", {})),
                    json.dumps(result, ensure_ascii=False),
                    result.get("source"),
                    selected_scene.get("item_id"),
                    scene_datetime,
                ),
            )
        conn.commit()


def list_plots(user_key: str) -> list[dict]:
    with db_connect() as conn:
        with conn.cursor() as cur:
            user = get_or_create_user(cur, user_key)
            cur.execute(
                """
                SELECT *
                FROM forest_plots
                WHERE user_id = %s
                ORDER BY updated_at DESC
                """,
                (user["id"],),
            )
            rows = cur.fetchall()
        conn.commit()
    return [row_to_plot(row) for row in rows]


def create_plot(user_key: str, payload: dict) -> dict:
    with db_connect() as conn:
        with conn.cursor() as cur:
            user = get_or_create_user(cur, user_key)
            cur.execute(
                """
                INSERT INTO forest_plots (
                  user_id, name, source_name, kml_text, geojson, ring, holes, bounds,
                  center, area_ha, drawn, analysis, analysis_item
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    user["id"],
                    payload.get("name") or "Lô rừng",
                    payload.get("sourceName") or "Polygon KML",
                    payload.get("kmlText"),
                    json.dumps(payload["geojson"], ensure_ascii=False),
                    json.dumps(payload["ring"], ensure_ascii=False),
                    json.dumps(payload.get("holes", []), ensure_ascii=False),
                    json.dumps(payload["bounds"], ensure_ascii=False),
                    json.dumps(payload["center"], ensure_ascii=False),
                    float(payload.get("area", 0)),
                    bool(payload.get("drawn", False)),
                    json.dumps(payload["analysis"], ensure_ascii=False) if payload.get("analysis") is not None else None,
                    json.dumps(payload["analysisItem"], ensure_ascii=False) if payload.get("analysisItem") is not None else None,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    return row_to_plot(row)


def update_plot(user_key: str, plot_id: str, payload: dict) -> dict | None:
    allowed = {
        "name": "name",
        "sourceName": "source_name",
        "analysis": "analysis",
        "analysisItem": "analysis_item",
    }
    assignments = []
    values = []
    for key, column in allowed.items():
        if key not in payload:
            continue
        assignments.append(f"{column} = %s")
        if key in {"analysis", "analysisItem"}:
            values.append(json.dumps(payload[key], ensure_ascii=False) if payload[key] is not None else None)
        else:
            values.append(payload[key])
    if not assignments:
        return None
    values.append(plot_id)
    with db_connect() as conn:
        with conn.cursor() as cur:
            user = get_or_create_user(cur, user_key)
            values.append(user["id"])
            cur.execute(
                f"""
                UPDATE forest_plots
                SET {", ".join(assignments)}, updated_at = now()
                WHERE id = %s AND user_id = %s
                RETURNING *
                """,
                values,
            )
            row = cur.fetchone()
        conn.commit()
    return row_to_plot(row) if row else None


def delete_plot(user_key: str, plot_id: str) -> bool:
    with db_connect() as conn:
        with conn.cursor() as cur:
            user = get_or_create_user(cur, user_key)
            cur.execute(
                "DELETE FROM forest_plots WHERE id = %s AND user_id = %s RETURNING id",
                (plot_id, user["id"]),
            )
            row = cur.fetchone()
        conn.commit()
    return bool(row)


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
    def _cors_origin(self):
        if "*" in ALLOWED_ORIGINS:
            return "*"
        request_origin = self.headers.get("Origin")
        if request_origin and request_origin in ALLOWED_ORIGINS:
            return request_origin
        return ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else "*"

    def _headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", self._cors_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-User-Key, ngrok-skip-browser-warning")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def _json(self, data, status=200):
        self._headers(status)
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _db_required(self):
        if db_enabled():
            return False
        self._json({"error": "DATABASE_URL is not configured."}, 503)
        return True

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self._json({"ok": True, "database": db_enabled()})
            return
        if path == "/api/plots":
            if self._db_required():
                return
            try:
                self._json({"plots": list_plots(require_user_key(self))})
            except Exception as exc:  # noqa: BLE001
                self._json({"error": str(exc)}, 500)
            return
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            payload = self._read_json()
            if path == "/api/plots":
                if self._db_required():
                    return
                self._json({"plot": create_plot(require_user_key(self), payload)}, 201)
                return
            if path != "/api/cover":
                self._json({"error": "not found"}, 404)
                return
            user_key = self.headers.get("X-User-Key", "").strip() or None
            key = cache_key(payload)
            result = db_cached_cover(payload, user_key) or cache_get(key)
            if result is None:
                result = calculate(payload)
                cache_set(key, result)
                db_store_cover(payload, result, user_key)
            self._json(result)
        except Exception as exc:  # noqa: BLE001
            self._json({"error": str(exc)}, 500)

    def do_PATCH(self):
        path = urlparse(self.path).path
        parts = path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api", "plots"]:
            self._json({"error": "not found"}, 404)
            return
        if self._db_required():
            return
        try:
            row = update_plot(require_user_key(self), parts[2], self._read_json())
            if not row:
                self._json({"error": "plot not found"}, 404)
                return
            self._json({"plot": row})
        except Exception as exc:  # noqa: BLE001
            self._json({"error": str(exc)}, 500)

    def do_DELETE(self):
        path = urlparse(self.path).path
        parts = path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api", "plots"]:
            self._json({"error": "not found"}, 404)
            return
        if self._db_required():
            return
        try:
            if not delete_plot(require_user_key(self), parts[2]):
                self._json({"error": "plot not found"}, 404)
                return
            self._json({"ok": True})
        except Exception as exc:  # noqa: BLE001
            self._json({"error": str(exc)}, 500)


def main():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"PC cover API listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
