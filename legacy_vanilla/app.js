/* global Cesium */
(() => {
  "use strict";

  const KML_URL = "./lô 68 hec.kml";
  const $ = (selector) => document.querySelector(selector);
  const plots = [];
  let selectedPlot = null;
  let density = 65;
  let treeCount = 0;
  let dataRectangle = null;
  let is3D = false;
  let densityTimer;
  let spectralLayer = null;
  let activeSpectralPlot = null;
  let indexOverlayEntity = null;
  let isDrawing = false;
  let drawPoints = [];
  let hoverPoint = null;
  let drawnSequence = 0;
  let spectralRenderToken = 0;

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
      rescale: "0,4500",
      colorFormula: "Gamma RGB 2.4 Saturation 1.12 Sigmoidal RGB 12 0.35",
      alpha: 0.68
    },
    "ndvi": {
      label: "NDVI · độ xanh sinh khối",
      description: "Ít thực vật → tán lá khỏe",
      assets: ["B08", "B04"],
      expression: "(B08-B04)/(B08+B04)",
      rescale: "-0.2,0.9",
      colormap: "rdylgn",
      alpha: 0.58
    },
    "ndre": {
      label: "NDRE · chlorophyll/rừng dày",
      description: "Căng thẳng/chlorophyll thấp → tán lá dày khỏe",
      assets: ["B8A", "B05"],
      expression: "(B8A-B05)/(B8A+B05)",
      rescale: "-0.1,0.65",
      colormap: "rdylgn",
      alpha: 0.58
    },
    "ndmi": {
      label: "NDMI · độ ẩm tán lá",
      description: "Khô/stress nước → ẩm tán lá tốt",
      assets: ["B08", "B11"],
      expression: "(B08-B11)/(B08+B11)",
      rescale: "-0.6,0.8",
      colormap: "brbg",
      alpha: 0.58
    },
    "nbr": {
      label: "NBR · cháy/suy thoái",
      description: "Cháy/suy thoái → thảm thực vật ổn định",
      assets: ["B08", "B12"],
      expression: "(B08-B12)/(B08+B12)",
      rescale: "-0.6,0.9",
      colormap: "rdylgn",
      alpha: 0.58
    },
    "ndwi": {
      label: "NDWI · nước/ẩm thấp",
      description: "Đất khô/thực vật → nước hoặc vùng ẩm",
      assets: ["B03", "B08"],
      expression: "(B03-B08)/(B03+B08)",
      rescale: "-0.8,0.5",
      colormap: "blues",
      alpha: 0.58
    },
    "savi": {
      label: "SAVI · cây thưa/đất trống",
      description: "Đất trống → thực vật trên nền đất lộ",
      assets: ["B08", "B04"],
      expression: "1.5*(B08-B04)/(B08+B04+5000)",
      rescale: "-0.2,0.8",
      colormap: "rdylgn",
      alpha: 0.58
    }
  };

  const ANALYSIS_INDICES = {
    ndvi: SPECTRAL_MODES.ndvi,
    ndre: SPECTRAL_MODES.ndre,
    ndmi: SPECTRAL_MODES.ndmi,
    nbr: SPECTRAL_MODES.nbr,
    ndwi: SPECTRAL_MODES.ndwi,
    savi: SPECTRAL_MODES.savi
  };

  Cesium.Ion.defaultAccessToken = "";
  const viewer = new Cesium.Viewer("cesiumContainer", {
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
    if (!value || !/[ÃÄáºá»]/.test(value)) return value;
    try {
      return new TextDecoder("utf-8").decode(Uint8Array.from([...value].map((char) => char.charCodeAt(0))));
    } catch {
      return value;
    }
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

  function addPlotBoundary(plot, index) {
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
        font: "700 12px system-ui",
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

  function updatePlotSummary() {
    const totalArea = plots.reduce((sum, plot) => sum + plot.area, 0);
    $("#visibleRegions").textContent = String(plots.length).padStart(2, "0");
    $("#totalArea").textContent = totalArea.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
    $("#clearDrawn").disabled = !plots.some((plot) => plot.drawn);
  }

  function redrawBoundaries() {
    boundarySource.entities.removeAll();
    plots.forEach(addPlotBoundary);
    scene.requestRender();
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
    $("#drawPolygon").classList.toggle("active", active);
    $("#drawPolygon span").textContent = active ? "Hủy vẽ polygon" : "Vẽ vùng phân tích";
    $("#drawHint").classList.toggle("active", active);
    $("#drawHint").textContent = active
      ? "Bấm để đặt đỉnh · Chuột phải để hoàn tất (tối thiểu 3 đỉnh)."
      : "Phạm vi tính toán: chỉ bên trong KML hoặc polygon người dùng vẽ.";
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
    $("#carbonTotal").textContent = treeCount.toLocaleString("vi-VN");
    if (selectedPlot) updateCard(selectedPlot);
    scene.requestRender();
  }

  function updateCard(plot) {
    selectedPlot = plot;
    const estimatedTrees = Math.min(900, Math.max(30, Math.round(plot.area * 8 * density / 100)));
    $("#cardType").textContent = plot.drawn ? "POLYGON VẼ" : "POLYGON KML";
    $("#cardName").textContent = plot.name;
    $("#cardDescription").textContent = `Đường biên gồm ${plot.ring.length - 1} đỉnh, đọc trực tiếp từ “${plot.sourceName}”.`;
    $("#cardArea").textContent = plot.area.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
    $("#cardCarbon").textContent = estimatedTrees.toLocaleString("vi-VN");
    $("#regionCard").classList.add("open");
    updateAnalysisPanel(plot);
    ensurePlotAnalysis(plot).catch((error) => {
      plot.analysis = { error: `Không thể phân tích polygon này: ${error.message}` };
      if (selectedPlot?.id === plot.id) updateAnalysisPanel(plot);
    });
  }

  function flyToPlot(plot, close = false) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(plot.center.lon, plot.center.lat - 0.002, close ? 1100 : 3200),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
      duration: 1.4
    });
  }

  function flyToAll(duration = 1.6) {
    if (!dataRectangle) return;
    viewer.camera.flyTo({ destination: dataRectangle, duration });
  }

  function formatSceneDate(value) {
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
  }

  function markMapUpdated() {
    const value = new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    }).format(new Date());
    $("#mapUpdatedAt").textContent = `Lần kiểm tra dữ liệu: ${value}`;
  }

  function evaluateVegetation(mean) {
    const greennessScore = Math.round(Cesium.Math.clamp((mean - 0.15) / 0.65, 0, 1) * 100);
    let densityLabel = "Rất thưa";
    if (mean >= 0.72) densityLabel = "Rất dày";
    else if (mean >= 0.58) densityLabel = "Dày";
    else if (mean >= 0.42) densityLabel = "Trung bình";
    else if (mean >= 0.25) densityLabel = "Thưa";

    let healthLabel = "Suy yếu";
    if (mean >= 0.68) healthLabel = "Rất khỏe";
    else if (mean >= 0.52) healthLabel = "Khỏe";
    else if (mean >= 0.35) healthLabel = "Trung bình";
    else if (mean >= 0.2) healthLabel = "Kém";
    return { greennessScore, densityLabel, healthLabel };
  }

  function updateAnalysisPanel(plot) {
    const analysis = plot?.analysis;
    if (!analysis) {
      $("#ndviMean").textContent = "—";
      $("#densityClass").textContent = plot?.analysisItem ? "Đang tính..." : "—";
      $("#healthClass").textContent = "—";
      $("#analysisConfidence").textContent = plot?.analysisItem ? "Đang phân tích" : "Đang chờ ảnh...";
      $("#analysisNote").textContent = "Chỉ tính pixel nằm trong polygon đang chọn; không lấy phần ngoài đường biên.";
      $("#ndviBar").style.left = "0%";
      return;
    }
    if (analysis.error) {
      $("#ndviMean").textContent = "—";
      $("#densityClass").textContent = "Chưa rõ";
      $("#healthClass").textContent = "Chưa rõ";
      $("#analysisConfidence").textContent = "Không khả dụng";
      $("#analysisNote").textContent = analysis.error;
      return;
    }
    const rating = evaluateVegetation(analysis.mean);
    const analysisItem = plot.analysisItem;
    const cloud = Number(analysisItem?.properties?.["eo:cloud_cover"] || 0);
    const confidence = cloud <= 10 && analysis.validPercent >= 85 ? "Tin cậy cao"
      : cloud <= 20 && analysis.validPercent >= 65 ? "Tin cậy vừa" : "Cần kiểm tra";
    $("#ndviMean").textContent = analysis.mean.toFixed(3);
    $("#densityClass").textContent = `${rating.densityLabel} · ${rating.greennessScore}/100`;
    $("#healthClass").textContent = rating.healthLabel;
    $("#analysisConfidence").textContent = confidence;
    const extra = analysis.indices
      ? ` · NDRE ${formatIndexValue(analysis.indices.ndre?.mean)} · NDMI ${formatIndexValue(analysis.indices.ndmi?.mean)} · NBR ${formatIndexValue(analysis.indices.nbr?.mean)} · NDWI ${formatIndexValue(analysis.indices.ndwi?.mean)} · SAVI ${formatIndexValue(analysis.indices.savi?.mean)}`
      : "";
    $("#analysisNote").textContent = `KML là 100% phạm vi khu đất/lô rừng; điểm xanh chỉ là thang NDVI trung bình từ pixel Sentinel bên trong polygon, không phải % diện tích KML · lệch chuẩn NDVI ${analysis.std.toFixed(3)} · ${analysis.validPercent.toFixed(0)}% pixel hợp lệ · mây ${cloud.toFixed(1)}%${extra}.`;
    const meterPosition = Cesium.Math.clamp((analysis.mean + 0.2) / 1.1 * 100, 0, 100);
    $("#ndviBar").style.left = `calc(${meterPosition}% - 1px)`;
  }

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

  function hierarchyForPlot(plot) {
    return new Cesium.PolygonHierarchy(
      plot.ring.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat)),
      plot.holes.filter((hole) => hole.length >= 3).map((hole) => new Cesium.PolygonHierarchy(
        hole.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat))
      ))
    );
  }

  function colorForIndex(mode, value) {
    const [min, max] = (SPECTRAL_MODES[mode]?.rescale || "-0.2,0.9").split(",").map(Number);
    const t = Cesium.Math.clamp((Number(value) - min) / (max - min), 0, 1);
    if (mode === "ndwi") return Cesium.Color.lerp(
      Cesium.Color.fromCssColorString("#f2b66d"),
      Cesium.Color.fromCssColorString("#2f8cff"),
      t,
      new Cesium.Color()
    );
    return Cesium.Color.lerp(
      Cesium.Color.fromCssColorString("#d94745"),
      Cesium.Color.fromCssColorString("#39b86a"),
      t,
      new Cesium.Color()
    );
  }

  function clearIndexOverlay() {
    indexOverlaySource.entities.removeAll();
    indexOverlayEntity = null;
  }

  function renderIndexOverlay(plot, mode) {
    clearIndexOverlay();
    const value = plot.analysis?.indices?.[mode]?.mean;
    if (!Number.isFinite(Number(value))) return false;
    indexOverlayEntity = indexOverlaySource.entities.add({
      name: `${SPECTRAL_MODES[mode].label} trong ${plot.name}`,
      polygon: {
        hierarchy: hierarchyForPlot(plot),
        material: colorForIndex(mode, value).withAlpha(0.62),
        outline: true,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
        outlineWidth: 2,
        height: 3
      },
      properties: { plotId: plot.id, indexMode: mode, value }
    });
    return true;
  }

  function formatIndexValue(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(3) : "—";
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

  function rectangleForSentinelItem(item, plot) {
    const bbox = item?.bbox;
    if (Array.isArray(bbox) && bbox.length >= 4 && bbox.every(Number.isFinite)) {
      const [west, south, east, north] = bbox.map(Number);
      const lonSpan = Math.max(east - west, 0.02);
      const latSpan = Math.max(north - south, 0.02);
      const pad = 0.04;
      return Cesium.Rectangle.fromDegrees(
        west - lonSpan * pad,
        south - latSpan * pad,
        east + lonSpan * pad,
        north + latSpan * pad
      );
    }
    return dataRectangle || paddedRectangleForPlot(plot, 1.6);
  }

  async function analyzePlotNdvi(plot, item) {
    plot.analysis = null;
    plot.analysisItem = item;
    if (selectedPlot?.id === plot.id) updateAnalysisPanel(plot);
    try {
      const params = new URLSearchParams({
        collection: "sentinel-2-l2a",
        item: item.id,
        asset_as_band: "true",
        expression: "(B08-B04)/(B08+B04)",
        nodata: "0",
        max_size: "1024"
      });
      params.append("assets", "B08");
      params.append("assets", "B04");
      const response = await fetch(`https://planetarycomputer.microsoft.com/api/data/v1/item/statistics?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plotAsGeoJson(plot))
      });
      if (!response.ok) throw new Error(`Dịch vụ thống kê trả về HTTP ${response.status}.`);
      const result = await response.json();
      const feature = result.type === "FeatureCollection" ? result.features?.[0] : result;
      const statistics = feature?.properties?.statistics || result?.statistics || result;
      const band = Object.values(statistics || {}).find((value) => value && Number.isFinite(Number(value.mean)));
      if (!band) throw new Error("Phản hồi không có giá trị NDVI trung bình.");
      plot.analysis = {
        mean: Number(band.mean),
        std: Number(band.std || 0),
        median: Number(band.median || band.mean),
        validPercent: Number(band.valid_percent ?? 100)
      };
    } catch (error) {
      plot.analysis = { error: `Chưa thể tính NDVI: ${error.message}` };
    }
    if (selectedPlot?.id === plot.id) updateAnalysisPanel(plot);
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
    const response = await fetch(`https://planetarycomputer.microsoft.com/api/data/v1/item/statistics?${params}`, {
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

  async function renderSpectralLayer(mode = $("#spectralMode").value, plot = activeSpectralPlot || selectedPlot) {
    if (!plot?.analysisItem) return;
    activeSpectralPlot = plot || activeSpectralPlot;
    const config = SPECTRAL_MODES[mode] || SPECTRAL_MODES["true-color"];
    const wasVisible = spectralLayer ? spectralLayer.show : true;
    const token = ++spectralRenderToken;
    if (spectralLayer) viewer.imageryLayers.remove(spectralLayer, true);
    spectralLayer = null;
    clearIndexOverlay();
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: spectralTileUrl(plot.analysisItem, mode),
      rectangle: rectangleForSentinelItem(plot.analysisItem, plot),
      minimumLevel: 8,
      maximumLevel: 18,
      credit: new Cesium.Credit("Sentinel-2 L2A · Microsoft Planetary Computer · ESA")
    });
    if (token !== spectralRenderToken) return;
    spectralLayer = viewer.imageryLayers.addImageryProvider(provider);
    spectralLayer.alpha = config.alpha;
    spectralLayer.show = wasVisible;
    spectralLayer.brightness = mode === "true-color" ? 1.0 : 1;
    spectralLayer.contrast = mode === "true-color" ? 1.08 : 1.08;
    spectralLayer.saturation = mode === "true-color" ? 1.02 : 1.04;
    spectralLayer.gamma = mode === "true-color" ? 1.0 : 1;
    viewer.imageryLayers.raiseToTop(spectralLayer);
    $("#satelliteToggle").checked = wasVisible;
    $("#ndviLegend").classList.toggle("open", Boolean(config.expression));
    if (config.expression) {
      $("#legendMin").textContent = config.rescale.split(",")[0].replace(".", ",");
      $("#legendMax").textContent = config.rescale.split(",")[1].replace(".", ",");
      $("#legendDescription").textContent = config.description || config.label;
    }
    scene.requestRender();
  }

  function chooseBestSentinelItem(items) {
    const candidates = (items || []).filter((item) => {
      const cloud = Number(item.properties?.["eo:cloud_cover"]);
      return Number.isFinite(cloud) && cloud <= 45;
    }).sort((a, b) => new Date(b.properties.datetime) - new Date(a.properties.datetime));
    if (!candidates.length) return null;
    const freshEnough = candidates.find((item) => Number(item.properties["eo:cloud_cover"]) <= 20);
    if (freshEnough) return freshEnough;
    return [...candidates].sort((a, b) => {
      const cloudA = Number(a.properties["eo:cloud_cover"]);
      const cloudB = Number(b.properties["eo:cloud_cover"]);
      return cloudA - cloudB || new Date(b.properties.datetime) - new Date(a.properties.datetime);
    })[0];
  }

  async function findLatestSentinel(bounds) {
    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 18);
    const params = new URLSearchParams({
      collections: "sentinel-2-l2a",
      bbox: [bounds.west, bounds.south, bounds.east, bounds.north].join(","),
      datetime: `${start.toISOString()}/${end.toISOString()}`,
      limit: "60"
    });
    const response = await fetch(`https://planetarycomputer.microsoft.com/api/stac/v1/search?${params}`);
    if (!response.ok) throw new Error(`STAC HTTP ${response.status}`);
    const result = await response.json();
    const item = chooseBestSentinelItem(result.features);
    if (!item) throw new Error("Không tìm thấy scene phù hợp trong 18 tháng gần đây");
    return item;
  }

  async function ensurePlotAnalysis(plot) {
    if (!plot) return null;
    if (!plot.analysisItem) plot.analysisItem = await findLatestSentinel(plot.bounds);
    if (!plot.analysis || plot.analysis.error) await analyzePlotIndices(plot, plot.analysisItem);
    if (selectedPlot?.id === plot.id) {
      const cloud = Number(plot.analysisItem.properties?.["eo:cloud_cover"] || 0).toFixed(1);
      $("#spectralStatus").textContent = `${plot.name} · ${formatSceneDate(plot.analysisItem.properties.datetime)} · mây ${cloud}% · không realtime`;
      $("#spectralStatus").title = `${plot.analysisItem.id} · Sentinel-2 L2A STAC/tile; ảnh theo ngày chụp, không phải ảnh live`;
      $("#satelliteToggle").disabled = false;
      $("#satelliteToggle").checked = true;
      $("#spectralMode").disabled = false;
      renderSpectralLayer($("#spectralMode").value || "true-color", plot);
      markMapUpdated();
    }
    return plot.analysis;
  }

  async function loadLatestSentinel(bounds) {
    const status = $("#spectralStatus");
    try {
      const end = new Date();
      const start = new Date(end);
      start.setMonth(start.getMonth() - 18);
      const params = new URLSearchParams({
        collections: "sentinel-2-l2a",
        bbox: [bounds.west, bounds.south, bounds.east, bounds.north].join(","),
        datetime: `${start.toISOString()}/${end.toISOString()}`,
        limit: "60"
      });
      const response = await fetch(`https://planetarycomputer.microsoft.com/api/stac/v1/search?${params}`);
      if (!response.ok) throw new Error(`STAC HTTP ${response.status}`);
      const result = await response.json();
      const sentinelItem = chooseBestSentinelItem(result.features);
      if (!sentinelItem) throw new Error("Không tìm thấy scene phù hợp trong 18 tháng gần đây");
      const cloud = Number(sentinelItem.properties["eo:cloud_cover"]).toFixed(1);
      status.textContent = `${formatSceneDate(sentinelItem.properties.datetime)} · mây ${cloud}% · không realtime`;
      status.title = `${sentinelItem.id} · Sentinel-2 L2A STAC/tile; ảnh theo ngày chụp, không phải ảnh live`;
      $("#satelliteToggle").disabled = false;
      $("#satelliteToggle").checked = true;
      $("#spectralMode").disabled = false;
      renderSpectralLayer("true-color");
      markMapUpdated();
      plots.forEach((plot) => analyzePlotNdvi(plot, sentinelItem));
    } catch (error) {
      status.textContent = "Không tải được Sentinel-2";
      status.title = error.message;
      $("#satelliteToggle").disabled = false;
      $("#satelliteToggle").checked = true;
      $("#spectralMode").disabled = false;
      renderSpectralLayer("true-color", selectedPlot);
      plots.forEach((plot) => {
        plot.analysis = { error: `Không có ảnh để đánh giá: ${error.message}` };
      });
      if (selectedPlot) updateAnalysisPanel(selectedPlot);
    }
  }

  loadLatestSentinel = async function loadLatestSentinelForSelectedPolygonOnly() {
    const status = $("#spectralStatus");
    try {
      if (!selectedPlot) throw new Error("Chưa có polygon để phân tích.");
      status.textContent = "Đang phân tích polygon đang chọn...";
      await ensurePlotAnalysis(selectedPlot);
    } catch (error) {
      status.textContent = "Không tải được Sentinel-2 cho polygon";
      status.title = error.message;
      $("#satelliteToggle").disabled = true;
      $("#spectralMode").disabled = true;
      if (selectedPlot) {
        selectedPlot.analysis = { error: `Không có ảnh để đánh giá polygon này: ${error.message}` };
        updateAnalysisPanel(selectedPlot);
      }
    }
  };

  function renderSearchResults(query = "") {
    const normalized = query.trim().toLocaleLowerCase("vi");
    const matches = plots.filter((plot) => `${plot.name} ${plot.sourceName}`.toLocaleLowerCase("vi").includes(normalized));
    $("#searchResults").innerHTML = matches.slice(0, 8).map((plot) =>
      `<button class="search-result" data-id="${plot.id}"><span>${plot.name}</span><span>${plot.area.toFixed(1)} ha</span></button>`
    ).join("");
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
      $("#cameraCoords").textContent = `${plots[0].center.lat.toFixed(4)}°N · ${plots[0].center.lon.toFixed(4)}°E`;
      rebuildForest();
      renderSearchResults();
      updateCard(plots[0]);
      flyToAll(0);
      $("#spectralStatus").textContent = "Dang tai Sentinel-2 L2A...";
      loadLatestSentinel();
      setTimeout(() => $("#loadingScreen").classList.add("done"), 500);
    } catch (error) {
      $("#loadingScreen").innerHTML = `<strong>Không thể đọc KML</strong><small>${error.message}<br/>Hãy chạy qua HTTP server, không mở bằng file://</small>`;
      $("#loadingScreen").classList.add("error");
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

  $("#resetView").addEventListener("click", () => flyToAll());
  $("#drawPolygon").addEventListener("click", () => setDrawing(!isDrawing));
  $("#clearDrawn").addEventListener("click", () => {
    if (isDrawing) setDrawing(false);
    const remaining = plots.filter((plot) => !plot.drawn);
    plots.splice(0, plots.length, ...remaining);
    if (selectedPlot?.drawn) selectedPlot = plots[0] || null;
    redrawBoundaries();
    rebuildForest();
    updatePlotSummary();
    renderSearchResults();
    if (selectedPlot) updateCard(selectedPlot);
    else $("#regionCard").classList.remove("open");
  });
  $("#togglePanel").addEventListener("click", () => $("#controlPanel").classList.toggle("hidden"));
  $("#zoomIn").addEventListener("click", () => viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.35));
  $("#zoomOut").addEventListener("click", () => viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.45));
  $("#closeCard").addEventListener("click", () => $("#regionCard").classList.remove("open"));
  $("#flyCloser").addEventListener("click", () => selectedPlot && flyToPlot(selectedPlot, true));
  $("#referenceToggle").addEventListener("change", (event) => {
    referenceLayer.show = event.target.checked;
    scene.requestRender();
  });
  $("#satelliteToggle").addEventListener("change", (event) => {
    if (spectralLayer) spectralLayer.show = event.target.checked;
    indexOverlaySource.show = event.target.checked;
    scene.requestRender();
  });
  $("#spectralMode").addEventListener("change", (event) => renderSpectralLayer(event.target.value, selectedPlot));
  $("#forestToggle").addEventListener("change", (event) => { forestSource.show = event.target.checked; scene.requestRender(); });
  $("#zoneToggle").addEventListener("change", (event) => { boundarySource.show = event.target.checked; scene.requestRender(); });

  $("#toggleAll").addEventListener("click", (event) => {
    const toggles = [...document.querySelectorAll(".layer-row .switch:not(:disabled)")];
    const turnOn = toggles.some((toggle) => !toggle.checked);
    toggles.forEach((toggle) => { toggle.checked = turnOn; toggle.dispatchEvent(new Event("change")); });
    event.target.textContent = turnOn ? "Tắt tất cả" : "Bật tất cả";
  });

  $("#densityRange").addEventListener("input", (event) => {
    density = Number(event.target.value);
    $("#densityValue").textContent = `${density}%`;
    event.target.style.background = `linear-gradient(90deg, var(--green) ${density}%, #314239 ${density}%)`;
    clearTimeout(densityTimer);
    densityTimer = setTimeout(rebuildForest, 120);
  });

  $("#toggle2D").addEventListener("click", (event) => {
    is3D = !is3D;
    if (is3D) scene.morphTo3D(1); else scene.morphTo2D(1);
    event.currentTarget.querySelector("b").textContent = is3D ? "3D" : "2D";
  });

  const searchInput = $("#regionSearch");
  searchInput.addEventListener("focus", () => renderSearchResults(searchInput.value));
  searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("#searchResults .search-result")?.click();
  });
  $("#searchResults").addEventListener("click", (event) => {
    const result = event.target.closest(".search-result");
    if (!result) return;
    const plot = plots.find((item) => item.id === result.dataset.id);
    updateCard(plot);
    flyToPlot(plot);
    searchInput.value = plot.name;
    $("#searchResults").classList.remove("open");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-box")) $("#searchResults").classList.remove("open");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isDrawing) {
      setDrawing(false);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
    }
  });

  viewer.camera.changed.addEventListener(() => {
    const position = viewer.camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(position.latitude);
    const lon = Cesium.Math.toDegrees(position.longitude);
    $("#cameraCoords").textContent = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"} · ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`;
  });

  loadKml();
})();
