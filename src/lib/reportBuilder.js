/* eslint-disable no-unused-vars */
const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const has = (value) => value !== undefined && value !== null && String(value).trim() && String(value).trim() !== '—';
const val = (value, suffix = '') => has(value) ? `${esc(value)}${suffix}` : '<i>Chưa đủ dữ liệu</i>';
const num = (value, suffix = '') => has(value) && Number.isFinite(Number(value))
  ? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(value))}${suffix}`
  : '<i>Chưa đủ dữ liệu</i>';
const money = (value) => has(value) && Number.isFinite(Number(value))
  ? `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) / 1000000) * 1000000)} VNĐ`
  : '<i>Chưa đủ dữ liệu</i>';
const compactMoney = (value) => has(value) && Number.isFinite(Number(value))
  ? `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) / 1000000) * 1000000)} VNĐ`
  : '—';
const row = (label, content) => `<tr><th>${label}</th><td>${content}</td></tr>`;
const field = (name, label, value = '', type = 'text') => `<label><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}"></label>`;
const finiteNumber = (value) => {
  if (!has(value)) return null;
  const normalized = String(value).replace(',', '.');
  return Number.isFinite(Number(normalized)) ? Number(normalized) : null;
};

const REPORTS = {
  health: { title: 'Báo cáo sức khỏe rừng', label: 'Báo cáo sức khỏe', pages: '8 trang' },
  bank: { title: 'Báo cáo thẩm định tài sản', label: 'Báo cáo cho ngân hàng', pages: '12 trang' },
  investor: { title: 'Báo cáo đánh giá đầu tư', label: 'Báo cáo cho nhà đầu tư', pages: '10 trang A4' },
};

const MODEL_CYCLE = { paper4: 4, paper5: 5, timber8: 8, large10: 10 };
const YIELD_TABLE = {
  paper4: { 1: { p10: 2, p50: 4, p90: 6 }, 2: { p10: 15, p50: 21, p90: 28 }, 3: { p10: 45, p50: 58, p90: 70 }, 4: { p10: 80, p50: 98, p90: 115 } },
  paper5: { 1: { p10: 2, p50: 4, p90: 5 }, 2: { p10: 14, p50: 20, p90: 25 }, 3: { p10: 38, p50: 50, p90: 60 }, 4: { p10: 65, p50: 80, p90: 95 }, 5: { p10: 95, p50: 115, p90: 135 } },
  timber8: { 1: { p10: 2, p50: 3, p90: 4 }, 2: { p10: 10, p50: 15, p90: 20 }, 3: { p10: 28, p50: 38, p90: 48 }, 4: { p10: 50, p50: 65, p90: 80 }, 5: { p10: 70, p50: 88, p90: 105 }, 6: { p10: 100, p50: 120, p90: 140 }, 7: { p10: 130, p50: 152, p90: 175 }, 8: { p10: 165, p50: 192, p90: 220 } },
  large10: { 1: { p10: 1, p50: 2, p90: 3 }, 2: { p10: 8, p50: 13, p90: 18 }, 3: { p10: 25, p50: 34, p90: 42 }, 4: { p10: 45, p50: 58, p90: 70 }, 5: { p10: 65, p50: 80, p90: 95 }, 6: { p10: 90, p50: 108, p90: 125 }, 7: { p10: 120, p50: 140, p90: 160 }, 8: { p10: 150, p50: 175, p90: 200 }, 9: { p10: 180, p50: 210, p90: 240 }, 10: { p10: 220, p50: 255, p90: 290 } },
};
const SOIL_FACTOR = { basalt: 1.15, red_yellow: 1.05, gray: 0.95, rocky_slope: 0.8 };
const RAIN_FACTOR = { drought: 0.8, low: 0.9, normal: 1, good: 1.05 };
const LOSS_FACTOR = 0.92;

function subtractYears(dateText, years) {
  const date = dateText ? new Date(dateText) : new Date();
  if (Number.isFinite(years)) date.setFullYear(date.getFullYear() - Math.max(1, Math.round(years)));
  return date.toISOString().slice(0, 10);
}

function filledForm(context, form = {}) {
  const opt = context.coverOptions || {};
  const cover = context.cover?.metrics || {};
  const valuation = context.cover?.valuation || {};
  const area = finiteNumber(context.card.area || context.stats.totalArea) || 67.73;
  const model = opt.model || 'timber8';
  const cycle = finiteNumber(form.cycle) || MODEL_CYCLE[model] || 4;
  const age = Math.max(1, Math.min(cycle, Math.round(finiteNumber(form.age) || finiteNumber(opt.age) || Math.min(cycle, 4))));
  const treeArea = finiteNumber(cover.tree_area_ha)
    || (finiteNumber(cover.tree_cover_pct) ? area * finiteNumber(cover.tree_cover_pct) / 100 : area * 0.72);
  const ndvi = finiteNumber(context.analysis?.mean);
  const ndviFactor = ndvi == null ? 1 : ndvi < 0.45 ? 0.7 : ndvi < 0.6 ? 0.85 : ndvi < 0.75 ? 1 : ndvi <= 0.85 ? 1.1 : 1.2;
  const factor = (SOIL_FACTOR[opt.soil] || 1.05) * (RAIN_FACTOR[opt.rainfall] || 1) * ndviFactor * LOSS_FACTOR;
  const yieldRow = YIELD_TABLE[model]?.[age] || YIELD_TABLE.timber8[4];
  const p10Volume = treeArea * yieldRow.p10 * factor;
  const p50Volume = treeArea * yieldRow.p50 * factor;
  const p90Volume = treeArea * yieldRow.p90 * factor;
  const backendP10Volume = finiteNumber(valuation.p10_m3);
  const backendP50Volume = finiteNumber(valuation.p50_m3);
  const backendP90Volume = finiteNumber(valuation.p90_m3);
  const backendP10Value = finiteNumber(valuation.p10_value_vnd);
  const backendP50Value = finiteNumber(valuation.p50_value_vnd);
  const backendP90Value = finiteNumber(valuation.p90_value_vnd);
  const volume = finiteNumber(form.volume) || backendP50Volume || p50Volume;
  const woodPrice = finiteNumber(form.woodPrice) || finiteNumber(valuation.price_vnd_m3) || finiteNumber(opt.priceVndM3) || 900000;
  const assetValue = finiteNumber(form.assetValue) || backendP50Value || volume * woodPrice;
  const careBase = Math.max(treeArea * 450000, assetValue * 0.009);
  const reportYear = new Date(has(form.date) ? form.date : new Date()).getFullYear();
  const harvestYear = reportYear + Math.max(0, cycle - age);
  const startYear = harvestYear - cycle + 1;
  const projection = Array.from({ length: cycle }, (_, index) => {
    const yearAge = index + 1;
    const year = startYear + index;
    const rowData = YIELD_TABLE[model]?.[yearAge] || yieldRow;
    const standingValue = treeArea * rowData.p50 * factor * woodPrice;
    const cost = yearAge === cycle ? 0 : Math.max(treeArea * 250000, standingValue * (yearAge === 1 ? 0.12 : yearAge === 2 ? 0.055 : 0.025));
    const cashFlow = yearAge === cycle ? standingValue : -cost;
    return {
      year,
      age: yearAge,
      volume: Math.round(treeArea * rowData.p50 * factor),
      standingValue: Math.round(standingValue),
      cost: Math.round(cost),
      cashFlow: Math.round(cashFlow),
      isFuture: yearAge > age,
      isHarvest: yearAge === cycle,
    };
  });
  const projectName = context.card.name || context.card.plot?.name || 'Lô rừng keo demo';
  return {
    ...form,
    owner: has(form.owner) ? form.owner : 'Công ty khách hàng demo',
    project: has(form.project) ? form.project : projectName,
    date: has(form.date) ? form.date : new Date().toISOString().slice(0, 10),
    address: has(form.address) ? form.address : 'Khu vực lô rừng theo polygon KML',
    province: has(form.province) ? form.province : 'Tây Nguyên',
    district: has(form.district) ? form.district : 'Khu vực trồng rừng',
    commune: has(form.commune) ? form.commune : 'Theo hồ sơ KML',
    treeType: has(form.treeType) ? form.treeType : 'Keo lai',
    plantingDate: has(form.plantingDate) ? form.plantingDate : subtractYears(form.date, age),
    age: String(age),
    cycle: String(cycle),
    volume: String(Math.round(volume)),
    woodPrice: String(Math.round(woodPrice)),
    assetValue: String(Math.round(assetValue)),
    p10Volume: String(Math.round(backendP10Volume || p10Volume)),
    p50Volume: String(Math.round(volume)),
    p90Volume: String(Math.round(backendP90Volume || p90Volume)),
    p10Value: String(Math.round(backendP10Value || p10Volume * woodPrice)),
    p50Value: String(Math.round(assetValue)),
    p90Value: String(Math.round(backendP90Value || p90Volume * woodPrice)),
    yieldPerHa: String(Math.round(volume / Math.max(treeArea, 0.01))),
    cashflowYear1: String(Math.round(careBase * 1.2)),
    cashflowYear2: String(Math.round(careBase)),
    cashflowYear3: String(Math.round(careBase * 0.85)),
    projection: JSON.stringify(projection),
    targetReturn: has(form.targetReturn) ? form.targetReturn : '18.7%',
    payback: has(form.payback) ? form.payback : '5.2 năm',
  };
}

