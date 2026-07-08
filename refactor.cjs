const fs = require('fs');

let code = fs.readFileSync('legacy_vanilla/app.js', 'utf8');

// Wrap in export function
code = code.replace(/^\(\(\) => \{/, 'export function initCesiumMap(containerId, callbacks) {');
code = code.replace(/\}\)\(\);\s*$/, '  return { setDensity, toggleDrawing, flyToAll, zoomIn, zoomOut, toggleReference, toggleSatellite, setSpectralMode, toggleForest, toggleZone };\n}');

// Replace KML_URL
code = code.replace('const KML_URL = "./lô 68 hec.kml";', 'const KML_URL = "/lô 68 hec.kml";');

// Remove $ function
code = code.replace('const $ = (selector) => document.querySelector(selector);', '');

// Replace Cesium.Viewer initialization
code = code.replace('const viewer = new Cesium.Viewer("cesiumContainer",', 'const viewer = new Cesium.Viewer(containerId,');

// Replace DOM updates with callbacks
// We'll use regex to catch common DOM assignments and replace them
code = code.replace(/\$\("#visibleRegions"\)\.textContent = ([^;]+);/g, 'callbacks.onVisibleRegionsChange($1);');
code = code.replace(/\$\("#totalArea"\)\.textContent = ([^;]+);/g, 'callbacks.onTotalAreaChange($1);');
code = code.replace(/\$\("#carbonTotal"\)\.textContent = ([^;]+);/g, 'callbacks.onCarbonTotalChange($1);');
code = code.replace(/\$\("#clearDrawn"\)\.disabled = ([^;]+);/g, 'callbacks.onClearDrawnDisabledChange($1);');
code = code.replace(/\$\("#drawPolygon"\)\.classList\.toggle\("active", active\);/g, '');
code = code.replace(/\$\("#drawPolygon span"\)\.textContent = active \? "Hủy vẽ polygon" : "Vẽ vùng phân tích";/g, '');
code = code.replace(/\$\("#drawHint"\)\.classList\.toggle\("active", active\);/g, '');
code = code.replace(/\$\("#drawHint"\)\.textContent = ([^;]+);/g, '');

code = code.replace(/\$\("#cardType"\)\.textContent = ([^;]+);/g, 'callbacks.onCardChange({ type: $1, name: plot.name, description: `Đường biên gồm ${plot.ring.length - 1} đỉnh, đọc trực tiếp từ “${plot.sourceName}”.`, area: plot.area, carbon: estimatedTrees, plot });');
code = code.replace(/\$\("#cardName"\)\.textContent = ([^;]+);/g, '');
code = code.replace(/\$\("#cardDescription"\)\.textContent = ([^;]+);/g, '');
code = code.replace(/\$\("#cardArea"\)\.textContent = ([^;]+);/g, '');
code = code.replace(/\$\("#cardCarbon"\)\.textContent = ([^;]+);/g, '');
code = code.replace(/\$\("#regionCard"\)\.classList\.add\("open"\);/g, 'callbacks.onCardOpen(true);');

// Analysis Panel
code = code.replace(/function updateAnalysisPanel\(plot\) \{([\s\S]*?)\}/, 'function updateAnalysisPanel(plot) { callbacks.onAnalysisUpdate(plot); }');

// Map Updated
code = code.replace(/function markMapUpdated\(\) \{([\s\S]*?)\}/, 'function markMapUpdated() { const value = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()); callbacks.onMapUpdated(value); }');

// Status 
code = code.replace(/\$\("#spectralStatus"\)\.textContent = ([^;]+);/g, 'callbacks.onSpectralStatusChange($1);');
code = code.replace(/\$\("#spectralStatus"\)\.title = ([^;]+);/g, '');
code = code.replace(/\$\("#satelliteToggle"\)\.disabled = ([^;]+);/g, 'callbacks.onSatelliteDisabledChange($1);');
code = code.replace(/\$\("#satelliteToggle"\)\.checked = ([^;]+);/g, 'callbacks.onSatelliteCheckedChange($1);');
code = code.replace(/\$\("#spectralMode"\)\.disabled = ([^;]+);/g, 'callbacks.onSpectralModeDisabledChange($1);');
code = code.replace(/\$\("#ndviLegend"\)\.classList\.toggle\("open", ([^)]+)\);/g, 'callbacks.onLegendChange($1, config);');
code = code.replace(/\$\("#legendMin"\)\.textContent = ([^;]+);/g, '');
code = code.replace(/\$\("#legendMax"\)\.textContent = ([^;]+);/g, '');
code = code.replace(/\$\("#legendDescription"\)\.textContent = ([^;]+);/g, '');

