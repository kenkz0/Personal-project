import { useMemo, useRef, useState } from 'react';

export default function ControlPanel({ 
  stats, 
  plots = [],
  selectedPlotId,
  status, 
  analysis, 
  spectralMode,
  isDrawing, 
  onToggleDrawing, 
  onSetDensity, 
  onToggleReference, 
  onToggleSatellite, 
  onSetSpectralMode, 
  onToggleForest, 
  onToggleZone,
  cover,
  coverOptions,
  onSetCoverOptions,
  onCalculateCover,
  onUploadKml,
  onSelectPlot
}) {
  const fileInputRef = useRef(null);
  const [plotQuery, setPlotQuery] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      onUploadKml?.(event.target.result);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const fmt = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
  const money = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value)) : '—';
  const coverBelongsToSelection = !cover?.plotId || !selectedPlotId || cover.plotId === selectedPlotId;
  const activeCover = coverBelongsToSelection ? cover : null;
  const metrics = activeCover?.metrics;
  const valuation = activeCover?.valuation;
  const busy = activeCover?.status === 'loading';
  const sceneDate = activeCover?.selected_scene?.datetime ? new Date(activeCover.selected_scene.datetime).toLocaleDateString('vi-VN') : null;
  const totalArea = plots.reduce((sum, plot) => sum + (Number(plot.area) || 0), 0);
  const selectedPlot = plots.find((plot) => plot.id === selectedPlotId);
  const filteredPlots = useMemo(() => {
    const normalized = plotQuery.trim().toLocaleLowerCase('vi');
    if (!normalized) return plots;
    return plots.filter((plot) => `${plot.name} ${plot.sourceName} ${plot.health}`.toLocaleLowerCase('vi').includes(normalized));
  }, [plotQuery, plots]);
  const coverNote = activeCover?.note || (
    metrics && activeCover?.selected_scene
      ? `Scene ${sceneDate} · scene cloud ${fmt(activeCover.selected_scene.eo_cloud_cover, 1)}% · AOI cloud ${fmt(metrics.aoi_cloud_pct, 1)}% · valid ${fmt(metrics.valid_pixel_pct, 1)}%`
      : 'Dung Microsoft Planetary Computer STAC + stackstac, clip polygon va tinh NDVI >= 0.45.'
  );

  return (
    <aside className="panel" id="controlPanel">
      <div className="panel-intro">
        <span className="eyebrow">TRUNG TÂM QUẢN LÝ RỪNG KEO</span>
        <h1>Quản lý nhiều lô rừng<br/><em>trong một màn hình.</em></h1>
        <p>Theo dõi danh mục lô, diện tích, sức khỏe tán cây và ảnh vệ tinh để biết ngay khu nào cần ưu tiên chăm sóc.</p>
      </div>

      <section className="portfolio-card">
        <div className="portfolio-hero">
          <div>
            <span>Danh mục khách hàng</span>
            <strong>{plots.length ? `${plots.length} lô` : 'Đang tải'}</strong>
            <small>{totalArea ? `${totalArea.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ha đang quản lý` : 'Chưa có dữ liệu diện tích'}</small>
          </div>
          <div className="portfolio-focus">
            <span>Đang xem</span>
            <strong>{selectedPlot?.name || '—'}</strong>
          </div>
        </div>
        <div className="portfolio-search">
          <svg viewBox="0 0 24 24"><path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"/></svg>
          <input
            value={plotQuery}
            onChange={(event) => setPlotQuery(event.target.value)}
            placeholder="Tìm tên lô, nguồn KML, tình trạng..."
            aria-label="Tìm lô rừng"
          />
        </div>
        <div className="plot-list">
          {filteredPlots.length ? filteredPlots.map((plot) => (
            <button
              type="button"
              className={`plot-row ${plot.id === selectedPlotId ? 'active' : ''}`}
              key={plot.id}
              onClick={() => onSelectPlot?.(plot.id)}
            >
              <span className={`plot-status ${plot.tone}`}></span>
              <span className="plot-main">
                <strong>{plot.name}</strong>
                <small>{plot.areaText} ha · NDVI {plot.ndvi} · mây {plot.cloud}%</small>
              </span>
              <span className="plot-health">{plot.health}</span>
            </button>
          )) : (
            <div className="plot-empty">Không tìm thấy lô phù hợp.</div>
          )}
        </div>
      </section>

      <div className="draw-tools" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
        <button id="drawPolygon" className={`draw-primary ${isDrawing ? 'active' : ''}`} onClick={onToggleDrawing}>
          <svg viewBox="0 0 24 24"><path d="m5 6 6-3 8 5-2 10-10 2-4-8Z"/><circle cx="5" cy="6" r="1.5"/><circle cx="19" cy="8" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg>
          <span>{isDrawing ? "Hủy vẽ" : "Vẽ vùng"}</span>
        </button>
        <button 
          id="uploadKmlBtn" 
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Tải lên tệp KML mới"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          <span>Tải tệp KML</span>
        </button>
        <input 
          type="file" 
          accept=".kml" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange} 
        />
      </div>

      <section className="control-section">
        <div className="section-heading"><span>LỚP DỮ LIỆU</span></div>
        <label className="layer-row">
          <span className="layer-icon osm"></span>
          <span><strong>Nền tham chiếu</strong><small>Ảnh nét để định vị, không đại diện ngày chụp</small></span>
          <input className="switch" id="referenceToggle" type="checkbox" defaultChecked onChange={e => onToggleReference?.(e.target.checked)} />
        </label>
        <label className="layer-row">
          <span className="layer-icon spectral"></span>
          <span><strong>Ảnh Sentinel-2</strong><small id="spectralStatus">{status.spectralStatus}</small></span>
          <input className="switch" id="satelliteToggle" type="checkbox" disabled={status.satelliteDisabled} checked={status.satelliteChecked} onChange={e => onToggleSatellite?.(e.target.checked)} />
        </label>
        <p className="map-update-time" id="mapUpdatedAt">{status.mapUpdatedAt}</p>
        <div className="band-picker">
          <span>TỔ HỢP BAND</span>
          <select id="spectralMode" value={spectralMode} disabled={status.spectralModeDisabled} onChange={e => onSetSpectralMode?.(e.target.value)}>
            <optgroup label="Hiển thị">
              <option value="true-color">True Color · RGB</option>
              <option value="false-color">False Color · tán lá</option>
            </optgroup>
            <optgroup label="Ranh giới & sinh khối">
              <option value="ndvi">NDVI · độ xanh</option>
              <option value="evi">EVI · tán dày</option>
            </optgroup>
            <optgroup label="Sức khỏe lá">
              <option value="ndre">NDRE · red edge</option>
              <option value="gci">GCI · diệp lục</option>
            </optgroup>
            <optgroup label="Nước & stress">
              <option value="ndmi">NDMI · độ ẩm</option>
            </optgroup>
          </select>
        </div>
        <label className="layer-row">
          <span className="layer-icon forest"></span>
          <span><strong>Rừng 3D</strong><small>Phủ kín bên trong polygon</small></span>
          <input className="switch" id="forestToggle" type="checkbox" onChange={e => onToggleForest?.(e.target.checked)} />
        </label>
        <label className="layer-row">
          <span className="layer-icon zones"></span>
          <span><strong>Ranh giới KML</strong><small>Polygon lô rừng</small></span>
          <input className="switch" id="zoneToggle" type="checkbox" defaultChecked onChange={e => onToggleZone?.(e.target.checked)} />
        </label>
      </section>

      <section className="control-section density-control">
        <div className="section-heading"><span>MẬT ĐỘ HIỂN THỊ</span></div>
        <input id="densityRange" type="range" min="20" max="100" defaultValue="65" step="5" onChange={e => onSetDensity?.(e.target.value)} />
      </section>

      <section className="stats-card">
        <div><small>LÔ RỪNG</small><strong id="visibleRegions">{stats.visibleRegions}</strong><span>polygon</span></div>
        <div><small>DIỆN TÍCH</small><strong id="totalArea">{stats.totalArea}</strong><span>hecta</span></div>
        <div><small>CÂY 3D</small><strong id="carbonTotal">{stats.carbonTotal}</strong><span>đối tượng</span></div>
      </section>

      <section className="health-card" id="healthCard">
        <div className="health-head">
          <span>ĐÁNH GIÁ THẢM THỰC VẬT</span>
          <strong id="analysisConfidence">{analysis.confidence}</strong>
        </div>
        <div className="health-score">
          <div><small>NDVI TB · ĐỘ XANH</small><strong id="ndviMean">{analysis.mean}</strong><span className="metric-detail">Trung vị {analysis.ndviMedian}</span></div>
          <div><small>EVI · TÁN DÀY</small><strong>{analysis.evi}</strong></div>
          <div><small>NDRE · RED EDGE</small><strong>{analysis.ndre}</strong></div>
          <div><small>GCI · DIỆP LỤC</small><strong>{analysis.gci}</strong></div>
          <div><small>NDMI TB · ĐỘ ẨM</small><strong id="ndmiMean">{analysis.ndmi}</strong><span className="metric-detail">Trung vị {analysis.ndmiMedian}</span></div>
          <div className="health-result"><small>ĐÁNH GIÁ LÔ ĐẤT</small><strong id="healthClass">{analysis.healthClass}</strong></div>
        </div>
        <div className="ndvi-meter"><i id="ndviBar" style={{left: analysis.barLeft}}></i><span></span></div>
        <p id="analysisNote">{analysis.note}</p>
        <p className="analysis-limit">LAI cần mô hình hiệu chỉnh thực địa; VV/VH cần Sentinel-1; CWSI cần dữ liệu nhiệt. Chưa hiển thị ước tính khi thiếu các nguồn này.</p>
      </section>
      <section className="cover-card">
        <div className="health-head">
          <span>DO CHE PHU & GIA TRI</span>
          <strong>{busy ? 'Dang tinh...' : activeCover?.status === 'ok' ? 'Microsoft API' : 'StackSTAC'}</strong>
        </div>
        <div className="cover-form">
          <label>
            <small>Mo hinh</small>
            <select value={coverOptions.model} onChange={e => onSetCoverOptions?.({ model: e.target.value })}>
              <option value="paper4">Keo giay 4 nam</option>
              <option value="paper5">Keo giay 5 nam</option>
              <option value="timber8">Keo go 8 nam</option>
              <option value="large10">Keo go lon 10 nam</option>
            </select>
          </label>
          <label>
            <small>Tuoi</small>
            <input type="number" min="1" max="10" value={coverOptions.age} onChange={e => onSetCoverOptions?.({ age: Number(e.target.value) })} />
          </label>
          <label>
            <small>Dat</small>
            <select value={coverOptions.soil} onChange={e => onSetCoverOptions?.({ soil: e.target.value })}>
              <option value="basalt">Bazan</option>
              <option value="red_yellow">Do vang</option>
              <option value="gray">Dat xam</option>
              <option value="rocky_slope">Doc soi</option>
            </select>
          </label>
          <label>
            <small>Mua</small>
            <select value={coverOptions.rainfall} onChange={e => onSetCoverOptions?.({ rainfall: e.target.value })}>
              <option value="drought">Han nang</option>
              <option value="dry">Thieu nuoc</option>
              <option value="normal">Binh thuong</option>
              <option value="good">Thuan loi</option>
            </select>
          </label>
          <label className="cover-wide">
            <small>Gia VND/m3</small>
            <input type="number" step="50000" min="0" value={coverOptions.priceVndM3} onChange={e => onSetCoverOptions?.({ priceVndM3: Number(e.target.value) })} />
          </label>
        </div>
        <button className="cover-run" type="button" disabled={busy} onClick={onCalculateCover}>
          {busy ? 'Dang tinh bang Microsoft API...' : 'Tinh do che phu & gia'}
        </button>
        {metrics && (
          <div className="cover-results">
            <div><small>CO CAY</small><strong>{fmt(metrics.tree_area_ha, 2)} ha</strong><span>{fmt(metrics.tree_cover_pct, 1)}%</span></div>
            <div><small>TAN DAY</small><strong>{fmt(metrics.dense_area_ha, 2)} ha</strong><span>{fmt(metrics.dense_canopy_pct, 1)}%</span></div>
            <div><small>NDVI TB</small><strong>{fmt(metrics.mean_ndvi, 3)}</strong><span>{valuation?.health_label || '—'}</span></div>
            <div><small>FVC</small><strong>{fmt(metrics.fvc_density_pct, 1)}%</strong><span>mat do tan</span></div>
            <div><small>P50 M3</small><strong>{fmt(valuation?.p50_m3, 0)}</strong><span>uoc tinh</span></div>
            <div><small>P50 VND</small><strong>{money(valuation?.p50_value_vnd)}</strong><span>demo</span></div>
          </div>
        )}
        <p className="analysis-limit">{coverNote}</p>
      </section>
    </aside>
  );
}
