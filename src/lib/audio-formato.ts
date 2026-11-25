/** Formato real do áudio pelos primeiros bytes — o tipo informado pela Z-API/navegador pode não bater com o arquivo. */
export function formatoAudio(b: Uint8Array): { ext: string; mime: string } | null {
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (ascii(0, 4) === "OggS") return { ext: "ogg", mime: "audio/ogg" };
  if (ascii(4, 4) === "ftyp") return { ext: "m4a", mime: "audio/mp4" };
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg" };
  if (ascii(0, 4) === "RIFF") return { ext: "wav", mime: "audio/wav" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: "webm", mime: "audio/webm" };
  return null;
}
