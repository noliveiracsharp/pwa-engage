/** Fundo virtual da câmera (desfoque ou imagem) via segmentação de pessoa no navegador. Só usar no cliente. */
export type ModoFundo = { tipo: "nenhum" } | { tipo: "desfoque" } | { tipo: "imagem"; url: string };

const VER = "0.10.22";
let segP: Promise<any> | null = null;

async function segmentador() {
  if (!segP) {
    segP = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fs = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`);
      return ImageSegmenter.createFromOptions(fs, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    })().catch((e) => { segP = null; throw e; });
  }
  return segP;
}

/** Recebe a trilha da câmera e devolve uma trilha processada. Chame parar() ao trocar/encerrar. */
export async function aplicarFundo(cam: MediaStreamTrack, modo: ModoFundo): Promise<{ track: MediaStreamTrack; parar: () => void }> {
  const seg = await segmentador();
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true;
  video.srcObject = new MediaStream([cam]);
  await video.play();
  const w = video.videoWidth || 640, h = video.videoHeight || 480;
  const saida = document.createElement("canvas"); saida.width = w; saida.height = h;
  const g = saida.getContext("2d")!;
  const masc = document.createElement("canvas"); masc.width = w; masc.height = h;
  const gm = masc.getContext("2d")!;
  const pessoa = document.createElement("canvas"); pessoa.width = w; pessoa.height = h;
  const gp = pessoa.getContext("2d")!;
  let img: HTMLImageElement | null = null;
  if (modo.tipo === "imagem") {
    img = new Image(); img.crossOrigin = "anonymous"; img.src = modo.url;
    await img.decode().catch(() => { img = null; });
  }
  const dados = gm.createImageData(w, h);
  let ativo = true, ultimo = -1;
  const quadro = () => {
    if (!ativo) return;
    if (video.readyState >= 2 && video.currentTime !== ultimo) {
      ultimo = video.currentTime;
      try {
        const r = seg.segmentForVideo(video, performance.now());
        const m: Float32Array = r.confidenceMasks?.[0]?.getAsFloat32Array();
        if (m) {
          for (let i = 0; i < m.length; i++) { const k = i * 4; dados.data[k] = dados.data[k + 1] = dados.data[k + 2] = 0; dados.data[k + 3] = m[i]! * 255; }
          gm.putImageData(dados, 0, 0);
        }
        r.close?.();
      } catch { /* ignora quadro */ }
      // pessoa recortada
      gp.globalCompositeOperation = "copy";
      gp.filter = "blur(2px)"; gp.drawImage(masc, 0, 0); gp.filter = "none";
      gp.globalCompositeOperation = "source-in"; gp.drawImage(video, 0, 0, w, h);
      // fundo
      if (img) {
        const s = Math.max(w / img.width, h / img.height);
        g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
      } else {
        g.filter = "blur(12px)"; g.drawImage(video, 0, 0, w, h); g.filter = "none";
      }
      g.drawImage(pessoa, 0, 0);
    }
    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);
  const track = saida.captureStream(24).getVideoTracks()[0]!;
  return { track, parar: () => { ativo = false; track.stop(); video.srcObject = null; } };
}

export const FUNDOS_PADRAO: { nome: string; url: string }[] = [
  { nome: "Escritório", url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&q=70" },
  { nome: "Sala de reunião", url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1280&q=70" },
  { nome: "Biblioteca", url: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1280&q=70" },
  { nome: "Natureza", url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1280&q=70" },
];
