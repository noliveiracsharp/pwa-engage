/** Captcha nativo do login: conta simples de soma, sem serviço externo. */
export type Desafio = { a: number; b: number };

export function gerarDesafio(rand: () => number = Math.random): Desafio {
  return { a: 1 + Math.floor(rand() * 9), b: 1 + Math.floor(rand() * 9) };
}

export function respostaCorreta(d: Desafio, resposta: string): boolean {
  const n = Number(resposta.trim());
  return resposta.trim() !== "" && Number.isInteger(n) && n === d.a + d.b;
}
