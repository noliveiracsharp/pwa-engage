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

/** Avaliação ao vivo (câmera): centralização na moldura, distância, inclinação e uma pessoa só. */
export function avaliarAoVivo(
  qtd: number, rosto: Caixa | null, w: number, h: number,
  olhos?: { esq: { x: number; y: number }; dir: { x: number; y: number } } | null,
): { ok: boolean; aviso: string } {
  if (qtd === 0 || !rosto) return { ok: false, aviso: "Posicione o rosto dentro da moldura" };
  if (qtd > 1) return { ok: false, aviso: "Apenas uma pessoa na câmera" };
  const cx = (rosto.x + rosto.w / 2) / w;
  const cy = (rosto.y + rosto.h / 2) / h;
  const tam = rosto.w / w;
  if (tam < 0.22) return { ok: false, aviso: "Aproxime-se da câmera" };
  if (tam > 0.6) return { ok: false, aviso: "Afaste-se um pouco" };
  if (Math.abs(cx - 0.5) > 0.12 || Math.abs(cy - 0.45) > 0.15) return { ok: false, aviso: "Centralize o rosto na moldura" };
  if (olhos) {
    const ang = Math.abs((Math.atan2(olhos.dir.y - olhos.esq.y, olhos.dir.x - olhos.esq.x) * 180) / Math.PI);
    const incl = Math.min(ang, 180 - ang);
    if (incl > 12) return { ok: false, aviso: "Mantenha a cabeça reta" };
  }
  return { ok: true, aviso: "Perfeito! Mantenha a posição" };
}

/** Luminosidade média (0-255) suficiente para leitura facial. */
export function avaliarLuz(media: number): { ok: boolean; aviso?: string } {
  if (media < 55) return { ok: false, aviso: "Ambiente escuro. Procure um local mais iluminado" };
  if (media > 225) return { ok: false, aviso: "Luz forte demais. Evite contraluz" };
  return { ok: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detVideoP: Promise<any> | null = null;
/** Detector em modo vídeo (para o preview ao vivo da câmera). Só no cliente. */
export async function detectorVideo() {
  if (!detVideoP) {
    detVideoP = (async () => {
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const fs = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`);
      return FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: MODELO }, runningMode: "VIDEO", minDetectionConfidence: 0.6 });
    })().catch((e) => { detVideoP = null; throw e; });
  }
  return detVideoP;
}
