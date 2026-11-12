/** Sino de tranquilização: regras puras do aviso periódico ao cliente em espera. */
export const SINO_INTERVALOS = [2, 3, 5, 10, 30, 60, 120] as const;
export const SINO_MAX_LIMITE = 5;
export const SINO_MENSAGEM_PADRAO =
  "Olá {nome}, ainda estamos analisando o seu caso com atenção. Por favor, aguarde só mais um momento que já te retorno! 🙏";

export type SinoEstado = {
  ativo: boolean;
  intervaloMin: number;
  mensagem: string;
  maxEnvios: number;
  enviosFeitos: number;
  proximoEnvio: string | null; // ISO
};

export function lerSino(r: Record<string, unknown> | undefined): SinoEstado {
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    ativo: r?.["sino_ativo"] === true,
    intervaloMin: n(r?.["sino_intervalo_min"], 3),
    mensagem: String(r?.["sino_mensagem"] ?? "") || SINO_MENSAGEM_PADRAO,
    maxEnvios: Math.min(SINO_MAX_LIMITE, n(r?.["sino_max_envios"], 3)),
    enviosFeitos: Math.max(0, Number(r?.["sino_envios_feitos"] ?? 0) || 0),
    proximoEnvio: r?.["sino_proximo_envio"] ? String(r["sino_proximo_envio"]) : null,
  };
}

export function textoSino(mensagem: string, nome: string): string {
  const primeiro = (nome || "").trim().split(/\s+/)[0] ?? "";
  return mensagem.replace(/\{nome\}/gi, primeiro).replace(/\s+,/g, ",").trim();
}

export function somarMin(iso: Date | string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60_000).toISOString();
}

/** Ligar: zera o contador e agenda o primeiro envio. */
export function ligarSino(cfg: { intervaloMin: number; mensagem: string; maxEnvios: number }, agora: Date) {
  return {
    sino_ativo: true,
    sino_intervalo_min: cfg.intervaloMin,
    sino_mensagem: cfg.mensagem,
    sino_max_envios: Math.min(SINO_MAX_LIMITE, Math.max(1, cfg.maxEnvios)),
    sino_envios_feitos: 0,
    sino_proximo_envio: somarMin(agora, cfg.intervaloMin),
  };
}

export const desligarSino = () => ({ sino_ativo: false, sino_proximo_envio: null });

/** Está na hora de enviar? */
export function sinoVencido(s: SinoEstado, agora: Date): boolean {
  return s.ativo && !!s.proximoEnvio && s.enviosFeitos < s.maxEnvios && new Date(s.proximoEnvio).getTime() <= agora.getTime();
}

/** Após um envio: incrementa; desarma ao atingir o teto. */
export function aposEnvio(s: SinoEstado, agora: Date) {
  const feitos = s.enviosFeitos + 1;
  const fim = feitos >= s.maxEnvios;
  return {
    sino_envios_feitos: feitos,
    sino_ativo: !fim,
    sino_proximo_envio: fim ? null : somarMin(agora, s.intervaloMin),
    limiteAtingido: fim,
  };
}
