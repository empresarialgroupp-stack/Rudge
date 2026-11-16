import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileUp, Lock } from 'lucide-react';
import { Field, Modal, Segmented } from './ui';
import { toast } from '../lib/ui';
import { useStore } from '../lib/store';
import { BANKS, importStatement, type BankId } from '../lib/finance';

/** Lê o arquivo como UTF-8 e, se vier com acentos quebrados, como Windows-1252 (comum em OFX). */
async function readText(file: File) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function WalletImport({ onClose }: { onClose: () => void }) {
  const { settings } = useStore();
  const [bank, setBank] = useState<BankId>('nubank');
  const [kind, setKind] = useState<'debit' | 'credit'>('debit');
  const [lastFour, setLastFour] = useState('');
  const [limit, setLimit] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function run() {
    if (!file) return input.current?.click();
    setBusy(true);
    try {
      const r = importStatement({
        bank,
        kind,
        lastFour,
        holder: settings.name || 'Você',
        limit: kind === 'credit' && Number(limit.replace(/\D/g, '')) ? Number(limit.replace(/\D/g, '')) : undefined,
        text: await readText(file),
      });
      toast({
        title: `${BANKS[bank].label}: ${r.count} transações lidas`,
        body: r.added > 0 ? `${r.added} novas na carteira.` : 'Nada novo: esse extrato já estava importado.',
        icon: 'check',
      });
      onClose();
    } catch (e) {
      toast({ title: 'Não consegui ler o arquivo', body: e instanceof Error ? e.message : String(e), icon: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // portal: dentro da página o modal ficaria abaixo da barra de abas do celular
  return createPortal(
    <Modal
      title="Importar extrato"
      onClose={onClose}
      size="narrow"
      footer={
        <button className="btn btn-primary btn-pill" onClick={run} disabled={busy}>
          <FileUp /> {file ? (busy ? 'Importando…' : 'Importar') : 'Escolher arquivo'}
        </button>
      }
    >
      <div className="wimport">
        <Field label="Banco">
          <Segmented full value={bank} onChange={setBank} options={(Object.keys(BANKS) as BankId[]).map((b) => ({ value: b, label: b === 'outro' ? 'Outro' : BANKS[b].label }))} />
        </Field>
        <p className="wimport-how">{BANKS[bank].how}</p>
        <Field label="Tipo">
          <Segmented
            full
            value={kind}
            onChange={setKind}
            options={[
              { value: 'debit', label: 'Conta' },
              { value: 'credit', label: 'Cartão de crédito' },
            ]}
          />
        </Field>
        <div className="wimport-row">
          <Field label="Final do cartão (opcional)">
            <input className="input" inputMode="numeric" maxLength={4} placeholder="1234" value={lastFour} onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))} />
          </Field>
          {kind === 'credit' && (
            <Field label="Limite (opcional)">
              <input className="input" inputMode="numeric" placeholder="5000" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label="Arquivo (OFX ou CSV)">
          <button type="button" className="wimport-file" onClick={() => input.current?.click()}>
            <FileUp />
            <span>{file ? file.name : 'Toque para escolher o arquivo do extrato'}</span>
          </button>
          <input ref={input} type="file" accept=".ofx,.csv,.txt,text/csv,application/x-ofx" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <p className="wimport-lock">
          <Lock /> O arquivo é lido neste aparelho e não é enviado para nenhum servidor. Nenhuma senha de banco é pedida.
        </p>
      </div>
    </Modal>,
    document.body,
  );
}
