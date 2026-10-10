/**
 * Server-side parsing of client-uploaded image data URLs (browser-compressed
 * screenshots/photos). Shared by the scan and meal server actions so validation
 * stays identical in both paths.
 */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** PDFs can't be compressed client-side; allow a bit more headroom (fits the 6MB action limit with base64 overhead) */
const MAX_PDF_BYTES = 4 * 1024 * 1024;

const IMAGE_DATA_URL_RE = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i;
const PDF_DATA_URL_RE = /^data:(application\/pdf);base64,(.+)$/i;

type ParsedImage = {
  mime: string;
  buffer: Buffer;
  /** base64 payload as received (reused for AI calls without re-encoding) */
  base64: string;
};

export function parseImageDataUrl(dataUrl: string): ParsedImage | null {
  const m = IMAGE_DATA_URL_RE.exec(dataUrl.trim());
  if (m) {
    const buffer = Buffer.from(m[2], "base64");
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;
    // "image/jpg" is not a real media type; normalize to image/jpeg
    const mime = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
    return { mime, buffer, base64: m[2] };
  }
  const pdf = PDF_DATA_URL_RE.exec(dataUrl.trim());
  if (pdf) {
    const buffer = Buffer.from(pdf[2], "base64");
    if (buffer.byteLength > MAX_PDF_BYTES) return null;
    return { mime: "application/pdf", buffer, base64: pdf[2] };
  }
  return null;
}
