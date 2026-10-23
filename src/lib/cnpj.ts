/** Consulta CNPJ com fallback: BrasilAPI e, se falhar, Minha Receita (mesmo formato de resposta). */
export async function fetchCnpj(cnpj: string): Promise<Response> {
  const fontes = [
    `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    `https://minhareceita.org/${cnpj}`,
  ];
  let ultima: Response | null = null;
  for (const url of fontes) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) return res;
      ultima = res;
    } catch {
      // tenta a próxima fonte
    }
  }
  if (ultima) return ultima;
  throw new Error("Serviço de CNPJ indisponível");
}
