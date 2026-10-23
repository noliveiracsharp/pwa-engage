import * as React from "react";
import type * as DialogPrimitive from "@radix-ui/react-dialog";
import { confirmar } from "@/components/layout/DialogoGlobal";

/** Botão principal acionado por Ctrl/Cmd+Enter (último visível e habilitado). */
const ROTULO_SALVAR = /^\s*(salvar|confirmar|criar|gravar|enviar|cadastrar|adicionar|aplicar)/i;

type Handlers = Pick<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "onEscapeKeyDown" | "onInteractOutside" | "onKeyDown" | "onInput">;

/**
 * Proteção dos formulários: atalho Ctrl/Cmd+Enter para salvar e aviso de
 * dados não salvos ao fechar com ESC ou clique fora.
 */
export function useFormGuard(props: Handlers) {
  const sujo = React.useRef(false);
  const liberado = React.useRef(false);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  const contentRef = React.useRef<HTMLElement | null>(null);

  const fecharLiberado = () => {
    liberado.current = true;
    closeRef.current?.click();
  };

  /** Grava o campo em edição (auto-save no blur) e aciona o botão Salvar, se houver. */
  const sairESalvar = () => {
    const ativo = document.activeElement as HTMLElement | null;
    ativo?.blur?.();
    const raiz = contentRef.current;
    const botoes = raiz
      ? Array.from(raiz.querySelectorAll("button")).filter(
          (b) => !b.disabled && b.offsetParent !== null && ROTULO_SALVAR.test(b.textContent ?? ""),
        )
      : [];
    const alvo = botoes[botoes.length - 1];
    sujo.current = false;
    // espera o salvamento disparado pelo blur antes de fechar
    window.setTimeout(() => {
      if (alvo) alvo.click();
      else fecharLiberado();
    }, 150);
  };

  const proteger = (e: Event) => {
    if (!sujo.current || liberado.current || e.defaultPrevented) return;
    e.preventDefault();
    const alvo = (e.target as HTMLElement | null)?.closest?.("[role=dialog]") as HTMLElement | null;
    contentRef.current = alvo ?? (closeRef.current?.parentElement ?? null);
    void confirmar({
      title: "Dados não salvos",
      description: "Você tem alterações que ainda não foram salvas. Deseja salvar antes de sair?",
      confirmText: "Sair sem salvar",
      cancelText: "Continuar editando",
      extraText: "Sair e salvar",
      onExtra: sairESalvar,
      destructive: true,
    }).then((ok) => {
      if (ok) fecharLiberado();
    });
  };

  return {
    closeRef,
    handlers: {
      onInput: (e: Parameters<NonNullable<Handlers["onInput"]>>[0]) => {
        sujo.current = true;
        props.onInput?.(e);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
        props.onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          const botoes = Array.from(e.currentTarget.querySelectorAll("button")).filter(
            (b) => !b.disabled && b.offsetParent !== null && ROTULO_SALVAR.test(b.textContent ?? ""),
          );
          const alvo = botoes[botoes.length - 1];
          if (alvo) {
            e.preventDefault();
            e.stopPropagation();
            sujo.current = false;
            alvo.click();
          }
        }
      },
      onEscapeKeyDown: (e: KeyboardEvent) => {
        props.onEscapeKeyDown?.(e);
        proteger(e);
      },
      onInteractOutside: (e: Parameters<NonNullable<Handlers["onInteractOutside"]>>[0]) => {
        props.onInteractOutside?.(e);
        proteger(e);
      },
    },
  };
}
