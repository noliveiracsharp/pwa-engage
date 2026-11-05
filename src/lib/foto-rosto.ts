/** Enquadramento de rosto para controle de acesso (puro + detecção no navegador). */
export type Caixa = { x: number; y: number; w: number; h: number };

/**
 * Recorte quadrado centrado no rosto, com margem para cabelo/queixo/ombros
 * (padrão de foto 3x4 usado por leitores faciais). Nunca sai da imagem.
 */
export function quadroRosto(rosto: Caixa, imgW: number, imgH: number, margem = 0.6): Caixa {
  const lado = Math.min(Math.max(rosto.w, rosto.h) * (1 + margem * 2), imgW, imgH);
  const cx = rosto.x + rosto.w / 2;
  const cy = rosto.y + rosto.h / 2 - rosto.h * 0.08; // sobe um pouco: inclui a testa
  const x = Math.min(Math.max(cx - lado / 2, 0), imgW - lado);
  const y = Math.min(Math.max(cy - lado / 2, 0), imgH - lado);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(lado), h: Math.round(lado) };
}

/** Avalia se o rosto serve para reconhecimento: um único rosto e grande o bastante. */
export function avaliarRosto(qtd: number, rosto: Caixa | null, imgW: number): { ok: boolean; aviso?: string } {
  if (qtd === 0 || !rosto) return { ok: false, aviso: "Nenhum rosto encontrado. Tire a foto de frente, com boa luz." };
  if (qtd > 1) return { ok: false, aviso: "Mais de um rosto na foto. Deixe apenas a pessoa cadastrada." };
  if (rosto.w < imgW * 0.12 || rosto.w < 80) return { ok: false, aviso: "Rosto muito pequeno. Aproxime a câmera." };
  return { ok: true };
}

const VER = "1.2.0";
const MODELO = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detP: Promise<any> | null = null;

async function detector() {
  if (!detP) {
    detP = (async () => {
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const fs = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`);
      return FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: MODELO }, runningMode: "IMAGE", minDetectionConfidence: 0.5 });
    })().catch((e) => { detP = null; throw e; });
  }
  return detP;
}

/** Detecta o rosto e devolve a foto recortada (JPEG 600x600). Só no cliente. */
export async function recortarRosto(file: File): Promise<{ arquivo: File; ok: boolean; aviso?: string }> {
  const bmp = await createImageBitmap(file);
  let caixa: Caixa | null = null;
  let qtd = 0;
  try {
    const det = await detector();
    const r = det.detect(bmp);
    qtd = r.detections.length;
    const b = r.detections[0]?.boundingBox;
    if (b) caixa = { x: b.originX, y: b.originY, w: b.width, h: b.height };
  } catch {
    return { arquivo: file, ok: false, aviso: "Detector de rosto indisponível; foto salva sem recorte." };
  }
  const aval = avaliarRosto(qtd, caixa, bmp.width);
  const q = caixa ? quadroRosto(caixa, bmp.width, bmp.height) : null;
  if (!q) return { arquivo: file, ...aval };
  const c = document.createElement("canvas");
  c.width = 600; c.height = 600;
  c.getContext("2d")!.drawImage(bmp, q.x, q.y, q.w, q.h, 0, 0, 600, 600);
  const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.9));
  return { arquivo: new File([blob], "rosto.jpg", { type: "image/jpeg" }), ...aval };
}
