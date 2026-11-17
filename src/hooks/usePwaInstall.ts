import { useCallback, useEffect, useState } from "react";

const CHAVE = "conectcon_pwa_dispensado_ate";
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PlataformaPwa = "android" | "ios" | null;

export function usePwaInstall() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);
  const [plataforma, setPlataforma] = useState<PlataformaPwa>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const dispensado = Number(localStorage.getItem(CHAVE) || 0) > Date.now();
    const celular = /Android|iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    let dentroIframe = false;
    try { dentroIframe = window.self !== window.top; } catch { dentroIframe = true; }
    if (standalone || dispensado || !celular || dentroIframe) return;

    const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    if (ios && safari) { setPlataforma("ios"); return; }

    const aoPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
      setPlataforma("android");
    };
    const aoInstalar = () => { setPlataforma(null); setEvento(null); };
    window.addEventListener("beforeinstallprompt", aoPrompt);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPrompt);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  const dispensar = useCallback(() => {
    localStorage.setItem(CHAVE, String(Date.now() + SETE_DIAS));
    setPlataforma(null);
  }, []);

  const instalar = useCallback(async () => {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    setEvento(null);
    if (outcome === "accepted") setPlataforma(null); else dispensar();
  }, [evento, dispensar]);

  return { plataforma, instalar, dispensar };
}