// Loading
code = code.replace(/\$\("#loadingScreen"\)\.classList\.add\("done"\)/g, 'callbacks.onLoading(false)');
code = code.replace(/\$\("#loadingScreen"\)\.innerHTML = ([^;]+);/g, 'callbacks.onLoadingError($1)');
code = code.replace(/\$\("#loadingScreen"\)\.classList\.add\("error"\);/g, '');
code = code.replace(/\$\("#cameraCoords"\)\.textContent = ([^;]+);/g, 'callbacks.onCameraCoordsChange($1);');
code = code.replace(/\$\("#searchResults"\)\.innerHTML = ([^;]+);/g, 'callbacks.onSearchResults(matches);');
code = code.replace(/\$\("#searchResults"\)\.classList\.toggle\("open", ([^)]+)\);/g, '');

// Extract event listeners to exported functions
code = code.replace(/\$\("#resetView"\)\.addEventListener\("click", \(\) => flyToAll\(\)\);/g, '');
code = code.replace(/\$\("#drawPolygon"\)\.addEventListener\("click", \(\) => setDrawing\(!isDrawing\)\);/g, 'function toggleDrawing() { setDrawing(!isDrawing); }');
code = code.replace(/\$\("#clearDrawn"\)\.addEventListener\("click", \(\) => \{([\s\S]*?)\}\);/g, 'function clearDrawn() { $1 }');
code = code.replace(/\$\("#togglePanel"\)\.addEventListener\("click", \(\) => \$\("#controlPanel"\)\.classList\.toggle\("hidden"\)\);/g, '');
code = code.replace(/\$\("#zoomIn"\)\.addEventListener\("click", \(\) => viewer\.camera\.zoomIn\(viewer\.camera\.positionCartographic\.height \* 0\.35\)\);/g, 'function zoomIn() { viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.35); }');
code = code.replace(/\$\("#zoomOut"\)\.addEventListener\("click", \(\) => viewer\.camera\.zoomOut\(viewer\.camera\.positionCartographic\.height \* 0\.45\)\);/g, 'function zoomOut() { viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.45); }');
code = code.replace(/\$\("#closeCard"\)\.addEventListener\("click", \(\) => \$\("#regionCard"\)\.classList\.remove\("open"\)\);/g, '');
code = code.replace(/\$\("#flyCloser"\)\.addEventListener\("click", \(\) => selectedPlot && flyToPlot\(selectedPlot, true\)\);/g, '');

code = code.replace(/\$\("#referenceToggle"\)\.addEventListener\("change", \(event\) => \{([\s\S]*?)\}\);/g, 'function toggleReference(visible) { referenceLayer.show = visible; scene.requestRender(); }');
code = code.replace(/\$\("#satelliteToggle"\)\.addEventListener\("change", \(event\) => \{([\s\S]*?)\}\);/g, 'function toggleSatellite(visible) { if(spectralLayer) spectralLayer.show = visible; indexOverlaySource.show = visible; scene.requestRender(); }');
code = code.replace(/\$\("#spectralMode"\)\.addEventListener\("change", \(event\) => renderSpectralLayer\(event\.target\.value, selectedPlot\)\);/g, 'function setSpectralMode(mode) { renderSpectralLayer(mode, selectedPlot); }');
code = code.replace(/\$\("#forestToggle"\)\.addEventListener\("change", \(event\) => \{ forestSource\.show = event\.target\.checked; scene\.requestRender\(\); \}\);/g, 'function toggleForest(visible) { forestSource.show = visible; scene.requestRender(); }');
code = code.replace(/\$\("#zoneToggle"\)\.addEventListener\("change", \(event\) => \{ boundarySource\.show = event\.target\.checked; scene\.requestRender\(\); \}\);/g, 'function toggleZone(visible) { boundarySource.show = visible; scene.requestRender(); }');
code = code.replace(/\$\("#toggleAll"\)\.addEventListener\("click", \(event\) => \{([\s\S]*?)\}\);/g, '');
code = code.replace(/\$\("#densityRange"\)\.addEventListener\("input", \(event\) => \{([\s\S]*?)\}\);/g, 'function setDensity(val) { density = val; clearTimeout(densityTimer); densityTimer = setTimeout(rebuildForest, 120); }');
code = code.replace(/\$\("#toggle2D"\)\.addEventListener\("click", \(event\) => \{([\s\S]*?)\}\);/g, 'function toggle2D() { is3D = !is3D; if (is3D) scene.morphTo3D(1); else scene.morphTo2D(1); }');

// Search inputs
code = code.replace(/const searchInput = \$\("#regionSearch"\);/g, '');
code = code.replace(/searchInput\.addEventListener/g, '//');
code = code.replace(/\$\("#searchResults"\)\.addEventListener/g, '//');
code = code.replace(/document\.addEventListener\("click"/g, '// document.addEventListener("click"');
code = code.replace(/document\.addEventListener\("keydown"/g, '// document.addEventListener("keydown"');

// Fix updateAnalysisPanel error where I replaced it entirely
// Oh wait, I replaced the whole body of updateAnalysisPanel, which is perfectly fine. It just calls callbacks.onAnalysisUpdate(plot);

fs.writeFileSync('src/lib/CesiumLogic.js', code);
console.log('Refactoring complete');
