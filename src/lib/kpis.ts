/** Regras puras do Cockpit de KPIs (modelo híbrido: recorrência + implantação + manutenção). */
import { num } from "@/lib/orcamentos";
import { temperaturaEfetiva, TEMP_GANHO, TEMP_PERDIDO } from "@/lib/temperatura";
import type { Row } from "@/lib/row";

const r2 = (v: number) => Math.round(v * 100) / 100;
const dia = (v: unknown) => String(v ?? "").slice(0, 10);
const entre = (d: string, de: string, ate: string) => !!d && d >= de && d <= ate;

export const ganha = (o: Row) => temperaturaEfetiva(o["situacao"], o["temperatura"])?.label === TEMP_GANHO.label;
export const perdida = (o: Row) => temperaturaEfetiva(o["situacao"], o["temperatura"])?.label === TEMP_PERDIDO.label;
const encerrada = (o: Row) => dia(o["contrato_encerrado_em"]);
/** Data de fechamento: ativação ou última atualização da oferta ganha. */
export const dataFechamento = (o: Row) => dia(o["ativado_em"] || o["data_ativacao"] || o["updated_at"] || o["created_at"]);

/** Contrato recorrente ativo numa data (ganho até a data e não encerrado). */
function ativoEm(o: Row, data: string) {
  if (num(o["total_recorrente"]) <= 0) return false;
  const fim = encerrada(o);
  const ganhoAte = ganha(o) && dataFechamento(o) <= data;
  const encerradoAntes = !!fim && fim <= data;
  return (ganhoAte || (!!fim && dataFechamento(o) <= data)) && !encerradoAntes;
}

export function recorrencia(orcs: Row[], de: string, ate: string) {
  const ativos = orcs.filter((o) => ativoEm(o, ate));
  const mrr = r2(ativos.reduce((s, o) => s + num(o["total_recorrente"]), 0));
  const clientes = new Set(ativos.map((o) => String(o["parceiro_id"] ?? o["id"]))).size;
  const baseInicio = orcs.filter((o) => ativoEm(o, de));
  const mrrInicio = baseInicio.reduce((s, o) => s + num(o["total_recorrente"]), 0);
  const perdidos = orcs.filter((o) => entre(encerrada(o), de, ate) && num(o["total_recorrente"]) > 0);
  const mrrPerdido = r2(perdidos.reduce((s, o) => s + num(o["total_recorrente"]), 0));
  const meses = Math.max(1, mesesPeriodo(de, ate));
  const churn = mrrInicio > 0 ? r2((mrrPerdido / mrrInicio / meses) * 100) : 0;
  const ticket = ativos.length ? r2(mrr / ativos.length) : 0;
  return { mrr, arr: r2(mrr * 12), contratos: ativos.length, clientes, ticket, churn, mrrPerdido, cancelados: perdidos.length, ltv: ltv(ticket, churn) };
}

/** LTV = ticket mensal ÷ churn mensal; sem churn, usa horizonte de 60 meses. */
export function ltv(ticketMensal: number, churnPctMes: number) {
  if (ticketMensal <= 0) return 0;
  return r2(churnPctMes > 0 ? ticketMensal / (churnPctMes / 100) : ticketMensal * 60);
}

export function mesesPeriodo(de: string, ate: string) {
  const a = new Date(de + "T12:00"), b = new Date(ate + "T12:00");
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1;
}

export const CATEGORIAS_CAC = /marketing|comercial|vendas?|an[uú]ncio|tr[aá]fego|publicidade|propaganda|comiss/i;

/** CAC = despesas pagas de marketing/vendas no período ÷ novos clientes ganhos. */
export function cac(titulos: Row[], orcs: Row[], de: string, ate: string) {
  const gasto = r2(titulos
    .filter((t) => t["tipo"] === "pagar" && CATEGORIAS_CAC.test(String(t["categoria"] ?? "")))
    .filter((t) => entre(dia(t["data_pagamento"] || (t["status"] === "pago" ? t["vencimento"] : "")), de, ate))
    .reduce((s, t) => s + num(t["valor_pago"] || t["valor"]), 0));
  const novos = new Set(orcs.filter((o) => ganha(o) && entre(dataFechamento(o), de, ate)).map((o) => String(o["parceiro_id"] ?? o["id"]))).size;
  return { gasto, novos, valor: novos ? r2(gasto / novos) : 0 };
}

