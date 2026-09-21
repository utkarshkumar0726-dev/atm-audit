import { downloadPhoto, openPhotoInNewTab } from '../utils/photo';

export default function PhotoLightbox({ src, onClose }) {
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="Close">
        &times;
      </button>

      <img src={src} alt="Full size" className="lightbox-image" onClick={(e) => e.stopPropagation()} />

      <div className="lightbox-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn-secondary" onClick={() => openPhotoInNewTab(src)}>
          Open in New Tab
        </button>
        <button type="button" className="btn-secondary" onClick={() => downloadPhoto(src)}>
          Download
        </button>
      </div>
    </div>
  );
}
