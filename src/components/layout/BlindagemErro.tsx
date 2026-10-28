import { Component, type ReactNode } from "react";

/** Isola falhas de um diálogo: mostra o erro sem derrubar a tela inteira. */
export class BlindagemErro extends Component<{ children: ReactNode; onFechar?: () => void }, { erro: Error | null }> {
  override state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) { return { erro }; }
  override componentDidCatch(erro: Error) { console.error("[BlindagemErro]", erro); }
  override render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-4">
        <div className="max-w-md space-y-3 rounded-lg border bg-card p-5 text-sm shadow-lg">
          <p className="font-semibold text-destructive">Não foi possível abrir esta ação.</p>
          <p className="break-words text-muted-foreground">{this.state.erro.message}</p>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground"
            onClick={() => { this.setState({ erro: null }); this.props.onFechar?.(); }}
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }
}