const css = `<style>
@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#dce5de;color:#14251a;font-family:"Segoe UI",Tahoma,Arial,sans-serif;font-synthesis:none;text-rendering:optimizeLegibility;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:210mm;height:297mm;margin:0 auto 8mm;padding:15mm 17mm 14mm;background:#f8f8f4;position:relative;overflow:hidden;page-break-after:always}.page:last-child{page-break-after:auto}header{display:flex;justify-content:space-between;align-items:end;padding-bottom:5mm;border-bottom:1px solid #cad6cc}header span,.eyebrow{color:#4d8d55;font-size:8px;letter-spacing:1.7px;font-weight:800;text-transform:uppercase}h2{margin:2mm 0 0;font-size:23px;font-weight:650;color:#173d29}h3{margin:5mm 0 2mm;color:#173d29;font-size:13px}header b{font-size:29px;font-weight:400;color:#b8c7bb}footer{position:absolute;bottom:7mm;left:17mm;right:17mm;display:flex;justify-content:space-between;color:#7d8a81;font-size:7px}.cover{padding:0;background:#09271a;color:white;display:grid;grid-template-rows:48% 52%}.hero{position:relative;overflow:hidden}.hero img,.map img,.visual img{width:100%;height:100%;object-fit:cover}.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,#09271a,transparent 45%)}.cover-copy{padding:12mm 17mm;position:relative}.brand{font-size:9px;letter-spacing:2.3px;font-weight:800;color:#a7dc78}.cover h1{margin:14mm 0 3mm;font-size:32px;line-height:1.08;font-weight:650}.cover p{color:#aac0b2}.cover-data{position:absolute;left:17mm;right:17mm;bottom:15mm;display:grid;grid-template-columns:1fr 1fr;gap:5mm;border-top:1px solid #365244;padding-top:5mm}.label{display:block;color:#789184;font-size:7px;letter-spacing:1px;text-transform:uppercase}.cover-data strong{display:block;margin-top:1.5mm;font-size:11px}.table{width:100%;margin-top:5mm;border-collapse:collapse;background:white;border:1px solid #d3ddd5}.table th,.table td{padding:3mm 5mm;border-bottom:1px solid #e0e7e1;text-align:left;font-size:9px}.table th{width:42%;color:#68786e;background:#f2f6f3;font-weight:700}.table td{font-weight:700}.table i,i{color:#a66c36;font-weight:500}.notice{margin-top:6mm;padding:4mm 5mm;background:#fff5e4;border-left:1mm solid #dda143;color:#715529;font-size:8px;line-height:1.55}.map{height:151mm;margin-top:7mm;border-radius:3mm;overflow:hidden;position:relative;background:#173d29}.map-meta{position:absolute;left:4mm;right:4mm;bottom:4mm;padding:4mm;background:#071a12dd;color:white;border-radius:2mm;display:flex;justify-content:space-between;font-size:8px}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:8mm}.kpi{padding:6mm 5mm;background:white;border:1px solid #d4ded6;border-radius:3mm}.kpi span{display:block;color:#6e7e74;font-size:7px;letter-spacing:1px;text-transform:uppercase}.kpi strong{display:block;margin-top:3mm;color:#2e7141;font-size:20px;font-weight:700}.kpi small{display:block;margin-top:2mm;color:#849087}.score{display:grid;grid-template-columns:55mm 1fr;gap:9mm;align-items:center;margin-top:12mm}.ring{width:55mm;height:55mm;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#59a45e calc(var(--s)*1%),#dce7dd 0);position:relative}.ring:after{content:"";position:absolute;inset:6mm;border-radius:50%;background:#f8f8f4}.ring strong{z-index:1;color:#276239;font-size:27px;font-weight:700}.visual-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:8mm}.visual{height:89mm;position:relative;overflow:hidden;border-radius:3mm;background:#173d29}.visual figcaption{position:absolute;left:3mm;bottom:3mm;padding:2mm 3mm;background:#091d14dd;color:white;border-radius:2mm;font-size:8px}.visual-empty{height:100%;display:grid;place-items:center;color:#b9c9be;font-size:10px;background:linear-gradient(135deg,#173d29,#0c2418)}.bullets{margin:8mm 0;padding-left:5mm}.bullets li{margin:3mm 0;color:#46564c;line-height:1.65;font-size:10px}.callout{margin-top:8mm;padding:7mm;background:#153f29;color:white;border-radius:3mm}.callout span{color:#9cc8a7;font-size:8px;letter-spacing:1px}.callout strong{display:block;margin-top:3mm;font-size:21px;font-weight:700}.chart{height:48mm;margin-top:2mm;background:white;border:1px solid #d3ddd5;border-radius:3mm;display:flex;align-items:end;gap:3mm;padding:9mm 7mm 8mm}.bar{flex:1;background:#73af65;position:relative;min-width:0;border-radius:1mm 1mm 0 0}.bar b{position:absolute;top:-6mm;left:50%;transform:translateX(-50%);font-size:7px;white-space:nowrap}.bar span{position:absolute;bottom:-7mm;left:50%;transform:translateX(-50%);font-size:6px;text-align:center;line-height:1.15;white-space:nowrap}.signature{display:grid;grid-template-columns:1fr 1fr;gap:18mm;margin-top:18mm;text-align:center;color:#68766d;font-size:9px}.signature div{border-top:1px solid #aebbb1;padding-top:4mm}
.corp-page{width:210mm;height:297mm;margin:0 auto 8mm;padding:16mm 17mm 18mm;background:#fff;position:relative;overflow:hidden;page-break-after:always;color:#1d2935}.corp-header{display:grid;grid-template-columns:52mm 1fr 55mm;gap:7mm;align-items:start;padding-bottom:6mm;border-bottom:0.45mm solid #2e7141}.corp-brand{display:flex;gap:3mm;align-items:center}.corp-logo{width:13mm;height:13mm;display:grid;place-items:center;border:0.45mm solid #2e7141;border-radius:2mm;color:#2e7141;font-weight:800;font-size:9pt}.corp-brand strong{display:block;color:#2e7141;font-size:10pt;letter-spacing:.2mm}.corp-brand span{display:block;margin-top:1mm;color:#5e6b76;font-size:7pt}.corp-title{text-align:center}.corp-title span{display:block;color:#64717c;font-size:8pt;text-transform:uppercase;letter-spacing:.45mm}.corp-title h1{margin:1.5mm 0 0;color:#2e7141;font-size:20pt;line-height:1.1}.corp-meta{display:grid;grid-template-columns:1fr;gap:1.2mm;color:#3f4d59;font-size:7.5pt}.corp-meta b{color:#2e7141}.corp-client{display:none}.corp-content{padding-top:7mm}.section-label{color:#4d8d55;font-size:8pt;text-transform:uppercase;letter-spacing:.4mm;font-weight:800}.corp-content h2{margin:1.5mm 0 5mm;color:#173d29;font-size:21pt;line-height:1.08}.corp-content h3{margin:0 0 3mm;color:#2e7141;font-size:14pt}.corp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.corp-grid.two{grid-template-columns:1fr 1fr}.corp-card{padding:4.5mm;border:0.25mm solid #d4ded6;border-radius:2mm;background:#fff;min-height:28mm}.corp-card.tint{background:#f2f6f3}.corp-card span{display:block;color:#6b7884;font-size:7pt;text-transform:uppercase;letter-spacing:.25mm}.corp-card strong{display:block;margin-top:2mm;color:#2e7141;font-size:16pt}.corp-card p{margin:2mm 0 0;color:#4c5965;font-size:9pt;line-height:1.5}.corp-note{margin-top:5mm;padding:4mm;border-left:1.2mm solid #4d8d55;background:#f2f6f3;color:#40505e;font-size:9pt;line-height:1.55}.corp-img{height:112mm;border:0.25mm solid #d4ded6;border-radius:2mm;overflow:hidden;background:#f0f3f6}.corp-img img{width:100%;height:100%;object-fit:cover}.corp-visual-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.corp-visual{height:64mm;position:relative;border:0.25mm solid #d4ded6;border-radius:2mm;overflow:hidden;background:#173d29}.corp-visual img{width:100%;height:100%;object-fit:cover;background:#173d29}.corp-visual span{position:absolute;left:3mm;bottom:3mm;padding:1.5mm 2mm;background:#091d14dd;color:white;border-radius:1mm;font-size:7pt}.corp-meter{display:grid;grid-template-columns:45mm 1fr;gap:8mm;align-items:center}.corp-ring{width:45mm;height:45mm;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#59a45e calc(var(--s)*1%),#d9e3ea 0);position:relative}.corp-ring:after{content:"";position:absolute;inset:6mm;border-radius:50%;background:#f8f8f4}.corp-ring b{position:relative;z-index:1;color:#276239;font-size:18pt}.corp-bars{height:70mm;display:flex;align-items:end;gap:8mm;margin-top:8mm;padding:10mm;border:0.25mm solid #d4ded6;border-radius:2mm;background:#fff}.corp-bars i{flex:1;background:#73af65;border-radius:1.3mm 1.3mm 0 0;position:relative}.corp-bars i:after{content:attr(data-label);position:absolute;left:50%;bottom:-7mm;transform:translateX(-50%);font-size:7pt;color:#66737e}.risk-row{display:grid;grid-template-columns:1fr 28mm;gap:4mm;align-items:center;padding:3.2mm 0;border-bottom:0.2mm solid #e0e7e1;font-size:9.2pt}.risk-row:last-child{border-bottom:0}.risk-row b{padding:1.5mm 2mm;text-align:center;border-radius:1mm;background:#f2f6f3;color:#2e7141}.timeline{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:5mm}.timeline div{padding:6mm 5mm;border:0.25mm solid #d4ded6;border-radius:2mm;background:#f2f6f3;text-align:center}.timeline b{display:block;color:#2e7141;font-size:13pt}.timeline span{display:block;margin-top:2mm;color:#55616d;font-size:9pt}.corp-footer,.corp-sign,.corp-seal,.corp-page-number{display:none}.qr{width:26mm;height:26mm;background:repeating-linear-gradient(45deg,#2e7141 0 2px,#fff 2px 4px);border:1.5mm solid white;box-shadow:0 0 0 .25mm #d4ded6}@media print{body{background:none}.page,.corp-page{margin:0}}
.visual-grid{align-items:start}.visual-grid.wide{grid-template-columns:1fr;gap:7mm;margin-top:7mm}.visual-grid.standard,.visual-grid.tall{grid-template-columns:1fr 1fr;gap:6mm 7mm}.visual,.corp-visual{height:auto;margin:0;position:relative;overflow:visible;border-radius:3mm;background:transparent;text-align:center}.visual-frame{position:relative;display:inline-block;max-width:100%;margin:0 auto;border-radius:3mm;overflow:hidden;text-align:left;line-height:0}.visual img,.corp-visual img{display:block;width:auto;max-width:100%;height:auto;object-fit:contain;background:transparent}.visual-grid.wide .visual img{max-height:96mm}.visual-grid.standard .visual img,.visual-grid.tall .visual img{max-height:91mm}.visual figcaption{left:3mm;right:auto;bottom:3mm;max-width:calc(100% - 6mm);font-size:8px;line-height:1.2}.corp-visual span{max-width:calc(100% - 6mm)}
.qr-box{display:flex;align-items:center;gap:5mm;margin-top:5mm;padding:4mm;border:1px solid #d4ded6;border-radius:2mm;background:#f2f6f3;color:#40505e;font-size:9px;line-height:1.45}.qr-box .qr{width:26mm;height:26mm;display:grid;place-items:center;background:#fff;border:1mm solid #fff;box-shadow:0 0 0 .25mm #d4ded6}.qr-box .qr img{width:100%;height:100%;display:block}.qr-box p{margin:0}.qr-box small{color:#66737e}.corp-grid .corp-card strong{line-height:1.15}.kpi small{line-height:1.35}
</style>`;

