import { useEffect, useState } from "react";
import { Copy, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ANEXOS_CONTRATO, ANEXOS_PADRAO, blocosDe, imprimirElemento, linkMinuta, nomeAnexo, type AnexoContrato } from "@/lib/propostas";
import { text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { MinutaDocumento } from "./MinutaDocumento";
import { EnviarPropostaDialog } from "./EnviarPropostaDialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orcamento: Row | null;
  linhas: Row[];
  empresa: Row | null | undefined;
  cliente: Row | undefined;
  vendedor: Row | undefined;
  itens: Row[];
};

/** Minuta de contrato: escolhe anexos, imprime/PDF e envia link de leitura por WhatsApp. */
export function MinutaDialog(props: Props) {
  const { open, onOpenChange, orcamento, cliente, empresa } = props;
  const [anexos, setAnexos] = useState<AnexoContrato[]>(ANEXOS_PADRAO);
  const [envio, setEnvio] = useState(false);

  useEffect(() => {
    if (!open || !orcamento) return;
    const c = blocosDe(orcamento["blocos_selecionados"]).find((b) => b.tipo === "CONTRATO");
    setAnexos(c?.anexos ?? ANEXOS_PADRAO);
  }, [open, orcamento]);

  if (!orcamento) return null;
  const token = orcamento["token_publico"];
  const link = token ? linkMinuta(token, anexos) : "";
  const nome = text(pick(cliente ?? {}, ["nome_fantasia", "razao_social", "nome"]));
  const mensagem = [
    `Olá${nome ? `, ${nome}` : ""}!`,
    "",
    `Segue a *Minuta Contratual* da Oferta *${text(orcamento["numero"])}* para análise prévia do seu departamento jurídico/diretoria.`,
    "",
    `Anexos inclusos: ${anexos.map(nomeAnexo).join(", ") || "somente condições gerais"}.`,
    "",
    `🔗 Link para leitura: ${link}`,
    "",
    "Ficamos à disposição para eventuais alinhamentos de cláusulas.",
  ].join("\n");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94vh] w-[98vw] max-w-[1300px] flex-col gap-0 p-0">
        <DialogHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b px-5 py-3">
          <DialogTitle>Minuta de contrato {text(orcamento["numero"])}</DialogTitle>
          <div className="mr-8 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => imprimirElemento("minuta-preview")}>
              <Printer className="mr-1 h-4 w-4" /> PDF
            </Button>
            {link && (
              <>
                <Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(link); toast.success("Link copiado"); }}>
                  <Copy className="mr-1 h-4 w-4" /> Copiar link
                </Button>
                <Button size="sm" onClick={() => setEnvio(true)}>
                  <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                </Button>
              </>
            )}
          </div>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[340px_1fr]">
          <aside className="space-y-3 overflow-y-auto border-r p-4">
            <p className="text-sm font-medium">Anexos da minuta</p>
            <p className="text-muted-foreground text-xs">As condições gerais sempre vão. Os anexos escolhidos são renumerados como I, II, III…</p>
            {ANEXOS_CONTRATO.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-start gap-2 text-xs">
                <Checkbox
                  className="mt-0.5"
                  checked={anexos.includes(a.id)}
                  onCheckedChange={(v) =>
                    setAnexos(ANEXOS_PADRAO.filter((id) => (id === a.id ? v === true : anexos.includes(id))))
                  }
                />
                <span>
                  <span className="font-medium">{nomeAnexo(a.id)}</span>
                  <span className="text-muted-foreground block">{a.descricao}</span>
                </span>
              </label>
            ))}
          </aside>
          <div className="overflow-y-auto bg-muted/40 p-4 md:p-8">
            <div className="mx-auto max-w-[850px]">
              <MinutaDocumento id="minuta-preview" {...props} empresa={empresa} orcamento={orcamento} anexos={anexos} />
            </div>
          </div>
        </div>
      </DialogContent>
      {link && (
        <EnviarPropostaDialog
          open={envio}
          onOpenChange={setEnvio}
          orcamento={orcamento}
          empresa={empresa}
          cliente={cliente}
          link={link}
          titulo="Enviar Minuta por WhatsApp"
          mensagemInicial={mensagem}
          antesDeEnviar={async () => true}
        />
      )}
    </Dialog>
  );
}
