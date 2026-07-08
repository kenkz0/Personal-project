export default function Footer({ cameraCoords }) {
  return (
    <footer className="map-footer">
      <span><i className="pulse"></i> KML ĐÃ KẾT NỐI</span>
      <span id="cameraCoords">{cameraCoords}</span>
      <span>Nền tham chiếu Esri/Maxar · Sentinel-2 ESA/Microsoft Planetary Computer · CesiumJS</span>
    </footer>
  );
}
