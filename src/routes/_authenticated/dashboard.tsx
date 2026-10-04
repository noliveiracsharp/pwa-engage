import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bot, CheckCircle2, Headphones, UserCheck, Users, UsersRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/dashboard")({
  staticData: { sitemap: false },
  component: Dashboard,
});

type Periodo = "mes" | "ano";

function periodStart(periodo: Periodo) {
  const now = new Date();
  if (periodo === "mes") return new Date(now.getFullYear(), now.getMonth(), 1);
  const d = new Date(now);
  d.setMonth(d.getMonth() - 11);
  d.setDate(1);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function countOf(table: string, empId: string | number | undefined, build?: (q: any) => any) {
  try {
    let query: any = supabase.from(table).select("*", { count: "exact", head: true });
    if (empId !== undefined) query = query.eq("empresa_id", empId);
    if (build) query = build(query);
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function useDashboard(periodo: Periodo) {
  const { empresaId } = useAudit();
  const since = periodStart(periodo).toISOString();

  return useQuery({
    queryKey: ["dashboard", periodo, empresaId],
    queryFn: async () => {
      void since;
      const [pessoas, usuarios, usuariosAtivos, comIA, emAtendimento, encerrados] = await Promise.all([
        countOf("pessoas", empresaId),
        countOf("usuarios", empresaId),
        countOf("usuarios", empresaId, (q) => q.eq("status", true)),
        countOf("atendimentos", empresaId, (q) => q.eq("status", "IA")),
        countOf("atendimentos", empresaId, (q) => q.eq("status", "Em atendimento")),
        countOf("atendimentos", empresaId, (q) => q.eq("status", "Encerrado")),
      ]);

      let porDia: Array<{ label: string; total: number }> = [];
      let porMes: Array<{ label: string; total: number }> = [];
      try {
        let q: any = supabase
          .from("atendimentos")
          .select("created_at");
        if (empresaId !== undefined) q = q.eq("empresa_id", empresaId);
        const { data } = await q
          .gte("created_at", periodStart("ano").toISOString())
          .limit(5000);
        const rows = (data ?? []) as Array<{ created_at: string }>;
        const dias = new Map<string, number>();
        const meses = new Map<string, number>();
        for (const row of rows) {
          const d = new Date(row.created_at);
          const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
          const mes = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
          if (d >= periodStart("mes")) dias.set(dia, (dias.get(dia) ?? 0) + 1);
          meses.set(mes, (meses.get(mes) ?? 0) + 1);
        }
        porDia = [...dias].map(([label, total]) => ({ label, total }));
        porMes = [...meses].map(([label, total]) => ({ label, total }));
      } catch {
        /* sem dados */
      }

      return { pessoas, usuarios, usuariosAtivos, comIA, emAtendimento, encerrados, porDia, porMes };
    },
  });
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number; icon: typeof Users }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const { data } = useDashboard(periodo);

  const cards = [
    { title: "Pessoas", value: data?.pessoas ?? 0, icon: Users },
    { title: "Usuários", value: data?.usuarios ?? 0, icon: UsersRound },
    { title: "Usuários ativos", value: data?.usuariosAtivos ?? 0, icon: UserCheck },
    { title: "Atendimentos com IA", value: data?.comIA ?? 0, icon: Bot },
    { title: "Em atendimento", value: data?.emAtendimento ?? 0, icon: Headphones },
    { title: "Encerrados", value: data?.encerrados ?? 0, icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mes">Mês atual</SelectItem>
            <SelectItem value="ano">Últimos 12 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <StatCard key={c.title} {...c} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atendimentos por dia</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.porDia ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip />
                <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atendimentos por mês</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.porMes ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip />
                <Bar dataKey="total" fill="var(--accent-foreground)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
