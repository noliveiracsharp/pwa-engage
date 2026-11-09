export type EstadoConexao = "online" | "verificando" | "offline";

/** Regra pura: navegador offline vence; com rede, depende do último ping. */
export function estadoConexao(navegadorOnline: boolean, pingOk: boolean | null, checando: boolean): EstadoConexao {
  if (!navegadorOnline) return "offline";
  if (pingOk === false) return checando ? "verificando" : "offline";
  if (pingOk === null && checando) return "verificando";
  return "online";
}

export const ROTULO_CONEXAO: Record<EstadoConexao, string> = {
  online: "Conectado à internet",
  verificando: "Verificando conexão…",
  offline: "Sem conexão com a internet",
};