/** Meses para a mensalidade pagar o CAC que sobra depois da margem da implantação. */
export function payback(cacValor: number, margemImplantacao: number, mensalidade: number) {
  const resto = cacValor - Math.max(0, margemImplantacao);
  if (resto <= 0) return 0;
  return mensalidade > 0 ? r2(resto / mensalidade) : Infinity;
}

export function vendas(orcs: Row[], de: string, ate: string) {
  const ganhas = orcs.filter((o) => ganha(o) && entre(dataFechamento(o), de, ate));
  const perdidas = orcs.filter((o) => perdida(o) && entre(dia(o["updated_at"] || o["created_at"]), de, ate));
  const impl = ganhas.reduce((s, o) => s + num(o["total_liquido"]), 0);
  const mensal = ganhas.reduce((s, o) => s + num(o["total_recorrente"]), 0);
  const lucro = ganhas.reduce((s, o) => s + num(o["lucro"] ?? o["total_lucro"]), 0);
  const ciclos = ganhas.map((o) => (new Date(dataFechamento(o)).getTime() - new Date(dia(o["created_at"])).getTime()) / 86400000).filter((x) => x >= 0);
  const tot = ganhas.length + perdidas.length;
  return {
    ganhas: ganhas.length, perdidas: perdidas.length,
    conversao: tot ? r2((ganhas.length / tot) * 100) : 0,
    ticketImpl: ganhas.length ? r2(impl / ganhas.length) : 0,
    ticketMensal: ganhas.length ? r2(mensal / ganhas.length) : 0,
    margemImpl: ganhas.length ? r2(lucro / ganhas.length) : 0,
    ciclo: ciclos.length ? Math.round(ciclos.reduce((s, x) => s + x, 0) / ciclos.length) : 0,
  };
}

const concluida = (o: Row) => !!o["concluido_em"] || /conclu/.test(String(o["status"] ?? ""));

/** Operação de campo: volume, SLA médio (horas), % no prazo e FCR (sem nova corretiva em 30 dias). */
export function operacao(os: Row[], de: string, ate: string) {
  const per = os.filter((o) => entre(dia(o["created_at"]), de, ate));
  const feitas = per.filter(concluida).filter((o) => o["concluido_em"]);
  const horas = feitas.map((o) => (new Date(String(o["concluido_em"])).getTime() - new Date(String(o["created_at"])).getTime()) / 3600000).filter((h) => h >= 0);
  const comPrazo = feitas.filter((o) => o["prazo_sla"]);
  const noPrazo = comPrazo.filter((o) => String(o["concluido_em"]) <= String(o["prazo_sla"])).length;
  const chave = (o: Row) => `${o["parceiro_id"] ?? ""}|${o["ativo_id"] ?? o["equipamento"] ?? ""}`;
  const corretivas = feitas.filter((o) => o["tipo"] === "corretiva");
  const resolvidas = corretivas.filter((o) => {
    const fim = new Date(String(o["concluido_em"])).getTime();
    return !os.some((x) => x !== o && x["tipo"] === "corretiva" && chave(x) === chave(o) && (() => {
      const t = new Date(String(x["created_at"])).getTime();
      return t > fim && t - fim <= 30 * 86400000;
    })());
  }).length;
  return {
    total: per.length,
    preventivas: per.filter((o) => o["tipo"] === "preventiva").length,
    corretivas: per.filter((o) => o["tipo"] === "corretiva").length,
    concluidas: feitas.length,
    slaHoras: horas.length ? r2(horas.reduce((s, h) => s + h, 0) / horas.length) : 0,
    noPrazo: comPrazo.length ? r2((noPrazo / comPrazo.length) * 100) : 0,
    fcr: corretivas.length ? r2((resolvidas / corretivas.length) * 100) : 0,
  };
}
