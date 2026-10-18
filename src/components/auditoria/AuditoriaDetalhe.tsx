import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type AuditoriaLog, OPERACAO_LABEL, camposVisiveis, nomeTabela, valorTexto } from "@/lib/auditoria";

export function OperacaoBadge({ op }: { op: AuditoriaLog["operacao"] }) {
  const cls =
    op === "INSERT" ? "bg-success/15 text-success" : op === "DELETE" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning";
  return <Badge variant="outline" className={`border-0 ${cls}`}>{OPERACAO_LABEL[op]}</Badge>;
}

export function AuditoriaDetalhe({ log, onClose }: { log: AuditoriaLog | null; onClose: () => void }) {
  const diff = log ? camposVisiveis(log.campos_alterados) : [];
  const snapshot = log?.operacao === "DELETE" ? log.dados_anteriores : log?.dados_novos;
  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {log && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <OperacaoBadge op={log.operacao} /> {nomeTabela(log.tabela)}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Quando:</span> {new Date(log.criado_em).toLocaleString("pt-BR")}</div>
              <div><span className="text-muted-foreground">Quem:</span> {log.usuario_nome ?? "Sistema / automação"}</div>
              <div className="break-all"><span className="text-muted-foreground">E-mail:</span> {log.usuario_email ?? "—"}</div>
              <div><span className="text-muted-foreground">IP:</span> {log.ip || "—"}</div>
              <div className="col-span-2 break-all"><span className="text-muted-foreground">Registro:</span> {log.registro_id}</div>
            </div>
            {log.operacao === "UPDATE" ? (
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-2">Campo</th><th className="py-1 pr-2">Antes</th><th className="py-1">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map(([k, d]) => (
                    <tr key={k} className="border-b align-top">
                      <td className="py-1 pr-2 font-medium">{k.replace(/_/g, " ")}</td>
                      <td className="py-1 pr-2 break-all text-destructive">{valorTexto(d.de)}</td>
                      <td className="py-1 break-all text-success">{valorTexto(d.para)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="mt-2">
                <p className="mb-1 text-sm text-muted-foreground">
                  {log.operacao === "DELETE" ? "Conteúdo no momento da exclusão" : "Dados gravados na criação"}
                </p>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(snapshot, null, 2)}</pre>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
