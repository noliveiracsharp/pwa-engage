import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoUpload } from "@/components/data-table/PhotoUpload";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { supabase } from "@/integrations/supabase/client";

const GRUPOS: { titulo: string; campos: [string, string, string?][] }[] = [
  { titulo: "Identificação", campos: [["nome", "Razão social", "sm:col-span-2"], ["titulo", "Nome fantasia"], ["cnpj_cpf", "CNPJ"], ["inscricao_estadual", "Inscrição estadual"]] },
  { titulo: "Contato", campos: [["email", "E-mail institucional"], ["telefone1", "Telefone"]] },
  { titulo: "Endereço", campos: [["cep", "CEP"], ["endereco", "Logradouro", "sm:col-span-2"], ["numero", "Número"], ["complemento", "Complemento"], ["bairro", "Bairro"], ["cidade", "Cidade"], ["uf", "UF"]] },
];
const MARCA = ["logo", "logo_escuro", "cor_primaria_claro", "cor_primaria_escuro"];
const TODOS = [...GRUPOS.flatMap((g) => g.campos.map((c) => c[0])), ...MARCA];

/** Telefones antigos gravados como "551141163571" viram "+551141163571" para o seletor de país não duplicar o 55. */
function carregar(d: Record<string, unknown>): Record<string, string> {
  const o = Object.fromEntries(TODOS.map((k) => [k, d[k] == null ? "" : String(d[k])]));
  const tel = o["telefone1"] ?? "";
  const dig = tel.replace(/\D/g, "");
  if (!tel.startsWith("+") && dig.startsWith("55") && dig.length >= 12) o["telefone1"] = `+${dig}`;
  return o;
}

/** Dados cadastrais e marca própria (white label) do condomínio, editáveis pelo síndico. */
export function DadosMarcaCondSecao({ condominioId, podeEditar }: { condominioId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["cond", "dados", condominioId], retry: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await (supabase as any).rpc("cond_dados_ler", { p_condominio: condominioId });
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? {}) as Record<string, unknown>;
    },
  });
  const [v, setV] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (q.data) setV(carregar(q.data));
  }, [q.data]);
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));

  async function salvar() {
    setSalvando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("cond_dados_salvar", { p_condominio: condominioId, p_dados: v });
    setSalvando(false);
    if (error) { toast.error(/function|schema cache/i.test(error.message) ? "Rode o script conectcon-meu-condominio-dados.sql no banco." : error.message); return; }
    toast.success("Dados do condomínio salvos.");
    for (const k of [["cond"], ["cond-marca"], ["table", "parceiros"], ["table", "empresas"]]) void qc.invalidateQueries({ queryKey: k });
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (q.error) return (
    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      {/function|schema cache/i.test(String(q.error.message)) ? "Para liberar esta aba, rode o script conectcon-meu-condominio-dados.sql no SQL Editor." : "Seu acesso não permite editar os dados deste condomínio."}
    </div>
  );

  return (
    <div className="space-y-4">
      {GRUPOS.map((g) => (
        <section key={g.titulo} className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-base font-semibold">{g.titulo}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.campos.map(([k, l, cls]) => (
              <div key={k} className={`min-w-0 ${cls ?? ""}`}>
                <Label htmlFor={`cd-${k}`} className="mb-1.5 block">{l}</Label>
                {k === "telefone1" && podeEditar
                  ? <PhoneInput value={v[k] ?? ""} onChange={(x: string) => set(k, x)} />
                  : <Input id={`cd-${k}`} value={v[k] ?? ""} disabled={!podeEditar} maxLength={k === "uf" ? 2 : undefined} onChange={(e) => set(k, k === "uf" ? e.target.value.toUpperCase() : e.target.value)} />}
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">Marca própria (white label)</h2>
        <p className="text-sm text-muted-foreground">Logo e cores aparecem no topo, no menu, nas atas e comunicados para todos que entram neste condomínio. Vazio usa a marca da administradora.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label className="mb-1.5 block">Logo (modo claro)</Label>{podeEditar ? <PhotoUpload value={v["logo"] ?? ""} alt="Logo do condomínio" onChange={(u) => set("logo", u)} /> : v["logo"] ? <img src={v["logo"]} alt="Logo do condomínio" className="h-16 object-contain" /> : null}</div>
          <div><Label className="mb-1.5 block">Logo (modo escuro, opcional)</Label>{podeEditar ? <PhotoUpload value={v["logo_escuro"] ?? ""} alt="Logo do condomínio no modo escuro" onChange={(u) => set("logo_escuro", u)} /> : null}</div>
          {([["cor_primaria_claro", "Cor principal — modo claro"], ["cor_primaria_escuro", "Cor principal — modo escuro"]] as const).map(([k, l]) => (
            <div key={k}>
              <Label htmlFor={`cd-${k}`} className="mb-1.5 block">{l}</Label>
              <div className="flex gap-2">
                <input type="color" aria-label={l} value={/^#[0-9a-f]{6}$/i.test(v[k] ?? "") ? v[k] : "#1d4ed8"} disabled={!podeEditar} onChange={(e) => set(k, e.target.value)} className="h-11 w-14 cursor-pointer rounded-md border border-input bg-background" />
                <Input id={`cd-${k}`} value={v[k] ?? ""} disabled={!podeEditar} placeholder="#000000" onChange={(e) => set(k, e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </section>
      {podeEditar && (
        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-3">
          <Button variant="outline" onClick={() => q.data && setV(carregar(q.data))}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      )}
    </div>
  );
}
