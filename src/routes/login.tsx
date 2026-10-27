import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import loginHero from "@/assets/login-hero.jpg";
import { useTheme } from "@/components/theme-provider";
import { aplicarMarca, buscarMarca, lembrarSlug, slugDoHost, slugLembrado, type MarcaPublica } from "@/lib/marca-publica";
import { lerEstado, MAX_TENTATIVAS, registrarFalha, restanteMs, salvarEstado } from "@/lib/login-limite";

export const Route = createFileRoute("/login")({
  staticData: { sitemap: true },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Atende.ai" },
      { name: "description", content: "Acesse o Atende.ai, sua central de suporte e atendimento multicanal." },
      { property: "og:title", content: "Entrar — Atende.ai" },
      { property: "og:description", content: "Acesse o Atende.ai, sua central de suporte e atendimento multicanal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [atualizado, setAtualizado] = useState(false);

  const [marca, setMarca] = useState<MarcaPublica | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    setAtualizado(qs.get("motivo") === "atualizacao");
    const slug = slugDoHost(window.location.hostname) || qs.get("e") || slugLembrado();
    if (!slug) return;
    buscarMarca(slug).then((m) => {
      if (!m) return; // falha temporária não apaga a empresa lembrada
      lembrarSlug(slug);
      setMarca(m);
      aplicarMarca(m);
    });
  }, []);

  const nomeMarca = marca?.titulo || marca?.nome || "Atende.ai";
  const logoMarca = (theme === "dark" && marca?.logo_escuro) || marca?.logo || "";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const atual = lerEstado(email);
    const resta = restanteMs(atual, Date.now());
    if (resta > 0) {
      toast.error("Acesso temporariamente bloqueado", { description: `Muitas tentativas. Tente novamente em ${Math.ceil(resta / 60000)} min.` });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) {
      const novo = registrarFalha(atual, Date.now());
      salvarEstado(email, novo);
      const restantes = MAX_TENTATIVAS - novo.falhas;
      toast.error("Não foi possível entrar", {
        description: novo.bloqueadoAte ? "Muitas tentativas. Acesso bloqueado por 15 minutos." : `E-mail ou senha incorretos. ${restantes} tentativa(s) restante(s).`,
      });
      return;
    }
    salvarEstado(email, null);
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleReset() {
    if (!email) {
      toast.error("Informe seu e-mail para redefinir a senha.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error("Erro ao enviar o e-mail", { description: error.message });
    else toast.success("Enviamos um link de redefinição para o seu e-mail.");
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="relative hidden h-full min-h-0 w-1/2 overflow-hidden lg:block">
        <img src={marca?.login_imagem || loginHero} alt="Atendimento multicanal" width={1024} height={1536} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-primary/80 to-transparent p-10">
          <h2 className="text-3xl font-bold text-primary-foreground">{nomeMarca}</h2>
          <p className="mt-2 max-w-md text-primary-foreground/90">
            Suporte e atendimento multicanal para todas as suas empresas, em um só lugar.
          </p>
        </div>
      </div>

      <div className="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto p-6 lg:w-1/2">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
          <div className="space-y-1 text-center lg:text-left">
            {logoMarca && <img src={logoMarca} alt={nomeMarca} data-no-zoom className="mx-auto mb-4 h-14 w-auto object-contain lg:mx-0" />}
            <h1 className="text-2xl font-bold text-foreground">Bem-vindo de volta</h1>
            <p className="text-sm text-muted-foreground">Entre com seu e-mail e senha para continuar.</p>
          </div>

          {atualizado && (
            <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-foreground">
              Você foi desconectado para carregar a nova versão do sistema. Faça login para continuar.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <div className="relative">
              <Input
                id="senha"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Entrar
          </Button>

          <Button type="button" variant="link" className="w-full" onClick={handleReset}>
            Esqueci a senha
          </Button>
        </form>
      </div>
    </div>
  );
}
