import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Link2, MessageCircle, Printer, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RichEditor } from "./RichEditor";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { rowId } from "@/lib/crud";
import {
  BLOCO_LABEL,
  blocosDe,
  ANEXOS_CONTRATO,
  ANEXOS_PADRAO,
  contratoPadraoPendente,
  gerarContratoModular,
  type AnexoContrato,
  imprimirElemento,
  linkProposta,
  TAGS,
  type Bloco,
} from "@/lib/propostas";
import type { Row } from "@/lib/row";
import { PropostaDocumento } from "./PropostaDocumento";
import { CapaEstiloEditor } from "./CapaEstiloEditor";
import { EnviarPropostaDialog } from "./EnviarPropostaDialog";
import { confirmar, perguntar } from "@/components/layout/DialogoGlobal";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orcamento: Row | null;
  linhas: Row[];
  empresa: Row | null | undefined;
  cliente: Row | undefined;
  vendedor: Row | undefined;
  itens: Row[];
  unidades: Row[];
  marcas: Row[];
};

const dataHora = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

/** Montador da proposta digital: blocos editáveis, modelos por empresa e link público. */
export function PropostaDialog(props: Props) {
  const { open, onOpenChange, orcamento, empresa, cliente } = props;
  const qc = useQueryClient();
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [envioOpen, setEnvioOpen] = useState(false);
  const empresaId = String(orcamento?.["empresa_id"] ?? rowId(empresa ?? {}) ?? "");

  useEffect(() => {
    if (!open || !orcamento) return;
    setBlocos(
      blocosDe(orcamento["blocos_selecionados"]).map((b) =>
        contratoPadraoPendente(b)
          ? {
              ...b,
              ativo: true,
              titulo: "Contrato de prestação de serviços e tecnologia",
              anexos: b.anexos ?? ANEXOS_PADRAO,
              conteudo: gerarContratoModular({ ...props, orcamento, anexos: b.anexos ?? ANEXOS_PADRAO }),
            }
          : b,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orcamento]);

  const templates = useQuery({
    queryKey: ["orcamentos_templates", empresaId],
    enabled: open && !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orcamentos_templates" as never)
        .select("*")
        .eq("empresa_id", empresaId)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (!orcamento) return null;
  const token = orcamento["token_publico"];
  const link = token ? linkProposta(token) : "";

  const set = (i: number, patch: Partial<Bloco>) =>
    setBlocos((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const salvar = async (silencioso = false) => {
    setSalvando(true);
    const { error } = await supabase
      .from("orcamentos")
      .update({ blocos_selecionados: blocos } as never)
      .eq("id", rowId(orcamento) as never);
    setSalvando(false);
    if (error) {
      toast.error("Não foi possível salvar a proposta", { description: error.message });
      return false;
    }
    qc.invalidateQueries({ queryKey: ["table", "orcamentos"] });
    if (!silencioso) toast.success("Proposta salva");
    return true;
  };

  const salvarModelo = async (b: Bloco) => {
    const nome = await perguntar({ title: `Nome do modelo de ${BLOCO_LABEL[b.tipo]}`, defaultValue: b.titulo });
    if (!nome) return;
    const { error } = await supabase.from("orcamentos_templates" as never).insert({
      empresa_id: empresaId,
      nome,
      tipo: b.tipo,
      conteudo: JSON.stringify({ titulo: b.titulo, conteudo: b.conteudo, estilo: b.estilo }),
    } as never);
    if (error) {
      toast.error("Erro ao salvar modelo", { description: error.message });
      return;
    }
    toast.success("Modelo salvo");
    templates.refetch();
  };

  const aplicarModelo = (i: number, id: string) => {
    const tpl = (templates.data ?? []).find((t) => String(rowId(t)) === id);
    if (!tpl) return;
    const raw = String(tpl["conteudo"] ?? "");
    try {
      const j = JSON.parse(raw) as { titulo?: string; conteudo?: string; estilo?: Bloco["estilo"] };
      set(i, {
        titulo: j.titulo ?? blocos[i]?.titulo ?? "",
        conteudo: j.conteudo ?? "",
        ...(j.estilo ? { estilo: j.estilo } : {}),
      });
    } catch {
      set(i, { conteudo: raw });
    }
  };

  const copiar = async () => {
    if (!(await salvar(true))) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  const whatsapp = () => setEnvioOpen(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94vh] w-[98vw] max-w-[1400px] flex-col gap-0 p-0">
        <DialogHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Proposta digital {String(orcamento["numero"] ?? "")}</DialogTitle>
            {orcamento["assinado_em"] ? (
              <Badge className="bg-success text-success-foreground">Assinada {dataHora(orcamento["assinado_em"])}</Badge>
            ) : orcamento["visualizado_em"] ? (
              <Badge variant="secondary">
                <Eye className="mr-1 h-3 w-3" /> Cliente abriu em {dataHora(orcamento["visualizado_em"])}
              </Badge>
            ) : token ? (
              <Badge variant="outline">Ainda não visualizada</Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => imprimirElemento("proposta-preview")}>
              <Printer className="mr-1 h-4 w-4" /> PDF
            </Button>
            {token ? (
              <>
                <Button variant="outline" size="sm" onClick={copiar}>
                  <Copy className="mr-1 h-4 w-4" /> Copiar link
                </Button>
                <Button variant="outline" size="sm" onClick={whatsapp}>
                  <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                </Button>
                <Button variant="outline" size="sm" onClick={async () => (await salvar(true)) && window.open(link, "_blank")}>
                  <Link2 className="mr-1 h-4 w-4" /> Abrir
                </Button>
              </>
            ) : (
              <span className="text-muted-foreground text-xs">Execute o script da proposta no banco para gerar o link.</span>
            )}
            <Button size="sm" className="mr-8" onClick={() => salvar()} disabled={salvando}>
              <Save className="mr-1 h-4 w-4" /> Salvar
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[460px_1fr]">
          <aside className="space-y-3 overflow-y-auto border-r p-4">
            <p className="text-muted-foreground text-xs">
              Formate textos, cores e caixas de destaque. Use o botão {"{ }"} para inserir dados do cliente.
            </p>
            {blocos.map((b, i) => {
              const tpls = (templates.data ?? []).filter((t) => t["tipo"] === b.tipo);
              return (
                <div key={b.tipo} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{BLOCO_LABEL[b.tipo]}</span>
                    <Switch checked={b.ativo} onCheckedChange={(v) => set(i, { ativo: v })} />
                  </div>
                  {b.ativo && b.tipo !== "ORCAMENTO" && (
                    <>
                      {b.tipo === "CAPA" && (
                        <CapaEstiloEditor estilo={b.estilo} onChange={(estilo) => set(i, { estilo })} />
                      )}
                      <Input value={b.titulo} onChange={(e) => set(i, { titulo: e.target.value })} placeholder="Título" />
                      <RichEditor
                        value={b.conteudo}
                        onChange={(html) => set(i, { conteudo: html })}
                        minHeight={b.tipo === "CONTRATO" ? 260 : 160}
                      />
                      {b.tipo === "CONTRATO" && (
                        <div className="bg-muted/40 space-y-2 rounded-md border p-2">
                          <p className="text-xs font-medium">Anexos incluídos (desmarque o que não foi vendido)</p>
                          {ANEXOS_CONTRATO.map((a) => {
                            const sel = b.anexos ?? ANEXOS_PADRAO;
                            return (
                              <label key={a.id} className="flex cursor-pointer items-start gap-2 text-xs">
                                <Checkbox
                                  className="mt-0.5"
                                  checked={sel.includes(a.id)}
                                  onCheckedChange={(v) => {
                                    const anexos: AnexoContrato[] = ANEXOS_CONTRATO.map((x) => x.id).filter((id) =>
                                      id === a.id ? v === true : sel.includes(id),
                                    );
                                    set(i, {
                                      anexos,
                                      conteudo: gerarContratoModular({ ...props, orcamento, anexos }),
                                    });
                                  }}
                                />
                                <span>
                                  <span className="font-medium">{a.label}</span>
                                  <span className="text-muted-foreground block">{a.descricao}</span>
                                </span>
                              </label>
                            );
                          })}
                          <p className="text-muted-foreground text-[11px]">
                            Marcar ou desmarcar refaz o contrato; ajustes manuais no texto devem ser feitos depois.
                          </p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {b.tipo === "CONTRATO" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={async () => {
                              if (b.conteudo.trim() && !await confirmar("Substituir o texto atual pelo contrato gerado a partir da oferta?")) return;
                              set(i, {
                                titulo: "Contrato de prestação de serviços e tecnologia",
                                conteudo: gerarContratoModular({ ...props, orcamento, anexos: b.anexos ?? ANEXOS_PADRAO }),
                              });
                            }}
                          >
                            Restaurar modelo padrão
                          </Button>
                        )}
                        {tpls.length > 0 && (
                          <Select onValueChange={(v) => aplicarModelo(i, v)}>
                            <SelectTrigger className="h-8 flex-1 text-xs">
                              <SelectValue placeholder="Carregar modelo" />
                            </SelectTrigger>
                            <SelectContent>
                              {tpls.map((t) => (
                                <SelectItem key={String(rowId(t))} value={String(rowId(t))}>
                                  {String(t["nome"] ?? "")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => salvarModelo(b)}>
                          Salvar como modelo
                        </Button>
                      </div>
                    </>
                  )}
                  {b.ativo && b.tipo === "ORCAMENTO" && (
                    <p className="text-muted-foreground text-xs">Itens, totais e pagamento vêm da oferta.</p>
                  )}
                </div>
              );
            })}
          </aside>
          <div className="overflow-y-auto bg-muted/40 p-4 md:p-8">
            <div className="mx-auto max-w-[850px]">
              <PropostaDocumento id="proposta-preview" blocos={blocos} {...props} orcamento={orcamento} />
            </div>
          </div>
        </div>
      </DialogContent>
      {link && (
        <EnviarPropostaDialog
          open={envioOpen}
          onOpenChange={setEnvioOpen}
          orcamento={orcamento}
          empresa={empresa}
          cliente={cliente}
          link={link}
          antesDeEnviar={() => salvar(true)}
        />
      )}
    </Dialog>
  );
}
