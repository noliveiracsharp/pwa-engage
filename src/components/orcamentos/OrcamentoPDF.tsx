import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Row } from "@/lib/row";
import { OrcamentoDocumento } from "./OrcamentoDocumento";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orcamento: Row | null;
  linhas: Row[];
  empresa: Row | null | undefined;
  cliente: Row | undefined;
  vendedor: Row | undefined;
  itens: Row[];
  unidades: Row[];
  marcas: Row[];
};

/** Pré-visualização do orçamento para o cliente, pronta para imprimir ou salvar em PDF. */
export function OrcamentoPDF({
  open,
  onOpenChange,
  orcamento,
  linhas,
  empresa,
  cliente,
  vendedor,
  itens,
  unidades,
  marcas,
}: Props) {
  if (!orcamento) return null;

  const numero = String(orcamento["numero"] ?? "") || "Orçamento";
  const imprimir = () => {
    const src = document.getElementById("orcamento-print");
    if (!src) return;
    const host = document.createElement("div");
    host.className = "orc-print-host";
    host.style.display = "none";
    host.appendChild(src.cloneNode(true));
    document.body.appendChild(host);
    document.documentElement.classList.add("orc-printing");
    const limpar = () => {
      document.documentElement.classList.remove("orc-printing");
      host.remove();
      window.removeEventListener("afterprint", limpar);
    };
    window.addEventListener("afterprint", limpar);
    const imgs = Array.from(host.querySelectorAll("img"));
    Promise.all(
      imgs.map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }),
      ),
    ).then(() => setTimeout(() => window.print(), 50));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-20 flex-row items-center justify-between gap-3 space-y-0 border-b bg-background px-6 py-4 print:hidden">
          <DialogTitle>Visualizar orçamento {numero}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button onClick={imprimir}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir / Salvar PDF
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar">
                <X className="h-5 w-5" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <OrcamentoDocumento id="orcamento-print" orcamento={orcamento} linhas={linhas} empresa={empresa} cliente={cliente} vendedor={vendedor} itens={itens} unidades={unidades} marcas={marcas} />
      </DialogContent>
    </Dialog>
  );
}
