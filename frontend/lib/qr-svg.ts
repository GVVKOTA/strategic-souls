/**
 * Strategic Souls Post-X5.1 — [28] Pure Zero-Dependency QR Code SVG Generator.
 * ISO/IEC 18004 Byte Mode, Error Correction Level L, Versions 1..6 (up to 134 UTF-8 bytes).
 * Zero external CDNs, zero third-party requests, deterministic output.
 */

const VERSION_SPECS: readonly {
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  blocks: number;
  align: readonly number[];
}[] = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, blocks: 1, align: [] },
  { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, blocks: 1, align: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, blocks: 1, align: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, blocks: 1, align: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, blocks: 1, align: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecCodewords: 18, blocks: 2, align: [6, 34] },
];

// GF(256) with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeEc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

function encodeDataBits(bytes: Uint8Array, totalDataCodewords: number): Uint8Array {
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  // Byte mode indicator (0100) + 8-bit character count (Versions 1..9)
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);

  const capacityBits = totalDataCodewords * 8;
  const terminatorLen = Math.min(4, capacityBits - bits.length);
  pushBits(0, terminatorLen);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(totalDataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let val = 0;
    for (let j = 0; j < 8; j++) val = (val << 1) | bits[i * 8 + j];
    codewords[i] = val;
  }
  const padBytes = [0xec, 0x11];
  let idx = bits.length / 8;
  let padIdx = 0;
  while (idx < totalDataCodewords) {
    codewords[idx++] = padBytes[padIdx % 2];
    padIdx++;
  }
  return codewords;
}

function interleaveBlocks(
  data: Uint8Array,
  blocks: number,
  ecPerBlock: number,
): Uint8Array {
  const blockLen = Math.floor(data.length / blocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let b = 0; b < blocks; b++) {
    const slice = data.slice(b * blockLen, (b + 1) * blockLen);
    dataBlocks.push(slice);
    ecBlocks.push(rsComputeEc(slice, ecPerBlock));
  }
  const result: number[] = [];
  for (let i = 0; i < blockLen; i++) {
    for (let b = 0; b < blocks; b++) result.push(dataBlocks[b][i]);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < blocks; b++) result.push(ecBlocks[b][i]);
  }
  return new Uint8Array(result);
}

// Precomputed BCH(15,5) format strings for ECC-L (01) and masks 0..7, XORed with 0x5412
const FORMAT_BITS_L = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
];

export type QrMatrix = {
  size: number;
  version: number;
  modules: boolean[][];
};

export function generateQrMatrix(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSION_SPECS.find((s) => bytes.length + 2 <= s.dataCodewords);
  if (!spec) {
    throw new Error("QR payload exceeds supported length (max 134 bytes).");
  }

  const size = spec.size;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );
  const isFunc: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r][c] = dark;
    isFunc[r][c] = true;
  };

  // Finder patterns + separators
  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const dark =
          inOuter &&
          (dr === 0 ||
            dr === 6 ||
            dc === 0 ||
            dc === 6 ||
            (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFunc(r, c, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns (Versions 2..6)
  for (const r of spec.align) {
    for (const c of spec.align) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(r + dr, c + dc, dist === 0 || dist === 2);
        }
      }
    }
  }

  // Reserve format info cells & dark module
  for (let i = 0; i <= 8; i++) {
    if (!isFunc[8][i]) isFunc[8][i] = true;
    if (!isFunc[i][8]) isFunc[i][8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    isFunc[8][i] = true;
    isFunc[i][8] = true;
  }
  setFunc(size - 8, 8, true);

  // Encode & interleave data + EC codewords
  const dataCw = encodeDataBits(bytes, spec.dataCodewords);
  const allCw = interleaveBlocks(dataCw, spec.blocks, spec.ecCodewords);

  // Place data bits in zigzag columns (right to left, skipping vertical timing column 6)
  let bitIndex = 0;
  const totalBits = allCw.length * 8;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let colOffset = 0; colOffset < 2; colOffset++) {
        const c = right - colOffset;
        if (isFunc[r][c]) continue;
        let dark = false;
        if (bitIndex < totalBits) {
          const byte = allCw[bitIndex >> 3];
          dark = ((byte >> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
        // Apply mask 0: (r + c) % 2 === 0
        modules[r][c] = (r + c) % 2 === 0 ? !dark : dark;
      }
    }
    upward = !upward;
  }

  // Write ECC-L Mask 0 format bits
  const fmt = FORMAT_BITS_L[0];
  for (let i = 0; i <= 5; i++) modules[8][i] = ((fmt >> (14 - i)) & 1) === 1;
  modules[8][7] = ((fmt >> 8) & 1) === 1;
  modules[8][8] = ((fmt >> 7) & 1) === 1;
  modules[7][8] = ((fmt >> 6) & 1) === 1;
  for (let i = 0; i <= 5; i++) modules[5 - i][8] = ((fmt >> (5 - i)) & 1) === 1;

  for (let i = 0; i <= 7; i++) modules[8][size - 1 - i] = ((fmt >> i) & 1) === 1;
  for (let i = 0; i <= 6; i++) modules[size - 1 - i][8] = ((fmt >> (14 - i)) & 1) === 1;

  return { size, version: spec.version, modules };
}

export function buildQrSvgString(text: string, px = 196): string {
  const { size, modules } = generateQrMatrix(text);
  const quiet = 4;
  const total = size + quiet * 2;
  const rects: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1" fill="#0b0d10"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/>${rects.join("")}</svg>`;
}
