function dataUrlToBlob(dataUrl) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const header = parts[0];
    const base64 = parts[1];
    const mime = header.match(/data:([^;]+);base64/)?.[1] || 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (err) {
    console.error('dataUrlToBlob conversion failed:', err);
    return null;
  }
}

// Data URLs can't be opened directly in modern browsers (security restriction),
// so convert to blob URL first.
export function openPhotoInNewTab(dataUrl) {
  try {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) {
      window.open(dataUrl, '_blank');
      return;
    }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    console.error('Failed to open photo:', err);
  }
}

export function downloadPhoto(dataUrl, filename = `atm-audit-photo-${Date.now()}.jpg`) {
  try {
    const blob = dataUrlToBlob(dataUrl);
    const url = blob ? URL.createObjectURL(blob) : dataUrl;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (blob) setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    console.error('Failed to download photo:', err);
  }
}
