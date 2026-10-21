import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { bannerEmailHtml, type BannerEmail } from "@/lib/regua-cobranca";

const SCRIPT = "Rode o script atendeai-cotacao-versoes-e-banners.sql no SQL Editor.";
const TIPOS = [
  { value: "cobranca", label: "Somente cobrança" },
  { value: "oferta", label: "Somente Ofertas" },
  { value: "todos", label: "Todos os e-mails" },
];
const MODELOS: Array<Omit<BannerEmail, "url_destino"> & { nome: string }> = [
  { nome: "Falar com o comercial", titulo: "Quer ir além?", descricao: "Fale com nosso time comercial e conheça condições exclusivas para clientes.", texto_botao: "Falar com o comercial" },
  { nome: "Upgrade de plano", titulo: "Sua operação cresceu? Seu plano também pode.", descricao: "Mais usuários, mais recursos e prioridade no atendimento.", texto_botao: "Quero fazer upgrade" },
  { nome: "Novo serviço", titulo: "Novidade para você", descricao: "Conheça nosso novo serviço e aproveite a condição de lançamento.", texto_botao: "Conhecer agora" },
  { nome: "Indique e ganhe", titulo: "Indique um amigo e ganhe desconto", descricao: "Para cada indicação que fechar conosco, você ganha um benefício na próxima fatura.", texto_botao: "Indicar agora" },
];

export function useBannersEmail(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: ["email_banners", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_banners" as never).select("*").eq("empresa_id", empresaId as never).order("prioridade", { ascending: true });
      if (error) return { faltaScript: true, rows: [] as BannerEmail[] };
      return { faltaScript: false, rows: (data ?? []) as BannerEmail[] };
    },
  });
}

const VAZIO: BannerEmail = { nome: "", titulo: "", descricao: "", imagem_url: "", texto_botao: "Falar com o comercial", url_destino: "", cor_fundo: "", ativo: true, tipo: "todos", prioridade: 0 };

export function BannersEmailButton({ empresaId, cor, canEdit }: { empresaId: string | null | undefined; cor: string; canEdit: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<BannerEmail | null>(null);
  const qc = useQueryClient();
  const q = useBannersEmail(empresaId);
  const rows = q.data?.rows ?? [];
  const previa = useMemo(() => (form ? `<table width="560" style="font-family:Arial,sans-serif">${bannerEmailHtml({ ...form, titulo: form.titulo || "Título do banner", url_destino: form.url_destino || "#" }, cor || "#2563eb")}</table>` : ""), [form, cor]);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["email_banners", empresaId] });

  async function salvar() {
    if (!form) return;
    if (!form.nome?.trim() || !form.titulo.trim() || !form.url_destino.trim()) return void toast.error("Informe nome, título e link de destino.");
    const { id, ...dados } = form;
    const payload = { ...dados, empresa_id: empresaId, prioridade: Number(dados.prioridade ?? 0) || 0 };
    const r = id
      ? await supabase.from("email_banners" as never).update(payload as never).eq("id", id)
      : await supabase.from("email_banners" as never).insert(payload as never);
    if (r.error) return void toast.error(r.error.message.includes("email_banners") ? SCRIPT : r.error.message);
    toast.success("Banner salvo.");
    setForm(null);
    recarregar();
  }
  async function excluir(b: BannerEmail) {
    if (!(await confirmar({ title: "Excluir banner", description: `Excluir "${b.nome}"?`, destructive: true, confirmText: "Excluir" }))) return;
    const { error } = await supabase.from("email_banners" as never).delete().eq("id", b.id as never);
    if (error) return void toast.error(error.message);
    recarregar();
  }
  async function alternar(b: BannerEmail, ativo: boolean) {
    const { error } = await supabase.from("email_banners" as never).update({ ativo } as never).eq("id", b.id as never);
    if (error) return void toast.error(error.message);
    recarregar();
  }
  const set = (p: Partial<BannerEmail>) => setForm((f) => (f ? { ...f, ...p } : f));

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}><Megaphone className="mr-1 h-4 w-4" />Banners de e-mail</Button>
      <Sheet open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setForm(null); }}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[60vw]">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Banners de upsell nos e-mails</SheetTitle>
            <SheetDescription>O banner ativo aparece acima do rodapé dos e-mails de cobrança e de Ofertas. Ao clicar, abre o link em uma nova aba.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {q.data?.faltaScript && <p className="text-sm text-destructive">{SCRIPT}</p>}
            {!form && (
              <>
                {canEdit && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Começar a partir de um modelo</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setForm({ ...VAZIO })}><Plus className="mr-1 h-4 w-4" />Em branco</Button>
                      {[...MODELOS].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((m) => (
                        <Button key={m.nome} size="sm" variant="secondary" onClick={() => setForm({ ...VAZIO, ...m })}>{m.nome}</Button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="divide-y rounded-md border">
                  {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum banner cadastrado.</p>}
                  {rows.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 p-3">
                      <Switch checked={b.ativo !== false} disabled={!canEdit} onCheckedChange={(v) => void alternar(b, v)} aria-label="Ativo" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{b.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">{TIPOS.find((t) => t.value === (b.tipo ?? "todos"))?.label} · prioridade {b.prioridade ?? 0}</p>
                      </div>
                      {canEdit && <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setForm({ ...b })}><Pencil className="h-4 w-4" /></Button>}
                      {canEdit && <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => void excluir(b)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Quando houver mais de um ativo para o mesmo tipo de e-mail, vale o de menor prioridade.</p>
              </>
            )}
            {form && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="space-y-1"><Label>Nome do modelo</Label><Input value={form.nome ?? ""} onChange={(e) => set({ nome: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Título</Label><Input value={form.titulo} onChange={(e) => set({ titulo: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Descrição</Label><Textarea rows={3} value={form.descricao ?? ""} onChange={(e) => set({ descricao: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Texto do botão</Label><Input value={form.texto_botao ?? ""} onChange={(e) => set({ texto_botao: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Link de destino (comercial)</Label><Input placeholder="https://wa.me/5511999999999 ou site" value={form.url_destino} onChange={(e) => set({ url_destino: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Imagem pronta (opcional, 1120×240)</Label><Input placeholder="https://..." value={form.imagem_url ?? ""} onChange={(e) => set({ imagem_url: e.target.value })} /><p className="text-xs text-muted-foreground">Com imagem, o banner inteiro vira o link. Sem imagem, usa o cartão com título e botão.</p></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Cor de fundo</Label><Input type="color" value={form.cor_fundo || cor || "#2563eb"} onChange={(e) => set({ cor_fundo: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Prioridade</Label><Input type="number" value={form.prioridade ?? 0} onChange={(e) => set({ prioridade: Number(e.target.value) })} /></div>
                  </div>
                  <div className="space-y-1"><Label>Aparece em</Label><SearchSelect value={form.tipo ?? "todos"} onChange={(v) => set({ tipo: v as BannerEmail["tipo"] })} options={TIPOS} /></div>
                  <div className="flex items-center gap-2"><Switch checked={form.ativo !== false} onCheckedChange={(v) => set({ ativo: v })} /><Label>Ativo</Label></div>
                </div>
                <div className="space-y-1"><Label>Prévia</Label><iframe title="Prévia do banner" sandbox="" srcDoc={previa} className="h-64 w-full rounded-md border bg-card" /></div>
              </div>
            )}
          </div>
          {form && (
            <div className="flex justify-end gap-2 border-t p-4">
              <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
              <Button onClick={() => void salvar()}>Salvar</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
