/** Canais de disparo de e-mail por empresa (ex.: Sistema/no-reply, Comercial, Compras). */
export type FinalidadeEmail = "sistema" | "comercial" | "compras" | "financeiro";

export const FINALIDADES: { valor: FinalidadeEmail; rotulo: string; uso: string }[] = [
  { valor: "comercial", rotulo: "Comercial", uso: "Ofertas e SDR" },
  { valor: "compras", rotulo: "Compras", uso: "Cotações e pedidos de compra" },
  { valor: "financeiro", rotulo: "Financeiro", uso: "Cobranças e avisos" },
  { valor: "sistema", rotulo: "Sistema", uso: "Login, nova senha e testes" },
];

export type CanalEmail = {
  id: string;
  empresa_id: string;
  nome: string;
  finalidades: string[];
  padrao: boolean;
  ativo: boolean;
  email_modo: "proprio" | "sistema";
  smtp_host: string | null;
  smtp_porta: number;
  smtp_usuario: string | null;
  remetente_nome: string | null;
  remetente_email: string | null;
  responder_para: string | null;
};

/** Canal sugerido para a finalidade: ativo e marcado para ela (padrão primeiro), senão o padrão geral, senão o primeiro ativo. */
export function canalSugerido(canais: CanalEmail[], finalidade: FinalidadeEmail): CanalEmail | null {
  const ativos = canais.filter((c) => c.ativo);
  const daFinalidade = ativos.filter((c) => c.finalidades.includes(finalidade));
  return (
    daFinalidade.find((c) => c.padrao) ?? daFinalidade[0] ?? ativos.find((c) => c.padrao) ?? ativos[0] ?? null
  );
}

export const rotuloCanal = (c: CanalEmail) =>
  `${c.nome}${c.remetente_email ? ` — ${c.remetente_email}` : ""}`;

/** Servidores conhecidos para preencher automaticamente (Hostinger, Amazon SES etc.). */
export const PROVEDORES_SMTP: { nome: string; host: string; porta: number }[] = [
  { nome: "Amazon SES (São Paulo)", host: "email-smtp.sa-east-1.amazonaws.com", porta: 465 },
  { nome: "Amazon SES (Virgínia)", host: "email-smtp.us-east-1.amazonaws.com", porta: 465 },
  { nome: "Google (Gmail/Workspace)", host: "smtp.gmail.com", porta: 465 },
  { nome: "Hostinger", host: "smtp.hostinger.com", porta: 465 },
  { nome: "Microsoft 365 / Outlook", host: "smtp.office365.com", porta: 587 },
];