function facts(c, f) {
  const area = Number(String(c.card.area || c.stats.totalArea).replace(',', '.'));
  const ndvi = Number(c.analysis.mean);
  const score = Number.isFinite(ndvi) ? Math.round(Math.max(0, Math.min(100, (ndvi + 0.2) / 1.1 * 100))) : null;
  const cover = c.cover?.metrics || {};
  const valuation = c.cover?.valuation || {};
  const volume = has(f.volume) ? Number(f.volume) : valuation.p50_m3;
  const gross = has(volume) && has(f.woodPrice) ? Number(volume) * Number(f.woodPrice) : valuation.p50_value_vnd;
  const net = has(f.assetValue) ? Number(f.assetValue) : (has(gross) ? Number(gross) : valuation.p50_value_vnd);
  const center = c.card.plot?.center ? `${Number(c.card.plot.center.lat).toFixed(5)}, ${Number(c.card.plot.center.lon).toFixed(5)}` : c.status.cameraCoords;
  const bounds = c.card.plot?.bounds;
  const meanLat = bounds ? (Number(bounds.north) + Number(bounds.south)) / 2 : 0;
  const width = bounds ? Math.max(0.000001, (Number(bounds.east) - Number(bounds.west)) * Math.cos(meanLat * Math.PI / 180)) : 1;
  const height = bounds ? Math.max(0.000001, Number(bounds.north) - Number(bounds.south)) : 1;
  const visualAspect = width / height;
  const visualLayout = visualAspect >= 1.35 ? 'wide' : visualAspect <= 0.78 ? 'tall' : 'standard';
  const age = finiteNumber(f.age) || 0;
  const cycle = finiteNumber(f.cycle) || 0;
  const harvestCountdown = Math.max(0, cycle - age);
  const harvestYear = new Date(f.date).getFullYear() + harvestCountdown;
  return { area, score, gross, net, center, cover, valuation, volume, visualAspect, visualLayout, age, cycle, harvestCountdown, harvestYear };
}


const page = (n, kicker, title, body) => `<section class="page"><header><div><span>${kicker}</span><h2>${title}</h2></div><b>${String(n).padStart(2, '0')}</b></header>${body}<footer><span>LÂM KÍNH · Báo cáo hỗ trợ ra quyết định</span><span>Trang ${String(n).padStart(2, '0')}</span></footer></section>`;
const visual = (src, label, note) => `<figure class="visual"><div class="visual-frame">${src ? `<img src="${src}">` : '<div class="visual-empty">Không có dữ liệu</div>'}<figcaption>${label}${note ? ` · ${note}` : ''}</figcaption></div></figure>`;
const visualItems = (c, gciNote = 'Dễ nhận diện vùng tán lá khác biệt') => [
  [c.snapshots?.falseColor, 'Tổ hợp màu giả (False Color)', 'Nhận diện tán lá'],
  [c.snapshots?.ndvi, 'Chỉ số thực vật (NDVI)', 'Độ xanh thực vật'],
  [c.snapshots?.gci, 'Chỉ số diệp lục (GCI)', gciNote],
  [c.snapshots?.ndmi, 'Chỉ số độ ẩm (NDMI)', 'Độ ẩm tán lá']
];
const visualGrid = (items, layout) => `<div class="visual-grid ${layout}">${items.map(([src, label, note]) => visual(src, label, note)).join('')}</div>`;
const visualNotice = (text) => `<div class="notice">${text}</div>`;
const cycleSummary = (x) => x.cycle ? `Cây hiện ${x.age} năm tuổi trong chu kỳ ${x.cycle} năm; còn khoảng ${x.harvestCountdown} năm đến khai thác${x.harvestCountdown === 0 ? ' / đã tới chu kỳ' : ''}` : 'Chưa đủ dữ liệu chu kỳ';
const valuationNote = (f, x) => `Giá trị hiện tại là ước tính tham khảo theo sản lượng P50 (${Number(f.p50Volume || x.volume || 0).toLocaleString('vi-VN')} m³), giá gỗ ${Number(f.woodPrice || 0).toLocaleString('vi-VN')} VNĐ/m³ và hệ số đất/mưa/NDVI từ màn hình tính độ che phủ. Các giả định định giá mặc định đồng bộ với kết quả ngoài trang chủ; khách hàng có thể điều chỉnh lại khi có số liệu thực địa.`;
const QrCodeBox = ({ c }) => {
  const url = c.reportUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(url);
  const qr = url && !isLocal ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(url)}" alt="QR bản đồ">` : '<span>QR</span>';
  const text = url && !isLocal
    ? `Quét mã để xem bản đồ tương tác và dữ liệu chi tiết trực tuyến.<br><small>${esc(url)}</small>`
    : 'QR sẽ được kích hoạt khi bản demo được đưa lên link public. Bản đang chạy nội bộ chỉ mở được trên máy demo.';
  return `<div class="qr-box"><div class="qr">${qr}</div><p>${text}</p></div>`;
};
function simpleHealthSummary(c, x) {
  const score = Number.isFinite(x.score) ? x.score : null;
  const health = score == null ? 'Chưa đủ dữ liệu' : score >= 70 ? 'Rừng đang phát triển tốt' : score >= 55 ? 'Rừng ở mức trung bình, cần theo dõi' : 'Cần kiểm tra thực địa';
  const fieldCheck = score != null && score >= 70 ? 'Chưa bắt buộc, nhưng nên kiểm tra mẫu trước giao dịch lớn.' : 'Có, nên kiểm tra vùng chỉ số thấp hoặc khu vực bị mây che.';
  const action = score != null && score >= 70 ? 'Duy trì chăm sóc định kỳ và cập nhật ảnh sau 30-60 ngày.' : 'Ưu tiên kiểm tra thực địa, đặc biệt các vùng màu vàng/đỏ/nâu trên ảnh phân tích.';
  return { health, fieldCheck, action };
}
const satelliteLegend = 'Chú giải nhanh: xanh đậm = cây khỏe/tán dày; vàng = trung bình; đỏ/nâu = yếu, khô hoặc đất trống; trắng/xám = mây hoặc vùng không đánh giá.';
function adaptiveVisualPages(pageNum, kicker, title, items, x, notice) {
  if (x.visualLayout !== 'wide') {
    return page(pageNum, kicker, title, `${visualGrid(items, x.visualLayout)}${visualNotice(notice)}`);
  }
  return [
    page(pageNum, kicker, `${title} · nhóm 1`, `${visualGrid(items.slice(0, 2), 'wide')}`),
    page(pageNum + 1, kicker, `${title} · nhóm 2`, `${visualGrid(items.slice(2), 'wide')}${visualNotice(notice)}`)
  ].join('');
}
const corpRows = (rows) => `<table class="table">${rows.map(([a, b]) => row(a, b)).join('')}</table>`;
const corpPage = (f, pageNo, title, subtitle, body) => page(pageNo, `BÁO CÁO NHÀ ĐẦU TƯ · ${subtitle}`, title, body);

