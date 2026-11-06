import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/components/theme-provider";
import { aplicarMarca, buscarMarca, lembrarSlug, slugDoHost, slugLembrado, type MarcaPublica } from "@/lib/marca-publica";

export const Route = createFileRoute("/reset-password")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — Atende.ai" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Defina uma nova senha para sua conta no Atende.ai." },
      { property: "og:title", content: "Redefinir senha — Atende.ai" },
      { property: "og:description", content: "Defina uma nova senha para sua conta no Atende.ai." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

const MIN = 6;

function CampoSenha({ id, label, valor, onChange, invalido }: { id: string; label: string; valor: string; onChange: (v: string) => void; invalido?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={ver ? "text" : "password"} autoComplete="new-password" required minLength={MIN} value={valor}
          onChange={(e) => onChange(e.target.value)} aria-invalid={invalido || undefined} className="pr-10" />
        <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md">
          {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function Regra({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className={`flex items-center gap-2 text-sm ${ok ? "text-primary" : "text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {texto}
    </li>
  );
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [loading, setLoading] = useState(false);
  const [marca, setMarca] = useState<MarcaPublica | null>(null);

  useEffect(() => {
    const slug = slugDoHost(window.location.hostname) || new URLSearchParams(window.location.search).get("e") || slugLembrado();
    if (!slug) return;
    buscarMarca(slug).then((m) => {
      if (!m) return;
      lembrarSlug(slug);
      setMarca(m);
      aplicarMarca(m);
    });
  }, []);

  const nomeMarca = marca?.titulo || marca?.nome || "Atende.ai";
  const logo = (theme === "dark" && marca?.logo_escuro) || marca?.logo || "";
  const tamanhoOk = senha.length >= MIN;
  const iguais = senha.length > 0 && senha === repetir;
  const valido = tamanhoOk && iguais;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) {
      toast.error(tamanhoOk ? "As senhas não coincidem." : `A senha precisa ter pelo menos ${MIN} caracteres.`);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível alterar a senha", { description: error.message });
      return;
    }
    toast.success("Senha atualizada!");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-lg">
        <div className="h-1.5 bg-primary" />
        <div className="space-y-6 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            {logo
              ? <img src={logo} alt={nomeMarca} className="max-h-14 max-w-[220px] object-contain" />
              : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><KeyRound className="h-6 w-6" /></div>}
            <div>
              <h1 className="text-2xl font-bold text-foreground">Criar nova senha</h1>
              <p className="mt-1 text-sm text-muted-foreground">Defina a senha de acesso a {nomeMarca}.</p>
            </div>
          </div>

          <CampoSenha id="nova" label="Nova senha" valor={senha} onChange={setSenha} />
          <CampoSenha id="repetir" label="Repetir nova senha" valor={repetir} onChange={setRepetir} invalido={repetir.length > 0 && !iguais} />

          <ul className="space-y-1">
            <Regra ok={tamanhoOk} texto={`Pelo menos ${MIN} caracteres`} />
            <Regra ok={iguais} texto="As duas senhas são iguais" />
          </ul>

          <Button type="submit" className="w-full" disabled={loading || !valido}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar nova senha
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">Voltar ao login</Link>
          </p>
        </div>
      </form>
    </div>
  );
}
