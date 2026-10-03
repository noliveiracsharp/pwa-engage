import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  MessageCircle, KanbanSquare, Calculator, FolderKanban, Moon, Sun, Menu, X, Check, Users,
  Bot, ShieldCheck, Zap, BarChart3, ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/components/theme-provider";
import { formatBRL, num } from "@/lib/orcamentos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

/** Número do WhatsApp comercial (somente dígitos, com 55). Ajuste para o número real. */
export const WHATSAPP_VENDAS = "5500000000000";

const waLink = (msg: string) => `https://wa.me/${WHATSAPP_VENDAS}?text=${encodeURIComponent(msg)}`;

type Plano = {
  id: string;
  nome: string;
  descricao: string | null;
  valor_mensal: number | null;
  usuarios_inclusos: number | null;
  valor_usuario_adicional: number | null;
};

const NAV = [
  { id: "recursos", label: "Recursos" },
  { id: "modulos", label: "Módulos" },
  { id: "planos", label: "Planos" },
  { id: "duvidas", label: "Dúvidas" },
  { id: "contato", label: "Contato" },
];

const FAQ = [
  { q: "Como funciona o teste grátis?", a: "Você escolhe um plano, envia seus dados e nossa equipe ativa seu acesso para testar o sistema completo antes de pagar." },
  { q: "Preciso de cartão de crédito para testar?", a: "Não. O teste é liberado sem cartão." },
  { q: "Posso ter vários usuários?", a: "Sim. Cada plano já inclui um número de usuários, e você pode adicionar mais quando precisar." },
  { q: "Quanto custa um usuário adicional?", a: "O valor por usuário adicional aparece no card de cada plano." },
  { q: "Posso cancelar quando quiser?", a: "Sim. Não há fidelidade: você pode cancelar a qualquer momento." },
  { q: "O suporte é em português?", a: "Sim. Nosso suporte é feito em português, direto pelo WhatsApp." },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img src="/icon-192.png" alt="Atende.ai" className="h-8 w-8 rounded-lg" />
      <span className="text-lg font-bold tracking-tight text-foreground">
        Atende<span className="text-primary">.ai</span>
      </span>
    </div>
  );
}

