const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const display = (value, fallback = 'Chưa có dữ liệu') => {
  const text = String(value ?? '').trim();
  return !text || text === '—' ? fallback : text;
};

const metric = (label, value, hint) => `
  <div class="metric">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(display(value, '—'))}</strong>
    <small>${escapeHtml(hint)}</small>
  </div>`;

export function exportForestReport({ snapshot, stats, card, analysis, status, spectralMode }) {
  const now = new Date();
  const reportId = `LK-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${String(now.getTime()).slice(-5)}`;
  const date = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeStyle: 'short' }).format(now);
  const sceneDate = card.plot?.analysisItem?.properties?.datetime;
  const cloud = card.plot?.analysisItem?.properties?.['eo:cloud_cover'];
  const source = card.plot?.sourceName || 'Tệp KML do người dùng cung cấp';
  const coordinates = card.plot?.center
    ? `${Number(card.plot.center.lat).toFixed(5)}°N, ${Number(card.plot.center.lon).toFixed(5)}°E`
    : status.cameraCoords;
  const modeLabels = {
    'true-color': 'True Color · RGB', 'false-color': 'False Color · tán lá',
    ndvi: 'NDVI · độ xanh', evi: 'EVI · tán dày', ndre: 'NDRE · red edge',
    gci: 'GCI · diệp lục', ndmi: 'NDMI · độ ẩm'
  };

  const reportHtml = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Báo cáo ${escapeHtml(card.name)}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #16221b; background: #dfe8e1; font-family: Arial, "Segoe UI", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; height: 297mm; padding: 15mm 17mm 13mm; margin: 0 auto 8mm; background: #f7f8f3; position: relative; overflow: hidden; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .cover { color: white; background: #0b261b; padding: 0; display: grid; grid-template-rows: 53% 47%; }
  .cover-copy { padding: 18mm 17mm; position: relative; z-index: 2; order: 2; }
  .brand { display: flex; align-items: center; gap: 4mm; font-size: 10px; letter-spacing: 2.6px; font-weight: 700; }
  .brand i { width: 10mm; height: 10mm; border-radius: 50% 50% 50% 12%; transform: rotate(-30deg); display: block; background: #99d65c; }
  .kicker { margin-top: 13mm; color: #99d65c; font-size: 9px; letter-spacing: 2px; font-weight: 800; }
  h1 { margin: 5mm 0 4mm; font-family: Georgia, serif; font-size: 35px; line-height: 1.05; font-weight: 500; }
  .lead { color: #bdd0c4; line-height: 1.65; font-size: 12px; max-width: 165mm; }
  .cover-meta { position: absolute; bottom: 13mm; left: 17mm; right: 17mm; border-top: 1px solid #315042; padding-top: 5mm; display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; font-size: 8px; color: #8fa89a; }
  .cover-meta strong { display: block; color: white; font-size: 10px; margin-top: 1.5mm; }
  .cover-image { position: relative; overflow: hidden; }
  .cover-image img { width: 100%; height: 100%; object-fit: cover; }
  .cover-image:after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, #0b261b 0%, transparent 35%); }
  .image-label { position: absolute; z-index: 2; bottom: 13mm; right: 13mm; padding: 3mm 4mm; background: rgba(4,18,11,.75); border: 1px solid rgba(255,255,255,.18); border-radius: 2mm; font-size: 8px; letter-spacing: 1px; }
  header { display: flex; align-items: flex-end; justify-content: space-between; padding-bottom: 5mm; border-bottom: 1px solid #ccd8ce; }
  header h2 { margin: 1mm 0 0; font-family: Georgia, serif; font-size: 24px; font-weight: 500; color: #153c29; }
  .section-no { color: #4e9255; font-size: 9px; letter-spacing: 2px; font-weight: 800; }
  .report-id { text-align: right; color: #708077; font-size: 8px; line-height: 1.6; }
  .map-layout { display: grid; grid-template-rows: 104mm auto; gap: 5mm; margin-top: 6mm; }
  .map-frame { background: #102a1e; border-radius: 3mm; overflow: hidden; position: relative; }
  .map-frame img { width: 100%; height: 100%; object-fit: cover; }
  .map-caption { position: absolute; left: 4mm; right: 4mm; bottom: 4mm; display: flex; justify-content: space-between; padding: 3mm 4mm; background: rgba(5,20,12,.78); border-radius: 2mm; color: white; font-size: 8px; }
  .sidebar { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .info { padding: 3.5mm; border: 1px solid #d4ddd5; border-radius: 2.5mm; background: white; }
  .info span, .metric span { display: block; color: #728077; font-size: 7px; letter-spacing: 1.1px; font-weight: 700; text-transform: uppercase; }
  .info strong { display: block; color: #1b3829; font-size: 12px; margin-top: 1.5mm; }
  .info small { display: block; color: #76847c; margin-top: 1mm; line-height: 1.45; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-top: 5mm; }
  .summary .info strong { font-size: 18px; color: #317044; }
  .analysis-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; margin-top: 8mm; }
  .metric { min-height: 31mm; padding: 5mm; background: white; border: 1px solid #d5ded6; border-radius: 3mm; }
  .metric strong { display: block; margin: 3mm 0 2mm; font-family: Georgia, serif; font-size: 24px; color: #2f7242; }
  .metric small { color: #829088; font-size: 8px; }
  .conclusion { margin-top: 6mm; display: grid; grid-template-columns: 34% 66%; border-radius: 3mm; overflow: hidden; }
  .result { background: #17452e; color: white; padding: 6mm; }
  .result span { color: #a9c9b3; font-size: 8px; letter-spacing: 1.3px; }
  .result strong { display: block; margin-top: 2.5mm; font-family: Georgia, serif; font-size: 19px; }
  .note { background: #e7eee6; padding: 5mm 6mm; color: #435149; font-size: 9px; line-height: 1.6; }
  footer { position: absolute; left: 17mm; right: 17mm; bottom: 7mm; display: flex; justify-content: space-between; color: #849087; font-size: 7px; }
  @media print { body { background: none; } .page { margin: 0; } }
</style></head><body>
<section class="page cover">
  <div class="cover-copy">
    <div class="brand"><i></i>LÂM KÍNH · FOREST INTELLIGENCE</div>
    <div class="kicker">BÁO CÁO PHÂN TÍCH KHÔNG GIAN</div>
    <h1>${escapeHtml(display(card.name, 'Khu vực phân tích'))}</h1>
    <p class="lead">Báo cáo trực quan hóa ranh giới KML, hiện trạng thảm thực vật và các chỉ số phổ từ ảnh vệ tinh Sentinel-2.</p>
    <div class="cover-meta"><div>MÃ BÁO CÁO<strong>${reportId}</strong></div><div>THỜI ĐIỂM XUẤT<strong>${escapeHtml(date)}</strong></div></div>
  </div>
  <div class="cover-image"><img src="${snapshot}" alt="Ảnh bản đồ"><div class="image-label">${escapeHtml(modeLabels[spectralMode] || spectralMode)}</div></div>
</section>
<section class="page">
  <header><div><div class="section-no">01 · TỔNG QUAN KHÔNG GIAN</div><h2>Bản đồ khu vực phân tích</h2></div><div class="report-id">${reportId}<br>${escapeHtml(date)}</div></header>
  <div class="map-layout">
    <div class="map-frame"><img src="${snapshot}" alt="Bản đồ visualization"><div class="map-caption"><span>${escapeHtml(modeLabels[spectralMode] || spectralMode)}</span><span>${escapeHtml(coordinates)}</span></div></div>
    <div class="sidebar">
      <div class="info"><span>Tên khu vực</span><strong>${escapeHtml(display(card.name))}</strong><small>${escapeHtml(card.description || 'Ranh giới polygon từ dữ liệu KML.')}</small></div>
      <div class="info"><span>Nguồn ranh giới</span><strong>${escapeHtml(source)}</strong><small>Dữ liệu được đọc trực tiếp từ polygon đang chọn.</small></div>
      <div class="info"><span>Dữ liệu vệ tinh</span><strong>Sentinel-2 L2A</strong><small>${sceneDate ? `Ngày chụp ${escapeHtml(new Intl.DateTimeFormat('vi-VN').format(new Date(sceneDate)))}` : 'Chưa xác định ngày chụp'}${Number.isFinite(Number(cloud)) ? ` · Mây ${Number(cloud).toFixed(1)}%` : ''}</small></div>
      <div class="info"><span>Tọa độ tâm</span><strong>${escapeHtml(coordinates)}</strong><small>Hệ tọa độ địa lý WGS 84.</small></div>
    </div>
  </div>
  <div class="summary">${metric('Diện tích', card.area || stats.totalArea, 'hecta')}${metric('Số polygon', stats.visibleRegions, 'khu vực hiển thị')}${metric('Mô phỏng 3D', card.carbon || stats.carbonTotal, 'đối tượng cây')}</div>
  <footer><span>LÂM KÍNH · Báo cáo tự động từ dữ liệu người dùng</span><span>Trang 02</span></footer>
</section>
<section class="page">
  <header><div><div class="section-no">02 · CHỈ SỐ THẢM THỰC VẬT</div><h2>Sức khỏe và độ ẩm tán lá</h2></div><div class="report-id">Độ tin cậy<br><strong>${escapeHtml(display(analysis.confidence))}</strong></div></header>
  <div class="analysis-grid">
    ${metric('NDVI trung bình', analysis.mean, 'Mật độ và độ xanh thực vật')}
    ${metric('EVI', analysis.evi, 'Tán lá dày, giảm nhiễu nền')}
    ${metric('NDRE', analysis.ndre, 'Sức khỏe lá và red edge')}
    ${metric('GCI', analysis.gci, 'Hàm lượng diệp lục tương đối')}
    ${metric('NDMI trung bình', analysis.ndmi, 'Độ ẩm của tán thực vật')}
    ${metric('NDVI trung vị', analysis.ndviMedian, `NDMI trung vị: ${display(analysis.ndmiMedian, '—')}`)}
  </div>
  <div class="conclusion"><div class="result"><span>KẾT LUẬN TỔNG HỢP</span><strong>${escapeHtml(display(analysis.healthClass))}</strong></div><div class="note">${escapeHtml(display(analysis.note, 'Chưa đủ dữ liệu để đưa ra kết luận.'))}</div></div>
  <div class="info" style="margin-top:5mm"><span>Lưu ý phương pháp</span><small>Chỉ số được tổng hợp từ pixel nằm trong polygon. Kết quả phục vụ sàng lọc và theo dõi từ xa, không thay thế khảo sát thực địa. LAI, VV/VH và CWSI cần thêm mô hình hiệu chỉnh hoặc nguồn dữ liệu chuyên biệt.</small></div>
  <footer><span>Nguồn: KML người dùng · Sentinel-2 L2A · Microsoft Planetary Computer / ESA</span><span>Trang 03</span></footer>
</section>
</body></html>`;

  document.getElementById('pdfReportPreview')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'pdfReportPreview';
  overlay.className = 'pdf-report-preview';
  overlay.innerHTML = `
    <div class="pdf-preview-toolbar">
      <div><strong>Xem trước báo cáo</strong><span>A4 dọc · 210 × 297 mm · 3 trang</span></div>
      <div class="pdf-preview-actions">
        <button type="button" data-action="close">Đóng</button>
        <button type="button" class="primary" data-action="print">In / Lưu PDF</button>
      </div>
    </div>
    <iframe title="Xem trước báo cáo PDF"></iframe>`;
  document.body.appendChild(overlay);
  const frame = overlay.querySelector('iframe');
  frame.srcdoc = reportHtml;
  overlay.querySelector('[data-action="close"]').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-action="print"]').addEventListener('click', () => {
    if (!frame.contentWindow) throw new Error('Không thể mở nội dung báo cáo để in.');
    frame.contentWindow.focus();
    frame.contentWindow.print();
  });
}
