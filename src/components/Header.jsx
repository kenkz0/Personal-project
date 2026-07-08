import { useEffect, useRef, useState } from 'react';

const REPORT_OPTIONS = [
  { type: 'health', label: 'Báo cáo sức khỏe', description: 'Chỉ số phổ, sức khỏe rừng, khuyến nghị' },
  { type: 'bank', label: 'Báo cáo cho ngân hàng', description: 'Thẩm định tài sản, rủi ro, giá trị đảm bảo' },
  { type: 'investor', label: 'Báo cáo cho nhà đầu tư', description: '10 trang A4, sinh lời, ROI, kế hoạch khai thác' },
];

export default function Header({ onExport, isExporting, onFlyToAll, onTogglePanel }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  const chooseReport = (type) => {
    setOpen(false);
    onExport?.(type);
  };

  return (
    <header className="topbar">
      <div className="brand" aria-label="Lâm Kính">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <path d="M24 5C14 12 8 21 9 31c1 8 8 13 15 12 9-1 15-8 15-17C39 17 32 10 24 5Z" />
            <path className="vein" d="M24 36V15m0 13-8-6m8 9 8-7" />
          </svg>
        </span>
        <span>
          <strong>LÂM KÍNH</strong>
          <small>VIETNAM FOREST 3D</small>
        </span>
      </div>
      <div className="top-actions">
        <div className="report-export-menu" ref={menuRef}>
          <button
            className="icon-button report-export-button"
            type="button"
            onClick={() => setOpen((value) => !value)}
            disabled={isExporting}
            title="Xuất báo cáo PDF"
            aria-label="Xuất báo cáo PDF"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" /></svg>
            <span>{isExporting ? 'Đang tạo...' : 'Xuất báo cáo PDF'}</span>
            <svg className="chevron" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {open && (
            <div className="report-dropdown" role="menu">
              {REPORT_OPTIONS.map((option) => (
                <button type="button" role="menuitem" key={option.type} onClick={() => chooseReport(option.type)}>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="icon-button" id="resetView" onClick={onFlyToAll} title="Về góc nhìn Việt Nam" aria-label="Về góc nhìn Việt Nam">
          <svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7M5 10v10h14V10M9 20v-6h6v6" /></svg>
        </button>
        <button className="icon-button" id="togglePanel" onClick={onTogglePanel} title="Ẩn/hiện bảng điều khiển" aria-label="Ẩn hiện bảng điều khiển">
          <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>
    </header>
  );
}
