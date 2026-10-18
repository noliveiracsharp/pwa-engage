import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export type LegalSecao = { titulo: string; resumo?: string; conteudo: ReactNode };

export function LegalPage({
  atual,
  titulo,
  resumo,
  secoes,
}: {
  atual: "termos" | "privacidade";
  titulo: string;
  resumo: string;
  secoes: LegalSecao[];
}) {
  const aba = (ativo: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
      ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
    }`;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-xl font-bold">Atende.ai</Link>
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar ao site
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <nav className="mb-8 flex gap-2 rounded-full border border-border p-1 w-fit">
          <Link to="/termos" className={aba(atual === "termos")}>Termos de Uso</Link>
          <Link to="/privacidade" className={aba(atual === "privacidade")}>Política de Privacidade</Link>
        </nav>
        <h1 className="text-3xl font-bold md:text-4xl">{titulo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: outubro de 2026</p>
        <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-sm font-semibold text-primary">Em resumo</p>
          <p className="mt-1">{resumo}</p>
        </div>
        <div className="mt-10 space-y-10">
          {secoes.map((s, i) => (
            <section key={s.titulo}>
              <h2 className="text-xl font-semibold">{i + 1}. {s.titulo}</h2>
              {s.resumo && <p className="mt-2 text-sm italic text-muted-foreground">👉 {s.resumo}</p>}
              <div className="mt-3 space-y-3 leading-relaxed text-foreground/90">{s.conteudo}</div>
            </section>
          ))}
        </div>
        <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          Dúvidas? Fale com a gente pelo e-mail <strong>privacidade@atende.ai</strong>.
        </p>
      </main>
    </div>
  );
}
