import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductTour, type TourStep } from './ProductTour';
import { liquidTabId } from './LiquidTabBar';
import { getState, useStore } from '../lib/store';
import { updateSettings } from '../lib/actions';
import { navigate, useModals, useRoute } from '../lib/ui';
import { useCloudStatus } from '../lib/cloud';

/**
 * Tour guiado do Rudge.
 * Abre sozinho uma vez por conta, depois do "Bem-vindo" (onboarding), na tela Início.
 * "Já viu" fica em settings.tourSeen, que sincroniza com a conta: quem viu no
 * computador não vê de novo no celular. Dá para rever em Configurações.
 */

const MOBILE = '(max-width: 900px)';

/** Primeiro elemento visível entre os seletores (computador e celular têm navegações diferentes). */
function pick(...selectors: string[]) {
  return () => {
    for (const sel of selectors) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el;
      }
    }
    return null;
  };
}

const byText = (sel: string, text: string) => () =>
  [...document.querySelectorAll<HTMLElement>(sel)].find((el) => el.textContent?.trim() === text && el.getBoundingClientRect().width > 0) ?? null;

const dock = (value: string) => `#${liquidTabId('dock', value)}`;
const rail = (label: string) => `.rail-item[aria-label="${label}"]`;

function buildSteps(mobile: boolean): TourStep[] {
  return [
    {
      title: 'Bem-vindo ao Rudge',
      body: mobile
        ? 'Um tour de 30 segundos pelo essencial. Toque em Próximo para seguir.'
        : 'Um tour de 30 segundos pelo essencial. Use Próximo ou as setas ← → do teclado (Esc fecha).',
    },
    {
      target: pick('.welcome'),
      title: 'Visão geral',
      body: 'Seu dia em um só lugar: tarefas de hoje, lembretes e metas fora do ritmo aparecem aqui assim que você abre o app.',
      placement: 'bottom',
    },
    {
      target: pick(dock('tarefas'), rail('Tarefas')),
      title: 'Tarefas',
      body: 'Tudo o que precisa ser feito, organizado por prazo. O número mostra quantas vencem hoje.',
      placement: 'right',
    },
    {
      target: pick(dock('metas'), rail('Metas')),
      title: 'Metas',
      body: 'Objetivos com prazo. O Rudge calcula o ritmo e monta um plano de ação para você chegar lá.',
      placement: 'right',
    },
    {
      target: pick(dock('mais'), rail('Hábitos')),
      title: 'Hábitos',
      body: mobile
        ? 'Pequenas ações diárias que constroem suas metas. No celular, ficam no menu Mais.'
        : 'Pequenas ações diárias que constroem suas metas. Marque todo dia e acompanhe a sequência.',
      placement: 'right',
    },
    {
      target: pick(dock('mais'), rail('Carteira')),
      title: 'Carteira',
      body: mobile
        ? 'Seus cartões, quanto entrou, quanto saiu e os 10% para guardar. Também fica no menu Mais.'
        : 'Seus cartões, quanto entrou, quanto saiu e os 10% para guardar.',
      placement: 'right',
    },
    {
      target: byText('.welcome-actions button', 'Focar'),
      title: 'Modo foco',
      body: 'Escolha uma tarefa e um tempo. A tela vira um relógio e o Rudge segura as distrações até você terminar.',
      placement: 'bottom',
    },
    {
      target: pick('.dock-add', '.topnav .btn-primary.btn-pill'),
      title: 'Adicionar rápido',
      body: 'Crie tarefas, lembretes e metas de qualquer tela. Dá para escrever do seu jeito, como “pagar conta amanhã às 9h”.',
      placement: 'bottom',
    },
    {
      title: 'Tudo pronto',
      body: 'Quando quiser rever este tour, é só abrir Configurações.',
    },
  ];
}

/* Pedido para rever o tour (botão em Configurações). */
const replayListeners = new Set<() => void>();
export function replayTour() {
  navigate('inicio');
  replayListeners.forEach((fn) => fn());
}

export function FirstRunTour() {
  const { settings } = useStore();
  const modals = useModals();
  const route = useRoute();
  const cloud = useCloudStatus();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const auto = useRef(false);

  const pending = settings.onboarded && !settings.tourSeen;
  const calm = route.name === 'inicio' && modals.length === 0 && cloud.state !== 'syncing';

  // Primeira vez: espera o "Bem-vindo" fechar, a conta sincronizar e a tela Início assentar.
  useEffect(() => {
    if (open || !pending || !calm) return;
    const t = setTimeout(() => {
      if (getState().settings.tourSeen) return;
      auto.current = true;
      setMobile(!!window.matchMedia?.(MOBILE).matches);
      setOpen(true);
    }, 1200);
    return () => clearTimeout(t);
  }, [open, pending, calm]);

  // Já visto em outro aparelho (chegou pela sincronização): fecha o tour automático.
  useEffect(() => {
    if (open && auto.current && settings.tourSeen) setOpen(false);
  }, [open, settings.tourSeen]);

  // Rever pelas Configurações
  useEffect(() => {
    const fn = () => {
      auto.current = false;
      setMobile(!!window.matchMedia?.(MOBILE).matches);
      setTimeout(() => setOpen(true), 500);
    };
    replayListeners.add(fn);
    return () => void replayListeners.delete(fn);
  }, []);

  const steps = useMemo(() => buildSteps(mobile), [mobile]);

  return (
    <ProductTour
      open={open}
      steps={steps}
      onClose={() => {
        setOpen(false);
        if (!getState().settings.tourSeen) updateSettings({ tourSeen: true });
      }}
    />
  );
}