export function LandingPage() {
  const { theme, toggleTheme } = useTheme();
  const [logado, setLogado] = useState(false);
  const [menu, setMenu] = useState(false);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLogado(!!data.session));
  }, []);

  const { data: planos = [], isLoading } = useQuery({
    queryKey: ["landing-planos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planos_base" as never)
        .select("*")
        .eq("status", true)
        .order("valor_mensal", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Plano[];
    },
  });

  const abrirPlano = (p: Plano | null) => {
    setPlano(p);
    setAberto(true);
  };

  const testar = () => {
    setMenu(false);
    if (planos.length === 1) abrirPlano(planos[0]);
    else scrollTo("planos");
  };

  const go = (id: string) => {
    setMenu(false);
    scrollTo(id);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Início">
            <Logo />
          </button>
          <nav className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => go(n.id)} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                {n.label}
              </button>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" asChild>
              <Link to={logado ? "/dashboard" : "/login"}>{logado ? "Ir para o Painel" : "Acessar Sistema"}</Link>
            </Button>
            <Button onClick={testar}>Testar Grátis</Button>
          </div>
          <div className="flex items-center gap-1 md:hidden">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMenu((m) => !m)} aria-label="Menu">
              {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        {menu && (
          <div className="border-t border-border bg-background px-4 py-4 md:hidden">
            <div className="flex flex-col gap-3">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => go(n.id)} className="text-left text-sm font-medium text-muted-foreground">
                  {n.label}
                </button>
              ))}
              <Button variant="outline" asChild>
                <Link to={logado ? "/dashboard" : "/login"}>{logado ? "Ir para o Painel" : "Acessar Sistema"}</Link>
              </Button>
              <Button onClick={testar}>Testar Grátis</Button>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-accent/60 blur-3xl" />
        </div>
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="space-y-6">
            <Badge variant="secondary" className="gap-1 px-3 py-1">
              <Bot className="h-3.5 w-3.5 text-primary" /> Atendimento com IA + WhatsApp
            </Badge>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Sua Empresa no Controle:{" "}
              <span className="text-primary">Atendimentos WhatsApp, Orçamentos e Projetos</span> em uma só Plataforma
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Centralize seus canais de atendimento, automatize processos com IA, gerencie funis de vendas e calcule orçamentos com taxa de juros automática.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => go("planos")} className="gap-2">
                Ver Planos e Começar <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" asChild className="gap-2">
                <a href={waLink("Olá, gostaria de tirar dúvidas sobre os planos do Atende.ai")} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" /> Falar com Consultor
                </a>
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> Sem cartão para testar</span>
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> Multiempresa</span>
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> Suporte em português</span>
            </div>
          </div>
          <Mockup />
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="scroll-mt-20 border-y border-border bg-muted/40">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {[
            { icon: Bot, t: "IA no atendimento", d: "Respostas automáticas e repasse suave para a equipe." },
            { icon: Users, t: "Vários atendentes", d: "Filas por departamento e conversas atribuídas." },
            { icon: ShieldCheck, t: "Permissões por perfil", d: "Cada pessoa vê só o que precisa." },
            { icon: BarChart3, t: "Relatórios e avaliação", d: "Nota de satisfação e indicadores em tempo real." },
          ].map((r) => (
            <div key={r.t} className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <r.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">{r.t}</p>
                <p className="text-sm text-muted-foreground">{r.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Módulos */}
      <section id="modulos" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Badge variant="outline" className="mb-3">Módulos</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Tudo o que sua operação precisa</h2>
          <p className="mt-3 text-muted-foreground">Do primeiro contato no WhatsApp ao projeto entregue, sem trocar de sistema.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: MessageCircle, t: "Central do WhatsApp", d: "Múltiplos atendentes, notas internas, filas, etiquetas e suporte a grupos." },
            { icon: KanbanSquare, t: "Kanban e Funis", d: "Gestão visual de leads e chamados por etapas personalizáveis." },
            { icon: Calculator, t: "Orçamentos Inteligentes", d: "Cálculo de margem, custo, impostos e tabela de juros parcelados automática." },
            { icon: FolderKanban, t: "Gestão de Projetos", d: "Espaços, subespaços, modelos de tarefas e acompanhamento de prazos." },
          ].map((m) => (
            <Card key={m.t} className="group transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg">
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-110">
                  <m.icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg">{m.t}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{m.d}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-20 bg-muted/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <Badge variant="outline" className="mb-3">Planos</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Escolha o plano ideal</h2>
            <p className="mt-3 text-muted-foreground">Comece com um teste grátis e cresça no seu ritmo.</p>
          </div>
          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-80 animate-pulse rounded-xl bg-muted" />)}
            </div>
          ) : planos.length === 0 ? (
            <Card className="mx-auto max-w-lg text-center">
              <CardContent className="space-y-4 py-10">
                <p className="text-muted-foreground">Fale com a gente para montar o plano ideal para sua empresa.</p>
                <Button onClick={() => abrirPlano(null)}>Quero conhecer</Button>
              </CardContent>
            </Card>
          ) : (
            <div className={planos.length === 1 ? "mx-auto flex max-w-lg justify-center [&>*]:w-full" : "grid gap-6 md:grid-cols-2 lg:grid-cols-3"}>
              {planos.map((p, i) => {
                const destaque = planos.length >= 3 && i === 1;
                return (
                  <Card key={p.id} className={`relative flex flex-col ${destaque ? "border-2 border-primary shadow-xl lg:scale-105" : ""}`}>
                    {destaque && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Mais escolhido</Badge>}
                    <CardHeader>
                      <CardTitle className="text-xl">{p.nome}</CardTitle>
                      {p.descricao && <p className="text-sm text-muted-foreground">{p.descricao}</p>}
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4">
                      <div>
                        <span className="text-4xl font-extrabold">{formatBRL(p.valor_mensal)}</span>
                        <span className="text-muted-foreground">/mês</span>
                      </div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {num(p.usuarios_inclusos)} usuários inclusos</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> + {formatBRL(p.valor_usuario_adicional)} por usuário adicional</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Teste grátis</li>
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full" variant={destaque ? "default" : "outline"} onClick={() => abrirPlano(p)}>
                        Começar Agora
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Ficou com dúvidas?{" "}
            <a href={waLink("Olá! Tenho dúvidas sobre os planos do Atende.ai.")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <MessageCircle className="h-4 w-4" /> Fale no WhatsApp
            </a>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
          <Zap className="mx-auto mb-4 h-10 w-10" />
          <h2 className="text-3xl font-bold sm:text-4xl">Pronto para organizar seu atendimento?</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">Em poucos minutos sua equipe já atende pelo WhatsApp com tudo registrado.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="secondary" onClick={() => go("planos")}>Ver Planos</Button>
            <Button size="lg" variant="outline" asChild className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
              <a href={waLink("Olá, gostaria de tirar dúvidas sobre os planos do Atende.ai")} target="_blank" rel="noreferrer">Falar com Consultor</a>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="duvidas" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6">
        <div className="mb-8 text-center">
          <Badge variant="outline" className="mb-3">Dúvidas</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Dúvidas Frequentes</h2>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((f, i) => (
            <AccordionItem key={f.q} value={`f${i}`}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Footer */}
      <footer id="contato" className="scroll-mt-20 border-t border-border bg-muted/40">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="space-y-3">
            <Logo />
            <p className="text-sm text-muted-foreground">Atendimento, vendas e projetos em uma só plataforma.</p>
          </div>
          <div>
            <p className="mb-3 font-semibold">Produto</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {NAV.slice(0, 3).map((n) => <li key={n.id}><button onClick={() => go(n.id)} className="hover:text-foreground">{n.label}</button></li>)}
            </ul>
          </div>
          <div>
            <p className="mb-3 font-semibold">Suporte</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href={waLink("Olá! Preciso de suporte no Atende.ai.")} target="_blank" rel="noreferrer" className="hover:text-foreground">WhatsApp</a></li>
              <li><Link to="/login" className="hover:text-foreground">Acessar Sistema</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 font-semibold">Institucional</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Termos de Uso</li>
              <li>Política de Privacidade</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Atende.ai. Todos os direitos reservados.
        </div>
      </footer>

      <ContratarDialog open={aberto} onOpenChange={setAberto} plano={plano} />
    </div>
  );
}

function Mockup() {
  return (
    <div className="relative">
      <div className="rounded-2xl border border-border bg-card p-3 shadow-2xl">
        <div className="mb-3 flex items-center gap-1.5 px-1">
          <span className="h-3 w-3 rounded-full bg-destructive/70" />
          <span className="h-3 w-3 rounded-full bg-warning/80" />
          <span className="h-3 w-3 rounded-full bg-success/80" />
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-3 sm:grid-cols-[150px_1fr]">
          <div className="space-y-2">
            {["Nilton", "Maria", "Grupo Obras", "Carlos"].map((n, i) => (
              <div key={n} className={`rounded-lg p-2 text-xs ${i === 0 ? "bg-primary/10" : "bg-muted"}`}>
                <p className="font-semibold">{n}</p>
                <p className="truncate text-muted-foreground">Mensagem recente…</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
            <div className="max-w-[80%] rounded-lg bg-card p-2 text-xs shadow-sm">Olá, gostaria de um orçamento 👋</div>
            <div className="ml-auto max-w-[80%] rounded-lg bg-primary p-2 text-xs text-primary-foreground">Claro! Já estou preparando para você.</div>
            <div className="max-w-[85%] rounded-lg border border-warning/40 bg-warning/15 p-2 text-xs">📝 Nota interna: cliente prioritário</div>
            <div className="ml-auto max-w-[80%] rounded-lg bg-primary p-2 text-xs text-primary-foreground">Orçamento #2026-15 enviado ✓✓</div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 hidden rounded-xl border border-border bg-card px-4 py-3 shadow-lg sm:block">
        <p className="text-xs text-muted-foreground">Orçamento aprovado</p>
        <p className="font-bold text-success">R$ 12.480,00</p>
      </div>
      <div className="absolute -right-3 -top-4 hidden rounded-xl border border-border bg-card px-4 py-3 shadow-lg sm:block">
        <p className="text-xs text-muted-foreground">Atendimentos hoje</p>
        <p className="font-bold text-primary">128</p>
      </div>
    </div>
  );
}

function ContratarDialog({ open, onOpenChange, plano }: { open: boolean; onOpenChange: (v: boolean) => void; plano: Plano | null }) {
  const [form, setForm] = useState({ nome: "", empresa: "", whatsapp: "", email: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valido = form.nome.trim() && form.empresa.trim() && form.whatsapp.replace(/\D/g, "").length >= 10 && /\S+@\S+\.\S+/.test(form.email);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    const msg = [
      `Olá! Quero contratar o Atende.ai${plano ? ` (plano ${plano.nome})` : ""}.`,
      ...(plano ? [`ID do plano: ${plano.id}`] : []),
      `Nome: ${form.nome}`,
      `Empresa: ${form.empresa}`,
      `WhatsApp: ${form.whatsapp}`,
      `E-mail: ${form.email}`,
    ].join("\n");
    window.open(waLink(msg), "_blank", "noopener");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plano ? `Contratar o plano ${plano.nome}` : "Começar teste grátis"}</DialogTitle>
          <DialogDescription>Preencha seus dados e nossa equipe ativa seu acesso.</DialogDescription>
        </DialogHeader>
        {plano && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-semibold">{plano.nome}</p>
            <p className="text-muted-foreground">
              {formatBRL(plano.valor_mensal)}/mês · {num(plano.usuarios_inclusos)} usuários inclusos
            </p>
          </div>
        )}
        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="lp-nome">Nome completo</Label><Input id="lp-nome" value={form.nome} onChange={set("nome")} required /></div>
          <div className="space-y-1.5"><Label htmlFor="lp-emp">Empresa</Label><Input id="lp-emp" value={form.empresa} onChange={set("empresa")} required /></div>
          <div className="space-y-1.5"><Label htmlFor="lp-wa">WhatsApp</Label><Input id="lp-wa" inputMode="tel" placeholder="(11) 99999-9999" value={form.whatsapp} onChange={set("whatsapp")} required /></div>
          <div className="space-y-1.5"><Label htmlFor="lp-email">E-mail</Label><Input id="lp-email" type="email" value={form.email} onChange={set("email")} required /></div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!valido}>Enviar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
