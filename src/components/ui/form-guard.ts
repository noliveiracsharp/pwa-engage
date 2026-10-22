import * as React from "react";
import { confirmar } from "@/components/layout/DialogoGlobal";

/** Botão principal acionado por Ctrl/Cmd+Enter (último visível e habilitado). */
const ROTULO_SALVAR = /^\s*(salvar|confirmar|criar|gravar|enviar|cadastrar|adicionar|aplicar)/i;

type Handlers = {
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
  onInteractOutside?: (e: Event) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onInput?: React.FormEventHandler<HTMLDivElement>;
};

/**
 * Proteção dos formulários: atalho Ctrl/Cmd+Enter para salvar e aviso de
 * dados não salvos ao fechar com ESC ou clique fora.
 */
export function useFormGuard(props: Handlers) {
  const sujo = React.useRef(false);
  const liberado = React.useRef(false);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  const proteger = (e: Event) => {
    if (!sujo.current || liberado.current || e.defaultPrevented) return;
    e.preventDefault();
    void confirmar({
      title: "Dados não salvos",
      description: "Você tem alterações que ainda não foram salvas. Deseja sair e descartar o que digitou?",
      confirmText: "Sair sem salvar",
      cancelText: "Continuar editando",
      destructive: true,
    }).then((ok) => {
      if (ok) {
        liberado.current = true;
        closeRef.current?.click();
      }
    });
  };

  return {
    closeRef,
    handlers: {
      onInput: (e: React.FormEvent<HTMLDivElement>) => {
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
      onInteractOutside: (e: Event) => {
        props.onInteractOutside?.(e);
        proteger(e);
      },
    },
  };
}
