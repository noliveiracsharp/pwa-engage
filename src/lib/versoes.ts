// Versionamento semântico do sistema: vMAJOR.MINOR.PATCH
export type Versao = {
  id: string;
  versao: string;
  major: number;
  minor: number;
  patch: number;
  descricao: string | null;
  is_atual: boolean;
  data_lancamento: string | null;
};

export type Atualizacao = {
  id: string;
  versao_id: string | null;
  titulo: string;
  descricao: string;
  tipo: "novo_recurso" | "melhoria" | "correcao";
  categoria: "ultimas" | "futuras";
  data_publicacao: string | null;
  ordem: number;
  ativo: boolean;
};

export type Sugestao = {
  id: string;
  usuario_id: string | null;
  empresa_id: string | null;
  sugestao: string;
  status: string;
  resposta_admin: string | null;
  created_at: string;
};

export type TipoIncremento = "major" | "minor" | "patch";

export function proximaVersao(atual: Pick<Versao, "major" | "minor" | "patch"> | null, tipo: TipoIncremento) {
  const b = atual ?? { major: 1, minor: 0, patch: 0 };
  if (tipo === "major") return { major: b.major + 1, minor: 0, patch: 0 };
  if (tipo === "minor") return { major: b.major, minor: b.minor + 1, patch: 0 };
  return { major: b.major, minor: b.minor, patch: b.patch + 1 };
}

export const fmtVersao = (v: { major: number; minor: number; patch: number }) => `v${v.major}.${v.minor}.${v.patch}`;

export const TIPO_LABEL: Record<Atualizacao["tipo"], string> = {
  novo_recurso: "Novo recurso",
  melhoria: "Melhorias",
  correcao: "Correção",
};

export const TIPO_CLASS: Record<Atualizacao["tipo"], string> = {
  novo_recurso: "bg-primary/15 text-primary",
  melhoria: "bg-accent text-accent-foreground",
  correcao: "bg-warning/15 text-warning",
};

export const STATUS_SUGESTAO: Record<string, string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  planejado: "Planejado",
  concluido: "Implementado",
  descartado: "Descartado",
};

export const fmtData = (d: string | null) => (d ? new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "");
