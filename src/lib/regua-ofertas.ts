import { z } from "zod";
import { diasDoVencimento, montarEmailCobrancaHtml, preencherModelo, type DadosEmailCobranca } from "./regua-cobranca";

export const etapaOfertaSchema = z.object({
  id: z.string().min(1).max(80), ativo: z.boolean(), referencia: z.enum(["envio", "validade"]),
  dias: z.number().int().min(-365).max(365), canais: z.array(z.enum(["whatsapp", "email"])).min(1),
  whatsapp: z.string().max(6000), assunto: z.string().max(300), mensagem: z.string().max(6000),
});
export const reguaOfertaSchema = z.object({
  ativo: z.boolean(), hora_disparo: z.number().int().min(0).max(23),
  dias_semana: z.array(z.number().int().min(0).max(6)).min(1),
  situacoes: z.array(z.string().min(1).max(150)).min(1), etapas: z.array(etapaOfertaSchema).max(30),
}).superRefine((cfg, ctx) => {
  if (new Set(cfg.etapas.map(e => e.id)).size !== cfg.etapas.length) ctx.addIssue({ code: "custom", message: "Etapas repetidas." });
  if (cfg.etapas.some(e => e.referencia === "envio" && e.dias < 0)) ctx.addIssue({ code: "custom", message: "Dias após o envio não podem ser negativos." });
});
export type EtapaOferta = z.infer<typeof etapaOfertaSchema>;
export type ReguaOferta = z.infer<typeof reguaOfertaSchema>;
export const ETAPAS_OFERTA: EtapaOferta[] = [
  { id: "retorno", ativo: true, referencia: "envio", dias: 2, canais: ["whatsapp", "email"], whatsapp: "Olá, {cliente}! Aqui é da {empresa}. Você conseguiu conferir a Oferta {numero}? Estamos à disposição para esclarecer suas dúvidas.\n{link}", assunto: "{empresa} — vamos conversar sobre a Oferta {numero}?", mensagem: "Você conseguiu conferir nossa Oferta {numero}? Estamos à disposição para esclarecer suas dúvidas e ajudar nos próximos passos." },
  { id: "lembrete", ativo: true, referencia: "envio", dias: 5, canais: ["email"], whatsapp: "Olá, {cliente}! Podemos ajudar com a Oferta {numero}? Confira os detalhes: {link}", assunto: "{empresa} — acompanhamento da Oferta {numero}", mensagem: "Gostaríamos de saber se podemos ajudar na análise da Oferta {numero}. Se precisar ajustar algum detalhe, fale com nossa equipe." },
  { id: "validade", ativo: true, referencia: "validade", dias: -2, canais: ["whatsapp", "email"], whatsapp: "Olá, {cliente}! A Oferta {numero} da {empresa} é válida até {validade}. Confira os detalhes e fale conosco: {link}", assunto: "{empresa} — Oferta {numero} válida até {validade}", mensagem: "Sua Oferta {numero} é válida até {validade}. Confira os detalhes e entre em contato se precisar de ajuda para concluir." },
];
export const REGUA_OFERTA_PADRAO: ReguaOferta = { ativo: false, hora_disparo: 9, dias_semana: [1,2,3,4,5], situacoes: ["Em andamento"], etapas: ETAPAS_OFERTA };
export const normalizarSituacao = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function ofertaPodeAcompanhar(oferta: Record<string, unknown>, cfg: ReguaOferta, ganha = false) {
  const sit = normalizarSituacao(oferta["situacao"]);
  return !ganha && !oferta["assinado_em"] && !oferta["ativado_em"] && !oferta["cancelado"] &&
    !/(aprovad|aceit|ganh|perdid|reprovad|cancelad|desisten|ativacao|concluid)/.test(sit) && cfg.situacoes.some(s => normalizarSituacao(s) === sit);
}
export function etapaOfertaHoje(e: EtapaOferta, oferta: Record<string, unknown>, hoje: string) {
  const base = e.referencia === "envio" ? oferta["acompanhamento_enviado_em"] : oferta["validade_orcamento"];
  return e.ativo && !!oferta["acompanhamento_enviado_em"] && !!base && diasDoVencimento(String(base).slice(0,10), hoje) === e.dias;
}
export function montarEmailOferta(d: DadosEmailCobranca & { numero: string; mensagem: string }) {
  return montarEmailCobrancaHtml(d, { mensagem: d.mensagem, titulo: `Oferta ${d.numero}`, botao: "Ver Oferta", validade: true });
}
export { preencherModelo };
