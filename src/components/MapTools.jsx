export default function MapTools({ is3D, onToggle2D, onZoomIn, onZoomOut }) {
  return (
    <div className="map-tools" aria-label="Công cụ bản đồ">
      <button id="zoomIn" aria-label="Phóng to" onClick={onZoomIn}>+</button>
      <button id="zoomOut" aria-label="Thu nhỏ" onClick={onZoomOut}>−</button>
      <span></span>
      <button id="toggle2D" aria-label="Chuyển chế độ 2D/3D" onClick={onToggle2D}>
        <b>{is3D ? "3D" : "2D"}</b>
      </button>
    </div>
  );
}
