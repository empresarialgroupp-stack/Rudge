// Tipos da carteira. O formato do cartão segue a API do Wallet stack (Arc Pro), então o
// componente próprio pode ser trocado pelo da Arc sem mudar os dados.
import type { ReactNode } from 'react';

export type CardVariant = 'metal' | 'black' | 'glass' | 'color';

export interface WalletTransaction {
  id: string;
  merchant: string;
  detail: string;
  /** negativo = gasto, positivo = entrada */
  amount: number;
  icon?: ReactNode;
  avatar?: string;
}

export interface WalletStackCard {
  id: string;
  issuer: string;
  product: string;
  /** só os 4 últimos dígitos; nunca o número completo */
  lastFour: string;
  holder: string;
  variant?: CardVariant;
  tint?: string;
  expires?: string;
  network?: ReactNode;
  image?: string;
  balance: number;
  balanceLabel: string;
  transactions: WalletTransaction[];
}

export type Category = 'salario' | 'pix' | 'mercado' | 'restaurante' | 'transporte' | 'assinatura' | 'compras' | 'casa' | 'saude' | 'outros';

/** Transação com data e categoria, como vem do agregador (Open Finance). */
export interface FinanceTransaction extends WalletTransaction {
  /** ISO 8601 */
  date: string;
  category: Category;
}

export interface FinanceCard extends WalletStackCard {
  kind: 'debit' | 'credit';
  /** limite do cartão de crédito */
  limit?: number;
  transactions: FinanceTransaction[];
}

/** Fonte dos dados: exemplo agora, Open Finance (Pluggy) depois. */
export interface FinanceProvider {
  id: 'sample' | 'pluggy';
  label: string;
  /** true quando os dados são reais (vindos do banco) */
  live: boolean;
  listCards(): Promise<FinanceCard[]>;
}
