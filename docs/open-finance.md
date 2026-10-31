# Carteira: conexão com os bancos (Open Finance)

Hoje a Carteira usa dados de exemplo (`src/lib/finance/sample.ts`). A troca para dados reais
acontece em um único ponto: `getProvider()` em `src/lib/finance/index.ts`.

## Agregador recomendado: Pluggy

- Brasileiro, conecta via Open Finance os principais bancos (Itaú, Bradesco, Santander, BB,
  Caixa, Nubank, Inter, C6 e outros) com consentimento do próprio usuário.
- Tem widget pronto de conexão (Pluggy Connect) e ambiente de testes gratuito.
- Alternativa: Belvo (mais focado em empresas e América Latina como um todo).

## Como fica a arquitetura

```
app ──/finance/connect-token──▶ Edge Function (Supabase) ──▶ Pluggy API
 │  abre o Pluggy Connect com o token, o usuário autoriza no banco
 └─/finance/cards──▶ Edge Function ──▶ contas, cartões e transações ──▶ FinanceCard[]
```

- `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` ficam como secrets do Supabase. Nunca no repositório
  nem no front.
- O app só guarda o `itemId` da conexão; as transações vêm do servidor.
- Só os 4 últimos dígitos do cartão chegam ao app.

## Passos para ligar

1. Criar conta em pluggy.ai e gerar as credenciais de teste.
2. Salvar as credenciais como secrets do Supabase.
3. Adicionar as rotas `/finance/*` na função `rudge` e um `pluggyProvider` que implemente
   `FinanceProvider.listCards()` mapeando contas/transações para `FinanceCard`.
4. Testar no ambiente de testes da Pluggy, depois trocar para produção.

## Wallet stack da Arc Pro

`src/components/WalletStack.tsx` é uma versão própria com a mesma API do Wallet stack da Arc
Pro. Com o plano Pro, `npx shadcn@latest add @uiarc-pro/wallet-stack` (com `ARC_PRO_TOKEN` no
ambiente, nunca no repositório) e trocar o import em `src/pages/Wallet.tsx`.