// --- COMPONENT LIBRARY ---

const CoverPage = ({ c, f, x, title, highlight }) => {
  return `<section class="page cover"><div class="hero"><img src="${c.snapshots?.rgb || c.snapshot}"></div><div class="cover-copy"><div class="brand">LÂM KÍNH · FOREST INTELLIGENCE</div><h1>${title}</h1><p>${val(f.project || c.card.name)}</p>${c.snapshotWarning ? `<div class="notice">${esc(c.snapshotWarning)}</div>` : ''}<div class="cover-data"><div><span class="label">Chủ sở hữu</span><strong>${val(f.owner)}</strong></div><div><span class="label">Ngày báo cáo</span><strong>${val(f.date)}</strong></div><div><span class="label">Mã lô</span><strong>${val(c.card.plot?.id)}</strong></div><div><span class="label">${highlight ? 'Giá trị ước tính' : 'Diện tích'}</span><strong>${highlight || val(c.card.area || c.stats.totalArea, ' ha')}</strong></div></div></div></section>`;
};

const ExecutiveDashboard = ({ c, f, x, pageNum }) => {
  return page(pageNum, 'TỔNG QUAN', 'Bảng điều khiển', `
    <div class="kpis">
      <div class="kpi"><span>Diện tích</span><strong>${Number.isFinite(x.area) ? x.area.toLocaleString('vi-VN') : '—'}</strong><small>ha</small></div>
      <div class="kpi"><span>Điểm sức khỏe</span><strong>${Number.isFinite(x.score) ? x.score : '—'}</strong><small>/100</small></div>
      <div class="kpi"><span>Giá trị</span><strong style="font-size:12px">${money(x.net)}</strong><small>tham khảo</small></div>
      <div class="kpi"><span>Chu kỳ khai thác</span><strong>${x.cycle || '—'} năm</strong><small>${cycleSummary(x)}</small></div>
      <div class="kpi"><span>Còn tới khai thác</span><strong>${x.harvestCountdown} năm</strong><small>Dự kiến năm ${x.harvestYear}</small></div>
      <div class="kpi"><span>Mức dữ liệu</span><strong>Ước tính</strong><small>Cần xác minh thực địa</small></div>
    </div>
    <div class="notice">${valuationNote(f, x)}</div>
  `);
};

const ForestProfile = ({ c, f, x, pageNum }) => {
  return page(pageNum, 'HỒ SƠ LÔ RỪNG', 'Thông tin lô', `
    <table class="table">
      ${row('Tên lô / dự án', val(f.project))}
      ${row('Mã lô', val(c.card.plot?.id))}
      ${row('Chủ sở hữu', val(f.owner))}
      ${row('Địa chỉ', val(f.address))}
      ${row('Tỉnh · Huyện · Xã', val([f.province, f.district, f.commune].filter(Boolean).join(' · ')))}
      ${row('Diện tích', Number.isFinite(x.area) ? `${x.area.toLocaleString('vi-VN')} ha` : val())}
      ${row('Loại cây', val(f.treeType))}
      ${row('Ngày trồng', val(f.plantingDate))}
      ${row('Tuổi cây', num(f.age, ' năm'))}
      ${row('Chu kỳ khai thác', num(f.cycle, ' năm'))}
      ${row('Diễn giải chu kỳ', esc(cycleSummary(x)))}
    </table>
    <div class="notice">Thông tin do người dùng nhập cần đối chiếu hồ sơ pháp lý và kiểm kê thực địa.</div>
  `);
};

const SatelliteOverview = ({ c, f, x, pageNum }) => {
  return adaptiveVisualPages(
    pageNum,
    'TRỰC QUAN HÓA VỆ TINH',
    'Các lớp phân tích phổ',
    visualItems(c),
    x,
    `${satelliteLegend} Mỗi ảnh được chụp từ đúng lớp phổ tương ứng. Lớp không tải được từ hệ thống liên kết sẽ để trống, không thay bằng ảnh màu tự nhiên.`
  );
};
SatelliteOverview.pageSpan = ({ x }) => x.visualLayout === 'wide' ? 2 : 1;

const HealthAssessment = ({ c, f, x, pageNum }) => {
  const score = Number.isFinite(x.score) ? x.score : 0;
  const summary = simpleHealthSummary(c, x);
  const treeCover = has(x.cover.tree_cover_pct) ? `${Number(x.cover.tree_cover_pct).toFixed(1)}%` : 'Chưa đủ dữ liệu';
  return page(pageNum, 'PHÂN TÍCH VIỄN THÁM', 'Đánh giá sức khỏe rừng', `
    <div class="score" style="--s:${score}">
      <div class="ring"><strong>${Number.isFinite(x.score) ? `${x.score}%` : '—'}</strong></div>
      <div><span class="eyebrow">ĐIỂM SỨC KHỎE RỪNG</span><h3>${esc(summary.health)}</h3><p>Đánh giá dựa trên độ xanh tán cây, độ ẩm tán lá và ảnh vệ tinh mới nhất của lô đang chọn.</p></div>
    </div>
    <table class="table">
      ${row('Kết luận dễ hiểu', esc(summary.health))}
      ${row('Độ che phủ cây', esc(treeCover))}
      ${row('Chỉ số xanh trung bình', val(c.analysis.mean))}
      ${row('Độ ẩm tán lá', val(c.analysis.ndmi))}
      ${row('Có cần đi kiểm tra ngay không?', esc(summary.fieldCheck))}
      ${row('Việc nên làm tiếp theo', esc(summary.action))}
    </table>
    <div class="notice">Điểm sức khỏe là chỉ báo hỗ trợ quản lý rừng, không phải kết luận pháp lý. Khi có giao dịch, vay vốn hoặc mua bán lớn, khách hàng vẫn nên kiểm tra thực địa và đối chiếu hồ sơ.</div>
  `);
};

const AssetEstimation = ({ c, f, x, pageNum }) => {
  return page(pageNum, 'MÔ HÌNH TÀI CHÍNH', 'Ước tính tài sản', `
    <table class="table">
      ${row('Diện tích', Number.isFinite(x.area) ? `${x.area.toLocaleString('vi-VN')} ha` : val())}
      ${row('Tuổi trung bình', num(f.age, ' năm'))}
      ${row('Sản lượng dự kiến', has(x.volume) ? `${Number(x.volume).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} m³` : val())}
      ${row('Giá gỗ tham chiếu', has(f.woodPrice) ? `${money(f.woodPrice)} / m³` : val())}
      ${row('Giá trị cây đứng ước tính', money(x.gross))}
      ${row('Giá trị hiện tại ước tính', money(x.net))}
      ${row('Chu kỳ / khai thác', esc(cycleSummary(x)))}
      ${row('Năm khai thác dự kiến', x.harvestYear)}
    </table>
    <div class="callout"><span>GIÁ TRỊ HIỆN TẠI ƯỚC TÍNH</span><strong>${money(x.net)}</strong></div>
    <div class="notice">${valuationNote(f, x)}</div>
  `);
};

const OwnerRecommendation = ({ c, f, x, pageNum }) => {
  return page(pageNum, 'HÀNH ĐỘNG ĐỀ XUẤT', 'Khuyến nghị', `
    <div class="callout">
      <span>ƯU TIÊN HIỆN TẠI</span>
      <strong>${Number.isFinite(x.score) && x.score >= 70 ? 'Theo dõi định kỳ' : 'Khảo sát thực địa'}</strong>
    </div>
    <ul class="bullets">
      <li>Đối chiếu tệp ranh giới (KML) với hồ sơ và mốc giới.</li>
      <li>Thu thập ô mẫu để hiệu chỉnh trữ lượng.</li>
      <li>Phân tích lại sau 30-60 ngày.</li>
      <li>Kiểm tra vùng chỉ số thực vật và độ ẩm thấp sau khi có phân vùng bất thường.</li>
    </ul>
    <div class="corp-grid">
      <div class="corp-card tint"><span>Ưu tiên cao</span><strong>Mốc giới</strong><p>Đối chiếu KML với mốc ngoài thực địa và hồ sơ đất.</p></div>
      <div class="corp-card tint"><span>Ưu tiên vừa</span><strong>Giá gỗ</strong><p>Cập nhật đơn giá địa phương trước khi ra quyết định tài chính.</p></div>
      <div class="corp-card tint"><span>Ưu tiên thấp</span><strong>Theo dõi</strong><p>Tạo lại báo cáo sau 30-60 ngày hoặc sau thời tiết bất thường.</p></div>
    </div>
  `);
};

const Disclaimer = ({ c, f, x, pageNum }) => {
  return page(pageNum, 'KẾT LUẬN', 'Tóm tắt và phạm vi sử dụng', `
    <div class="kpis">
      <div class="kpi"><span>Diện tích</span><strong>${Number.isFinite(x.area) ? x.area.toLocaleString('vi-VN') : '—'}</strong><small>hecta</small></div>
      <div class="kpi"><span>Sức khỏe</span><strong>${Number.isFinite(x.score) ? `${x.score}%` : '—'}</strong><small>Chỉ số thực vật chuẩn hóa</small></div>
      <div class="kpi"><span>Giá trị ước tính</span><strong style="font-size:12px">${money(x.net)}</strong><small>theo P50</small></div>
    </div>
    <ul class="bullets">
      <li>Ranh giới được tổng hợp từ tệp ranh giới người dùng.</li>
      <li>Tình trạng thảm thực vật mô tả từ vệ tinh Sentinel-2 tại thời điểm gần nhất.</li>
      <li>Định giá chỉ có ý nghĩa khi giả định đầu vào đã được xác minh.</li>
    </ul>
    ${QrCodeBox({ c })}
    <div class="notice"><strong>Lưu ý pháp lý:</strong> Giá trị ước tính dựa trên dữ liệu viễn thám và giả định thị trường tại thời điểm báo cáo. Báo cáo hỗ trợ thẩm định, không thay thế khảo sát thực địa, hồ sơ pháp lý hoặc quyết định định giá chính thức.</div>
    <div class="signature"><div>Đại diện chủ sở hữu</div><div>Đơn vị lập báo cáo</div></div>
  `);
};

