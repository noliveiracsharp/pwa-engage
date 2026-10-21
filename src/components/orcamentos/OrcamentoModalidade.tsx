import { HandCoins, Repeat } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  formatBRL,
  MODALIDADES,
  type DescontoTipo,
  type Modalidade,
} from "@/lib/orcamentos";

export type ModalidadeState = {
  modalidade: Modalidade;
  desconto_avista_tipo: DescontoTipo;
  desconto_avista: string;
  taxa_instalacao: string;
  taxa_instalacao_isenta: boolean;
  vigencia_meses: string;
  /** Contrato sem prazo de término: mensalidades geradas continuamente. */
  prazo_indeterminado: boolean;
  reajuste_indice: string;
};

type Props = {
  value: ModalidadeState;
  /** Total da implantação (produtos + serviços avulsos, após desconto comercial). */
  totalImplantacao: number;
  totalAvista: number;
  totalRecorrente: number;
  readOnly?: boolean | undefined;
  onChange: (patch: Partial<ModalidadeState>) => void;
};

/** Condição comercial da implantação e dados dos serviços recorrentes mensais. */
export function OrcamentoModalidade({
  value,
  totalImplantacao,
  totalAvista,
  totalRecorrente,
  readOnly,
  onChange,
}: Props) {
  const economia = totalImplantacao - totalAvista;
  const meses = Math.max(1, Math.floor(Number(value.vigencia_meses) || 36));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="bg-card space-y-4 rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <HandCoins className="text-muted-foreground h-4 w-4" />
          Implantação: condição comercial
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          className="w-full"
          value={value.modalidade}
          onValueChange={(v) => v && onChange({ modalidade: v as Modalidade })}
          disabled={Boolean(readOnly)}
        >
          {MODALIDADES.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className="flex-1">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-muted-foreground text-xs">
          {MODALIDADES.find((m) => m.value === value.modalidade)?.descricao}
        </p>

        {value.modalidade === "avista" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="desconto_avista" className="text-sm">
                Desconto à vista
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={value.desconto_avista_tipo}
                onValueChange={(v) => v && onChange({ desconto_avista_tipo: v as DescontoTipo })}
                disabled={Boolean(readOnly)}
              >
                <ToggleGroupItem value="valor" className="px-3 text-xs">
                  R$
                </ToggleGroupItem>
                <ToggleGroupItem value="percentual" className="px-3 text-xs">
                  %
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <Input
              id="desconto_avista"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder={value.desconto_avista_tipo === "percentual" ? "Ex.: 5" : "Ex.: 250,00"}
              value={value.desconto_avista}
              onChange={(e) => onChange({ desconto_avista: e.target.value })}
            />
            <div className="bg-success/10 rounded-md border p-3 text-sm">
              {economia >= 0.01 ? (
                <>
                  De <span className="text-muted-foreground line-through">{formatBRL(totalImplantacao)}</span>{" "}
                  por <strong className="tabular-nums">{formatBRL(totalAvista)}</strong> à vista
                  <span className="text-muted-foreground"> (economia de {formatBRL(economia)})</span>
                </>
              ) : (
                <>
                  Total à vista: <strong className="tabular-nums">{formatBRL(totalAvista)}</strong>
                </>
              )}
            </div>
          </div>
        )}

        {value.modalidade === "comodato" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="taxa_instalacao" className="text-sm">
                Taxa de instalação (R$)
              </Label>
              <Input
                id="taxa_instalacao"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={value.taxa_instalacao}
                onChange={(e) => onChange({ taxa_instalacao: e.target.value })}
              />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="taxa_isenta" className="text-sm">
                  Isentar taxa de instalação
                </Label>
                <p className="text-muted-foreground text-xs">
                  Isenção condicionada à vigência de {meses} meses; se cancelar antes, a taxa é cobrada
                  integralmente e corrigida.
                </p>
              </div>
              <Switch
                id="taxa_isenta"
                checked={value.taxa_instalacao_isenta}
                onCheckedChange={(v) => onChange({ taxa_instalacao_isenta: v })}
                disabled={Boolean(readOnly)}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Os equipamentos permanecem propriedade da empresa. O parcelamento segue a regra com juros.
            </p>
          </div>
        )}
      </div>

      <div className="bg-card space-y-4 rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Repeat className="text-muted-foreground h-4 w-4" />
          Serviços recorrentes mensais
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Mensalidade total</span>
          <strong className="tabular-nums">{formatBRL(totalRecorrente)}/mês</strong>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vigencia_meses" className="text-sm">
              Vigência (meses)
            </Label>
            <Input
              id="vigencia_meses"
              type="number"
              min={1}
              inputMode="numeric"
              value={value.vigencia_meses}
              disabled={value.prazo_indeterminado}
              onChange={(e) => onChange({ vigencia_meses: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reajuste_indice" className="text-sm">
              Reajuste anual
            </Label>
            <Input
              id="reajuste_indice"
              value={value.reajuste_indice}
              placeholder="IPCA"
              onChange={(e) => onChange({ reajuste_indice: e.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <Label htmlFor="prazo_indeterminado" className="text-sm">Contrato sem prazo de término</Label>
            <p className="text-muted-foreground text-xs">O sistema mantém sempre os próximos 12 meses de mensalidade lançados.</p>
          </div>
          <Switch id="prazo_indeterminado" checked={value.prazo_indeterminado} disabled={Boolean(readOnly)} onCheckedChange={(x) => onChange({ prazo_indeterminado: x })} />
        </div>
        {totalRecorrente <= 0 && (
          <p className="text-muted-foreground text-xs">
            Marque itens como “Serviço recorrente (mensal)” para compor a mensalidade.
          </p>
        )}
      </div>
    </div>
  );
}
