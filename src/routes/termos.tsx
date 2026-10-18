import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/landing/LegalPage";

const TITLE = "Termos de Uso — Atende.ai";
const DESC = "Regras de uso da plataforma Atende.ai explicadas de forma simples: conta, dados, assinatura e cancelamento.";
const URL = "https://pwa-engage.lovable.app/termos";

export const Route = createFileRoute("/termos")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: Termos,
});

function Termos() {
  return (
    <LegalPage
      atual="termos"
      titulo="Termos de Uso"
      resumo="Você é dono dos seus dados. Nós fornecemos uma ferramenta segura para você atender, vender e organizar sua empresa. Só não vale usar o sistema para spam ou qualquer coisa ilegal."
      secoes={[
        { titulo: "O que é o Atende.ai", conteudo: <p>O Atende.ai é um sistema on-line, por assinatura, que reúne atendimento (inclusive WhatsApp), CRM, ofertas, projetos, ordens de serviço e financeiro em um só lugar. Ao criar uma conta ou usar o sistema, você concorda com estes termos.</p> },
        { titulo: "Sua conta e sua senha", resumo: "Cuide da sua senha como cuida da chave de casa.", conteudo: <><p>Você é responsável por manter sua senha em segredo e por decidir o que cada colaborador pode ver ou fazer no sistema.</p><p>Todas as ações importantes ficam registradas (quem fez e quando), para proteger a sua própria empresa.</p></> },
        { titulo: "O que não é permitido", resumo: "Nada de spam, golpes ou conteúdo ilegal.", conteudo: <><p>É proibido usar o sistema para:</p><ul className="list-disc space-y-1 pl-6"><li>enviar mensagens em massa para quem não autorizou (spam);</li><li>divulgar conteúdo ofensivo, falso ou ilegal;</li><li>tentar invadir, copiar ou prejudicar o sistema.</li></ul><p>Se isso acontecer, a conta pode ser suspensa.</p></> },
        { titulo: "Os dados são seus", resumo: "Não vendemos nem usamos seus dados para outra finalidade.", conteudo: <p>Tudo o que você cadastra (clientes, mensagens, ofertas, financeiro) pertence à sua empresa. Usamos essas informações apenas para fazer o sistema funcionar para você.</p> },
        { titulo: "Planos, pagamento e cancelamento", resumo: "Pode trocar de plano ou cancelar quando quiser.", conteudo: <><p>O serviço é cobrado por mensalidade, conforme o plano e os módulos escolhidos. Você pode mudar de plano ou cancelar a qualquer momento.</p><p>Antes de encerrar, você pode pedir uma cópia dos seus dados cadastrais.</p></> },
        { titulo: "Funcionamento e suporte", conteudo: <p>Trabalhamos para manter o sistema no ar 24 horas por dia. Quando houver manutenção programada, avisaremos antes. O suporte é feito pelo WhatsApp e por e-mail.</p> },
        { titulo: "Mudanças nestes termos", conteudo: <p>Se alterarmos estes termos, avisaremos pelo sistema ou por e-mail. A data de atualização sempre aparece no topo desta página.</p> },
      ]}
    />
  );
}
