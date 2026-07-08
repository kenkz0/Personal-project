export default function LoadingScreen({ loading, loadingError }) {
  if (!loading) return null;
  return (
    <div className={`loading ${loadingError ? 'error' : ''}`} id="loadingScreen">
      {loadingError ? (
        <div>
          <strong>Không thể đọc KML</strong>
          <small>{loadingError}<br />Hãy chạy ứng dụng qua HTTP server.</small>
        </div>
      ) : (
        <>
          <span className="loading-tree">♠</span>
          <strong>Đang gieo rừng số...</strong>
        </>
      )}
    </div>
  );
}