const CollateralDashboard = ({ c, f, x, pageNum }) => {
  const asset = has(x.net) ? Number(x.net) : null;
  const ltvPct = 60;
  const collateral = has(asset) ? asset * ltvPct / 100 : null;
  const healthText = Number.isFinite(x.score) && x.score >= 70 ? 'Tốt' : Number.isFinite(x.score) && x.score >= 55 ? 'Trung bình' : 'Cần xác minh';
  const dryRisk = has(c.analysis.ndmi) && Number(c.analysis.ndmi) < -0.1 ? 'Trung bình' : 'Thấp';
  return page(pageNum, 'TÓM TẮT THẨM ĐỊNH', 'Tóm tắt kết quả thẩm định', `
    <div class="kpis">
      <div class="kpi"><span>Giá trị tài sản ước tính</span><strong style="font-size:12px">${money(asset)}</strong><small>VNĐ</small></div>
      <div class="kpi"><span>Tỷ lệ cho vay đề xuất</span><strong>${ltvPct}%</strong><small>Tỷ lệ cho vay trên giá trị (LTV) tham khảo</small></div>
      <div class="kpi"><span>Giá trị bảo đảm đề xuất</span><strong style="font-size:12px">${money(collateral)}</strong><small>VNĐ</small></div>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Điểm sức khỏe rừng</span><strong>${Number.isFinite(x.score) ? x.score : '—'}</strong><small>/100 · ${healthText}</small></div>
      <div class="kpi"><span>Rủi ro sinh trưởng</span><strong>${dryRisk}</strong><small>theo độ ẩm tán lá và dữ liệu nhập</small></div>
      <div class="kpi"><span>Khả năng thanh khoản</span><strong>TB-Cao</strong><small>cần đối chiếu thị trường gỗ</small></div>
      <div class="kpi"><span>Chu kỳ tài sản</span><strong>${x.cycle || '—'} năm</strong><small>Còn ${x.harvestCountdown} năm đến khai thác</small></div>
      <div class="kpi"><span>Năm khai thác</span><strong>${x.harvestYear}</strong><small>dự kiến theo ngày trồng</small></div>
      <div class="kpi"><span>Pháp lý</span><strong>Cần bổ sung</strong><small>không thay thế thẩm định</small></div>
    </div>
    <div class="notice">Các chỉ tiêu tín dụng là mô hình tham khảo để ngân hàng sàng lọc hồ sơ. Giá trị mặc định đồng bộ với kết quả ước tính P50 ngoài trang chủ; khi thẩm định thật vẫn cần bổ sung pháp lý, khảo sát thực địa và chứng thư định giá.</div>
  `);
};

const BankLocation = ({ c, f, x, pageNum }) => {
  return page(pageNum, 'VỊ TRÍ & RANH GIỚI', 'Bản đồ vị trí lô rừng', `
    <div class="map"><img src="${c.snapshots?.rgb || c.snapshot}"><div class="map-meta"><span>Tọa độ: ${esc(x.center)}</span><span>${Number.isFinite(x.area) ? `${x.area.toLocaleString('vi-VN')} ha` : '—'}</span></div></div>
    <table class="table">
      ${row('Tọa độ trung tâm', esc(x.center))}
      ${row('Diện tích', Number.isFinite(x.area) ? `${x.area.toLocaleString('vi-VN')} ha` : val())}
      ${row('Ranh giới', 'Tệp ranh giới (KML) trong ứng dụng')}
      ${row('Nguồn ảnh', 'Ảnh màu tự nhiên vệ tinh Sentinel-2')}
      ${row('Chu kỳ tài sản', esc(cycleSummary(x)))}
    </table>
    ${QrCodeBox({ c })}
  `);
};

const SatelliteEvidence = ({ c, f, x, pageNum }) => {
  return adaptiveVisualPages(
    pageNum,
    'PHÂN TÍCH VIỄN THÁM',
    'Các lớp phân tích viễn thám',
    visualItems(c, 'Dễ nhìn với người không chuyên'),
    x,
    `${satelliteLegend} Ảnh tổ hợp màu giả dùng đúng tổ hợp Sentinel-2 B08, B04, B03 để làm nổi bật tán thực vật; các chỉ số còn lại là lớp phân tích riêng, không thay thế bản đồ pháp lý.`
  );
};
SatelliteEvidence.pageSpan = ({ x }) => x.visualLayout === 'wide' ? 2 : 1;

const BankAssessment = ({ c, f, x, pageNum }) => {
  const treeCover = has(x.cover.tree_cover_pct) ? `${Number(x.cover.tree_cover_pct).toFixed(1)}%` : val();
  const summary = simpleHealthSummary(c, x);
  return page(pageNum, 'CHỈ SỐ & ĐÁNH GIÁ', 'Bảng chỉ số viễn thám', `
    <table class="table">
      ${row('Kết luận dễ hiểu', esc(summary.health))}
      ${row('Chỉ số thực vật (NDVI)', val(c.analysis.mean))}
      ${row('Chỉ số thực vật cải tiến (EVI)', val(c.analysis.evi))}
      ${row('Chỉ số diệp lục tố (GCI)', val(c.analysis.gci))}
      ${row('Chỉ số độ ẩm tán lá (NDMI)', val(c.analysis.ndmi))}
      ${row('Độ che phủ cây', treeCover)}
      ${row('Khuyến nghị kiểm tra', esc(summary.fieldCheck))}
    </table>
    <div class="callout"><span>ĐÁNH GIÁ CHUNG</span><strong>${esc(summary.health)}</strong></div>
    <div class="notice">${satelliteLegend} Các chỉ số trên giúp ngân hàng sàng lọc nhanh hiện trạng sinh trưởng; không thay thế kiểm kê thực địa hoặc chứng thư thẩm định giá.</div>
  `);
};

const ValuationSection = ({ c, f, x, pageNum }) => {
  const asset = has(x.net) ? Number(x.net) : null;
  const ltvPct = 60;
  const collateral = has(asset) ? asset * ltvPct / 100 : null;
  return page(pageNum, 'ƯỚC TÍNH TÀI SẢN', 'Bảng ước tính tài sản', `
    <table class="table">
      ${row('Diện tích', Number.isFinite(x.area) ? `${x.area.toLocaleString('vi-VN')} ha` : val())}
      ${row('Tuổi trung bình', num(f.age, ' năm'))}
      ${row('Sản lượng ước tính', has(f.p50Volume) ? `${Number(f.p50Volume).toLocaleString('vi-VN')} m³` : val())}
      ${row('Giá gỗ tham chiếu', has(f.woodPrice) ? `${money(f.woodPrice)} / m³` : val())}
      ${row('Giá trị cây đứng ước tính', money(f.p50Value))}
      ${row('Giá trị hiện tại ước tính', money(x.net))}
      ${row('Chu kỳ / khai thác', esc(cycleSummary(x)))}
      ${row('Ghi chú mô hình', esc(valuationNote(f, x)))}
    </table>
    <div class="callout"><span>GIÁ TRỊ BẢO ĐẢM ĐỀ XUẤT · Tỷ lệ cho vay (LTV) ${ltvPct}%</span><strong>${money(collateral)}</strong></div>
  `);
};

const CreditRiskSection = ({ c, f, x, pageNum }) => {
  const dryRisk = has(c.analysis.ndmi) && Number(c.analysis.ndmi) < -0.1 ? 'Trung bình' : 'Thấp';
  return page(pageNum, 'PHÂN TÍCH RỦI RO', 'Rủi ro tín dụng và tài sản', `
    <table class="table">
      ${row('Rủi ro pháp lý', 'Cần kiểm tra hồ sơ')}
      ${row('Rủi ro sinh trưởng / khô hạn', dryRisk)}
      ${row('Rủi ro thiên tai', 'Trung bình')}
      ${row('Rủi ro thị trường', 'Trung bình')}
      ${row('Rủi ro thanh khoản', 'Thấp - Trung bình')}
    </table>
    <div class="corp-grid two" style="margin-top:6mm">
      <div class="corp-card tint"><span>Rủi ro bắt buộc xử lý</span><strong>Pháp lý</strong><p>Kiểm tra giấy tờ đất, quyền khai thác, mốc giới và tranh chấp.</p></div>
      <div class="corp-card tint"><span>Rủi ro cần theo dõi</span><strong>Sinh trưởng</strong><p>Theo dõi vùng tán yếu, độ ẩm thấp và biến động sau thời tiết xấu.</p></div>
    </div>
    <div class="notice"><strong>Kết luận rủi ro:</strong> Lô rừng có thể dùng cho bước sàng lọc tín dụng nếu thông tin pháp lý và quyền sử dụng đất được xác minh đầy đủ.</div>
  `);
};

