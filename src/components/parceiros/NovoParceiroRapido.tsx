import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { useTableRows } from "@/lib/crud";
import type { Row } from "@/lib/row";
import { ParceiroSheet } from "@/components/parceiros/ParceiroSheet";

/** Botão "+ Novo" que abre o cadastro completo de parceiro e devolve o id criado. */
export function NovoParceiroRapido({ tipo, onCriado, disabled, inicial }: {
  inicial?: Row;
  tipo: "cliente" | "fornecedor";
  onCriado: (id: string) => void;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: parceiros = [] } = useTableRows("parceiros");
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const salvar = async (values: Row) => {
    setSalvando(true);
    const dados = { ...values, ...(tipo === "cliente" ? { is_cliente: true } : { is_fornecedor: true }) };
    const { data, error } = await supabase.from("parceiros").insert(stamp(dados, true) as never).select("id").maybeSingle();
    setSalvando(false);
    if (error) return void toast.error(error.code === "23505" ? "Já existe um cadastro com este CPF/CNPJ." : error.message);
    await qc.refetchQueries({ queryKey: ["table", "parceiros"], type: "active" });
    setAberto(false);
    toast.success(tipo === "cliente" ? "Cliente cadastrado." : "Fornecedor cadastrado.");
    if (data) onCriado(String((data as Row)["id"]));
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => setAberto(true)}>
        <Plus className="mr-1 h-3.5 w-3.5" /> {tipo === "cliente" ? "Novo cliente" : "Novo fornecedor"}
      </Button>
      {aberto && (
        <ParceiroSheet open={aberto} onOpenChange={setAberto} record={null} parceiros={parceiros} readOnly={false} saving={salvando} onSave={(v) => void salvar(v)} inicial={inicial} />
      )}
    </>
  );
}
