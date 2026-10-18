import { useState } from 'react';
import { ArrowRight, Bell, BellRing, Check, CircleAlert, Download, Info, Sparkles, Target, X } from 'lucide-react';
import { closeModal, dismissToast, navigate, openModal, useModals, useToasts, type Toast } from '../lib/ui';
import { updateSettings } from '../lib/actions';
import { useStore } from '../lib/store';
import { permission } from '../lib/notify';
import { isStandalone, promptInstall, useInstall } from '../lib/pwa';
import { TaskEditor, ReminderEditor, HabitEditor } from './Editors';
import { QuickAdd, CommandPalette } from './Quick';
import { GoalWizard, GoalDetail, GoalEdit } from './GoalModals';
import { VoiceModal } from './VoiceModal';
import { BrandMark, Modal } from './ui';
import { enableNotifications } from '../pages/Dashboard';

const TOAST_ICON: Record<NonNullable<Toast['icon']>, typeof Bell> = {
  bell: Bell,
  check: Check,
  info: Info,
  error: CircleAlert,
  spark: Sparkles,
};

export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => {
        const I = TOAST_ICON[t.icon ?? 'info'];
        return (
          <div key={t.id} className="toast glass strong" role="status">
            <div className="t-icon">
              <I />
            </div>
            <div className="t-body">
              <b>{t.title}</b>
              {t.body && <p>{t.body}</p>}
              {!!t.actions?.length && (
                <div className="t-actions">
                  {t.actions.map((a, i) => (
                    <button
                      key={a.label}
                      className={i === 0 ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-glass'}
                      onClick={() => {
                        a.run();
                        dismissToast(t.id);
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="icon-btn sm" onClick={() => dismissToast(t.id)} aria-label="Fechar">
              <X />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Onboarding() {
  const s = useStore();
  const install = useInstall();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(s.settings.name);
  const finish = () => {
    updateSettings({ onboarded: true, name: name.trim() || s.settings.name });
    closeModal('onboarding');
  };
  const notifOk = permission() === 'granted' && s.settings.notifications;

  return (
    <Modal onClose={finish} size="narrow">
      <div className="steps" style={{ marginTop: 6 }}>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      {step === 0 && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <BrandMark className="login-mark" />
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 650, letterSpacing: '-0.03em' }}>Bem-vindo ao Rudge</h2>
          <p className="muted" style={{ margin: 0 }}>Tarefas, metas, hábitos e lembretes em um só lugar — com notificações que realmente lembram você.</p>
          <input
            className="input"
            placeholder="Como quer ser chamado?"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setStep(1)}
            autoFocus
            style={{ textAlign: 'center', marginTop: 6 }}
          />
        </div>
      )}
      {step === 1 && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="empty-icon" style={{ width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'var(--solid)', color: 'var(--on-solid)' }}>
            <BellRing width={26} height={26} />
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 650, letterSpacing: '-0.03em' }}>Ative as notificações</h2>
          <p className="muted" style={{ margin: 0 }}>
            É assim que o Rudge lembra você de compromissos, hábitos e do progresso das metas — com botões para concluir ou adiar direto no aviso.
          </p>
          {notifOk ? (
            <span className="chip solid" style={{ height: 30, padding: '0 12px' }}>
              <Check /> Notificações ativadas
            </span>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={() => void enableNotifications()}>
              <Bell /> Permitir notificações
            </button>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="empty-icon" style={{ width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'var(--solid)', color: 'var(--on-solid)' }}>
            <Download width={26} height={26} />
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 650, letterSpacing: '-0.03em' }}>Instale como aplicativo</h2>
          <p className="muted" style={{ margin: 0 }}>Janela própria no computador, ícone na tela inicial do celular e funcionamento offline.</p>
          {isStandalone() || install === 'installed' ? (
            <span className="chip solid" style={{ height: 30, padding: '0 12px' }}>
              <Check /> Já instalado
            </span>
          ) : install === 'available' ? (
            <button className="btn btn-primary btn-lg" onClick={() => void promptInstall()}>
              <Download /> Instalar agora
            </button>
          ) : (
            <button
              className="btn btn-glass btn-lg"
              onClick={() => {
                finish();
                navigate('instalar');
              }}
            >
              Ver passo a passo
            </button>
          )}
        </div>
      )}
      {step === 3 && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="empty-icon" style={{ width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'var(--solid)', color: 'var(--on-solid)' }}>
            <Target width={26} height={26} />
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 650, letterSpacing: '-0.03em' }}>Sua primeira meta</h2>
          <p className="muted" style={{ margin: 0 }}>Escolha uma área da vida e o Rudge propõe uma meta concreta, com etapas, hábito de apoio e lembretes.</p>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => {
              finish();
              openModal({ type: 'goal-wizard' });
            }}
          >
            <Sparkles /> Criar minha meta
          </button>
        </div>
      )}
      <div className="row" style={{ marginTop: 22 }}>
        <button className="btn btn-ghost" onClick={finish}>
          Pular
        </button>
        <div className="spacer" />
        {step < 3 && (
          <button className="btn btn-glass" onClick={() => setStep(step + 1)}>
            Continuar <ArrowRight />
          </button>
        )}
      </div>
    </Modal>
  );
}

export function ModalHost() {
  const modals = useModals();
  return (
    <>
      {modals.map((m) => {
        switch (m.type) {
          case 'task':
            return <TaskEditor key={`task-${m.id ?? 'new'}`} id={m.id} defaults={m.defaults} />;
          case 'reminder':
            return <ReminderEditor key={`rem-${m.id ?? 'new'}`} id={m.id} defaults={m.defaults} />;
          case 'habit':
            return <HabitEditor key={`habit-${m.id ?? 'new'}`} id={m.id} defaults={m.defaults} />;
          case 'goal-wizard':
            return <GoalWizard key={`gw-${m.templateId ?? ''}`} templateId={m.templateId} />;
          case 'goal-detail':
            return <GoalDetail key={`gd-${m.id}`} id={m.id} />;
          case 'goal-edit':
            return <GoalEdit key={`ge-${m.id}`} id={m.id} />;
          case 'quick-add':
            return <QuickAdd key="qa" mode={m.mode} />;
          case 'voice':
            return <VoiceModal key="voice" />;
          case 'command':
            return <CommandPalette key="cmd" />;
          case 'onboarding':
            return <Onboarding key="onb" />;
          default:
            return null;
        }
      })}
    </>
  );
}
