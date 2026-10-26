import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ItemSheet } from "@/components/itens/ItemSheet";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import type { Row } from "@/lib/row";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (item: Row) => void };

/** Cadastro completo de item (mesma tela de Produtos e Serviços, com código automático) aberto de Cotações/Ofertas. */
export function NovoItemCompleto({ open, onOpenChange, onCreated }: Props) {
  const { stamp } = useAudit();
  const qc = useQueryClient();
  const perms = usePagePermissions("/itens");
  const [saving, setSaving] = useState(false);
  return (
    <ItemSheet
      open={open}
      onOpenChange={onOpenChange}
      record={null}
      saving={saving}
      readOnly={false}
      duplicando={false}
      canCreateApoio={perms.canCreate}
      onSave={async (vals) => {
        setSaving(true);
        const { data, error } = await supabase.from("itens").insert(stamp(vals, true) as never).select().single();
        setSaving(false);
        if (error) return void toast.error(error.message);
        await qc.invalidateQueries({ queryKey: ["table", "itens"] });
        toast.success("Item cadastrado.");
        onCreated(data as Row);
        onOpenChange(false);
      }}
    />
  );
}
