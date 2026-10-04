/** Toca um aviso sonoro curto gerado no navegador (sem arquivos externos). */
let ctx: AudioContext | null = null;

export function tocarSom(tipo: "equipe" | "cliente" = "equipe") {
  if (typeof window === "undefined") return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const notas = tipo === "cliente" ? [880, 1175, 1568] : [660, 990];
    notas.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      const t = ctx!.currentTime + i * 0.13;
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(ctx!.destination);
      o.start(t);
      o.stop(t + 0.3);
    });
  } catch {
    /* navegador bloqueou o áudio */
  }
}
