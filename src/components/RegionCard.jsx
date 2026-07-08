export default function RegionCard({ card, onClose }) {
  return (
    <div className={`region-card ${card.open ? 'open' : ''}`} id="regionCard" aria-live="polite">
      <button id="closeCard" aria-label="Đóng" onClick={onClose}>×</button>
      <span className="card-type" id="cardType">{card.type}</span>
      <h2 id="cardName">{card.name}</h2>
      <p id="cardDescription">{card.description}</p>
      <div className="card-metrics">
        <div><strong id="cardArea">{card.area}</strong><small>hecta</small></div>
        <div><strong id="cardCarbon">{card.carbon}</strong><small>cây 3D</small></div>
      </div>
    </div>
  );
}
