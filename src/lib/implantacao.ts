/** Checklist de implantação de um novo cliente: regras puras (testáveis). */
import type { Row } from "@/lib/row";

export type PassoImplantacao = {
  id: string;
  titulo: string;
  descricao: string;
  rota: string;
  acao: string;
  feito: boolean;
};

export type DadosImplantacao = {
  empresa?: Row | undefined;
  instancias: Row[];
  usuarios: Row[];
  itens: Row[];
  parceiros: Row[];
  contas: Row[];
  ofertas: Row[];
};

const txt = (v: unknown) => String(v ?? "").trim();

export function passosImplantacao(d: DadosImplantacao): PassoImplantacao[] {
  const e = d.empresa ?? {};
  const empresaOk = Boolean(txt(e["cnpj"] ?? e["documento"]) && txt(e["logo"] ?? e["logo_url"] ?? e["logomarca"]));
  const whatsOk = d.instancias.some((i) => i["webhook_ativo"] === true || /conect/i.test(txt(i["status"])));
  return [
    { id: "empresa", titulo: "Dados da empresa e marca", descricao: "CNPJ, endereço e logotipo.", rota: "/empresas", acao: "Completar cadastro", feito: empresaOk },
    { id: "whatsapp", titulo: "Conectar o WhatsApp", descricao: "Ligue a instância e ative o recebimento.", rota: "/empresas", acao: "Conectar WhatsApp", feito: whatsOk },
    { id: "equipe", titulo: "Equipe e acessos", descricao: "Cadastre pelo menos mais um usuário.", rota: "/usuarios", acao: "Convidar equipe", feito: d.usuarios.length >= 2 },
    { id: "catalogo", titulo: "Produtos e serviços", descricao: "Cadastre o que sua empresa vende.", rota: "/itens", acao: "Cadastrar itens", feito: d.itens.length > 0 },
    { id: "parceiros", titulo: "Clientes e fornecedores", descricao: "Importe a planilha ou cadastre o primeiro.", rota: "/parceiros", acao: "Cadastrar clientes", feito: d.parceiros.length > 0 },
    { id: "contas", titulo: "Contas bancárias", descricao: "Configure a conta para cobrança e fluxo de caixa.", rota: "/financeiro", acao: "Cadastrar conta", feito: d.contas.length > 0 },
    { id: "oferta", titulo: "Primeira Oferta", descricao: "Monte e envie a primeira proposta.", rota: "/orcamentos", acao: "Criar Oferta", feito: d.ofertas.length > 0 },
  ];
}

export function progressoImplantacao(passos: PassoImplantacao[]) {
  const feitos = passos.filter((p) => p.feito).length;
  return { feitos, total: passos.length, pct: passos.length ? Math.round((feitos / passos.length) * 100) : 0 };
}
