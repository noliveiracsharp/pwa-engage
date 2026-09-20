import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { pick } from "@/lib/row";

export const Route = createFileRoute("/_authenticated/meus-dados")({
  component: MeusDados,
});

function MeusDados() {
  const { usuario, user } = useAuth();
  const nome = pick<string>(usuario, ["nome", "nome_completo"], user?.email ?? "");
  const foto = pick<string>(usuario, ["foto", "avatar", "avatar_url"]);
  const campos: Array<[string, string | undefined]> = [
    ["Nome", nome],
    ["E-mail", pick<string>(usuario, ["email"], user?.email)],
    ["Telefone", pick<string>(usuario, ["telefone", "celular", "whatsapp"])],
    ["CPF", pick<string>(usuario, ["cpf", "documento"])],
    ["Perfil", pick<string>(usuario, ["perfil", "perfil_descricao", "funcao"])],
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
