// MD5 with a state that can be written down and picked up again. The move engine copies a large
// file over several requests, so the hash of the whole file must survive between them; the
// platform's own hash object cannot be serialised. Pure: bytes in, hex out. MD5 is used as a
// content check the providers themselves report (Drive's md5Checksum, an S3 ETag), never for
// security.

export type Md5State = {
  /** The four 32-bit words of the running state. */
  h: [number, number, number, number];
  /** Bytes hashed so far, including the buffered ones. */
  len: number;
  /** The buffered bytes not yet in a full 64-byte block, as hex. */
  tail: string;
};

const K = new Int32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

function block(h: Int32Array, w: Int32Array) {
  let a = h[0];
  let b = h[1];
  let c = h[2];
  let d = h[3];
  for (let i = 0; i < 64; i++) {
    let f: number;
    let g: number;
    if (i < 16) {
      f = (b & c) | (~b & d);
      g = i;
    } else if (i < 32) {
      f = (d & b) | (~d & c);
      g = (5 * i + 1) & 15;
    } else if (i < 48) {
      f = b ^ c ^ d;
      g = (3 * i + 5) & 15;
    } else {
      f = c ^ (b | ~d);
      g = (7 * i) & 15;
    }
    const next = d;
    d = c;
    c = b;
    b = (b + rotl((a + f + K[i] + w[g]) | 0, S[(i >> 4) * 4 + (i & 3)])) | 0;
    a = next;
  }
  h[0] = (h[0] + a) | 0;
  h[1] = (h[1] + b) | 0;
  h[2] = (h[2] + c) | 0;
  h[3] = (h[3] + d) | 0;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export class Md5 {
  private h = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476]);
  private len = 0;
  private buf = new Uint8Array(64);
  private fill = 0;
  private w = new Int32Array(16);

  static from(state: Md5State): Md5 {
    const m = new Md5();
    m.h.set(state.h);
    m.len = state.len;
    const tail = unhex(state.tail);
    if (tail.length >= 64 || (state.len - tail.length) % 64 !== 0) throw new Error('MD5_STATE_INVALID');
    m.buf.set(tail);
    m.fill = tail.length;
    return m;
  }

  state(): Md5State {
    return { h: [this.h[0], this.h[1], this.h[2], this.h[3]], len: this.len, tail: hex(this.buf.subarray(0, this.fill)) };
  }

  private run(chunk: Uint8Array, at: number) {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const j = at + i * 4;
      w[i] = chunk[j] | (chunk[j + 1] << 8) | (chunk[j + 2] << 16) | (chunk[j + 3] << 24);
    }
    block(this.h, w);
  }

  update(bytes: Uint8Array): this {
    this.len += bytes.length;
    let at = 0;
    if (this.fill > 0) {
      const take = Math.min(64 - this.fill, bytes.length);
      this.buf.set(bytes.subarray(0, take), this.fill);
      this.fill += take;
      at = take;
      if (this.fill < 64) return this;
      this.run(this.buf, 0);
      this.fill = 0;
    }
    for (; at + 64 <= bytes.length; at += 64) this.run(bytes, at);
    if (at < bytes.length) {
      this.buf.set(bytes.subarray(at), 0);
      this.fill = bytes.length - at;
    }
    return this;
  }

  /** The hex digest so far. Does not change the state: more bytes may follow. */
  digest(): string {
    const copy = Md5.from(this.state());
    const bits = copy.len * 8;
    const padLen = (copy.fill < 56 ? 56 : 120) - copy.fill;
    const pad = new Uint8Array(padLen + 8);
    pad[0] = 0x80;
    const lo = bits >>> 0;
    const hi = Math.floor(bits / 4294967296) >>> 0;
    for (let i = 0; i < 4; i++) {
      pad[padLen + i] = (lo >>> (8 * i)) & 0xff;
      pad[padLen + 4 + i] = (hi >>> (8 * i)) & 0xff;
    }
    const len = copy.len;
    copy.update(pad);
    copy.len = len;
    const out = new Uint8Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out[i * 4 + j] = (copy.h[i] >>> (8 * j)) & 0xff;
    return hex(out);
  }
}

/** md5 of one buffer, as hex. */
export const md5Hex = (bytes: Uint8Array) => new Md5().update(bytes).digest();

/** md5 of the concatenated raw digests, as S3 does for the ETag of a multipart object. */
export function md5OfDigests(hexDigests: string[]): string {
  const all = new Uint8Array(hexDigests.length * 16);
  hexDigests.forEach((d, i) => all.set(unhex(d), i * 16));
  return md5Hex(all);
}