function cashflowBlock(f, asset) {
  let projection = [];
  try { projection = JSON.parse(f.projection || '[]'); } catch { projection = []; }
  if (!projection.length) return `<table class="table">${row('Dòng tiền khai thác ước tính', money(f.p50Value || asset))}</table>`;
  const maxStanding = Math.max(...projection.map(item => item.standingValue), 1);
  const maxCash = Math.max(...projection.map(item => Math.abs(item.cashFlow)), 1);
  const bar = (value, maxValue, item, label, extra = '') => {
    const height = Math.max(12, Math.min(88, Math.abs(value || 0) / maxValue * 88));
    const opacity = item.isFuture ? 0.38 : 1;
    const color = value < 0 ? '#d7a35b' : item.isHarvest ? '#2e7141' : '#73af65';
    return `<div class="bar" style="height:${height}%;opacity:${opacity};background:${color}"><b>${compactMoney(value)}</b><span>${label}${extra}</span></div>`;
  };
  const standingBars = projection.map(item => bar(item.standingValue, maxStanding, item, item.year, `<br>Tuổi ${item.age}`)).join('');
  const cashBars = projection.map(item => bar(item.cashFlow, maxCash, item, item.year, item.isHarvest ? '<br>Thu hoạch' : `<br>Tuổi ${item.age}`)).join('');
  const harvest = projection.at(-1);
  const totalCost = projection.slice(0, -1).reduce((sum, item) => sum + item.cost, 0);
  return `<h3>Giá trị cây ước tính</h3><div class="chart">${standingBars}</div><h3>Dòng tiền thật</h3><div class="chart">${cashBars}</div><table class="table">${row('Năm trồng', projection[0]?.year ?? val())}${row('Năm thu hoạch', harvest?.year ?? val())}${row('Số năm trong chu kỳ', `${projection.length} năm`)}${row('Tổng chi phí trước khai thác', money(-totalCost))}${row('Doanh thu khai thác ước tính', money(harvest?.standingValue))}${row('Dòng tiền ròng chu kỳ', money((harvest?.standingValue || 0) - totalCost))}${row('Giá trị hiện tại ròng (NPV) tham khảo', money(((harvest?.standingValue || 0) - totalCost) * 0.86))}${row('Tỷ suất hoàn vốn nội bộ (IRR) tham khảo', val(f.targetReturn || '18.7%'))}${row('Thời gian thu hồi vốn', val(f.payback || '5.2 năm'))}</table>`;
}

const CashFlowSection = ({ c, f, x, pageNum }) => {
  const asset = has(x.net) ? Number(x.net) : null;
  return page(pageNum, 'DÒNG TIỀN DỰ KIẾN', 'Dòng tiền dự kiến', cashflowBlock(f, asset));
};

const BankRecommendation = ({ c, f, x, pageNum }) => {
  const ltvPct = 60;
  return page(pageNum, 'KẾT LUẬN & KHUYẾN NGHỊ', 'Kết luận thẩm định', `
    <div class="callout"><span>KẾT LUẬN</span><strong>${Number.isFinite(x.score) && x.score >= 70 ? 'Có thể xem xét làm tài sản bảo đảm' : 'Cần bổ sung kiểm chứng trước khi cấp tín dụng'}</strong></div>
    <ul class="bullets">
      <li>Tỷ lệ cho vay đề xuất tối đa ${ltvPct}% giá trị tài sản rừng đã xác minh.</li>
      <li>Theo dõi định kỳ 3 tháng/lần bằng ảnh vệ tinh và cập nhật hồ sơ thực địa.</li>
      <li>Cập nhật giá gỗ, tuổi rừng và trữ lượng sau mỗi lần khảo sát.</li>
    </ul>
    <div class="corp-grid two" style="margin-top:6mm">
      <div class="corp-card tint"><span>Điều kiện bắt buộc</span><strong>Pháp lý</strong><p>Xác minh giấy tờ đất, quyền khai thác và tình trạng tranh chấp.</p></div>
      <div class="corp-card tint"><span>Tái thẩm định</span><strong>6 tháng</strong><p>Cập nhật ảnh vệ tinh, giá gỗ và kiểm kê thực địa.</p></div>
    </div>
    <div class="notice">Báo cáo này chỉ có giá trị tham khảo, không thay thế chứng thư thẩm định giá hoặc quyết định tín dụng của ngân hàng.</div>
  `);
};

const BankLegal = ({ c, f, x, pageNum }) => {
  return page(pageNum, 'TÀI LIỆU PHÁP LÝ', 'Hồ sơ pháp lý cần cung cấp', `
    <ul class="bullets">
      <li>Giấy chứng nhận quyền sử dụng đất hoặc hợp đồng thuê đất.</li>
      <li>Xác nhận ranh giới, mốc giới và diện tích.</li>
      <li>Hồ sơ trồng rừng hoặc kế hoạch trồng rừng.</li>
      <li>Biên bản kiểm kê thực địa và ảnh hiện trường.</li>
      <li>Thông tin chủ sở hữu / khách hàng vay.</li>
    </ul>
    <div class="notice">Danh sách này là danh mục đối chiếu phục vụ ngân hàng; trạng thái hợp lệ cần do bộ phận pháp lý xác nhận.</div>
  `);
};

const InvestmentDashboard = ({ c, f, x, pageNum }) => {
  const asset = x.net || x.valuation.p50_value_vnd;
  const npv = has(asset) ? Number(asset) * 0.86 : null;
  const healthLabel = Number.isFinite(x.score) && x.score >= 70 ? 'Tốt' : Number.isFinite(x.score) && x.score >= 55 ? 'Trung bình' : 'Cần xác minh';
  return corpPage(f, pageNum, 'Tóm tắt đầu tư', 'Tóm tắt đầu tư', `
    <div class="corp-grid two">
      <div class="corp-card tint"><span>Giá trị hiện tại ước tính</span><strong>${compactMoney(asset)}</strong><p>Giá trị tài sản theo P50 từ mô hình độ che phủ, chưa phải chứng thư định giá.</p></div>
      <div class="corp-card tint"><span>Điểm hấp dẫn</span><strong>${healthLabel}</strong><p>Dựa trên điểm sức khỏe và độ che phủ thực tế.</p></div>
    </div>
    ${corpRows([['Tỷ suất hoàn vốn nội bộ (IRR) dự kiến', val(f.targetReturn || '18.7%')], ['Thời gian thu hồi vốn', val(f.payback || '5.2 năm')], ['Giá trị hiện tại ròng (NPV) tham khảo', compactMoney(npv)], ['Nguồn ảnh', 'Ảnh vệ tinh Sentinel-2 + tệp ranh giới (KML)'], ['Ghi chú', 'Cần xác minh pháp lý và khảo sát thực địa trước quyết định đầu tư.']])}
    <div class="corp-note">${esc(valuationNote(f, x))}</div>
  `);
};

const ExecutiveSummary = ({ c, f, x, pageNum }) => {
  return corpPage(f, pageNum, 'Executive Summary', 'Executive Summary', `
    <div class="corp-grid">
      <div class="corp-card tint"><span>Điểm hấp dẫn</span><strong>Sức khỏe tốt</strong><p>Rừng còn ${x.harvestCountdown} năm đến khai thác trong chu kỳ ${x.cycle} năm, còn dư địa tăng giá trị nếu chăm sóc ổn định.</p></div>
      <div class="corp-card tint"><span>Rủi ro chính</span><strong>Pháp lý & giá gỗ</strong><p>Cần kiểm tra hồ sơ đất, mốc giới, khả năng khai thác và cập nhật giá gỗ địa phương.</p></div>
      <div class="corp-card tint"><span>Điều kiện đầu tư</span><strong>Thẩm định tiếp</strong><p>Chỉ nên ra quyết định sau kiểm kê thực địa, xác minh quyền sử dụng đất và xác nhận sản lượng.</p></div>
    </div>
    <div class="corp-note">
      <strong>Tóm tắt lý do đầu tư:</strong>
      <ul class="bullets">
        <li>Khu vực sinh thái phù hợp với chu kỳ sinh trưởng của Keo.</li>
        <li>Tỷ suất sinh lời nội bộ kỳ vọng ở mức cao.</li>
        <li>Khả năng thanh khoản gỗ tốt ở thị trường địa phương.</li>
        <li>Có dữ liệu viễn thám hỗ trợ đánh giá rủi ro và giám sát từ xa.</li>
        <li>Dòng tiền ổn định với rủi ro trong mức kiểm soát.</li>
      </ul>
    </div>
  `);
};

const InvestorForestProfile = ({ c, f, x, pageNum }) => {
  return corpPage(f, pageNum, 'Thông tin lô rừng', 'Thông tin lô rừng', 
    corpRows([['Tên lô / dự án', val(f.project || c.card.name)], ['Mã lô', val(f.code || c.card.plot?.id)], ['Chủ sở hữu', val(f.owner)], ['Địa chỉ', val(f.address)], ['Tỉnh · Huyện · Xã', val([f.province, f.district, f.commune].filter(Boolean).join(' · '))], ['Diện tích', Number.isFinite(x.area) ? `${x.area.toLocaleString('vi-VN')} ha` : val()], ['Loại cây', val(f.treeType)], ['Ngày trồng', val(f.plantingDate)], ['Tuổi cây', num(f.age, ' năm')], ['Chu kỳ khai thác', num(f.cycle, ' năm')], ['Diễn giải chu kỳ', esc(cycleSummary(x))]]) + `<div class="corp-note">Ví dụ: nếu lô đang là Keo gỗ 8 năm và tuổi cây hiện tại là 4 năm, báo cáo hiểu là còn khoảng 4 năm đến thời điểm khai thác chính. Các mục chưa có thông tin được giữ nguyên trạng thái thiếu dữ liệu để người dùng bổ sung.</div>`
  );
};

