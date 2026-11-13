import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, Languages, LogOut, Menu, Moon, RotateCw, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IDIOMAS, normalizarIdioma, useIdioma, type Idioma } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme-provider";
import { supabase } from "@/integrations/supabase/client";
import { pick } from "@/lib/row";
import { useTableRows, rowId } from "@/lib/crud";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight, Building2 } from "lucide-react";
import { lerAmbiente, useAmbientes } from "@/hooks/useAmbientes";
import { emModoUnidade, rotuloCargo } from "@/lib/ambientes";
import { useEffect, useState } from "react";
import { MeusDadosSheet } from "@/components/perfil/MeusDadosSheet";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { AvisosButton } from "@/components/layout/AvisosButton";
import { CentralAjuda } from "@/components/ajuda/CentralAjuda";
import { BuscaFuncoes } from "@/components/layout/BuscaFuncoes";
import { slugLembrado } from "@/lib/marca-publica";
import { Star } from "lucide-react";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { useCondSeletor } from "@/components/condominios/cond-seletor";
import { cn } from "@/lib/utils";
import { SemaforoConexao } from "@/components/layout/Conexao";

export function AppHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { usuario, empresa, user, isMaster, empresaContextoId, setEmpresaContexto } = useAuth();
  const { data: empresas = [] } = useTableRows("empresas", isMaster);
  const ativas = empresas.filter((e) => e["status"] !== false && e["ativo"] !== false);
  const { theme, toggleTheme } = useTheme();
  const { t, idioma, setIdioma: aplicarIdioma } = useIdioma();
  const idiomaPerfil = pick<string>(usuario, ["idioma"]);
  useEffect(() => {
    if (idiomaPerfil) aplicarIdioma(normalizarIdioma(idiomaPerfil));
  }, [idiomaPerfil, aplicarIdioma]);
  async function setIdioma(v: Idioma) {
    aplicarIdioma(v);
    const id = usuario ? rowId(usuario) : null;
    if (id != null) await supabase.from("usuarios").update({ idioma: v } as never).eq("id", id as never);
  }
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [meusDados, setMeusDados] = useState(false);
  const { data: ambientes } = useAmbientes();
  const [recarregando, setRecarregando] = useState(false);
  const modoUnidade = emModoUnidade(lerAmbiente());
  const condSel = useCondSeletor();
  const ambAtual = modoUnidade ? ambientes?.find((a) => a.id === lerAmbiente()) : undefined;

  const ativa = useEmpresaAtiva();
  const nome = pick<string>(usuario, ["nome", "nome_completo", "usuario_nome"], user?.email ?? "Usuário");
  const foto = pick<string>(usuario, ["foto", "avatar", "avatar_url", "imagem"]);
  const perfilId = pick<string | number>(usuario, ["perfil_id", "id_perfil"]);
  const { data: perfilNome } = useQuery({
    queryKey: ["perfil-nome", String(perfilId ?? "")],
    enabled: perfilId !== undefined && perfilId !== null && String(perfilId) !== "",
    queryFn: async () => {
      const { data } = await supabase.from("perfil").select("descricao").eq("id", perfilId as never).maybeSingle();
      return String((data as { descricao?: string } | null)?.descricao ?? "");
    },
  });
  const cargoExibido = ambAtual && ambAtual.tipo === "unidade" ? rotuloCargo(ambAtual.vinculo) : perfilNome;
  const iniciais = (nome ?? "U").slice(0, 2).toUpperCase();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    const s = slugLembrado();
    navigate({ to: "/login", search: (s ? { e: s } : {}) as never, replace: true });
  }

  return (
    <header className="flex h-16 w-full shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border bg-card px-2 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => (modoUnidade ? window.dispatchEvent(new Event("cond-menu-toggle")) : onToggleSidebar())} aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>
        {condSel && (!modoUnidade || condSel.opcoes.length > 1) ? (
          <div className="flex min-w-0 items-center gap-1">
            <div className="w-48 min-w-0 sm:w-72">
              <SearchSelect value={condSel.valor} onChange={condSel.onChange} options={condSel.opcoes} placeholder="Selecione o condomínio" emptyText="Nenhum condomínio." />
            </div>
            <Button size="icon" variant="ghost" className="shrink-0" disabled={!condSel.valor} aria-label={condSel.valor && condSel.padrao === condSel.valor ? "Remover condomínio padrão" : "Definir como condomínio padrão"} title={condSel.valor && condSel.padrao === condSel.valor ? "Remover condomínio padrão" : "Definir como condomínio padrão"} onClick={() => condSel.onPadrao(condSel.valor)}>
              <Star className={cn("size-4", condSel.valor && condSel.padrao === condSel.valor ? "fill-warning text-warning" : "text-muted-foreground")} />
            </Button>
          </div>
        ) : (
          <span className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">{ativa.titulo}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <BuscaFuncoes />
        {isMaster && !modoUnidade && (
          <Select
            value={empresaContextoId ?? String(empresa ? rowId(empresa) ?? "" : "")}
            onValueChange={(v) => {
              setEmpresaContexto(v);
              queryClient.invalidateQueries();
            }}
          >
            <SelectTrigger className="h-9 w-10 px-2 sm:mr-1 sm:w-[240px] sm:px-3 [&>span]:hidden sm:[&>span]:inline [&>svg:last-child]:hidden sm:[&>svg:last-child]:block" aria-label="Contexto da Empresa" title="Contexto da Empresa">
              <Building2 className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Contexto da Empresa" />
            </SelectTrigger>
            <SelectContent>
              {ativas.map((e) => (
                <SelectItem key={String(rowId(e))} value={String(rowId(e))}>
                  {pick<string>(e, ["nome_fantasia", "nome", "razao_social"], "Empresa")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          aria-label="Recarregar aplicação"
          title="Recarregar aplicação (Ctrl+F5)"
          disabled={recarregando}
          onClick={async () => {
            setRecarregando(true);
            try {
              queryClient.clear();
              if ("caches" in window) {
                const nomes = await caches.keys();
                await Promise.allSettled(nomes.map((n) => caches.delete(n)));
              }
              if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.allSettled(regs.map((r) => r.update()));
              }
            } finally {
              const url = new URL(window.location.href);
              url.searchParams.set("_r", String(Date.now()));
              window.location.replace(url.toString());
            }
          }}
        >
          <RotateCw className={`h-5 w-5 ${recarregando ? "animate-spin" : ""}`} />
        </Button>
        <CentralAjuda />
        {!modoUnidade && <div className="hidden sm:block"><AvisosButton /></div>}
        <SemaforoConexao />
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={toggleTheme} aria-label="Alternar tema">
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-9 w-9">
                {foto && <AvatarImage src={foto} alt={nome} />}
                <AvatarFallback>{iniciais}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="truncate">{nome}</span>
              {cargoExibido && <span className="truncate text-xs font-normal text-muted-foreground">{cargoExibido}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setMeusDados(true)}>
              <User className="mr-2 h-4 w-4" /> {t("menu.meusDados")}
            </DropdownMenuItem>
            {(ambientes?.length ?? 0) > 1 && (
              <DropdownMenuItem onSelect={() => navigate({ to: "/acesso" })}>
                <ArrowLeftRight className="mr-2 h-4 w-4" /> Trocar acesso
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="sm:hidden" onSelect={toggleTheme}>
              {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />} {theme === "dark" ? "Tema claro" : "Tema escuro"}
            </DropdownMenuItem>
            <DropdownMenuItem className="sm:hidden" onSelect={() => window.dispatchEvent(new Event("abrir-ajuda"))}>
              <HelpCircle className="mr-2 h-4 w-4" /> Ajuda e suporte
            </DropdownMenuItem>
            <DropdownMenuItem className="sm:hidden" onSelect={() => { queryClient.clear(); const u = new URL(window.location.href); u.searchParams.set("_r", String(Date.now())); window.location.replace(u.toString()); }}>
              <RotateCw className="mr-2 h-4 w-4" /> Recarregar aplicação
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages className="mr-2 h-4 w-4" /> {t("menu.idioma")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={idioma} onValueChange={(v) => setIdioma(v as Idioma)}>
                  {IDIOMAS.map((i) => (
                    <DropdownMenuRadioItem key={i.id} value={i.id}>
                      <span className="mr-2 w-6 text-xs font-semibold text-muted-foreground">{i.sigla}</span>
                      {i.nome}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> {t("acao.sair")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <MeusDadosSheet open={meusDados} onOpenChange={setMeusDados} />
      </div>
    </header>
  );
}
