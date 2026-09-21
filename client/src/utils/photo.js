function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+);base64/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Data URLs can't be opened as a top-level tab in modern browsers (blocked for
// phishing prevention), so we convert to a blob: URL first, which can.
export function openPhotoInNewTab(dataUrl) {
  const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function downloadPhoto(dataUrl, filename = `photo-${Date.now()}.jpg`) {
  const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
