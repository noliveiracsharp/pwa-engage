import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Barcode, Check, Copy, CreditCard, Loader2, MailCheck, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useModulosPublicos } from "@/lib/modulos-publicos";
import { Checkbox } from "@/components/ui/checkbox";
import { formatBRL, num } from "@/lib/orcamentos";
import { digitsOnly, formatCpfCnpj, isCompletePhone, isValidCpfCnpj } from "@/lib/input-masks";
import { DocumentInput } from "@/components/data-table/DocumentInput";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TITLE = "Checkout — Atende.ai";
const DESC = "Cadastre sua empresa e escolha a forma de pagamento para assinar o Atende.ai.";

export const Route = createFileRoute("/checkout")({
  ssr: false,
  staticData: { sitemap: false },
  validateSearch: (s: Record<string, unknown>) => ({ planoId: typeof s["planoId"] === "string" ? s["planoId"] : "" }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

type Plano = { id: string; nome: string; valor_mensal: number | null; usuarios_inclusos: number | null };
type Metodo = "cartao" | "pix" | "boleto";
type Resultado =
  | { tipo: "cartao" }
  | { tipo: "pix"; qrCode?: string | undefined; copiaCola?: string | undefined }
  | { tipo: "boleto"; url?: string | undefined };

const passo1Schema = z.object({
  nome_empresa: z.string().trim().min(2, "Informe o nome da empresa").max(150),
  cnpj_cpf: z.string().refine(isValidCpfCnpj, "CPF ou CNPJ inválido"),
  telefone: z.string().min(1, "Informe o telefone").refine(isCompletePhone, "Telefone incompleto"),
  nome_usuario: z.string().trim().min(3, "Informe o nome completo").max(120),
  email: z.string().trim().email("E-mail inválido").max(255),
  senha: z.string().min(6, "Mínimo de 6 caracteres").max(72),
});

const cartaoSchema = z.object({
  numero: z.string().refine((v) => digitsOnly(v).length >= 13, "Número do cartão inválido"),
  nome: z.string().trim().min(3, "Informe o nome impresso"),
  validade: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Use MM/AA"),
  cvv: z.string().regex(/^\d{3,4}$/, "CVV inválido"),
  cpf: z.string().refine(isValidCpfCnpj, "CPF do titular inválido"),
});

const maskCard = (v: string) => digitsOnly(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
const maskValidade = (v: string) => digitsOnly(v).slice(0, 4).replace(/^(\d{2})(\d)/, "$1/$2");

function Campo({ label, erro, children }: { label: string; erro?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {erro && <p className="text-destructive text-xs">{erro}</p>}
    </div>
  );
}

function CheckoutPage() {
  const { planoId } = Route.useSearch();
  const [passo, setPasso] = useState<1 | 2>(1);
  const [dados, setDados] = useState({ nome_empresa: "", cnpj_cpf: "", telefone: "", nome_usuario: "", email: "", senha: "" });
  const [cartao, setCartao] = useState({ numero: "", nome: "", validade: "", cvv: "", cpf: "" });
  const [metodo, setMetodo] = useState<Metodo>("cartao");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const { data: plano, isLoading } = useQuery({
    queryKey: ["checkout-plano", planoId],
    enabled: !!planoId,
    queryFn: async () => {
      const { data } = await supabase.from("planos_base" as never).select("*").eq("id", planoId).maybeSingle();
      return (data as unknown as Plano) ?? null;
    },
  });

  const { data: modulos = [] } = useModulosPublicos();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const escolhidos = modulos.filter((m) => selecionados.includes(m.id));
  const total = Number(plano?.valor_mensal ?? 0) + escolhidos.reduce((t, m) => t + m.valor, 0);
  const alternar = (id: string) => setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const setD = (k: keyof typeof dados, v: string) => setDados((d) => ({ ...d, [k]: v }));
  const setC = (k: keyof typeof cartao, v: string) => setCartao((d) => ({ ...d, [k]: v }));

  const validar = (schema: z.ZodTypeAny, valor: unknown) => {
    const r = schema.safeParse(valor);
    if (r.success) return setErros({}), true;
    const e: Record<string, string> = {};
    r.error.issues.forEach((i) => (e[String(i.path[0])] ??= i.message));
    setErros(e);
    return false;
  };

  const avancar = () => {
    if (validar(passo1Schema, dados)) setPasso(2);
  };

  const concluir = async () => {
    if (metodo === "cartao" && !validar(cartaoSchema, cartao)) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-checkout", {
        body: {
          planoId,
          modulos: selecionados,
          empresa: { nome_empresa: dados.nome_empresa, cnpj_cpf: digitsOnly(dados.cnpj_cpf), telefone: dados.telefone },
          usuario: { nome_usuario: dados.nome_usuario, email: dados.email.trim(), senha: dados.senha },
          forma_pagamento: metodo,
          cartao: metodo === "cartao" ? { ...cartao, numero: digitsOnly(cartao.numero), cpf: digitsOnly(cartao.cpf) } : undefined,
        },
      });
      if (error) throw error;
      const d = (data ?? {}) as Record<string, string | undefined>;
      if (d["error"]) throw new Error(d["error"]);
      if (metodo === "cartao") {
        toast.success("Pagamento aprovado!");
        setResultado({ tipo: "cartao" });
      } else if (metodo === "pix") {
        setResultado({ tipo: "pix", qrCode: d["qrCode"] ?? d["pix_qrcode"], copiaCola: d["copiaCola"] ?? d["pix_copia_cola"] });
      } else {
        setResultado({ tipo: "boleto", url: d["boletoUrl"] ?? d["bankSlipUrl"] });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        /failed to send|not found|404|fetch/i.test(msg)
          ? "O pagamento ainda não está disponível. Fale com nosso time pelo WhatsApp."
          : msg || "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <img src="/logo-atendeai-azulesc.png" alt="Atende.ai" className="h-9 w-auto dark:hidden" />
            <img src="/logo-atendeai-azul.png" alt="Atende.ai" className="hidden h-9 w-auto dark:block" />
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1fr_320px]">
        <h1 className="sr-only">Assinar o Atende.ai</h1>
        <Card className="order-2 lg:order-1">
          {resultado ? (
            <Sucesso resultado={resultado} email={dados.email} />
          ) : (
            <>
              <CardHeader>
                <div className="flex gap-2">
                  <Badge variant={passo === 1 ? "default" : "secondary"}>1. Cadastro</Badge>
                  <Badge variant={passo === 2 ? "default" : "secondary"}>2. Pagamento</Badge>
                </div>
                <CardTitle>{passo === 1 ? "Dados da empresa e do administrador" : "Forma de pagamento"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {passo === 1 ? (
                  <>
                    <section className="space-y-3">
                      <p className="text-muted-foreground text-sm font-medium">Empresa</p>
                      <Campo label="Nome da empresa / Razão social" erro={erros["nome_empresa"]}>
                        <Input value={dados.nome_empresa} onChange={(e) => setD("nome_empresa", e.target.value)} />
                      </Campo>
                      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] [&>*]:min-w-0">
                        <Campo label="CPF ou CNPJ" erro={erros["cnpj_cpf"]}>
                          <DocumentInput value={dados.cnpj_cpf} onChange={(v) => setD("cnpj_cpf", v)} />
                        </Campo>
                        <Campo label="Telefone / WhatsApp" erro={erros["telefone"]}>
                          <PhoneInput value={dados.telefone} onChange={(v) => setD("telefone", v)} />
                        </Campo>
                      </div>
                    </section>
                    <section className="space-y-3">
                      <p className="text-muted-foreground text-sm font-medium">Administrador</p>
                      <Campo label="Nome completo" erro={erros["nome_usuario"]}>
                        <Input value={dados.nome_usuario} onChange={(e) => setD("nome_usuario", e.target.value)} />
                      </Campo>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Campo label="E-mail" erro={erros["email"]}>
                          <Input type="email" value={dados.email} onChange={(e) => setD("email", e.target.value)} />
                        </Campo>
                        <Campo label="Senha" erro={erros["senha"]}>
                          <Input type="password" autoComplete="new-password" value={dados.senha} onChange={(e) => setD("senha", e.target.value)} />
                        </Campo>
                      </div>
                    </section>
                    <Button className="w-full" onClick={avancar}>Avançar para Pagamento</Button>
                  </>
                ) : (
                  <>
                    <Tabs value={metodo} onValueChange={(v) => setMetodo(v as Metodo)}>
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="cartao"><CreditCard className="mr-1 h-4 w-4" />Cartão</TabsTrigger>
                        <TabsTrigger value="pix"><QrCode className="mr-1 h-4 w-4" />PIX</TabsTrigger>
                        <TabsTrigger value="boleto"><Barcode className="mr-1 h-4 w-4" />Boleto</TabsTrigger>
                      </TabsList>
                      <TabsContent value="cartao" className="space-y-3 pt-3">
                        <Campo label="Número do cartão" erro={erros["numero"]}>
                          <Input inputMode="numeric" value={maskCard(cartao.numero)} onChange={(e) => setC("numero", e.target.value)} />
                        </Campo>
                        <Campo label="Nome impresso no cartão" erro={erros["nome"]}>
                          <Input value={cartao.nome} onChange={(e) => setC("nome", e.target.value.toUpperCase())} />
                        </Campo>
                        <div className="grid grid-cols-2 gap-3">
                          <Campo label="Validade (MM/AA)" erro={erros["validade"]}>
                            <Input inputMode="numeric" value={cartao.validade} onChange={(e) => setC("validade", maskValidade(e.target.value))} />
                          </Campo>
                          <Campo label="CVV" erro={erros["cvv"]}>
                            <Input inputMode="numeric" value={cartao.cvv} onChange={(e) => setC("cvv", digitsOnly(e.target.value).slice(0, 4))} />
                          </Campo>
                        </div>
                        <Campo label="CPF do titular" erro={erros["cpf"]}>
                          <Input inputMode="numeric" value={formatCpfCnpj(cartao.cpf)} onChange={(e) => setC("cpf", digitsOnly(e.target.value).slice(0, 11))} />
                        </Campo>
                      </TabsContent>
                      <TabsContent value="pix" className="text-muted-foreground pt-3 text-sm">
                        O QR Code e a chave Copia e Cola serão gerados imediatamente após a confirmação.
                      </TabsContent>
                      <TabsContent value="boleto" className="text-muted-foreground pt-3 text-sm">
                        O boleto será gerado com vencimento para 3 dias úteis. O acesso será liberado assim que o pagamento for compensado.
                      </TabsContent>
                    </Tabs>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <Button variant="outline" onClick={() => setPasso(1)} disabled={enviando}>Voltar</Button>
                      <Button className="flex-1" onClick={concluir} disabled={enviando || !plano}>
                        {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Concluir e Assinar
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </>
          )}
        </Card>

        <Card className="order-1 h-fit lg:order-2">
          <CardHeader><CardTitle className="text-base">Resumo do pedido</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : plano ? (
              <>
                <p className="text-lg font-semibold">{plano.nome}</p>
                <p className="text-3xl font-extrabold">{formatBRL(plano.valor_mensal)}<span className="text-muted-foreground text-sm font-normal">/mês</span></p>
                <p className="flex items-center gap-2"><Check className="text-primary h-4 w-4" />{num(plano.usuarios_inclusos)} usuários inclusos</p>
                <p className="flex items-center gap-2"><Check className="text-primary h-4 w-4" />Cobrança mensal recorrente</p>
                {modulos.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="mb-2 font-semibold">Módulos adicionais</p>
                    <div className="space-y-2">
                      {modulos.map((m) => (
                        <label key={m.id} className="flex cursor-pointer items-start gap-2">
                          <Checkbox checked={selecionados.includes(m.id)} onCheckedChange={() => alternar(m.id)} disabled={!!resultado} className="mt-0.5" />
                          <span className="flex-1">{m.nome}</span>
                          <span className="text-muted-foreground whitespace-nowrap">+{formatBRL(m.valor)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t pt-3">
                  <span className="font-semibold">Total mensal</span>
                  <span className="text-xl font-extrabold">{formatBRL(total)}</span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Plano não encontrado. <Link to="/" hash="planos" className="text-primary underline">Escolha um plano</Link>.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Sucesso({ resultado, email }: { resultado: Resultado; email: string }) {
  const copiar = async (t: string) => {
    await navigator.clipboard.writeText(t);
    toast.success("Código copiado.");
  };
  return (
    <CardContent className="space-y-4 py-8 text-center">
      <MailCheck className="text-primary mx-auto h-10 w-10" />
      <h2 className="text-xl font-semibold">
        {resultado.tipo === "cartao" ? "Assinatura confirmada!" : "Pedido recebido!"}
      </h2>
      {resultado.tipo === "pix" && (
        <div className="space-y-3">
          {resultado.qrCode && (
            <img src={resultado.qrCode.startsWith("data:") ? resultado.qrCode : `data:image/png;base64,${resultado.qrCode}`} alt="QR Code PIX" className="mx-auto h-56 w-56 rounded-md bg-card" />
          )}
          {resultado.copiaCola && (
            <div className="flex gap-2">
              <Input readOnly value={resultado.copiaCola} />
              <Button variant="outline" size="icon" onClick={() => copiar(resultado.copiaCola!)} aria-label="Copiar"><Copy className="h-4 w-4" /></Button>
            </div>
          )}
          <p className="text-muted-foreground text-sm">Aguarde a compensação do PIX para liberar o acesso.</p>
        </div>
      )}
      {resultado.tipo === "boleto" && resultado.url && (
        <Button asChild><a href={resultado.url} target="_blank" rel="noreferrer">Abrir boleto (PDF)</a></Button>
      )}
      <p className="text-muted-foreground text-sm">
        Você vai receber no e-mail <strong>{email}</strong> e no WhatsApp os dados do cadastro com o link para entrar no sistema.
      </p>
      <Button asChild variant="outline"><Link to="/login">Ir para o login</Link></Button>
    </CardContent>
  );
}
