import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows, rowId, text } from "@/lib/crud";
import { pick } from "@/lib/row";
import { formatCpfCnpj } from "@/lib/input-masks";

export const Route = createFileRoute("/_authenticated/meus-dados")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Meus Dados — Atende.ai" },
      { name: "description", content: "Seus dados de cadastro, cargo e perfil de acesso no Atende.ai." },
      { property: "og:title", content: "Meus Dados — Atende.ai" },
      { property: "og:description", content: "Seus dados de cadastro, cargo e perfil de acesso no Atende.ai." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeusDados,
});

function MeusDados() {
  const { usuario, user } = useAuth();
  const nome = pick<string>(usuario, ["nome", "nome_completo"], user?.email ?? "");
  const foto = pick<string>(usuario, ["foto", "avatar", "avatar_url"]);
  const { data: perfis = [] } = useTableRows("perfil");
  const perfilId = text(pick(usuario, ["perfil_id"]));
  const perfilNome = perfis.find((p) => text(rowId(p)) === perfilId)
    ? text(pick(perfis.find((p) => text(rowId(p)) === perfilId), ["descricao"]))
    : undefined;
  const campos: Array<[string, string | undefined]> = [
    ["Nome", nome],
    ["E-mail", pick<string>(usuario, ["email"], user?.email)],
    ["CPF", formatCpfCnpj(pick<string>(usuario, ["cpf"], "") ?? "")],
    ["Cargo", pick<string>(usuario, ["cargo"])],
    ["Perfil", perfilNome],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Meus Dados</h1>
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="h-14 w-14">
            {foto && <AvatarImage src={foto} alt={nome ?? ""} />}
            <AvatarFallback>{(nome ?? "U").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <CardTitle>{nome}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {campos.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-sm text-foreground">{value ?? "—"}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
