import jpeg from "jpeg-js";
import { PNG } from "pngjs";
// Decode only two explicit raster formats. No SVG, HEIF, external resource loaders, or native codecs.
export function safePhoto(raw: Buffer): Buffer {
  let decoded: { width: number; height: number; data: Uint8Array };
  if (
    raw.length >= 33 &&
    raw.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    const w = raw.readUInt32BE(16),
      h = raw.readUInt32BE(20);
    if (
      raw.toString("ascii", 12, 16) !== "IHDR" ||
      !w ||
      !h ||
      w * h > 16000000 ||
      raw[24] !== 8 ||
      raw[28] !== 0
    )
      throw Error("Use a non-interlaced, 8-bit PNG up to 16 megapixels");
    decoded = PNG.sync.read(raw, { checkCRC: true });
  } else if (raw[0] === 255 && raw[1] === 216 && raw[2] === 255) {
    decoded = jpeg.decode(raw, {
      useTArray: true,
      maxResolutionInMP: 16,
      maxMemoryUsageInMB: 128,
      tolerantDecoding: false,
    });
  } else throw Error("Choose a JPEG or PNG photo");
  const { width, height, data } = decoded,
    scale = Math.min(1, 1200 / width, 1600 / height),
    w = Math.max(1, Math.round(width * scale)),
    h = Math.max(1, Math.round(height * scale));
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const source =
          (Math.min(height - 1, Math.floor(y / scale)) * width +
            Math.min(width - 1, Math.floor(x / scale))) *
          4,
        target = (y * w + x) * 4;
      const alpha = data[source + 3] / 255;
      for (let c = 0; c < 3; c++)
        rgba[target + c] = Math.round(
          data[source + c] * alpha + 255 * (1 - alpha),
        );
      rgba[target + 3] = 255;
    }
  return jpeg.encode({ width: w, height: h, data: rgba }, 78).data;
}