const InvestorSatelliteEvidence = ({ c, f, x, pageNum }) => {
  const shot = (src, label) => `<figure class="corp-visual">${src ? `<img src="${src}">` : '<div class="visual-empty">Không có dữ liệu</div>'}<span>${label}</span></figure>`;
  return corpPage(f, pageNum, 'Phân tích viễn thám', 'Các lớp viễn thám', `
    <div class="corp-visual-grid">
      ${shot(c.snapshots?.falseColor, 'Tổ hợp màu giả (False Color)')}
      ${shot(c.snapshots?.ndvi, 'Chỉ số thực vật (NDVI)')}
      ${shot(c.snapshots?.gci, 'Chỉ số diệp lục (GCI)')}
      ${shot(c.snapshots?.ndmi, 'Chỉ số độ ẩm (NDMI)')}
    </div>
    ${corpRows([['Chỉ số thực vật (NDVI)', val(c.analysis.mean)], ['Chỉ số thực vật cải tiến (EVI)', val(c.analysis.evi)], ['Chỉ số diệp lục tố (GCI)', val(c.analysis.gci)], ['Chỉ số độ ẩm tán lá (NDMI)', val(c.analysis.ndmi)]])}
    <div class="corp-note">${satelliteLegend}</div>
  `);
};

const InvestorHealth = ({ c, f, x, pageNum }) => {
  const summary = simpleHealthSummary(c, x);
  const treeCover = has(x.cover.tree_cover_pct) ? `${Number(x.cover.tree_cover_pct).toFixed(1)}%` : '—';
  return corpPage(f, pageNum, 'Sức khỏe & tăng trưởng', 'Sức khỏe & Tăng trưởng', `
    <div class="corp-meter" style="--s:${x.score || 0}">
      <div class="corp-ring"><b>${Number.isFinite(x.score) ? x.score : '—'}</b></div>
      <div>
        ${corpRows([['Điểm sức khỏe', Number.isFinite(x.score) ? `${x.score}/100` : val()], ['Đánh giá dễ hiểu', esc(summary.health)], ['Chỉ số thực vật trung bình', val(c.analysis.mean)], ['Độ che phủ cây', treeCover], ['Có cần kiểm tra ngay không?', esc(summary.fieldCheck)], ['Việc nên làm tiếp theo', esc(summary.action)]])}
      </div>
    </div>
  `);
};

const FinancialProjection = ({ c, f, x, pageNum }) => {
  return corpPage(f, pageNum, 'Ước tính sản lượng & giá trị', 'Ước tính sản lượng & Giá trị', 
    corpRows([['Diện tích có cây', has(x.cover.tree_area_ha) ? `${Number(x.cover.tree_area_ha).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ha` : val()], ['Năng suất ước tính', has(f.yieldPerHa) ? `${Number(f.yieldPerHa).toLocaleString('vi-VN')} m³/ha` : val()], ['Sản lượng ước tính', has(f.p50Volume) ? `${Number(f.p50Volume).toLocaleString('vi-VN')} m³` : val()], ['Giá gỗ tham chiếu', has(f.woodPrice) ? `${money(f.woodPrice)} / m³` : val()], ['Giá trị cây đứng ước tính', money(f.p50Value)], ['Giá trị hiện tại ước tính', money(x.net)], ['Chu kỳ / khai thác', esc(cycleSummary(x))]]) + `<div class="corp-note">${esc(valuationNote(f, x))}</div>`
  );
};

const InvestorCashFlow = ({ c, f, x, pageNum }) => {
  const asset = x.net || x.valuation.p50_value_vnd;
  const npv = has(asset) ? Number(asset) * 0.86 : null;
  return corpPage(f, pageNum, 'Hiệu quả đầu tư', 'Hiệu quả & Dòng tiền', `
    <div class="corp-grid">
      <div class="corp-card tint"><span>Giá trị hiện tại ròng (NPV)</span><strong>${compactMoney(npv)}</strong></div>
      <div class="corp-card tint"><span>Tỷ suất hoàn vốn nội bộ (IRR)</span><strong>${val(f.targetReturn || '18.7%')}</strong></div>
      <div class="corp-card tint"><span>Thời gian thu hồi vốn</span><strong>${val(f.payback || '5.2 năm')}</strong></div>
    </div>
    ${cashflowBlock(f, asset)}
  `);
};

const InvestmentRisk = ({ c, f, x, pageNum }) => {
  const dryRisk = has(c.analysis.ndmi) && Number(c.analysis.ndmi) < -0.1 ? 'Trung bình' : 'Thấp';
  return corpPage(f, pageNum, 'Phân tích rủi ro & cơ hội', 'Rủi ro & Cơ hội', `
    <div class="corp-card">
      <div class="risk-row"><span>Rủi ro thị trường</span><b>Trung bình</b></div>
      <div class="risk-row"><span>Rủi ro thiên tai</span><b>${dryRisk}</b></div>
      <div class="risk-row"><span>Rủi ro pháp lý</span><b>Cần kiểm tra</b></div>
      <div class="risk-row"><span>Rủi ro thanh khoản</span><b>Thấp - TB</b></div>
      <div class="risk-row"><span>Cơ hội carbon / tăng trưởng</span><b>Có</b></div>
    </div>
    <div class="corp-grid three" style="margin-top:6mm">
      <div class="corp-card tint"><span>Điểm cần chắc chắn</span><strong>Pháp lý</strong><p>Không đầu tư nếu chưa rõ quyền đất, quyền khai thác và mốc giới.</p></div>
      <div class="corp-card tint"><span>Điểm cần theo dõi</span><strong>Giá gỗ</strong><p>Cập nhật giá thu mua địa phương trước khi chốt phương án tài chính.</p></div>
      <div class="corp-card tint"><span>Điểm tạo giá trị</span><strong>Chăm sóc</strong><p>Theo dõi ảnh vệ tinh định kỳ để giảm chi phí kiểm tra toàn bộ lô.</p></div>
    </div>
    <div class="corp-note">Rủi ro chỉ là phân loại định hướng vì chưa có bộ hồ sơ pháp lý đầy đủ, kiểm kê thực địa và chuỗi ảnh đa thời điểm.</div>
  `);
};

const InvestmentRecommendation = ({ c, f, x, pageNum }) => {
  return corpPage(f, pageNum, 'Kế hoạch khai thác', 'Kế hoạch khai thác', `
    <div class="timeline">
      <div><b>Năm 1-3</b><span>Chăm sóc, kiểm kê, theo dõi stress</span></div>
      <div><b>Năm 4-7</b><span>Tỉa thưa, cập nhật định giá</span></div>
      <div><b>Năm 8+</b><span>Khai thác chính / gỗ lớn</span></div>
    </div>
    <div class="corp-grid two" style="margin-top:7mm">
      <div>${corpRows([['Sản phẩm đầu ra', 'Gỗ nguyên liệu hoặc gỗ lớn tùy chu kỳ'], ['Dữ liệu cần bổ sung', 'Ô mẫu, tuổi rừng, mật độ, hồ sơ pháp lý'], ['Tần suất cập nhật', '3 tháng/lần hoặc sau biến động lớn']])}</div>
      <div class="corp-card tint"><h3>Phụ lục truy cập</h3>${QrCodeBox({ c })}</div>
    </div>
  `);
};

const Appendix = ({ c, f, x, pageNum }) => {
  return corpPage(f, pageNum, 'Phụ lục', 'Phạm vi & Giới hạn', `
    ${QrCodeBox({ c })}
    <ul class="bullets">
      <li>Vệ tinh: Sentinel-2 RGB, NDVI, GCI, NDMI.</li>
      <li>Giới hạn: độ phân giải Sentinel-2 10-20 m, ảnh hưởng của mây, sai số ranh giới.</li>
      <li>Báo cáo này hỗ trợ quyết định nội bộ, không dùng làm chứng thư thẩm định giá.</li>
    </ul>
  `);
};

// --- RENDER ENGINE & CONFIGS ---

const ForestReportConfig = [
  CoverPage,
  ExecutiveDashboard,
  ForestProfile,
  SatelliteOverview,
  HealthAssessment,
  AssetEstimation,
  OwnerRecommendation,
  Disclaimer
];

const BankReportConfig = [
  CoverPage,
  CollateralDashboard,
  ForestProfile,
  BankLocation,
  SatelliteEvidence,
  BankAssessment,
  ValuationSection,
  CreditRiskSection,
  CashFlowSection,
  BankRecommendation,
  BankLegal
];

const InvestorReportConfig = [
  CoverPage,
  InvestmentDashboard,
  ExecutiveSummary,
  InvestorForestProfile,
  InvestorSatelliteEvidence,
  InvestorHealth,
  FinancialProjection,
  InvestorCashFlow,
  InvestmentRisk,
  InvestmentRecommendation,
  Appendix
];

