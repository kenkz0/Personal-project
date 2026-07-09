export function initCesiumMap(containerId, callbacks) {
  const COVER_API_BASE = (import.meta.env.VITE_COVER_API_URL || "").replace(/\/+$/, "");
  const coverApiUrl = (path) => `${COVER_API_BASE}${path}`;
  const $ = () => ({
    get value() { return ""; }, set value(v) {},
    get textContent() { return ""; }, set textContent(v) {},
    get checked() { return false; }, set checked(v) {},
    get disabled() { return false; }, set disabled(v) {},
    style: {}, classList: { toggle: ()=>{}, remove: ()=>{}, add: ()=>{} },
    addEventListener: ()=>{}, focus: ()=>{}, click: ()=>{}
  });
  const KML_URL = "/lô%2068%20hec.kml";
  
  const plots = [];
  let selectedPlot = null;
  let density = 65;
  let treeCount = 0;
  let dataRectangle = null;
  let is3D = false;
  let densityTimer;
  let spectralLayer = null;
  const spectralLayerCache = new Map();
  let spectralLayerVisible = true;
  let activeSpectralPlot = null;
  let isDrawing = false;
  let drawPoints = [];
  let hoverPoint = null;
  let drawnSequence = 0;
  let spectralRenderToken = 0;
  let currentSpectralMode = "true-color";
  const SENTINEL_CLOUD_THRESHOLD = 35;
  const PLOT_FOCUS_PADDING = 0.18;

  const SPECTRAL_MODES = {
    "true-color": {
      label: "True Color",
      description: "RGB tự nhiên để đối chiếu hiện trạng nhìn thấy.",
      assets: ["visual"],
      visual: true,
      alpha: 0.68
    },
    "false-color": {
      label: "Tán lá/ranh rừng",
      description: "B08/B04/B03: cây khỏe nổi đỏ, dễ tách ranh tán lá với đất trống.",
      assets: ["B08", "B04", "B03"],
      rescale: "800,3000",
      colorFormula: "Gamma RGB 1.6 Saturation 1.3",
      alpha: 0.68
    },
    "ndvi": {
      label: "NDVI · độ xanh sinh khối",
      description: "Ít thực vật → tán lá khỏe",
      assets: ["B08", "B04"],
      // Sentinel-2 L2A PB >= 04.00 stores BOA reflectance with -1000
      // BOA_ADD_OFFSET. Apply it before calculating the normalized index.
      expression: "(B08-B04)/(B08+B04-2000)",
      rescale: "-0.2,0.9",
      colormap: "rdylgn",
      alpha: 0.58
    },
    "evi": {
      label: "EVI · sinh khối tán dày",
      description: "Duy trì độ nhạy tốt hơn NDVI khi rừng đã khép tán.",
      assets: ["B08", "B04", "B02"],
      expression: "2.5*(B08-B04)/(B08+6*B04-7.5*B02+10500)",
      rescale: "-0.2,1",
      colormap: "rdylgn",
      alpha: 0.58
    },
    "ndre": {
      label: "NDRE · diệp lục/red edge",
      description: "Theo dõi diệp lục và dấu hiệu suy yếu sớm.",
      assets: ["B8A", "B05"],
      expression: "(B8A-B05)/(B8A+B05-2000)",
      rescale: "-0.1,0.65",
      colormap: "rdylgn",
      alpha: 0.58
    },
    "gci": {
      label: "GCI · diệp lục xanh",
      description: "Chỉ báo trạng thái diệp lục và dinh dưỡng của tán lá.",
      assets: ["B08", "B03"],
      expression: "(B08-1000)/(B03-1000)-1",
      rescale: "0,6",
      colormap: "viridis",
      alpha: 0.58
    },
    "ndmi": {
      label: "NDMI · độ ẩm tán lá",
      description: "Khô/stress nước → ẩm tán lá tốt",
      assets: ["B08", "B11"],
      expression: "(B08-B11)/(B08+B11-2000)",
      rescale: "-0.2,0.5",
      colormap: "brbg",
      alpha: 0.58
    }
  };

  const ANALYSIS_INDICES = {
    ndvi: SPECTRAL_MODES.ndvi,
    evi: SPECTRAL_MODES.evi,
    ndre: SPECTRAL_MODES.ndre,
    gci: SPECTRAL_MODES.gci,
    ndmi: SPECTRAL_MODES.ndmi
  };

  Cesium.Ion.defaultAccessToken = "";
  const viewer = new Cesium.Viewer(containerId, {
    baseLayer: false,
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: false,
    contextOptions: {
      webgl: { preserveDrawingBuffer: true }
    },
    requestRenderMode: false
  });

  const scene = viewer.scene;
  scene.backgroundColor = Cesium.Color.fromCssColorString("#07110d");
  scene.globe.baseColor = Cesium.Color.fromCssColorString("#10281d");
  scene.globe.enableLighting = false;
  scene.globe.dynamicAtmosphereLighting = false;
  scene.fog.enabled = false;
  scene.fog.density = 0.00018;
  scene.skyAtmosphere.hueShift = -0.08;
  scene.skyAtmosphere.saturationShift = -0.28;
  scene.skyAtmosphere.brightnessShift = -0.28;
  scene.screenSpaceCameraController.minimumZoomDistance = 80;
  scene.screenSpaceCameraController.maximumZoomDistance = 22000000;
  scene.morphTo2D(0);

  const referenceLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 19,
    credit: new Cesium.Credit("Reference imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community")
  }));
  referenceLayer.alpha = 0.72;
  referenceLayer.brightness = 0.96;
  referenceLayer.contrast = 1.04;
  referenceLayer.saturation = 1.02;
  referenceLayer.gamma = 1;

  const boundarySource = new Cesium.CustomDataSource("Ranh giới KML");
  const forestSource = new Cesium.CustomDataSource("Rừng 3D trong KML");
  const drawSource = new Cesium.CustomDataSource("Bản nháp polygon");
  viewer.dataSources.add(boundarySource);
  viewer.dataSources.add(forestSource);
  forestSource.show = false;
  viewer.dataSources.add(drawSource);
  const indexOverlaySource = new Cesium.CustomDataSource("Chỉ số phổ trong KML");
  viewer.dataSources.add(indexOverlaySource);

  function seededRandom(seed) {
    let t = seed + 0x6d2b79f5;
    return () => {
      t += 0x6d2b79f5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pointInRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i];
      const b = ring[j];
      const intersects = ((a.lat > point.lat) !== (b.lat > point.lat))
        && (point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function polygonAreaHectares(ring) {
    if (ring.length < 3) return 0;
    const meanLat = ring.reduce((sum, p) => sum + p.lat, 0) / ring.length;
    const metersPerLon = 111320 * Math.cos(Cesium.Math.toRadians(meanLat));
    const metersPerLat = 110574;
    let twiceArea = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const current = ring[i];
      const next = ring[(i + 1) % ring.length];
      twiceArea += (current.lon * metersPerLon) * (next.lat * metersPerLat)
        - (next.lon * metersPerLon) * (current.lat * metersPerLat);
    }
    return Math.abs(twiceArea) / 2 / 10000;
  }

  function boundsOf(ring) {
    return ring.reduce((bounds, point) => ({
      west: Math.min(bounds.west, point.lon),
      east: Math.max(bounds.east, point.lon),
      south: Math.min(bounds.south, point.lat),
      north: Math.max(bounds.north, point.lat)
    }), { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity });
  }

  function centroidOf(ring) {
    const points = ring.length > 1 && ring[0].lon === ring[ring.length - 1].lon
      && ring[0].lat === ring[ring.length - 1].lat ? ring.slice(0, -1) : ring;
    return {
      lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
      lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length
    };
  }

  function repairMojibake(value) {
    if (!value) return value;
    const windows1252 = new Map([..."€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ"]
      .map((char, index) => [char, index + 0x80]));
    let result = value;
    for (let pass = 0; pass < 2 && /[ÃÄÂáºá»]/.test(result); pass += 1) {
      try {
        const bytes = [...result].map((char) => {
          const code = char.charCodeAt(0);
          if (code <= 0xff) return code;
          if (windows1252.has(char)) return windows1252.get(char);
          throw new Error("Ký tự không thuộc Windows-1252");
        });
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
        if (decoded.includes("�")) break;
        result = decoded;
      } catch {
        break;
      }
    }
    return result.replaceAll("�", "").trim();
  }

  function parseKml(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("KML không hợp lệ hoặc không thể phân tích.");
    const parsed = [];
    const placemarks = [...xml.getElementsByTagNameNS("*", "Placemark")];
    placemarks.forEach((placemark, placemarkIndex) => {
      const nameNode = placemark.getElementsByTagNameNS("*", "name")[0];
      const polygons = [...placemark.getElementsByTagNameNS("*", "Polygon")];
      polygons.forEach((polygon, polygonIndex) => {
        const outer = polygon.getElementsByTagNameNS("*", "outerBoundaryIs")[0];
        const coordinateNode = outer?.getElementsByTagNameNS("*", "coordinates")[0];
        if (!coordinateNode) return;
        const ring = coordinateNode.textContent.trim().split(/\s+/).map((tuple) => {
          const [lon, lat, height = 0] = tuple.split(",").map(Number);
          return { lon, lat, height };
        }).filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
        if (ring.length < 3) return;
        const bounds = boundsOf(ring);
        const holes = [...polygon.getElementsByTagNameNS("*", "innerBoundaryIs")].map((inner) => {
          const node = inner.getElementsByTagNameNS("*", "coordinates")[0];
          return node ? node.textContent.trim().split(/\s+/).map((tuple) => {
            const [lon, lat] = tuple.split(",").map(Number);
            return { lon, lat };
          }) : [];
        });
        parsed.push({
          id: `kml-plot-${placemarkIndex}-${polygonIndex}`,
          name: polygons.length > 1 ? `Lô ${placemarkIndex + 1}.${polygonIndex + 1}` : `Lô rừng ${placemarkIndex + 1}`,
          sourceName: repairMojibake(nameNode?.textContent?.trim()) || "Polygon KML",
          ring,
          holes,
          bounds,
          center: centroidOf(ring),
          area: polygonAreaHectares(ring),
          drawn: false
        });
      });
    });
    return parsed;
  }

  function addPlotBoundary(plot) {
    const hierarchy = new Cesium.PolygonHierarchy(
      plot.ring.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat)),
      plot.holes.filter((hole) => hole.length >= 3).map((hole) => new Cesium.PolygonHierarchy(
        hole.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat))
      ))
    );
    const fill = Cesium.Color.fromCssColorString("#ffbf00");
    const polygonEntity = boundarySource.entities.add({
      id: plot.id,
      name: plot.name,
      polygon: {
        hierarchy,
        material: fill.withAlpha(plot.drawn ? 0.1 : 0.015),
        outline: true,
        outlineColor: fill,
        outlineWidth: 3,
        height: 1
      },
      properties: { plotId: plot.id }
    });
    boundarySource.entities.add({
      polyline: {
        positions: plot.ring.map((point) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 4)),
        width: 3,
        clampToGround: true,
        material: fill
      },
      properties: { plotId: plot.id }
    });
    boundarySource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(plot.center.lon, plot.center.lat, 55),
      label: {
        show: false,
        text: `${plot.name.toUpperCase()}  ·  ${plot.area.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} HA`,
        font: '700 13px "Segoe UI", Arial, sans-serif',
        fillColor: Cesium.Color.fromCssColorString("#efffe7"),
        outlineColor: Cesium.Color.fromCssColorString("#07110d"),
        outlineWidth: 5,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25000),
        disableDepthTestDistance: 10000
      },
      properties: { plotId: plot.id }
    });
    return polygonEntity;
  }

  function plotPortfolioRow(plot) {
    const ndvi = plot.analysis?.indices?.ndvi?.mean ?? plot.analysis?.mean;
    const cloud = Number(plot.analysisItem?.properties?.["eo:cloud_cover"]);
    let health = "Đang chờ ảnh";
    let tone = "pending";
    if (plot.analysis?.error) {
      health = "Cần kiểm tra";
      tone = "warning";
    } else if (Number.isFinite(ndvi)) {
      if (ndvi >= 0.6) {
        health = "Rừng xanh dày";
        tone = "good";
      } else if (ndvi >= 0.4) {
        health = "Phát triển tốt";
        tone = "good";
      } else if (ndvi >= 0.25) {
        health = "Thực vật thưa";
        tone = "watch";
      } else {
        health = "Ít thực vật";
        tone = "warning";
      }
    } else if (plot.analysisItem) {
      health = "Đang phân tích";
      tone = "pending";
    }
    return {
      id: plot.id,
      name: plot.name,
      sourceName: plot.sourceName,
      area: plot.area,
      areaText: plot.area.toLocaleString("vi-VN", { maximumFractionDigits: 1 }),
      drawn: Boolean(plot.drawn),
      selected: selectedPlot?.id === plot.id,
      health,
      tone,
      ndvi: Number.isFinite(ndvi) ? ndvi.toFixed(3) : "—",
      cloud: Number.isFinite(cloud) ? cloud.toFixed(1) : "—",
      center: plot.center
    };
  }

  function emitPlotPortfolio() {
    callbacks.onPlotsChange?.(plots.map(plotPortfolioRow));
  }

  function updatePlotSummary() {
    const totalArea = plots.reduce((sum, plot) => sum + plot.area, 0);
    callbacks.onVisibleRegionsChange(String(plots.length).padStart(2, "0"));
    callbacks.onTotalAreaChange(totalArea.toLocaleString("vi-VN", { maximumFractionDigits: 1 }));
    callbacks.onClearDrawnDisabledChange?.(!plots.some((plot) => plot.drawn));
    emitPlotPortfolio();
  }

  function screenToLonLat(screenPosition) {
    const cartesian = viewer.camera.pickEllipsoid(screenPosition, scene.globe.ellipsoid);
    if (!cartesian) return null;
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    return {
      lon: Cesium.Math.toDegrees(cartographic.longitude),
      lat: Cesium.Math.toDegrees(cartographic.latitude)
    };
  }

  function refreshDrawPreview() {
    drawSource.entities.removeAll();
    const preview = hoverPoint ? [...drawPoints, hoverPoint] : [...drawPoints];
    if (preview.length >= 2) {
      drawSource.entities.add({
        polyline: {
          positions: preview.map((point) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 3)),
          width: 3,
          clampToGround: true,
          material: Cesium.Color.fromCssColorString("#d7ff75")
        }
      });
    }
    if (preview.length >= 3) {
      drawSource.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(preview.map((point) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat))),
          material: Cesium.Color.fromCssColorString("#a7e853").withAlpha(0.22),
          height: 2
        }
      });
    }
    drawPoints.forEach((point) => drawSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 5),
      point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString("#e7ffb6"),
        outlineColor: Cesium.Color.fromCssColorString("#17331d"),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    }));
    scene.requestRender();
  }

  function setDrawing(active) {
    isDrawing = active;
    drawPoints = [];
    hoverPoint = null;
    drawSource.entities.removeAll();
    
    
    
    
    scene.canvas.style.cursor = active ? "crosshair" : "default";
    scene.requestRender();
  }

  function finishDrawing() {
    if (drawPoints.length < 3) return;
    const ring = [...drawPoints, { ...drawPoints[0] }];
    const plot = {
      id: `drawn-plot-${Date.now()}`,
      name: `Vùng vẽ ${++drawnSequence}`,
      sourceName: "Người dùng vẽ trên bản đồ",
      ring,
      holes: [],
      bounds: boundsOf(ring),
      center: centroidOf(ring),
      area: polygonAreaHectares(ring),
      drawn: true,
      analysis: null
    };
    plots.push(plot);
    setDrawing(false);
    addPlotBoundary(plot, plots.length - 1);
    updatePlotSummary();
    rebuildForest();
    renderSearchResults();
    updateCard(plot);
    ensurePlotAnalysis(plot)
      .catch((error) => {
        plot.analysis = { error: `Không có ảnh cho vùng vẽ: ${error.message}` };
        if (selectedPlot?.id === plot.id) updateAnalysisPanel(plot);
      });
  }

  function randomPointInPlot(plot, random) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const point = {
        lon: plot.bounds.west + random() * (plot.bounds.east - plot.bounds.west),
        lat: plot.bounds.south + random() * (plot.bounds.north - plot.bounds.south)
      };
      if (pointInRing(point, plot.ring) && !plot.holes.some((hole) => pointInRing(point, hole))) return point;
    }
    return plot.center;
  }

  function rebuildForest() {
    forestSource.entities.removeAll();
    treeCount = 0;
    plots.forEach((plot, plotIndex) => {
      const random = seededRandom(9137 + plotIndex * 101);
      // Ở 100%: xấp xỉ 8 cây mô phỏng/ha, có giới hạn để bảo vệ WebGL.
      const count = Math.min(900, Math.max(30, Math.round(plot.area * 8 * density / 100)));
      for (let i = 0; i < count; i += 1) {
        const point = randomPointInPlot(plot, random);
        const height = 11 + random() * 17;
        const crownRadius = 2.2 + random() * 2.6;
        const trunkHeight = height * 0.42;
        const green = random() > 0.52 ? "#4f9f45" : random() > 0.3 ? "#65b34f" : "#377f43";
        forestSource.entities.add({
          position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, trunkHeight / 2),
          cylinder: {
            length: trunkHeight,
            topRadius: 0.7,
            bottomRadius: 1.05,
            material: Cesium.Color.fromCssColorString("#654c32"),
            slices: 6,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 14000)
          },
          properties: { plotId: plot.id }
        });
        forestSource.entities.add({
          position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, trunkHeight + (height - trunkHeight) / 2),
          cylinder: {
            length: height - trunkHeight,
            topRadius: 0.3,
            bottomRadius: crownRadius,
            material: Cesium.Color.fromCssColorString(green).withAlpha(0.97),
            slices: 7,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 14000)
          },
          properties: { plotId: plot.id }
        });
      }
      treeCount += count;
    });
    callbacks.onCarbonTotalChange(treeCount.toLocaleString("vi-VN"));
    if (selectedPlot) updateCard(selectedPlot);
    scene.requestRender();
  }

  function updateCard(plot, analyze = true) {
    selectedPlot = plot;
    activeSpectralPlot = plot;
    callbacks.onCardChange({
      type: plot.drawn ? "POLYGON VẼ" : "POLYGON KML",
      name: plot.name,
      description: `Đường biên gồm ${plot.ring.length - 1} đỉnh, đọc trực tiếp từ “${plot.sourceName}”.`,
      area: plot.area.toLocaleString("vi-VN", { maximumFractionDigits: 2 }),
      carbon: Math.min(900, Math.max(30, Math.round(plot.area * 8 * density / 100))),
      plot
    });
    
    
    
    
    callbacks.onCardOpen(true);
    updateAnalysisPanel(plot);
    emitPlotPortfolio();
    if (plot.analysisItem) {
      renderSpectralLayer(currentSpectralMode, plot);
    } else if (spectralLayer) {
      spectralLayer.show = false;
      scene.requestRender();
    }
    if (!analyze) return;
    ensurePlotAnalysis(plot).catch((error) => {
      plot.analysis = { error: `Không thể phân tích polygon này: ${error.message}` };
      if (selectedPlot?.id === plot.id) updateAnalysisPanel(plot);
      emitPlotPortfolio();
    });
  }

  function selectPlot(plotId) {
    const plot = plots.find((item) => item.id === plotId);
    if (!plot) return;
    updateCard(plot);
    viewer.camera.flyTo({ destination: paddedRectangleForPlot(plot, PLOT_FOCUS_PADDING), duration: 1.1 });
  }

  function flyToAll(duration = 1.6) {
    if (!dataRectangle) return;
    viewer.camera.flyTo({ destination: dataRectangle, duration });
  }

  function flyToSelectedPlot(duration = 1.1) {
    if (selectedPlot) {
      viewer.camera.flyTo({ destination: paddedRectangleForPlot(selectedPlot, PLOT_FOCUS_PADDING), duration });
      return;
    }
    flyToAll(duration);
  }

  function formatSceneDate(value) {
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
  }

  function markMapUpdated() { const value = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()); callbacks.onMapUpdated(`Cập nhật lúc ${value}`); }

  function updateAnalysisPanel(plot) { callbacks.onAnalysisUpdate(plot); }

  function plotAsGeoJson(plot) {
    const closeRing = (ring) => {
      const coordinates = ring.map((point) => [point.lon, point.lat]);
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first]);
      return coordinates;
    };
    return {
      type: "Feature",
      properties: { plotId: plot.id },
      geometry: {
        type: "Polygon",
        coordinates: [closeRing(plot.ring), ...plot.holes.filter((hole) => hole.length >= 3).map(closeRing)]
      }
    };
  }

  async function fetchWithRetry(url, options, attempts = 2) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (response.ok || (response.status < 500 && response.status !== 429)) return response;
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = new Error(error.name === "AbortError"
          ? "Dịch vụ Sentinel-2 không phản hồi sau 12 giây"
          : "Không thể kết nối dịch vụ Sentinel-2");
      } finally {
        clearTimeout(timeout);
      }
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
      }
    }
    throw lastError || new Error("Yêu cầu mạng thất bại");
  }

  function showLocalSentinelFallback() {
    if (spectralLayer) spectralLayer.show = false;
    spectralLayer = viewer.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({
      url: "/img/2026-05-21-_True_color.jpg",
      rectangle: dataRectangle
    }));
    spectralLayer.alpha = 0.78;
    viewer.imageryLayers.raiseToTop(spectralLayer);
    callbacks.onSatelliteDisabledChange(false);
    callbacks.onSatelliteCheckedChange(true);
    callbacks.onSpectralModeDisabledChange(true);
    scene.requestRender();
  }

  function clearIndexOverlay() {
    indexOverlaySource.entities.removeAll();
  }

  function paddedRectangleForPlot(plot, paddingFactor = 0.12) {
    const lonSpan = Math.max(plot.bounds.east - plot.bounds.west, 0.0008);
    const latSpan = Math.max(plot.bounds.north - plot.bounds.south, 0.0008);
    return Cesium.Rectangle.fromDegrees(
      plot.bounds.west - lonSpan * paddingFactor,
      plot.bounds.south - latSpan * paddingFactor,
      plot.bounds.east + lonSpan * paddingFactor,
      plot.bounds.north + latSpan * paddingFactor
    );
  }

  function rectangleForSentinelItem(plot) {
    return paddedRectangleForPlot(plot, PLOT_FOCUS_PADDING);
  }

  function rectangleForReportSnapshot(plot) {
    const plotRectangle = rectangleForSentinelItem(plot);
    const bbox = plot?.analysisItem?.bbox;
    if (!Array.isArray(bbox) || bbox.length < 4) return plotRectangle;
    const itemRectangle = Cesium.Rectangle.fromDegrees(
      Number(bbox[0]),
      Number(bbox[1]),
      Number(bbox[2]),
      Number(bbox[3])
    );
    const west = Math.max(plotRectangle.west, itemRectangle.west);
    const south = Math.max(plotRectangle.south, itemRectangle.south);
    const east = Math.min(plotRectangle.east, itemRectangle.east);
    const north = Math.min(plotRectangle.north, itemRectangle.north);
    if (west >= east || south >= north) return plotRectangle;
    return new Cesium.Rectangle(west, south, east, north);
  }

  async function analyzeIndexForPlot(plot, item, key, config) {
    const params = new URLSearchParams({
      collection: "sentinel-2-l2a",
      item: item.id,
      asset_as_band: "true",
      expression: config.expression,
      nodata: "0",
      max_size: "1024"
    });
    config.assets.forEach((asset) => params.append("assets", asset));
    const response = await fetchWithRetry(`https://planetarycomputer.microsoft.com/api/data/v1/item/statistics?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plotAsGeoJson(plot))
    });
    if (!response.ok) throw new Error(`${config.label || key} HTTP ${response.status}`);
    const result = await response.json();
    const feature = result.type === "FeatureCollection" ? result.features?.[0] : result;
    const statistics = feature?.properties?.statistics || result?.statistics || result;
    const band = Object.values(statistics || {}).find((value) => value && Number.isFinite(Number(value.mean)));
    if (!band) throw new Error(`${config.label || key} không có giá trị trung bình`);
    return {
      mean: Number(band.mean),
      std: Number(band.std || 0),
      median: Number(band.median || band.mean),
      min: Number(band.min ?? NaN),
      max: Number(band.max ?? NaN),
      validPercent: Number(band.valid_percent ?? 100)
    };
  }

  async function analyzePlotIndices(plot, item) {
    plot.analysis = null;
    plot.analysisItem = item;
    if (selectedPlot?.id === plot.id) updateAnalysisPanel(plot);
    emitPlotPortfolio();
    try {
      const entries = await Promise.all(Object.entries(ANALYSIS_INDICES).map(async ([key, config]) => [
        key,
        await analyzeIndexForPlot(plot, item, key, config)
      ]));
      const indices = Object.fromEntries(entries);
      const ndvi = indices.ndvi;
      plot.analysis = {
        mean: ndvi.mean,
        std: ndvi.std,
        median: ndvi.median,
        validPercent: ndvi.validPercent,
        indices
      };
    } catch (error) {
      plot.analysis = { error: `Chưa thể tính chỉ số phổ trong polygon: ${error.message}` };
    }
    if (selectedPlot?.id === plot.id) updateAnalysisPanel(plot);
    emitPlotPortfolio();
  }

  function spectralTileUrl(item, mode) {
    const config = SPECTRAL_MODES[mode] || SPECTRAL_MODES["true-color"];
    const base = "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x";
    const params = new URLSearchParams({
      collection: "sentinel-2-l2a",
      item: item.id,
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

  async function renderSpectralLayer(mode = currentSpectralMode, plot = activeSpectralPlot || selectedPlot) {
    if (!plot?.analysisItem) return;
    currentSpectralMode = SPECTRAL_MODES[mode] ? mode : "true-color";
    activeSpectralPlot = plot || activeSpectralPlot;
    const config = SPECTRAL_MODES[currentSpectralMode];
    const token = ++spectralRenderToken;
    if (spectralLayer) spectralLayer.show = false;
    clearIndexOverlay();
    const cacheKey = `${plot.id}:${plot.analysisItem.id}:${currentSpectralMode}`;
    spectralLayer = spectralLayerCache.get(cacheKey);
    if (!spectralLayer) {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: spectralTileUrl(plot.analysisItem, currentSpectralMode),
        rectangle: rectangleForSentinelItem(plot),
        minimumLevel: 8,
        maximumLevel: 18,
        credit: new Cesium.Credit("Sentinel-2 L2A · Microsoft Planetary Computer · ESA")
      });
      if (token !== spectralRenderToken) return;
      spectralLayer = viewer.imageryLayers.addImageryProvider(provider);
      spectralLayerCache.set(cacheKey, spectralLayer);
    }
    spectralLayer.alpha = config.alpha;
    spectralLayer.show = spectralLayerVisible;
    spectralLayer.brightness = currentSpectralMode === "true-color" ? 1.0 : 1;
    spectralLayer.contrast = 1.08;
    spectralLayer.saturation = currentSpectralMode === "true-color" ? 1.02 : 1.04;
    spectralLayer.gamma = 1;
    viewer.imageryLayers.raiseToTop(spectralLayer);
    spectralLayer.show = spectralLayerVisible;
    callbacks.onSatelliteCheckedChange(spectralLayerVisible);
    $("#ndviLegend").classList.toggle("open", Boolean(config.expression));
    if (config.expression) {
      
      
      
    }
    scene.requestRender();
  }

  function itemDate(item) {
    return new Date(item.properties?.datetime);
  }

  function itemCloud(item) {
    const cloud = Number(item.properties?.["eo:cloud_cover"]);
    return Number.isFinite(cloud) ? cloud : Infinity;
  }

  function monthKey(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function compareSceneQuality(a, b) {
    return itemCloud(a) - itemCloud(b) || itemDate(b) - itemDate(a);
  }

  function chooseBestSentinelItem(items) {
    const validItems = (items || [])
      .filter((item) => Number.isFinite(itemDate(item).getTime()))
      .sort((a, b) => itemDate(b) - itemDate(a));
    const months = [...new Set(validItems.map((item) => monthKey(itemDate(item))))];

    for (const key of months) {
      const monthlyCandidates = validItems
        .filter((item) => monthKey(itemDate(item)) === key && itemCloud(item) <= SENTINEL_CLOUD_THRESHOLD)
        .sort(compareSceneQuality);
      if (monthlyCandidates.length) return monthlyCandidates[0];
    }

    return [...validItems].sort(compareSceneQuality)[0] || null;
  }

  async function findLatestSentinel(bounds) {
    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 18);
    const params = new URLSearchParams({
      collections: "sentinel-2-l2a",
      bbox: [bounds.west, bounds.south, bounds.east, bounds.north].join(","),
      datetime: `${start.toISOString()}/${end.toISOString()}`,
      limit: "200"
    });
    const response = await fetchWithRetry(`https://planetarycomputer.microsoft.com/api/stac/v1/search?${params}`);
    if (!response.ok) throw new Error(`STAC HTTP ${response.status}`);
    const result = await response.json();
    const item = chooseBestSentinelItem(result.features);
    if (!item) throw new Error(`Không tìm thấy scene Sentinel-2 trong 18 tháng gần đây`);
    return item;
  }

  async function ensurePlotAnalysis(plot) {
    if (!plot) return null;
    if (!plot.analysisItem) plot.analysisItem = await findLatestSentinel(plot.bounds);
    if (Object.keys(ANALYSIS_INDICES).some((key) => !plot.analysis?.indices?.[key])) {
      await analyzePlotIndices(plot, plot.analysisItem);
    }
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

  async function loadLatestSentinel(bounds) {
    let sentinelItem;
    try {
      const end = new Date();
      const start = new Date(end);
      start.setMonth(start.getMonth() - 18);
      const params = new URLSearchParams({
        collections: "sentinel-2-l2a",
        bbox: [bounds.west, bounds.south, bounds.east, bounds.north].join(","),
        datetime: `${start.toISOString()}/${end.toISOString()}`,
        limit: "200"
      });
      const response = await fetchWithRetry(`https://planetarycomputer.microsoft.com/api/stac/v1/search?${params}`);
      if (!response.ok) throw new Error(`STAC HTTP ${response.status}`);
      const result = await response.json();
      sentinelItem = chooseBestSentinelItem(result.features);
      if (!sentinelItem) throw new Error(`Không tìm thấy scene Sentinel-2 trong 18 tháng gần đây`);
      const cloud = Number(sentinelItem.properties["eo:cloud_cover"]).toFixed(1);
      callbacks.onSpectralStatusChange(`${formatSceneDate(sentinelItem.properties.datetime)} · mây ${cloud}% · không realtime`);
      callbacks.onSatelliteDisabledChange(false);
      callbacks.onSatelliteCheckedChange(true);
      callbacks.onSpectralModeDisabledChange(false);
      plots.forEach((plot) => { plot.analysisItem = sentinelItem; });
      await renderSpectralLayer(currentSpectralMode, selectedPlot || plots[0]);
      markMapUpdated();
    } catch (error) {
      callbacks.onSpectralStatusChange("API tạm thời không khả dụng · ảnh cục bộ 21/05/2026");
      showLocalSentinelFallback();
      plots.forEach((plot) => {
        plot.analysis = { error: `Không tính chỉ số mới: ${error.message}. Đang hiển thị ảnh True Color cục bộ; ảnh này không được dùng để suy ra chỉ số.` };
      });
      if (selectedPlot) updateAnalysisPanel(selectedPlot);
      return;
    }

    if (selectedPlot) {
      try {
        await analyzePlotIndices(selectedPlot, sentinelItem);
      } catch (error) {
        selectedPlot.analysis = { error: `Không thể tính chỉ số: ${error.message}` };
        updateAnalysisPanel(selectedPlot);
      }
    }
  }

  function renderSearchResults(query = "") {
    const normalized = query.trim().toLocaleLowerCase("vi");
    const matches = plots.filter((plot) => `${plot.name} ${plot.sourceName}`.toLocaleLowerCase("vi").includes(normalized));
    callbacks.onSearchResults(matches);
    $("#searchResults").classList.toggle("open", matches.length > 0 && document.activeElement === $("#regionSearch"));
  }

  async function loadKml() {
    try {
      const response = await fetch(KML_URL);
      if (!response.ok) throw new Error(`Không tải được KML (${response.status}).`);
      const parsedPlots = parseKml(await response.text());
      if (!parsedPlots.length) throw new Error("KML không chứa polygon nào.");
      plots.push(...parsedPlots);
      plots.forEach(addPlotBoundary);
      const allBounds = plots.reduce((bounds, plot) => ({
        west: Math.min(bounds.west, plot.bounds.west), east: Math.max(bounds.east, plot.bounds.east),
        south: Math.min(bounds.south, plot.bounds.south), north: Math.max(bounds.north, plot.bounds.north)
      }), { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity });
      const lonPadding = Math.max((allBounds.east - allBounds.west) * 0.28, 0.002);
      const latPadding = Math.max((allBounds.north - allBounds.south) * 0.28, 0.002);
      dataRectangle = Cesium.Rectangle.fromDegrees(
        allBounds.west - lonPadding, allBounds.south - latPadding,
        allBounds.east + lonPadding, allBounds.north + latPadding
      );
      updatePlotSummary();
      callbacks.onCameraCoordsChange(`${plots[0].center.lat.toFixed(4)}°N · ${plots[0].center.lon.toFixed(4)}°E`);
      rebuildForest();
      renderSearchResults();
      updateCard(plots[0]);
      flyToAll(0);
      callbacks.onSpectralStatusChange("Đang tải Sentinel-2 L2A...");
      setTimeout(() => callbacks.onLoading(false), 500);
    } catch (error) {
      callbacks.onLoadingError(error.message);
      
    }
  }

  async function loadCustomKml(kmlText) {
    try {
      const parsedPlots = parseKml(kmlText);
      if (!parsedPlots.length) throw new Error("KML không chứa polygon nào.");

      const uploadId = `upload-${Date.now()}`;
      const startNumber = plots.length + 1;
      const addedPlots = parsedPlots.map((plot, index) => ({
        ...plot,
        id: `${uploadId}-${index}`,
        name: `Lô rừng ${startNumber + index}`
      }));

      plots.push(...addedPlots);
      addedPlots.forEach(addPlotBoundary);
      
      const allBounds = plots.reduce((bounds, plot) => ({
        west: Math.min(bounds.west, plot.bounds.west), east: Math.max(bounds.east, plot.bounds.east),
        south: Math.min(bounds.south, plot.bounds.south), north: Math.max(bounds.north, plot.bounds.north)
      }), { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity });
      
      const lonPadding = Math.max((allBounds.east - allBounds.west) * 0.28, 0.002);
      const latPadding = Math.max((allBounds.north - allBounds.south) * 0.28, 0.002);
      dataRectangle = Cesium.Rectangle.fromDegrees(
        allBounds.west - lonPadding, allBounds.south - latPadding,
        allBounds.east + lonPadding, allBounds.north + latPadding
      );
      
      updatePlotSummary();
      callbacks.onCameraCoordsChange(`${addedPlots[0].center.lat.toFixed(4)}°N · ${addedPlots[0].center.lon.toFixed(4)}°E`);
      rebuildForest();
      renderSearchResults();
      
      updateCard(addedPlots[0]);
      viewer.camera.flyTo({ destination: paddedRectangleForPlot(addedPlots[0], PLOT_FOCUS_PADDING), duration: 1.1 });
      
      callbacks.onSpectralStatusChange("Đang tải Sentinel-2 L2A...");
    } catch (error) {
      window.alert(`Không thể đọc KML: ${error.message}`);
    }
  }

  const clickHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  clickHandler.setInputAction((movement) => {
    if (isDrawing) {
      const point = screenToLonLat(movement.position);
      if (point) {
        drawPoints.push(point);
        hoverPoint = null;
        refreshDrawPreview();
      }
      return;
    }
    const picked = scene.pick(movement.position);
    if (!Cesium.defined(picked) || !picked.id) return;
    const id = picked.id.properties?.plotId?.getValue?.() || picked.id.id;
    const plot = plots.find((item) => item.id === id);
    if (plot) updateCard(plot);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  clickHandler.setInputAction((movement) => {
    if (!isDrawing || !drawPoints.length) return;
    hoverPoint = screenToLonLat(movement.endPosition);
    refreshDrawPreview();
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  clickHandler.setInputAction(() => {
    if (isDrawing) finishDrawing();
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  scene.canvas.addEventListener("contextmenu", (event) => {
    if (isDrawing) event.preventDefault();
  });

  
  function toggleDrawing() { setDrawing(!isDrawing); }
  
  
  function zoomIn() { viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.35); }
  function zoomOut() { viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.45); }
  
  
  function toggleReference(visible) { referenceLayer.show = visible; scene.requestRender(); }
  function toggleSatellite(visible) { spectralLayerVisible = visible; if(spectralLayer) spectralLayer.show = visible; indexOverlaySource.show = visible; scene.requestRender(); }
  function setSpectralMode(mode) {
    currentSpectralMode = SPECTRAL_MODES[mode] ? mode : "true-color";
    renderSpectralLayer(currentSpectralMode, activeSpectralPlot || selectedPlot);
  }
  function toggleForest(visible) { forestSource.show = visible; scene.requestRender(); }
  function toggleZone(visible) { boundarySource.show = visible; scene.requestRender(); }

  

  function setDensity(val) { density = val; clearTimeout(densityTimer); densityTimer = setTimeout(rebuildForest, 120); }

  async function calculateCoverAndValue(options = {}) {
    const plot = selectedPlot || plots[0];
    if (!plot) throw new Error("Chưa có polygon để tính độ che phủ.");
    callbacks.onCoverUpdate?.({ status: "loading", plotId: plot.id, plotName: plot.name, note: "Đang tính bằng Microsoft Planetary Computer..." });
    const response = await fetch(coverApiUrl("/api/cover"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true"
      },
      body: JSON.stringify({ geojson: plotAsGeoJson(plot), options })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Cover API HTTP ${response.status}`);
    const scopedResult = { status: "ok", plotId: plot.id, plotName: plot.name, ...result };
    callbacks.onCoverUpdate?.(scopedResult);
    return scopedResult;
  }

  function toggle2D() { is3D = !is3D; if (is3D) scene.morphTo3D(1); else scene.morphTo2D(1); }

  
  // Search event listeners omitted for React integration

  viewer.camera.changed.addEventListener(() => {
    const position = viewer.camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(position.latitude);
    const lon = Cesium.Math.toDegrees(position.longitude);
    callbacks.onCameraCoordsChange(`${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"} · ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`);
  });

  loadKml();
  function destroy() {
    clearTimeout(densityTimer);
    spectralRenderToken += 1;
    clickHandler.destroy();
    if (!viewer.isDestroyed()) viewer.destroy();
  }

  function exportMap() {
    scene.render();
    const link = document.createElement("a");
    link.download = `lam-kinh-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = scene.canvas.toDataURL("image/png");
    link.click();
  }

  function getMapSnapshot() {
    scene.render();
    return scene.canvas.toDataURL("image/jpeg", 0.92);
  }

  function screenPointForLonLat(lon, lat) {
    const toWindow = Cesium.SceneTransforms?.wgs84ToWindowCoordinates
      || Cesium.SceneTransforms?.worldToWindowCoordinates;
    if (typeof toWindow !== "function") return null;
    const position = Cesium.Cartesian3.fromDegrees(lon, lat);
    return toWindow(scene, position);
  }

  function getRectangleSnapshot(rectangle, quality = 0.92) {
    scene.render();
    const canvas = scene.canvas;
    const corners = [
      screenPointForLonLat(Cesium.Math.toDegrees(rectangle.west), Cesium.Math.toDegrees(rectangle.south)),
      screenPointForLonLat(Cesium.Math.toDegrees(rectangle.west), Cesium.Math.toDegrees(rectangle.north)),
      screenPointForLonLat(Cesium.Math.toDegrees(rectangle.east), Cesium.Math.toDegrees(rectangle.south)),
      screenPointForLonLat(Cesium.Math.toDegrees(rectangle.east), Cesium.Math.toDegrees(rectangle.north))
    ].filter(Boolean);
    if (corners.length < 4) return getMapSnapshot();

    const pixelRatio = canvas.width / Math.max(canvas.clientWidth, 1);
    const xs = corners.map((point) => point.x * pixelRatio);
    const ys = corners.map((point) => point.y * pixelRatio);
    const pad = 0;
    let left = Math.floor(Math.min(...xs) - pad);
    let top = Math.floor(Math.min(...ys) - pad);
    let right = Math.ceil(Math.max(...xs) + pad);
    let bottom = Math.ceil(Math.max(...ys) + pad);
    if (left < 0) {
      right -= left;
      left = 0;
    }
    if (top < 0) {
      bottom -= top;
      top = 0;
    }
    if (right > canvas.width) {
      left = Math.max(0, left - (right - canvas.width));
      right = canvas.width;
    }
    if (bottom > canvas.height) {
      top = Math.max(0, top - (bottom - canvas.height));
      bottom = canvas.height;
    }
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);

    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    output.getContext("2d").drawImage(canvas, left, top, width, height, 0, 0, width, height);
    return output.toDataURL("image/jpeg", quality);
  }

  function waitForImagery(timeoutMs = 1400) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        removeListener?.();
        clearTimeout(timeout);
        scene.render();
        resolve();
      };
      const removeListener = scene.globe.tileLoadProgressEvent.addEventListener((pending) => {
        if (pending === 0) setTimeout(finish, 80);
      });
      const timeout = setTimeout(finish, timeoutMs);
      scene.requestRender();
    });
  }

  async function getReportSnapshots() {
    const plot = selectedPlot || activeSpectralPlot || plots[0];
    const originalMode = currentSpectralMode;
    const captures = {};
    if (!plot?.analysisItem) {
      await ensurePlotAnalysis(plot);
    }
    if (!plot?.analysisItem) {
      throw new Error("Lô đang chọn chưa có ảnh Sentinel-2 để tạo báo cáo.");
    }
    const reportRectangle = rectangleForReportSnapshot(plot);
    viewer.camera.setView({ destination: reportRectangle });
    await waitForImagery(900);
    const modes = [
      ["rgb", "true-color"],
      ["falseColor", "false-color"],
      ["ndvi", "ndvi"],
      ["gci", "gci"],
      ["ndmi", "ndmi"]
    ];
    for (const [key, mode] of modes) {
      try {
        await renderSpectralLayer(mode, plot);
        await waitForImagery(mode === "true-color" ? 900 : 1200);
        captures[key] = getRectangleSnapshot(reportRectangle);
      } catch (error) {
        console.warn(`Không thể chụp lớp ${mode}:`, error);
      }
    }
    await renderSpectralLayer(originalMode, plot);
    scene.requestRender();
    return captures;
  }

  return { loadCustomKml, setDensity, toggleDrawing, flyToAll, flyToSelectedPlot, zoomIn, zoomOut, toggleReference, toggleSatellite, setSpectralMode, toggleForest, toggleZone, toggle2D, selectPlot, calculateCoverAndValue, exportMap, getMapSnapshot, getReportSnapshots, destroy };
}
