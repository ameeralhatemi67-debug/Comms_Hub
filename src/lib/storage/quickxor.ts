// Microsoft's QuickXorHash, the content hash OneDrive keeps for every file (the only one both a
// personal and a work or school account always give). A resumable form: the engine copies a file
// in parts across requests, so the hash state is a small JSON value saved with the upload.
//
// The algorithm (Microsoft's published description): a 160-bit buffer; byte number n of the file is
// XORed into the buffer at bit position (n * 11) mod 160 (little-endian bit order, wrapping around
// the end); at the end the file's length, as 64 bits little-endian, is XORed into the last eight
// bytes; the result is the 20 bytes of the buffer, base64. Because 160 * 11 is a multiple of 160,
// the position depends only on n mod 160, so the state is 160 byte accumulators and a length.
// tests/onedrive.test.mjs holds this to an independent port of Microsoft's reference code.

const WIDTH = 160;
const SHIFT = 11;

export type QuickXorState = { a: number[]; n: number };

export class QuickXor {
  private acc: Uint8Array;
  private length: number;

  constructor(state?: QuickXorState) {
    this.acc = new Uint8Array(WIDTH);
    this.length = 0;
    if (state) {
      if (!Array.isArray(state.a) || state.a.length !== WIDTH || !Number.isFinite(state.n)) throw new Error('QUICKXOR_STATE');
      this.acc.set(state.a);
      this.length = state.n;
    }
  }

  static from(state: QuickXorState) {
    return new QuickXor(state);
  }

  /** How many bytes have been fed in. */
  get bytes() {
    return this.length;
  }

  update(bytes: Uint8Array): this {
    let r = this.length % WIDTH;
    for (let i = 0; i < bytes.length; i++) {
      this.acc[r] ^= bytes[i];
      r = r + 1 === WIDTH ? 0 : r + 1;
    }
    this.length += bytes.length;
    return this;
  }

  state(): QuickXorState {
    return { a: Array.from(this.acc), n: this.length };
  }

  /** The hash so far, base64, as OneDrive writes it. */
  digest(): string {
    let buf = 0n;
    const mask = (1n << BigInt(WIDTH)) - 1n;
    for (let r = 0; r < WIDTH; r++) {
      const b = this.acc[r];
      if (!b) continue;
      const v = BigInt(b) << BigInt((r * SHIFT) % WIDTH);
      // A byte that crosses the end of the buffer wraps to the start.
      buf ^= (v & mask) ^ (v >> BigInt(WIDTH));
    }
    const out = new Uint8Array(WIDTH / 8);
    for (let i = 0; i < out.length; i++) out[i] = Number((buf >> BigInt(8 * i)) & 0xffn);
    let len = BigInt(this.length);
    for (let i = 0; i < 8; i++) {
      out[WIDTH / 8 - 8 + i] ^= Number(len & 0xffn);
      len >>= 8n;
    }
    return Buffer.from(out).toString('base64');
  }
}
