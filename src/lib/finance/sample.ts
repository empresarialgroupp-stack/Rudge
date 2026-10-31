// Dados de exemplo, gerados em datas relativas a hoje para o mês atual sempre ter movimento.
// Bancos, nomes e finais de cartão são fictícios.
import type { Category, FinanceCard, FinanceProvider, FinanceTransaction } from './types';

const DAY = 86_400_000;

function tx(id: string, merchant: string, category: Category, amount: number, daysAgo: number, now: number, note?: string): FinanceTransaction {
  const d = new Date(now - daysAgo * DAY);
  const when = daysAgo === 0 ? 'Hoje' : daysAgo === 1 ? 'Ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  return { id, merchant, category, amount, date: d.toISOString(), detail: `${note ?? CATEGORY_LABEL[category]} · ${when}` };
}

export const CATEGORY_LABEL: Record<Category, string> = {
  salario: 'Salário',
  pix: 'Pix',
  mercado: 'Mercado',
  restaurante: 'Restaurante',
  transporte: 'Transporte',
  assinatura: 'Assinatura',
  compras: 'Compras',
  casa: 'Casa',
  saude: 'Saúde',
  outros: 'Outros',
};

/** Dias desde o início do mês, limitado para as transações não caírem no mês anterior. */
function inMonth(daysAgo: number, now: number) {
  return Math.min(daysAgo, new Date(now).getDate() - 1);
}

export function sampleCards(now = Date.now()): FinanceCard[] {
  const m = (d: number) => inMonth(d, now);
  return [
    {
      id: 'conta',
      kind: 'debit',
      issuer: 'Banco Exemplo',
      product: 'Conta corrente',
      lastFour: '4821',
      holder: 'André',
      expires: '09/30',
      variant: 'metal',
      balance: 6240.5,
      balanceLabel: 'Disponível',
      transactions: [
        tx('c1', 'Cliente Onyx', 'pix', 1800, m(0), now, 'Pix recebido'),
        tx('c2', 'Padaria Central', 'restaurante', -18.9, m(0), now),
        tx('c3', 'Supermercado Bom Preço', 'mercado', -412.35, m(2), now),
        tx('c4', 'Uber', 'transporte', -27.4, m(2), now),
        tx('c5', 'Salário', 'salario', 5200, m(4), now, 'Depósito'),
        tx('c6', 'Aluguel', 'casa', -1650, m(5), now, 'Boleto'),
        tx('c7', 'Farmácia', 'saude', -86.2, m(6), now),
        tx('c8', 'Café da esquina', 'restaurante', -12.5, m(7), now),
        tx('c9', 'Café da esquina', 'restaurante', -14, m(8), now),
      ],
    },
    {
      id: 'credito',
      kind: 'credit',
      issuer: 'Banco Exemplo',
      product: 'Crédito Black',
      lastFour: '0917',
      holder: 'André',
      expires: '03/29',
      variant: 'black',
      limit: 8000,
      balance: 2186.3,
      balanceLabel: 'Fatura atual',
      transactions: [
        tx('k1', 'Streaming', 'assinatura', -55.9, m(1), now),
        tx('k2', 'Restaurante Japonês', 'restaurante', -186, m(1), now),
        tx('k3', 'Loja de eletrônicos', 'compras', -1299, m(3), now, 'Compras · 3x'),
        tx('k4', 'Posto Ipiranga', 'transporte', -230, m(4), now),
        tx('k5', 'iFood', 'restaurante', -64.5, m(5), now),
        tx('k6', 'iFood', 'restaurante', -48.9, m(6), now),
        tx('k7', 'Academia', 'assinatura', -119.9, m(8), now),
        tx('k8', 'Estorno', 'compras', 45, m(9), now, 'Estorno'),
      ],
    },
    {
      id: 'empresa',
      kind: 'debit',
      issuer: 'Banco Digital',
      product: 'Conta PJ',
      lastFour: '3306',
      holder: 'André',
      expires: '11/28',
      variant: 'color',
      tint: 'oklch(42% .15 262)',
      balance: 14830,
      balanceLabel: 'Disponível',
      transactions: [
        tx('e1', 'Cliente Atlas', 'pix', 4500, m(1), now, 'Pix recebido'),
        tx('e2', 'Ferramentas SaaS', 'assinatura', -289, m(2), now),
        tx('e3', 'Cliente Norte', 'pix', 2700, m(6), now, 'Pix recebido'),
        tx('e4', 'Contador', 'outros', -450, m(7), now, 'Serviço'),
        tx('e5', 'Anúncios', 'compras', -900, m(9), now, 'Marketing'),
      ],
    },
  ];
}

export const sampleProvider: FinanceProvider = {
  id: 'sample',
  label: 'Dados de exemplo',
  live: false,
  listCards: async () => sampleCards(),
};
