import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { safePhoto } from "../netlify/lib/image";
describe("Private image sanitisation", () => {
  it("re-encodes raster images to JPEG without source metadata", () => {
    const png = new PNG({ width: 20, height: 20 });
    png.data.fill(200);
    const result = safePhoto(PNG.sync.write(png));
    expect([...result.subarray(0, 2)]).toEqual([255, 216]);
    expect(result.includes(Buffer.from("Exif"))).toBe(false);
  });
  it("rejects SVG and invalid buffers before decoding", () => {
    expect(() =>
      safePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toThrow();
    expect(() => safePhoto(Buffer.from([0, 1]))).toThrow();
  });
  it("rejects oversized PNG dimensions before allocation", () => {
    const png = new PNG({ width: 10, height: 10 });
    const raw = PNG.sync.write(png);
    raw.writeUInt32BE(10000000, 16);
    expect(() => safePhoto(raw)).toThrow("16 megapixels");
  });
});