function renderReport(components, props, title) {
  let pageNum = 1;
  const body = components.map((Component) => {
    const html = Component({ ...props, pageNum });
    pageNum += typeof Component.pageSpan === 'function' ? Component.pageSpan(props) : 1;
    return html;
  }).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${title}</title>${css}</head><body>${body}</body></html>`;
}

function build(context, form) {
  const prepared = filledForm(context, form);
  const x = facts(context, prepared);
  const props = { c: context, f: prepared, x };
  
  if (prepared.type === 'health') {
    props.title = 'BÁO CÁO SỨC KHỎE RỪNG';
    props.highlight = '';
    return renderReport(ForestReportConfig, props, REPORTS.health.title);
  }
  if (prepared.type === 'bank') {
    props.title = 'THẨM ĐỊNH TÀI SẢN RỪNG CHO NGÂN HÀNG';
    const asset = has(x.net) ? Number(x.net) : null;
    props.highlight = money(asset);
    return renderReport(BankReportConfig, props, REPORTS.bank.title);
  }
  if (prepared.type === 'investor') {
    props.title = 'BÁO CÁO ĐÁNH GIÁ ĐẦU TƯ RỪNG';
    const asset = x.net || x.valuation.p50_value_vnd;
    props.highlight = compactMoney(asset);
    return renderReport(InvestorReportConfig, props, REPORTS.investor.title);
  }
  // Fallback basic
  props.title = 'BÁO CÁO SỨC KHỎE RỪNG';
  props.highlight = '';
  return renderReport(ForestReportConfig, props, REPORTS.health.title);
}

export function openReportBuilder(context, initialType = 'health') {
  document.getElementById('pdfReportPreview')?.remove();
  const root = document.createElement('div');
  root.id = 'pdfReportPreview';
  root.className = 'pdf-report-preview';
  document.body.appendChild(root);

  const opt = context.coverOptions || {};
  const modelLabels = {
    paper4: 'Keo giấy 4 năm',
    paper5: 'Keo giấy 5 năm',
    timber8: 'Keo gỗ 8 năm',
    large10: 'Keo gỗ lớn 10 năm',
  };
  const defaults = {
    treeType: opt.model ? modelLabels[opt.model] || 'Keo' : 'Keo (cần xác nhận)',
    age: opt.age != null ? String(opt.age) : '',
    price: opt.priceVndM3 != null ? String(opt.priceVndM3) : '',
  };
  const demo = filledForm(context, { treeType: defaults.treeType, age: defaults.age, woodPrice: defaults.price });
  const checked = (type) => initialType === type ? 'checked' : '';

  const formView = () => {
    root.innerHTML = `<div class="report-setup-shell"><div class="report-setup-head"><div><span>REPORT BUILDER</span><h2>Tạo báo cáo tài sản rừng</h2><p>Chọn mẫu và bổ sung dữ liệu không có trong KML.</p></div><button data-close>×</button></div><form class="report-setup-form"><section class="report-type-picker"><label><input type="radio" name="type" value="health" ${checked('health')}><span><strong>Báo cáo sức khỏe</strong><small>Chỉ số phổ, sức khỏe, khuyến nghị</small></span></label><label><input type="radio" name="type" value="bank" ${checked('bank')}><span><strong>Báo cáo cho ngân hàng</strong><small>11 trang · thẩm định, pháp lý, rủi ro</small></span></label><label><input type="radio" name="type" value="investor" ${checked('investor')}><span><strong>Báo cáo cho nhà đầu tư</strong><small>11 trang A4 · corporate print</small></span></label></section><div class="report-form-grid">${field('owner', 'Tên công ty khách hàng / chủ sở hữu')}${field('project', 'Tên dự án / tên lô', context.card.name)}${field('code', 'Mã hóa đơn / mã lô', context.card.plot?.id)}${field('date', 'Ngày lập', new Date().toISOString().slice(0, 10), 'date')}${field('address', 'Địa chỉ')}${field('province', 'Tỉnh')}${field('district', 'Huyện')}${field('commune', 'Xã')}${field('treeType', 'Loại cây', demo.treeType)}${field('plantingDate', 'Ngày trồng', demo.plantingDate, 'date')}${field('age', 'Tuổi cây (năm)', demo.age, 'number')}${field('cycle', 'Chu kỳ khai thác (năm)', demo.cycle, 'number')}</div><div class="report-form-section"><h3>Giả định định giá</h3><p>Để trống nếu chưa được xác minh. Báo cáo vẫn giữ nguyên trường và hiển thị thiếu dữ liệu.</p><div class="report-form-grid">${field('volume', 'Sản lượng dự kiến (m³)', demo.volume, 'number')}${field('woodPrice', 'Giá gỗ (VNĐ/m³)', demo.woodPrice, 'number')}${field('assetValue', 'Giá trị hiện tại (VNĐ)', demo.assetValue, 'number')}${field('targetReturn', 'Tỷ suất kỳ vọng', demo.targetReturn)}${field('payback', 'Thời gian thu hồi vốn', demo.payback)}</div></div><div class="report-form-actions"><button type="button" data-close>Hủy</button><button class="primary">Tạo bản xem trước</button></div></form></div>`;

    root.querySelector('input[name="code"]')?.closest('label')?.remove();
    root.querySelectorAll('[data-close]').forEach((button) => {
      button.onclick = () => root.remove();
    });
    root.querySelector('form').onsubmit = (event) => {
      event.preventDefault();
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const report = REPORTS[form.type] || REPORTS.health;
      const html = build(context, form);
      root.innerHTML = `<div class="pdf-preview-toolbar"><div><strong>${report.title}</strong><span>A4 dọc</span></div><div class="pdf-preview-actions"><button data-back>Sửa thông tin</button><button data-close>Đóng</button><div style="position: relative; display: inline-block;"><button class="primary" type="button" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'">In / Lưu PDF ▾</button><div style="display: none; position: absolute; right: 0; top: 100%; margin-top: 4px; background: white; border: 1px solid #d4ded6; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 10; min-width: 190px; overflow: hidden;"><button data-print="save-current" style="display: block; width: 100%; text-align: left; padding: 8px 12px; background: none; border: none; font-size: 13px; color: #14251a; cursor: pointer; border-bottom: 1px solid #f2f6f3;" onmouseover="this.style.background='#f2f6f3'" onmouseout="this.style.background='none'">Lưu PDF bản này</button><button data-print="save-all" style="display: block; width: 100%; text-align: left; padding: 8px 12px; background: none; border: none; font-size: 13px; color: #14251a; cursor: pointer; border-bottom: 1px solid #f2f6f3;" onmouseover="this.style.background='#f2f6f3'" onmouseout="this.style.background='none'">Lưu PDF 3 bản</button><div style="padding: 7px 12px; color: #6e7e74; font-size: 11px; line-height: 1.35; border-bottom: 1px solid #d4ded6;">Trong hộp thoại, chọn Save as PDF.</div><button data-print="current" style="display: block; width: 100%; text-align: left; padding: 8px 12px; background: none; border: none; font-size: 13px; color: #14251a; cursor: pointer; border-bottom: 1px solid #f2f6f3;" onmouseover="this.style.background='#f2f6f3'" onmouseout="this.style.background='none'">In bản này</button><button data-print="all" style="display: block; width: 100%; text-align: left; padding: 8px 12px; background: none; border: none; font-size: 13px; color: #14251a; cursor: pointer;" onmouseover="this.style.background='#f2f6f3'" onmouseout="this.style.background='none'">In 3 bản</button></div></div></div></div><iframe title="Xem trước PDF"></iframe>`;
      const frame = root.querySelector('iframe');
      frame.srcdoc = html;
      root.querySelector('[data-back]').onclick = formView;
      root.querySelector('[data-close]').onclick = () => root.remove();
      
      const printReport = (htmlContent, fileName) => {
        const printWindow = document.createElement('iframe');
        printWindow.style.position = 'absolute';
        printWindow.style.top = '-9999px';
        document.body.appendChild(printWindow);
        printWindow.contentDocument.open();
        printWindow.contentDocument.write(htmlContent);
        printWindow.contentDocument.title = fileName;
        printWindow.contentDocument.close();
        
        printWindow.contentWindow.focus();
        setTimeout(() => {
          printWindow.contentWindow.print();
          setTimeout(() => printWindow.remove(), 1000);
        }, 500);
      };

      const printCurrentReport = () => {
        const projectName = context.card.name || 'Bao_cao';
        const fileName = `${report.title} - ${projectName}`;
        printReport(frame.srcdoc, fileName);
      };

      const printAllReports = () => {
        const h1 = build(context, { ...form, type: 'health' });
        const h2 = build(context, { ...form, type: 'bank' });
        const h3 = build(context, { ...form, type: 'investor' });
        
        const extractBody = (h) => {
          const match = h.match(/<body>([\s\S]*?)<\/body>/i);
          return match ? match[1] : '';
        };
        
        const combinedBody = extractBody(h1) + extractBody(h2) + extractBody(h3);
        const combinedHtml = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo Cáo Tổng Hợp</title>${css}</head><body>${combinedBody}</body></html>`;
        
        const projectName = context.card.name || 'Lam_Kinh';
        const fileName = `Bao_cao_tong_hop - ${projectName}`;
        printReport(combinedHtml, fileName);
      };

      root.querySelector('[data-print="save-current"]').onclick = printCurrentReport;
      root.querySelector('[data-print="save-all"]').onclick = printAllReports;
      root.querySelector('[data-print="current"]').onclick = printCurrentReport;
      root.querySelector('[data-print="all"]').onclick = printAllReports;
    };
  };

  formView();
}
