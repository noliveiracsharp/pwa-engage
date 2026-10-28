import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextoRico } from "@/components/ui/texto-rico";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { useAudit } from "@/lib/audit";
import { salvarModeloContrato, useModelosContrato } from "@/lib/contrato-modelos";
import { modeloPadraoContrato, SECOES_CONTRATO, TAGS, TAGS_CONTRATO, type SecaoContrato } from "@/lib/propostas";

/** Documentos → Contrato da Oferta: edita condições gerais e anexos A–D usados nas Ofertas. */
export function ContratoOfertaModelos({ canEdit }: { canEdit: boolean }) {
  const { empresaId } = useAudit();
  const eid = empresaId ? String(empresaId) : "";
  const qc = useQueryClient();
  const { data: modelos = {}, isFetched } = useModelosContrato(eid);
  const [secao, setSecao] = useState<SecaoContrato>("geral");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const personalizado = !!modelos[secao];

  useEffect(() => {
    if (!isFetched) return;
    setTexto(modelos[secao] ?? modeloPadraoContrato(secao));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secao, isFetched, modelos[secao]]);

  async function gravar(conteudo: string | null) {
    if (!eid) { toast.error("Selecione a empresa."); return; }
    setSalvando(true);
    try {
      await salvarModeloContrato(eid, secao, conteudo);
      await qc.invalidateQueries({ queryKey: ["contratos_modelos", eid] });
      toast.success(conteudo ? "Modelo salvo. As próximas Ofertas usarão este texto." : "Texto padrão restaurado.");
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}. Rode o script do contrato no SQL Editor.`);
    } finally {
      setSalvando(false);
    }
  }

  async function restaurar() {
    if (!(await confirmar({ titulo: "Restaurar texto padrão?", descricao: "O texto personalizado desta seção será apagado." }))) return;
    await gravar(null);
  }

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <aside className="space-y-1">
        {SECOES_CONTRATO.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSecao(s.id)}
            className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${secao === s.id ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-muted"}`}
          >
            <span className="block font-medium">{s.label}</span>
            <span className="text-muted-foreground text-xs">{modelos[s.id] ? "Personalizado" : "Padrão do sistema"}</span>
          </button>
        ))}
      </aside>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{SECOES_CONTRATO.find((s) => s.id === secao)?.label}</h3>
          <Badge variant={personalizado ? "default" : "secondary"}>{personalizado ? "Personalizado" : "Padrão"}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Este texto entra no contrato da Oferta (oferta digital e minuta). Mantenha o título "Anexo X —" nos anexos para a numeração automática. Variáveis:{" "}
          {[...TAGS_CONTRATO, ...TAGS].map((t) => (
            <code key={t} className="bg-muted mr-1 rounded px-1 text-xs">{t}</code>
          ))}
        </p>
        <TextoRico value={texto} onChange={setTexto} minHeight={360} disabled={!canEdit} />
        {canEdit && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={!personalizado || salvando} onClick={() => void restaurar()}>
              <RotateCcw className="mr-1 h-4 w-4" /> Restaurar padrão
            </Button>
            <Button disabled={salvando} onClick={() => void gravar(texto)}>
              <Save className="mr-1 h-4 w-4" /> Salvar
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
