/**
 * 8×8 separable DCT/IDCT used by the watermark embedder/extractor.
 *
 * The implementation is intentionally simple (not the fastest AAN variant) but
 * it is stable, easy to audit, and fast enough for a cached, once-per-user-per
 * -day operation on map images.
 */

const SQRT_2_OVER_8 = Math.sqrt(2 / 8);
const ONE_OVER_SQRT_8 = 1 / Math.sqrt(8);

const cosTable: number[][] = [];
for (let u = 0; u < 8; u++) {
  const row: number[] = [];
  for (let x = 0; x < 8; x++) {
    row.push(Math.cos(((2 * x + 1) * u * Math.PI) / 16));
  }
  cosTable.push(row);
}

function alpha(u: number): number {
  return u === 0 ? ONE_OVER_SQRT_8 : SQRT_2_OVER_8;
}

export function dct8(input: Float64Array, output: Float64Array): void {
  for (let u = 0; u < 8; u++) {
    let sum = 0;
    const cosRow = cosTable[u]!;
    for (let x = 0; x < 8; x++) {
      sum += input[x]! * cosRow[x]!;
    }
    output[u] = sum * alpha(u);
  }
}

export function idct8(input: Float64Array, output: Float64Array): void {
  for (let x = 0; x < 8; x++) {
    let sum = 0;
    for (let u = 0; u < 8; u++) {
      sum += input[u]! * alpha(u) * cosTable[u]![x]!;
    }
    output[x] = sum;
  }
}

/**
 * Forward 2D DCT on an 8×8 block stored in row-major order.
 *
 * Allocates local scratch arrays per call to keep the functions re-entrant
 * and easy to reason about. The single-threaded runtime means the extra
 * allocation is acceptable; if profiling shows it is a bottleneck we can pool
 * buffers later.
 */
export function forwardDCT2D(block: Float64Array): Float64Array {
  const out = new Float64Array(64);
  const rowTmp = new Float64Array(8);
  const colTmp = new Float64Array(8);
  const colOut = new Float64Array(8);

  // Row DCTs
  for (let y = 0; y < 8; y++) {
    dct8(block.subarray(y * 8, y * 8 + 8), rowTmp);
    for (let u = 0; u < 8; u++) {
      out[y * 8 + u] = rowTmp[u]!;
    }
  }

  // Column DCTs
  for (let u = 0; u < 8; u++) {
    for (let y = 0; y < 8; y++) {
      colTmp[y] = out[y * 8 + u]!;
    }
    dct8(colTmp, colOut);
    for (let y = 0; y < 8; y++) {
      out[y * 8 + u] = colOut[y]!;
    }
  }

  return out;
}

/**
 * Inverse 2D DCT on an 8×8 block stored in row-major order.
 */
export function inverseDCT2D(block: Float64Array): Float64Array {
  const out = new Float64Array(64);
  const colTmp = new Float64Array(8);
  const colOut = new Float64Array(8);
  const rowTmp = new Float64Array(8);

  // Column IDCTs
  for (let u = 0; u < 8; u++) {
    for (let y = 0; y < 8; y++) {
      colTmp[y] = block[y * 8 + u]!;
    }
    idct8(colTmp, colOut);
    for (let y = 0; y < 8; y++) {
      out[y * 8 + u] = colOut[y]!;
    }
  }

  // Row IDCTs
  for (let y = 0; y < 8; y++) {
    idct8(out.subarray(y * 8, y * 8 + 8), rowTmp);
    for (let x = 0; x < 8; x++) {
      out[y * 8 + x] = rowTmp[x]!;
    }
  }

  return out;
}
