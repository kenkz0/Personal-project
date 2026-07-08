import { useEffect, useRef, useState } from 'react';
import { initCesiumMap } from './lib/CesiumLogic.js';
import Header from './components/Header.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import MapTools from './components/MapTools.jsx';
import RegionCard from './components/RegionCard.jsx';
import Footer from './components/Footer.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import { openReportBuilder } from './lib/reportBuilder.js';

export default function App() {
  const cesiumContainer = useRef(null);
  const mapLogic = useRef(null);

  // State maps
  const [stats, setStats] = useState({
    visibleRegions: '—',
    totalArea: '—',
    carbonTotal: '—'
  });

  const [card, setCard] = useState({
    open: false,
    type: 'POLYGON KML',
    name: 'Lô rừng',
    description: '',
    area: '—',
    carbon: '—',
    plot: null
  });

  const [analysis, setAnalysis] = useState({
    mean: '—',
    ndviMedian: '—',
    evi: '—',
    ndre: '—',
    gci: '—',
    ndmi: '—',
    ndmiMedian: '—',
    densityClass: '—',
    healthClass: '—',
    confidence: 'Đang chờ ảnh...',
    note: 'Đang đợi dữ liệu Sentinel‑2 để phân tích polygon.',
    barLeft: '0%'
  });

  const [cover, setCover] = useState({
    status: 'idle',
    note: 'Chưa tính độ che phủ bằng Microsoft API.',
    metrics: null,
    valuation: null,
    selected_scene: null,
    source: ''
  });

  const [coverOptions, setCoverOptions] = useState({
    model: 'timber8',
    age: 4,
    soil: 'red_yellow',
    rainfall: 'normal',
    priceVndM3: 900000,
    sceneCloudMax: 10
  });

  const [status, setStatus] = useState({
    mapUpdatedAt: 'Lần kiểm tra dữ liệu: —',
    spectralStatus: 'Đang tìm ảnh ít mây...',
    cameraCoords: '16.30°N · 106.20°E',
    satelliteDisabled: true,
    satelliteChecked: false,
    spectralModeDisabled: true,
    legendOpen: false,
    loading: true,
    loadingError: null
  });

  const [isDrawing, setIsDrawing] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [spectralMode, setSpectralMode] = useState('true-color');
  const [isExporting, setIsExporting] = useState(false);

  const handleExportReport = async (reportType = 'health') => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      let snapshot = `${window.location.origin}/image.png`;
      let snapshots = { rgb: snapshot };
      let snapshotWarning = 'Canvas bản đồ chưa sẵn sàng; báo cáo đang dùng ảnh minh họa dự phòng.';
      try {
        const captured = await mapLogic.current?.getReportSnapshots();
        if (captured?.rgb) {
          snapshots = captured;
          snapshot = captured.rgb;
          snapshotWarning = '';
        }
      } catch (captureError) {
        console.warn('Không thể chụp canvas Cesium cho báo cáo:', captureError);
      }
      openReportBuilder({ snapshot, snapshots, snapshotWarning, stats, card, analysis, status, spectralMode, cover, coverOptions }, reportType);
    } catch (error) {
      window.alert(`Không thể tạo báo cáo PDF: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleUploadKml = (kmlText) => {
    mapLogic.current?.loadCustomKml(kmlText);
  };

  useEffect(() => {
    if (!cesiumContainer.current || mapLogic.current) return;

    const logic = initCesiumMap(cesiumContainer.current, {
      onVisibleRegionsChange: (val) => setStats(s => ({ ...s, visibleRegions: val })),
      onTotalAreaChange: (val) => setStats(s => ({ ...s, totalArea: val })),
      onCarbonTotalChange: (val) => setStats(s => ({ ...s, carbonTotal: val })),
      onCardChange: (data) => setCard(s => ({ ...s, ...data })),
      onCardOpen: (open) => setCard(s => ({ ...s, open })),
      onAnalysisUpdate: (plot) => {
        if (!plot?.analysis) {
          setAnalysis({
            mean: '—', ndviMedian: '—', evi: '—', ndre: '—', gci: '—', ndmi: '—', ndmiMedian: '—', densityClass: plot?.analysisItem ? "Đang tính..." : "—", healthClass: '—',
            confidence: plot?.analysisItem ? "Đang phân tích" : "Đang chờ ảnh...",
            note: "Chỉ tính pixel nằm trong polygon đang chọn; không lấy phần ngoài đường biên.", barLeft: '0%'
          });
          return;
        }
        if (plot.analysis.error) {
           setAnalysis({
            mean: '—', ndviMedian: '—', evi: '—', ndre: '—', gci: '—', ndmi: '—', ndmiMedian: '—', densityClass: "Chưa rõ", healthClass: "Chưa rõ", confidence: "Không khả dụng",
            note: plot.analysis.error, barLeft: '0%'
          });
          return;
        }
        
        const mean = plot.analysis.indices?.ndvi?.mean ?? plot.analysis.mean;
        const evi = plot.analysis.indices?.evi?.mean;
        const ndre = plot.analysis.indices?.ndre?.mean;
        const gci = plot.analysis.indices?.gci?.mean;
        const ndmi = plot.analysis.indices?.ndmi?.mean;
        const formatIndex = (value) => Number.isFinite(value) ? value.toFixed(3) : '—';
        let densityLabel = "Rất ít thực vật";
        if (mean >= 0.6) densityLabel = "Tán lá dày";
        else if (mean >= 0.4) densityLabel = "Thảm thực vật tốt";
        else if (mean >= 0.25) densityLabel = "Thực vật thưa";
        
        let moistureLabel = "Khô, cần theo dõi";
        if (ndmi >= 0.2) moistureLabel = "Ẩm tốt";
        else if (ndmi >= -0.1) moistureLabel = "Ẩm bình thường";

        // NDVI determines vegetation condition. NDMI is reported separately
        // as canopy-moisture context and must not turn green vegetation into
        // a poor-health classification by itself.
        let healthLabel = "Ít thực vật";
        if (mean >= 0.6) healthLabel = "Rừng xanh dày";
        else if (mean >= 0.4) healthLabel = "Thực vật phát triển tốt";
        else if (mean >= 0.25) healthLabel = "Thực vật thưa";

        const cloud = Number(plot.analysisItem?.properties?.["eo:cloud_cover"] || 0);
        const validPercent = Math.min(...Object.values(plot.analysis.indices || {}).map(index => index.validPercent ?? 0));
        const confidence = cloud <= 10 && validPercent >= 85 ? "Tin cậy cao" : "Cần kiểm tra";
        const meterPosition = Math.max(0, Math.min(100, (mean + 0.2) / 1.1 * 100));

        setAnalysis({
          mean: mean.toFixed(3),
          ndviMedian: formatIndex(plot.analysis.indices?.ndvi?.median),
          evi: formatIndex(evi),
          ndre: formatIndex(ndre),
          gci: formatIndex(gci),
          ndmi: formatIndex(ndmi),
          ndmiMedian: formatIndex(plot.analysis.indices?.ndmi?.median),
          densityClass: densityLabel,
          healthClass: healthLabel,
          confidence,
          note: `${plot.name}: NDVI ${formatIndex(mean)} → ${densityLabel.toLowerCase()}; EVI ${formatIndex(evi)} theo dõi tán dày; NDRE ${formatIndex(ndre)} và GCI ${formatIndex(gci)} phản ánh diệp lục; NDMI ${formatIndex(ndmi)} → ${moistureLabel.toLowerCase()}. Kết luận: ${healthLabel.toLowerCase()}. Chỉ tính pixel trong polygon.`,
          barLeft: `calc(${meterPosition}% - 1px)`
        });
      },
      onMapUpdated: (val) => setStatus(s => ({ ...s, mapUpdatedAt: val })),
      onSpectralStatusChange: (val) => setStatus(s => ({ ...s, spectralStatus: val })),
      onSatelliteDisabledChange: (val) => setStatus(s => ({ ...s, satelliteDisabled: val })),
      onSatelliteCheckedChange: (val) => setStatus(s => ({ ...s, satelliteChecked: val })),
      onSpectralModeDisabledChange: (val) => setStatus(s => ({ ...s, spectralModeDisabled: val })),
      onLegendChange: (open) => setStatus(s => ({ ...s, legendOpen: open })),
      onCoverUpdate: (data) => setCover(data),
      onLoading: (isLoading) => setStatus(s => ({ ...s, loading: isLoading })),
      onLoadingError: (err) => setStatus(s => ({ ...s, loadingError: err })),
      onCameraCoordsChange: (val) => setStatus(s => ({ ...s, cameraCoords: val })),
      onSearchResults: () => {}
    });
    mapLogic.current = logic;

    return () => {
      logic.destroy();
      mapLogic.current = null;
    };
  }, []);

  return (
    <div id="app">
      <div id="cesiumContainer" ref={cesiumContainer} aria-label="Bản đồ 3D Việt Nam"></div>

      <Header 
        onExport={handleExportReport}
        isExporting={isExporting}
        onFlyToAll={() => mapLogic.current?.flyToAll()} 
        onTogglePanel={() => document.getElementById('controlPanel').classList.toggle('hidden')} 
      />

      <ControlPanel 
        stats={stats}
        status={status}
        analysis={analysis}
        spectralMode={spectralMode}
        isDrawing={isDrawing}
        onToggleDrawing={() => { setIsDrawing(!isDrawing); mapLogic.current?.toggleDrawing(); }}
        onSetDensity={(val) => mapLogic.current?.setDensity(val)}
        onToggleReference={(val) => mapLogic.current?.toggleReference(val)}
        onToggleSatellite={(val) => {
          setStatus(s => ({ ...s, satelliteChecked: val }));
          mapLogic.current?.toggleSatellite(val);
        }}
        onSetSpectralMode={(val) => {
          setSpectralMode(val);
          mapLogic.current?.setSpectralMode(val);
        }}
        onToggleForest={(val) => mapLogic.current?.toggleForest(val)}
        onToggleZone={(val) => mapLogic.current?.toggleZone(val)}
        cover={cover}
        coverOptions={coverOptions}
        onSetCoverOptions={(patch) => setCoverOptions(s => ({ ...s, ...patch }))}
        onCalculateCover={() => {
          setCover({ status: 'loading', note: 'Đang gửi polygon sang Microsoft Planetary Computer...', metrics: null, valuation: null });
          mapLogic.current?.calculateCoverAndValue(coverOptions).catch((error) => {
            setCover({ status: 'error', note: error.message, metrics: null, valuation: null });
          });
        }}
        onUploadKml={handleUploadKml}
      />

      <MapTools 
        is3D={is3D}
        onToggle2D={() => { setIs3D(!is3D); mapLogic.current?.toggle2D(); }}
        onZoomIn={() => mapLogic.current?.zoomIn()}
        onZoomOut={() => mapLogic.current?.zoomOut()}
      />

      <RegionCard 
        card={card}
        onClose={() => setCard(s => ({...s, open: false}))}
      />

      <Footer cameraCoords={status.cameraCoords} />

      <LoadingScreen 
        loading={status.loading} 
        loadingError={status.loadingError} 
      />
    </div>
  );
}
