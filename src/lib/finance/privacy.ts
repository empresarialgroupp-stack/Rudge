// Privacidade da Carteira neste aparelho: o olhinho que desfoca os valores e as preferências
// da seção "Dados sensíveis" das Configurações.
import { useSyncExternalStore } from 'react';

const KEY = 'rudge.wallet.privacy.v1';

export interface Privacy {
  /** valores desfocados agora */
  hidden: boolean;
  /** sempre abrir a Carteira com os valores ocultos */
  hideOnOpen: boolean;
  /** avisos de entrada sem o valor ("Entrou dinheiro" em vez de "Entrou R$ 40,00") */
  hideToasts: boolean;
}

function read(): Privacy {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Privacy>;
    const hideOnOpen = !!v.hideOnOpen;
    return { hidden: hideOnOpen || !!v.hidden, hideOnOpen, hideToasts: !!v.hideToasts };
  } catch {
    return { hidden: false, hideOnOpen: false, hideToasts: false };
  }
}

let state = read();
const listeners = new Set<() => void>();

export function setPrivacy(patch: Partial<Privacy>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  listeners.forEach((l) => l());
}

export function usePrivacy() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}

/** Avisos mostram valores só quando nada está oculto e o usuário não pediu avisos discretos. */
export function amountsInAlerts() {
  return !state.hidden && !state.hideToasts;
}
