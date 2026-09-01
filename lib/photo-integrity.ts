/**
 * Client-side photo integrity capture — runs on the ORIGINAL file before
 * resize-image.ts re-encodes it (which strips EXIF and changes bytes).
 *
 *   sha256   hex digest of the original bytes (chain of custody)
 *   lat/lng  EXIF GPS position, decimal degrees
 *   takenAt  EXIF DateTimeOriginal as ISO string
 *
 * The EXIF reader is a minimal JPEG APP1/TIFF walker — enough for the
 * three GPS/date tags we need, no library. Anything unexpected returns
 * nulls; integrity capture must never block an upload.
 */

export type PhotoIntegrity = {
  sha256: string | null;
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
};

export async function extractPhotoIntegrity(file: File): Promise<PhotoIntegrity> {
  const out: PhotoIntegrity = { sha256: null, lat: null, lng: null, takenAt: null };
  try {
    const buf = await file.arrayBuffer();
    try {
      const digest = await crypto.subtle.digest("SHA-256", buf);
      out.sha256 = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      /* subtle unavailable (http origin) — hash stays null */
    }
    const exif = readExif(new DataView(buf));
    out.lat = exif.lat;
    out.lng = exif.lng;
    out.takenAt = exif.takenAt;
  } catch (err) {
    console.warn("[photo-integrity] capture failed:", err);
  }
  return out;
}

function readExif(view: DataView): { lat: number | null; lng: number | null; takenAt: string | null } {
  const none = { lat: null, lng: null, takenAt: null };
  // JPEG magic
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return none;

  // Walk JPEG segments looking for APP1/Exif.
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if ((marker & 0xff00) !== 0xff00 || size < 2) return none;
    if (marker === 0xffe1) {
      // "Exif\0\0"
      if (
        view.getUint32(offset + 4) === 0x45786966 &&
        view.getUint16(offset + 8) === 0x0000
      ) {
        return readTiff(view, offset + 10);
      }
    }
    offset += 2 + size;
  }
  return none;
}

function readTiff(view: DataView, tiffStart: number): { lat: number | null; lng: number | null; takenAt: string | null } {
  const none = { lat: null, lng: null, takenAt: null };
  const byteOrder = view.getUint16(tiffStart);
  const little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) return none;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);

  if (u16(tiffStart + 2) !== 0x002a) return none;
  const ifd0 = tiffStart + u32(tiffStart + 4);

  let gpsIfd: number | null = null;
  let exifIfd: number | null = null;

  const walk = (
    ifd: number,
    onTag: (tag: number, type: number, count: number, valueOffset: number) => void,
  ) => {
    if (ifd + 2 > view.byteLength) return;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > view.byteLength) return;
      onTag(u16(e), u16(e + 2), u32(e + 4), e + 8);
    }
  };

  walk(ifd0, (tag, _type, _count, vo) => {
    if (tag === 0x8825) gpsIfd = tiffStart + u32(vo);
    if (tag === 0x8769) exifIfd = tiffStart + u32(vo);
  });

  // A tag value larger than 4 bytes is stored at an offset; smaller ones
  // are inline in the entry's value slot.
  const rational = (o: number) => {
    const num = u32(o);
    const den = u32(o + 4);
    return den === 0 ? 0 : num / den;
  };
  const ascii = (vo: number, count: number) => {
    const at = count > 4 ? tiffStart + u32(vo) : vo;
    let s = "";
    for (let i = 0; i < count - 1 && at + i < view.byteLength; i++) {
      s += String.fromCharCode(view.getUint8(at + i));
    }
    return s;
  };

  let lat: number | null = null;
  let lng: number | null = null;
  let latRef = "N";
  let lngRef = "E";
  let takenAt: string | null = null;

  if (gpsIfd !== null) {
    walk(gpsIfd, (tag, _type, count, vo) => {
      if (tag === 0x0001) latRef = ascii(vo, count) || "N";
      if (tag === 0x0003) lngRef = ascii(vo, count) || "E";
      if (tag === 0x0002 || tag === 0x0004) {
        const at = tiffStart + u32(vo); // 3 rationals never fit inline
        if (at + 24 <= view.byteLength) {
          const deg = rational(at);
          const min = rational(at + 8);
          const sec = rational(at + 16);
          const dd = deg + min / 60 + sec / 3600;
          if (tag === 0x0002) lat = dd;
          else lng = dd;
        }
      }
    });
  }
  if (lat !== null && latRef.toUpperCase().startsWith("S")) lat = -lat;
  if (lng !== null && lngRef.toUpperCase().startsWith("W")) lng = -lng;

  if (exifIfd !== null) {
    walk(exifIfd, (tag, _type, count, vo) => {
      if (tag === 0x9003 /* DateTimeOriginal */) {
        // "YYYY:MM:DD HH:MM:SS" — local camera time, no zone info.
        const raw = ascii(vo, count);
        const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
        if (m) takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
      }
    });
  }

  return { lat, lng, takenAt };
}
