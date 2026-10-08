(function () {
  var s = document.currentScript;
  if (!s) return;
  var id = s.getAttribute("data-instancia");
  if (!id) return;
  var base = new URL(s.src).origin;
  var cor = s.getAttribute("data-cor") || "#0ea5e9";
  var lado = s.getAttribute("data-posicao") === "esquerda" ? "left" : "right";
  var icone = s.getAttribute("data-icone") || "chat";
  var imagem = s.getAttribute("data-imagem") || "";
  var ICONES = {
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    headset: '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>',
    atendente: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
    robo: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    whatsapp: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9 9.5c.3 2.3 2.2 4.2 4.5 4.5l1-1.2 1.8.7-.3 1.5c-3.5.4-7.4-3.5-7-7l1.5-.3.7 1.8z"/>',
    ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'
  };
  var h = cor.replace("#", ""), claro = false;
  if (/^[0-9a-f]{6}$/i.test(h)) {
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    claro = (r * 299 + g * 587 + b * 114) / 1000 > 170;
  }
  var fg = claro ? "#0f172a" : "#ffffff";
  function svg(p) { return '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="' + fg + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>"; }
  var fechado = imagem
    ? '<img src="' + imagem.replace(/"/g, "") + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
    : svg(ICONES[icone] || ICONES.chat);
  var x = svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
  var aberto = false;
  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Abrir chat");
  btn.style.cssText = "position:fixed;bottom:20px;" + lado + ":20px;width:60px;height:60px;border-radius:50%;border:0;padding:" + (imagem ? "0" : "16px") + ";background:" + cor + ";box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer;z-index:2147483646;display:flex;align-items:center;justify-content:center;overflow:hidden;transition:transform .2s";
  btn.innerHTML = fechado;
  btn.onmouseenter = function () { btn.style.transform = "scale(1.07)"; };
  btn.onmouseleave = function () { btn.style.transform = "scale(1)"; };
  var frame = document.createElement("iframe");
  var ident = { nome: s.getAttribute("data-nome") || "", telefone: s.getAttribute("data-telefone") || "", email: s.getAttribute("data-email") || "" };
  var qs = new URLSearchParams();
  Object.keys(ident).forEach(function (k) { if (ident[k]) qs.set(k, ident[k]); });
  frame.src = base + "/widget/" + encodeURIComponent(id) + (qs.toString() ? "?" + qs.toString() : "");
  frame.title = "Chat";
  frame.style.cssText = "position:fixed;bottom:92px;" + lado + ":20px;width:370px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);border:0;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.3);z-index:2147483647;display:none;background:#fff";
  btn.onclick = function () {
    aberto = !aberto;
    frame.style.display = aberto ? "block" : "none";
    btn.innerHTML = aberto ? x : fechado;
    btn.style.padding = aberto || !imagem ? "16px" : "0";
  };
  window.addEventListener("message", function (e) { if (e.origin === base && e.data === "atendeai-widget-fechar" && aberto) btn.onclick(); });
  function enviarIdent() { if (frame.contentWindow) frame.contentWindow.postMessage({ tipo: "atendeai-identificar", dados: ident }, base); }
  frame.addEventListener("load", enviarIdent);
  window.AtendeAI = {
    identify: function (d) { d = d || {}; ident = { nome: d.nome || "", telefone: d.telefone || "", email: d.email || "" }; enviarIdent(); },
    open: function () { if (!aberto) btn.onclick(); },
    close: function () { if (aberto) btn.onclick(); }
  };
  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();
