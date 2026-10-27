import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Substitui window.confirm/prompt/alert por diálogos no tema do sistema. */
export type ConfirmOpts = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** Botão extra (verde), ex.: "Sair e salvar". */
  extraText?: string;
  onExtra?: () => void;
};
export type PromptOpts = ConfirmOpts & { defaultValue?: string; placeholder?: string; multiline?: boolean; required?: boolean };

type Pedido =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: "alert"; opts: ConfirmOpts; resolve: () => void };

let enfileirar: ((p: Pedido) => void) | null = null;
const pendentes: Pedido[] = [];
function enviar(p: Pedido) { if (enfileirar) enfileirar(p); else pendentes.push(p); }

const DESTRUTIVO = /excluir|apagar|remover|desconectar|estornar|substituir/i;
const norm = (o: string | ConfirmOpts): ConfirmOpts => (typeof o === "string" ? { description: o } : o);

export function confirmar(o: string | ConfirmOpts): Promise<boolean> {
  const opts = norm(o);
  const destructive = opts.destructive ?? DESTRUTIVO.test(`${opts.title ?? ""} ${opts.description ?? ""}`);
  return new Promise((resolve) => enviar({ kind: "confirm", opts: { ...opts, destructive }, resolve }));
}
export function perguntar(o: string | PromptOpts): Promise<string | null> {
  const opts = typeof o === "string" ? { title: o } : o;
  return new Promise((resolve) => enviar({ kind: "prompt", opts, resolve }));
}
export function avisar(o: string | ConfirmOpts): Promise<void> {
  return new Promise((resolve) => enviar({ kind: "alert", opts: norm(o), resolve }));
}

export function DialogoGlobal() {
  const [fila, setFila] = useState<Pedido[]>([]);
  const [texto, setTexto] = useState("");
  useEffect(() => {
    enfileirar = (p) => setFila((f) => [...f, p]);
    if (pendentes.length) setFila((f) => [...f, ...pendentes.splice(0)]);
    return () => { enfileirar = null; };
  }, []);
  const atual = fila[0];
  useEffect(() => { if (atual?.kind === "prompt") setTexto(atual.opts.defaultValue ?? ""); }, [atual]);

  const fechar = (ok: boolean) => {
    if (!atual) return;
    if (atual.kind === "confirm") atual.resolve(ok);
    else if (atual.kind === "prompt") atual.resolve(ok ? texto : null);
    else atual.resolve();
    setFila((f) => f.slice(1));
  };
  if (!atual) return null;
  const { opts } = atual;
  const destructive = atual.kind === "confirm" && opts.destructive;
  const titulo = opts.title ?? (atual.kind === "alert" ? tr("msg.aviso") : destructive ? tr("msg.confirmarExclusao").replace("?", "") : tr("acao.confirmar"));
  const bloqueado = atual.kind === "prompt" && (atual.opts.required ?? true) && !texto.trim();
  const Icone = destructive ? AlertTriangle : Info;

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) fechar(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icone className={destructive ? "h-5 w-5 text-destructive" : "h-5 w-5 text-primary"} />{titulo}
          </AlertDialogTitle>
          {opts.description && <AlertDialogDescription className="whitespace-pre-line">{opts.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {atual.kind === "prompt" && (atual.opts.multiline
          ? <Textarea autoFocus value={texto} placeholder={atual.opts.placeholder} onChange={(e) => setTexto(e.target.value)} />
          : <Input autoFocus value={texto} placeholder={atual.opts.placeholder} onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !bloqueado) fechar(true); }} />)}
        <AlertDialogFooter>
          {atual.kind !== "alert" && <AlertDialogCancel>{opts.cancelText ?? tr("acao.cancelar")}</AlertDialogCancel>}
          {atual.kind === "confirm" && opts.extraText && (
            <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={() => { opts.onExtra?.(); fechar(false); }}>
              {opts.extraText}
            </Button>
          )}
          <Button autoFocus={atual.kind !== "prompt"} disabled={bloqueado} variant={destructive ? "destructive" : "default"} onClick={() => fechar(true)}>
            {opts.confirmText ?? (atual.kind === "alert" ? tr("acao.entendi") : destructive ? tr("acao.simContinuar") : tr("acao.confirmar"))}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
