const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  for (const f of files) {
    const nb = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nb);
    offset += 30 + nb.length + size;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/* ---------- MP4 / MOV writer (one video track, one chunk) ---------- */
const bx = {
  u32: (...n) => { const a = new Uint8Array(n.length * 4), d = new DataView(a.buffer); n.forEach((v, i) => d.setUint32(i * 4, v >>> 0)); return a; },
  u16: (...n) => { const a = new Uint8Array(n.length * 2), d = new DataView(a.buffer); n.forEach((v, i) => d.setUint16(i * 2, v)); return a; },
  str: s => Uint8Array.from([...s].map(c => c.charCodeAt(0))),
  box(type, ...parts) {
    let size = 8; parts.forEach(p => size += p.length);
    const out = new Uint8Array(size); new DataView(out.buffer).setUint32(0, size); out.set(bx.str(type), 4);
    let o = 8; parts.forEach(p => { out.set(p, o); o += p.length; }); return out;
  }
};
function buildMoov(o, dataOffset) {
  const { w, h, fps, samples, fourcc, avcC, depth, name, vendor = '\0\0\0\0', spatial = 0, extra = [] } = o;
  const ts = fps * 1000, delta = 1000, n = samples.length, dur = n * delta, movTs = 1000, movDur = Math.round(dur * movTs / ts);
  const now = Math.floor(Date.now() / 1000) + 2082844800, B = bx.box, U32 = bx.u32, U16 = bx.u16;
  const matrix = U32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);
  const mvhd = B('mvhd', U32(0, now, now, movTs, movDur, 0x10000), U16(0x0100, 0), U32(0, 0), matrix, U32(0, 0, 0, 0, 0, 0, 2));
  const tkhd = B('tkhd', U32(3, now, now, 1, 0, movDur), U32(0, 0), U16(0, 0, 0, 0), matrix, U32(w * 65536, h * 65536));
  const mdhd = B('mdhd', U32(0, now, now, ts, dur), U16(0x55C4, 0));
  const hdlr = B('hdlr', U32(0, 0), bx.str('vide'), U32(0, 0, 0), bx.str('VideoHandler\0'));
  const vmhd = B('vmhd', U32(1), U16(0, 0, 0, 0));
  const dinf = B('dinf', B('dref', U32(0, 1), B('url ', U32(1))));
  const cname = new Uint8Array(32); cname[0] = name.length; cname.set(bx.str(name), 1);
  const entry = B(fourcc, new Uint8Array(6), U16(1), U16(0, 0), bx.str(vendor), U32(0, spatial), U16(w, h), U32(0x00480000, 0x00480000, 0), U16(1), cname, U16(depth, 0xFFFF), avcC ? B('avcC', avcC) : new Uint8Array(0), ...extra);
  const sizes = U32(...samples.map(s => s.data.length));
  const keys = samples.map((s, i) => s.key ? i + 1 : 0).filter(Boolean);
  const stbl = B('stbl', B('stsd', U32(0, 1), entry), B('stts', U32(0, 1, n, delta)), B('stsc', U32(0, 1, 1, n, 1)),
    B('stsz', U32(0, 0, n), sizes), B('stco', U32(0, 1, dataOffset)), avcC ? B('stss', U32(0, keys.length, ...keys)) : new Uint8Array(0));
  return B('moov', mvhd, B('trak', tkhd, B('mdia', mdhd, hdlr, B('minf', vmhd, dinf, stbl))));
}
/* o: {kind:'mp4'|'mov', fourcc, w,h,fps, samples:[{data,key}], avcC?, depth, name, vendor?, spatial?, extra?: sample-entry boxes} */
function muxVideo(o) {
  const ftyp = o.kind === 'mp4' ? bx.box('ftyp', bx.str('isom'), bx.u32(512), bx.str('isomiso2avc1mp41')) : bx.box('ftyp', bx.str('qt  '), bx.u32(0x20050300), bx.str('qt  '));
  const moovLen = buildMoov(o, 0).length, offset = ftyp.length + moovLen + 8, moov = buildMoov(o, offset);
  let mdatSize = 8; o.samples.forEach(s => mdatSize += s.data.length);
  const mdatHead = new Uint8Array(8); new DataView(mdatHead.buffer).setUint32(0, mdatSize); mdatHead.set(bx.str('mdat'), 4);
  return new Blob([ftyp, moov, mdatHead, ...o.samples.map(s => s.data)], { type: o.kind === 'mp4' ? 'video/mp4' : 'video/quicktime' });
}


export { makeZip, muxVideo, crc32, bx };
