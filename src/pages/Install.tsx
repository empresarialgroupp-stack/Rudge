import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import {
  AppWindow,
  BatteryCharging,
  BellRing,
  CheckCircle2,
  Copy,
  Download,
  EllipsisVertical,
  Info,
  Laptop,
  MoreHorizontal,
  Plus,
  Power,
  Share,
  Smartphone,
  SquarePlus,
  Tablet,
} from 'lucide-react';
import { detectBrowser, detectPlatform, isStandalone, promptInstall, useInstall } from '../lib/pwa';
import { permission } from '../lib/notify';
import { toast } from '../lib/ui';
import { useStore } from '../lib/store';
import { BrandMark, Segmented } from '../components/ui';
import { enableNotifications } from './Dashboard';

type Target = 'desktop' | 'android' | 'ios';

function QR({ text }: { text: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    return { n, d };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${svg.n + 4} ${svg.n + 4}`} width={148} height={148} style={{ borderRadius: 14, background: '#fff', flex: 'none' }} aria-label="QR code do endereço">
      <path d={svg.d} fill="#000" />
    </svg>
  );
}

const Hint = ({ children }: { children: React.ReactNode }) => <span className="ui-hint">{children}</span>;

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="step">
      <span className="n" />
      <div>
        <b>{title}</b>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function Install() {
  const s = useStore();
  const platform = detectPlatform();
  const browser = detectBrowser();
  const install = useInstall();
  const [target, setTarget] = useState<Target>(platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'desktop');
  const url = location.origin + location.pathname;
  const standalone = isStandalone();
  const notifOk = permission() === 'granted' && s.settings.notifications;

  return (
    <>
      <div className="install-hero glass liquid">
        <div>
          <h2>{standalone || install === 'installed' ? 'O Rudge está instalado' : 'Instale o Rudge como aplicativo'}</h2>
          <p>
            {standalone || install === 'installed'
              ? 'Você está usando a versão instalada: janela própria, funciona offline e mantém os lembretes ativos.'
              : 'Ele ganha ícone próprio, abre em janela dedicada, funciona offline e fica pronto para disparar seus lembretes. Escolha o seu dispositivo e siga o passo a passo.'}
          </p>
          <div className="row wrap" style={{ marginTop: 16 }}>
            {install === 'available' && (
              <button
                className="btn btn-primary btn-lg"
                onClick={async () => {
                  const ok = await promptInstall();
                  if (ok) toast({ title: 'Rudge instalado', body: 'Abra pelo ícone no menu iniciar, dock ou tela inicial.', icon: 'check' });
                }}
              >
                <Download /> Instalar agora
              </button>
            )}
            {(standalone || install === 'installed') && (
              <span className="chip solid" style={{ height: 30, padding: '0 12px' }}>
                <CheckCircle2 /> Instalado
              </span>
            )}
            {!notifOk && (
              <button className="btn btn-glass btn-lg" onClick={() => void enableNotifications()}>
                <BellRing /> Ativar notificações
              </button>
            )}
          </div>
        </div>
        <BrandMark className="install-icon" />
      </div>

      <div className="toolbar">
        <Segmented
          value={target}
          onChange={setTarget}
          options={[
            { value: 'desktop', label: <><Laptop width={15} /> Computador</> },
            { value: 'android', label: <><Smartphone width={15} /> Android</> },
            { value: 'ios', label: <><Tablet width={15} /> iPhone / iPad</> },
          ]}
        />
      </div>

      <div className="dash-grid" style={{ marginTop: 0 }}>
        <div className="dash-col">
          {target === 'desktop' && (
            <section className="card glass">
              <div className="card-head">
                <h2 className="card-title">
                  <Laptop /> Windows, Mac ou Linux
                </h2>
              </div>
              <div className="step-list">
                <Step title="Abra no Chrome ou no Edge">
                  Acesse este mesmo endereço no Google Chrome ou no Microsoft Edge{browser === 'firefox' ? ' (o Firefox não instala apps da web no computador)' : ''}. No Mac também funciona pelo Safari: menu <Hint>Arquivo</Hint> → <Hint>Adicionar ao Dock…</Hint>.
                </Step>
                <Step title="Clique em instalar">
                  Na barra de endereço, à direita, clique no ícone <Hint><AppWindow /> Instalar</Hint>. Se não aparecer: no Chrome, menu <Hint><EllipsisVertical /></Hint> → <Hint>Transmitir, salvar e compartilhar</Hint> → <Hint>Instalar página como app…</Hint>. No Edge, menu <Hint><MoreHorizontal /></Hint> → <Hint>Aplicativos</Hint> → <Hint>Instalar este site como um aplicativo</Hint>.
                </Step>
                <Step title="Confirme">
                  Clique em <Hint>Instalar</Hint>. O Rudge abre em janela própria e aparece no Menu Iniciar (Windows), no Launchpad (Mac) ou no menu de aplicativos (Linux).
                </Step>
                <Step title="Fixe na barra de tarefas / Dock">
                  Windows: clique com o botão direito no ícone do Rudge na barra de tarefas → <Hint>Fixar na barra de tarefas</Hint>. Mac: clique com o botão direito no ícone no Dock → <Hint>Opções</Hint> → <Hint>Manter no Dock</Hint>.
                </Step>
                <Step title="Ative as notificações">
                  No Rudge, toque em <Hint><BellRing /> Ativar notificações</Hint> e escolha <Hint>Permitir</Hint>. Confira também se o sistema permite: Windows → <Hint>Configurações › Sistema › Notificações</Hint>; Mac → <Hint>Ajustes do Sistema › Notificações</Hint>.
                </Step>
                <Step title="Abra junto com o computador (opcional)">
                  Os avisos já chegam com o Rudge fechado; abrir com o sistema deixa o app à mão. Chrome: abra <Hint>chrome://apps</Hint>, clique com o botão direito no Rudge → <Hint><Power /> Iniciar app ao fazer login</Hint>. Edge: abra <Hint>edge://apps</Hint>, no Rudge clique em <Hint><MoreHorizontal /></Hint> → <Hint>Iniciar automaticamente no logon do dispositivo</Hint>.
                </Step>
              </div>
            </section>
          )}

          {target === 'android' && (
            <section className="card glass">
              <div className="card-head">
                <h2 className="card-title">
                  <Smartphone /> Android
                </h2>
              </div>
              <div className="step-list">
                <Step title="Abra no Google Chrome">Aponte a câmera para o QR code ao lado ou digite o endereço no Chrome do celular.</Step>
                <Step title="Instale o app">
                  Toque no menu <Hint><EllipsisVertical /></Hint> no canto superior direito → <Hint>Instalar app</Hint> (em algumas versões: <Hint>Adicionar à tela inicial</Hint> → <Hint>Instalar</Hint>). No Samsung Internet: menu <Hint>≡</Hint> → <Hint>Adicionar página a</Hint> → <Hint>Tela inicial</Hint>.
                </Step>
                <Step title="Abra pelo ícone">O Rudge aparece na tela inicial e na gaveta de apps. Abra por ali e entre com seu e-mail e senha.</Step>
                <Step title="Permita as notificações">
                  Toque em <Hint><BellRing /> Ativar notificações</Hint> → <Hint>Permitir</Hint>. Os avisos trazem os botões <Hint>Concluir</Hint> e <Hint>Adiar</Hint>.
                </Step>
                <Step title="Evite que o sistema pause o Rudge">
                  Em <Hint>Configurações › Apps › Chrome › Bateria</Hint> escolha <Hint><BatteryCharging /> Sem restrições</Hint> (o nome varia por fabricante).
                </Step>
              </div>
            </section>
          )}

          {target === 'ios' && (
            <section className="card glass">
              <div className="card-head">
                <h2 className="card-title">
                  <Tablet /> iPhone e iPad
                </h2>
              </div>
              <div className="step-list">
                <Step title="Abra no Safari">Aponte a câmera para o QR code ao lado ou digite o endereço no Safari (requer iOS/iPadOS 16.4 ou superior).</Step>
                <Step title="Toque em Compartilhar">
                  Toque no botão <Hint><Share /> Compartilhar</Hint> — na barra inferior do iPhone ou no topo do iPad.
                </Step>
                <Step title="Adicionar à Tela de Início">
                  Role a lista e toque em <Hint><SquarePlus /> Adicionar à Tela de Início</Hint>. Mantenha <Hint>Abrir como App Web</Hint> ativado e toque em <Hint><Plus /> Adicionar</Hint>.
                </Step>
                <Step title="Abra pelo ícone e ative as notificações">
                  No iPhone as notificações só funcionam pelo app instalado. Abra o Rudge pela Tela de Início, entre e toque em <Hint><BellRing /> Ativar notificações</Hint> → <Hint>Permitir</Hint>.
                </Step>
              </div>
            </section>
          )}
        </div>

        <div className="dash-col">
          <section className="card glass">
            <div className="card-head">
              <h2 className="card-title">
                <Smartphone /> Abrir em outro dispositivo
              </h2>
            </div>
            <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
              <QR text={url} />
              <div className="stack sm" style={{ minWidth: 0 }}>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>Escaneie com a câmera do celular para abrir o Rudge e instalar.</p>
                <code style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--fg-2)' }}>{url}</code>
                <button
                  className="btn btn-sm btn-glass"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      toast({ title: 'Endereço copiado', icon: 'check' });
                    } catch {
                      toast({ title: 'Não foi possível copiar', icon: 'error' });
                    }
                  }}
                >
                  <Copy /> Copiar endereço
                </button>
              </div>
            </div>
          </section>

          <section className="card glass">
            <div className="card-head">
              <h2 className="card-title">
                <Info /> Como os lembretes funcionam
              </h2>
            </div>
            <div className="stack sm" style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>
                O Rudge agenda tudo — lembretes, tarefas com horário, hábitos, check-ins de metas, o resumo da manhã e o fechamento do dia — e envia a agenda dos próximos 30 dias para o servidor do Rudge.
              </p>
              <p style={{ margin: 0 }}>
                <b>Com o app fechado:</b> o servidor confere a cada minuto e envia o aviso para o computador e o celular, com os botões <b>Concluir</b> e <b>Adiar</b>. Basta ativar as notificações em cada aparelho (no iPhone, pelo app instalado na Tela de Início).
              </p>
              <p style={{ margin: 0 }}>
                <b>Dica:</b> em Configurações → Notificações use “Testar com o app fechado” para conferir em cada aparelho.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
