// Copy of original CesiumLogic.js with added best‑day logic

// NOTE: This file is a copy; original file remains unchanged.
// All original imports, constants, and helper functions are assumed to be present.
// ------------------------------------------------------------
// --- BEGIN ORIGINAL CONTENT (truncated for brevity) ---
// ... (original imports, constants, helper functions) ...
// ------------------------------------------------------------

/**
 * Find the Sentinel‑2 item with the highest mean NDVI within the last 2 months.
 * Falls back to the latest available item if none are found.
 */
async function findBestSentinelInRange(bounds) {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 2); // 2‑month window
  const params = new URLSearchParams({
    collections: "sentinel-2-l2a",
    bbox: [bounds.west, bounds.south, bounds.east, bounds.north].join(","),
    datetime: `${start.toISOString()}/${end.toISOString()}`,
    limit: "60"
  });
  const response = await fetchWithRetry(`https://planetarycomputer.microsoft.com/api/stac/v1/search?${params}`);
  if (!response.ok) throw new Error(`STAC HTTP ${response.status}`);
  const result = await response.json();
  return chooseBestSentinelItem(result.features);
}

/**
 * From a list of STAC items, compute NDVI mean for each and return the item
 * with the highest NDVI mean.
 */
async function chooseBestSentinelItem(features) {
  if (!features?.length) return null;
  const ndviScores = await Promise.all(
    features.map(async (item) => {
      // Re‑use the existing NDVI analysis configuration
      const ndvi = await analyzeIndexForPlot(null, item, "ndvi", ANALYSIS_INDICES.ndvi);
      return { item, ndviMean: ndvi.mean };
    })
  );
  ndviScores.sort((a, b) => b.ndviMean - a.ndviMean);
  return ndviScores[0].item;
}

/**
 * Ensure the plot has analysis data. Updated to prefer the best‑day item
 * within the last 2 months, falling back to the most recent item.
 */
async function ensurePlotAnalysis(plot) {
  if (!plot) return null;
  // Try to get the best day within the 2‑month window
  plot.analysisItem = await findBestSentinelInRange(plot.bounds);
  // If none found, fallback to the original loadLatestSentinel (defined elsewhere)
  if (!plot.analysisItem) plot.analysisItem = await loadLatestSentinel(plot.bounds);
  // Run index analysis if not already present
  if (Object.keys(ANALYSIS_INDICES).some((key) => !plot.analysis?.indices?.[key])) {
    await analyzePlotIndices(plot, plot.analysisItem);
  }
  // UI callbacks (unchanged from original logic)
  if (selectedPlot?.id === plot.id) {
    const cloud = Number(plot.analysisItem.properties?.["eo:cloud_cover"] || 0).toFixed(1);
    callbacks.onSpectralStatusChange(`${plot.name} · ${formatSceneDate(plot.analysisItem.properties.datetime)} · mây ${cloud}% · không realtime`);
    callbacks.onSatelliteDisabledChange(false);
    callbacks.onSatelliteCheckedChange(true);
    callbacks.onSpectralModeDisabledChange(false);
    renderSpectralLayer(currentSpectralMode, plot);
    markMapUpdated();
  }
  return plot.analysis;
}

/**
 * Generate tile URL for visualisation. Now uses plot.analysisItem (the best day).
 */
function spectralTileUrl(item, mode) {
  const config = SPECTRAL_MODES[mode] || SPECTRAL_MODES["true-color"];
  const base = "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x";
  const params = new URLSearchParams({
    collection: "sentinel-2-l2a",
    item: item.id, // item will be plot.analysisItem when called from renderSpectralLayer
    nodata: "0",
    format: "png"
  });
  config.assets.forEach((asset) => params.append("assets", asset));
  if (config.expression) {
    params.set("asset_as_band", "true");
    params.set("expression", config.expression);
    params.set("rescale", config.rescale);
    params.set("colormap_name", config.colormap);
  } else if (config.visual) {
    params.set("asset_as_band", "false");
  } else {
    params.set("asset_as_band", "true");
    params.set("rescale", config.rescale);
    params.set("color_formula", config.colorFormula);
  }
  return `${base}?${params.toString()}`;
}

// Export the functions expected by the rest of the application.
export {
  // (original exports…) – keep whatever the app imports
  ensurePlotAnalysis,
  spectralTileUrl,
  // optional exports for debugging / external use
  findBestSentinelInRange,
  chooseBestSentinelItem
};
