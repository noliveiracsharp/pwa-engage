import { useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MODELO_IA_PADRAO, MODELOS_IA, type DadosNo } from "@/lib/fluxos";

type Arquivo = { nome: string; texto: string };
const LIMITE_ARQUIVO = 80_000;

async function lerArquivo(f: File): Promise<string> {
  if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
    const paginas: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      paginas.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
    return paginas.join("\n");
  }
  return f.text();
}

export function IaPropriedades({ d, atualizar }: { d: DadosNo; atualizar: (p: DadosNo) => void }) {
  const [lendo, setLendo] = useState(false);
  const s = (k: string) => String(d[k] ?? "");
  const arquivos = (Array.isArray(d["base_arquivos"]) ? d["base_arquivos"] : []) as Arquivo[];

  const enviar = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setLendo(true);
    try {
      const novos: Arquivo[] = [];
      for (const f of Array.from(lista)) {
        const texto = (await lerArquivo(f)).replace(/\s+\n/g, "\n").trim();
        if (!texto) { toast.error(`${f.name}: não foi possível ler o texto (PDF escaneado?)`); continue; }
        if (texto.length > LIMITE_ARQUIVO) toast.warning(`${f.name}: arquivo grande, usamos só o começo`);
        novos.push({ nome: f.name, texto: texto.slice(0, LIMITE_ARQUIVO) });
      }
      if (novos.length) atualizar({ base_arquivos: [...arquivos, ...novos] });
    } catch {
      toast.error("Não foi possível ler o arquivo");
    } finally {
      setLendo(false);
    }
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label>Modelo de IA</Label>
        <Select value={s("modelo") || MODELO_IA_PADRAO} onValueChange={(v) => atualizar({ modelo: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODELOS_IA.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Como a IA deve se comportar</Label>
        <Textarea rows={5} value={s("instrucoes")} onChange={(e) => atualizar({ instrucoes: e.target.value })} />
        <p className="text-xs text-muted-foreground">Identidade, tom e regras. Ex.: "Nunca prometa descontos."</p>
      </div>
      <div className="space-y-1.5">
        <Label>Base de conhecimento — texto</Label>
        <Textarea rows={5} value={s("base_texto")} onChange={(e) => atualizar({ base_texto: e.target.value })} placeholder="Perguntas frequentes, planos, horários..." />
      </div>
      <div className="space-y-1.5">
        <Label>Base de conhecimento — sites</Label>
        <Textarea rows={3} value={s("base_urls")} onChange={(e) => atualizar({ base_urls: e.target.value })} placeholder="https://conectcon.com/suporte" />
        <p className="text-xs text-muted-foreground">Um endereço por linha (até 5). O texto da página é lido na hora da pergunta.</p>
      </div>
      <div className="space-y-2">
        <Label>Base de conhecimento — arquivos (PDF ou TXT)</Label>
        {arquivos.map((a, i) => (
          <div key={`${a.nome}-${i}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{a.nome}</span>
            <span className="text-xs text-muted-foreground">{Math.round(a.texto.length / 1000)} mil letras</span>
            <Button size="icon" variant="ghost" className="size-7" onClick={() => atualizar({ base_arquivos: arquivos.filter((_, j) => j !== i) })}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:bg-muted">
          {lendo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {lendo ? "Lendo arquivo..." : "Adicionar arquivo"}
          <Input type="file" accept=".pdf,.txt,.md,.csv" multiple className="hidden" disabled={lendo} onChange={(e) => { void enviar(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Se a resposta não estiver na base, o bloco segue pela saída "Não soube". Se "Respondeu" não estiver ligado a nada, a IA continua conversando com o cliente. A resposta fica em {"{{resposta_ia}}"}.
      </p>
    </>
  );
}
