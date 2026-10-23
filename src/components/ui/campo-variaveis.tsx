import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Braces, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { chaveVariavel, gatilhoVariavel, inserirVariavel, useVariaveisPersonalizadas, type VariavelDef } from "@/lib/variaveis";

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Variáveis do contexto (ex.: fornecedor, numero, link). */
  variaveis: VariavelDef[];
  empresaId: string | number | undefined;
  rows?: number;
  placeholder?: string;
  className?: string;
};

/** Campo de texto que abre a lista de variáveis ao digitar `{{` e permite criar variáveis da empresa. */
export function CampoVariaveis({ value, onChange, variaveis, empresaId, rows = 8, placeholder, className }: Props) {
  const qc = useQueryClient();
  const ref = useRef<HTMLTextAreaElement>(null);
  const { data: proprias = [] } = useVariaveisPersonalizadas(empresaId);
  const [gatilho, setGatilho] = useState<{ inicio: number; termo: string } | null>(null);
  const [ativo, setAtivo] = useState(0);
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoValor, setNovoValor] = useState("");

  const todas = useMemo<VariavelDef[]>(() => {
    const m = new Map<string, VariavelDef>();
    variaveis.forEach((v) => m.set(v.chave, v));
    proprias.forEach((r) => {
      const k = String(r["chave"]);
      if (!m.has(k)) m.set(k, { chave: k, descricao: String(r["valor"] ?? ""), personalizada: true });
    });
    return [...m.values()].sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"));
  }, [variaveis, proprias]);

  const filtradas = gatilho ? todas.filter((v) => v.chave.includes(gatilho.termo.toLowerCase())) : [];

  const atualizarGatilho = (texto: string, cursor: number) => {
    const g = gatilhoVariavel(texto, cursor);
    setGatilho(g);
    setAtivo(0);
    if (!g) setCriando(false);
  };

  const escolher = (chave: string) => {
    const el = ref.current;
    if (!el || !gatilho) return;
    const r = inserirVariavel(value, el.selectionStart, gatilho.inicio, chave);
    onChange(r.texto);
    setGatilho(null);
    setCriando(false);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.cursor, r.cursor); });
  };

  const abrirLista = () => {
    const el = ref.current;
    if (!el) return;
    const c = el.selectionStart;
    const novo = value.slice(0, c) + "{{" + value.slice(c);
    onChange(novo);
    setGatilho({ inicio: c, termo: "" });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(c + 2, c + 2); });
  };

  const criar = async () => {
    const chave = chaveVariavel(novoNome);
    if (!chave) return void toast.error("Informe o nome da variável.");
    if (todas.some((v) => v.chave === chave)) return escolher(chave);
    const { error } = await supabase.from("variaveis_personalizadas" as never).insert({ empresa_id: String(empresaId), chave, valor: novoValor } as never);
    if (error) return void toast.error("Não foi possível criar. Rode o script atendeai-variaveis-personalizadas.sql no banco.");
    await qc.invalidateQueries({ queryKey: ["variaveis_personalizadas"] });
    toast.success(`Variável {{${chave}}} criada.`);
    setNovoNome(""); setNovoValor("");
    escolher(chave);
  };

  return (
    <div className={cn("relative", className)}>
      <Textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); atualizarGatilho(e.target.value, e.target.selectionStart); }}
        onClick={(e) => atualizarGatilho(value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => { if (!criando) setGatilho(null); }, 150)}
        onKeyDown={(e) => {
          if (!gatilho || criando) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((a) => Math.min(a + 1, Math.max(filtradas.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          else if ((e.key === "Enter" || e.key === "Tab") && filtradas[ativo]) { e.preventDefault(); escolher(filtradas[ativo].chave); }
          else if (e.key === "Escape") { e.preventDefault(); setGatilho(null); }
        }}
      />
      <Button type="button" variant="ghost" size="sm" className="absolute top-1 right-1 h-7 px-2 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={abrirLista} title="Inserir variável">
        <Braces className="mr-1 h-3.5 w-3.5" />Variável
      </Button>
      {gatilho && (
        <div className="absolute right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-sm shadow-lg" onMouseDown={(e) => e.preventDefault()}>
          {filtradas.length === 0 && !criando && <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma variável encontrada.</p>}
          {!criando && filtradas.map((v, i) => (
            <button key={v.chave} type="button" onClick={() => escolher(v.chave)} className={cn("flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left", i === ativo ? "bg-accent" : "hover:bg-accent")}>
              <span className="font-mono text-xs">{`{{${v.chave}}}`}</span>
              <span className="truncate text-xs text-muted-foreground">{v.personalizada ? `Personalizada · ${v.descricao}` : v.descricao}</span>
            </button>
          ))}
          {empresaId && (criando ? (
            <div className="space-y-2 p-2">
              <Input autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome (ex.: chave_pix)" />
              <Input value={novoValor} onChange={(e) => setNovoValor(e.target.value)} placeholder="Valor padrão" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void criar())} />
              {novoNome && <p className="text-xs text-muted-foreground">Será usada como {`{{${chaveVariavel(novoNome)}}}`}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setCriando(false); ref.current?.focus(); }}>Cancelar</Button>
                <Button type="button" size="sm" onClick={() => void criar()}>Salvar</Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setCriando(true); setNovoNome(gatilho.termo); }} className="mt-1 flex w-full items-center gap-1 rounded border-t border-border px-2 py-1.5 text-left text-xs text-primary hover:bg-accent">
              <Plus className="h-3.5 w-3.5" /> Criar nova variável
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
