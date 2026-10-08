// Mantenha em sincronia com public/atendeai-widget.js (mesmas chaves e desenhos).
export const WIDGET_ICONES: Record<string, { nome: string; svg: string }> = {
  chat: { nome: "Balão de conversa", svg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>' },
  headset: {
    nome: "Fone de atendimento",
    svg: '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>',
  },
  atendente: {
    nome: "Atendente",
    svg: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
  },
  robo: {
    nome: "Robô / IA",
    svg: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  },
  whatsapp: {
    nome: "WhatsApp",
    svg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9 9.5c.3 2.3 2.2 4.2 4.5 4.5l1-1.2 1.8.7-.3 1.5c-3.5.4-7.4-3.5-7-7l1.5-.3.7 1.8z"/>',
  },
  ajuda: {
    nome: "Ajuda",
    svg: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  },
};

export const svgIcone = (k: string, cor = "currentColor", tam = 28) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${(WIDGET_ICONES[k] ?? WIDGET_ICONES.chat!).svg}</svg>`;
