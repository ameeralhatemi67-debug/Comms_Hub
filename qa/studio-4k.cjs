// The 4K fixture of the preview checks of D10 (qa/studio-scrub.cjs, qa/studio-autores.cjs): 20 s of 3840 x 2160 at 30
// frames a second, H.264 at 60 Mbit/s with a key frame every `gop` frames, a moving test picture with each frame's
// number as a 12-bit gray code in a black band across the middle (read back as qa/desktop-media.cjs reads it). Made
// by the local ffmpeg, kept between runs.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const SECONDS = 20;
const BITS = 12;
const grayBoxes = Array.from({ length: BITS }, (_, k) => {
  const p = 2 ** k;
  return `drawbox=x=iw*${k + 2}/16:y=ih*7/16:w=iw/16-4:h=ih/8:color=white:t=fill:enable='eq(mod(floor(n/${p})+floor(n/${2 * p}),2),1)'`;
}).join(',');

function make4k(file, gop) {
  if (fs.existsSync(file) && fs.statSync(file).size > 1e8) return;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=s=3840x2160:r=30:d=${SECONDS}`,
    '-vf', `drawbox=x=0:y=ih*6/16:w=iw:h=ih*4/16:color=black:t=fill,${grayBoxes}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '60M', '-maxrate', '60M', '-bufsize', '120M', '-pix_fmt', 'yuv420p', '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-an', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
}

module.exports = { make4k, SECONDS, BITS };
