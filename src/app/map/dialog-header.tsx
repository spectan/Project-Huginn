export function DialogHeader({ closeLabel, onClose, title }: { closeLabel: string; onClose(): void; title: string }) {
  return (
    <div className="map-account-panel-header">
      <strong>{title}</strong>
      <button aria-label={closeLabel} className="map-account-close" onClick={onClose} type="button">
        x
      </button>
    </div>
  );
}
