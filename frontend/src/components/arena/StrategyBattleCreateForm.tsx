'use client';

interface CreateBattleForm {
  nft1: string;
  nft2: string;
  nft2Owner: string;
  stakes: string;
  scheduledStartAt: string;
}

interface StrategyBattleCreateFormProps {
  form: CreateBattleForm;
  onFormChange: (updater: (prev: CreateBattleForm) => CreateBattleForm) => void;
  onSubmit: () => void;
  status: { loading: boolean; error: string | null; success: string | null };
  disabled: boolean;
}

export default function StrategyBattleCreateForm({
  form,
  onFormChange,
  onSubmit,
  status,
  disabled,
}: StrategyBattleCreateFormProps) {
  return (
    <div
      className="p-6 space-y-4"
      style={{
        background: 'rgba(120, 160, 200, 0.1)',
        border: '2px solid #ff8c00',
        borderRadius: '16px',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div style={{ fontFamily: 'Press Start 2P, monospace', color: '#ff8c00', fontSize: '11px', marginBottom: '12px' }}>
        CREATE STRATEGY BATTLE
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '9px', color: '#ffb347', display: 'block', marginBottom: '4px' }}>YOUR NFT ID</label>
          <input
            type="number"
            value={form.nft1}
            onChange={(e) => onFormChange((f) => ({ ...f, nft1: e.target.value }))}
            placeholder="e.g. 42"
            style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid #ff8c00', borderRadius: '8px', color: '#fff', fontFamily: 'monospace' }}
          />
        </div>
        <div>
          <label style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '9px', color: '#ffb347', display: 'block', marginBottom: '4px' }}>OPPONENT NFT ID</label>
          <input
            type="number"
            value={form.nft2}
            onChange={(e) => onFormChange((f) => ({ ...f, nft2: e.target.value }))}
            placeholder="e.g. 7"
            style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid #ff8c00', borderRadius: '8px', color: '#fff', fontFamily: 'monospace' }}
          />
        </div>
        <div>
          <label style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '9px', color: '#ffb347', display: 'block', marginBottom: '4px' }}>OPPONENT WALLET</label>
          <input
            type="text"
            value={form.nft2Owner}
            onChange={(e) => onFormChange((f) => ({ ...f, nft2Owner: e.target.value }))}
            placeholder="0x..."
            style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid #ff8c00', borderRadius: '8px', color: '#fff', fontFamily: 'monospace' }}
          />
        </div>
        <div>
          <label style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '9px', color: '#ffb347', display: 'block', marginBottom: '4px' }}>STAKES (CRwN)</label>
          <input
            type="number"
            value={form.stakes}
            onChange={(e) => onFormChange((f) => ({ ...f, stakes: e.target.value }))}
            placeholder="100"
            style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid #ff8c00', borderRadius: '8px', color: '#fff', fontFamily: 'monospace' }}
          />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '9px', color: '#ffb347', display: 'block', marginBottom: '4px' }}>SCHEDULED START (OPTIONAL)</label>
          <input
            type="datetime-local"
            value={form.scheduledStartAt}
            onChange={(e) => onFormChange((f) => ({ ...f, scheduledStartAt: e.target.value }))}
            style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid #ff8c00', borderRadius: '8px', color: '#fff', fontFamily: 'monospace' }}
          />
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#999', display: 'block', marginTop: '2px' }}>Leave empty to start immediately</span>
        </div>
      </div>
      {status.error && (
        <p style={{ color: '#ff4444', fontFamily: 'monospace', fontSize: '12px' }}>{status.error}</p>
      )}
      {status.success && (
        <p style={{ color: '#44ff88', fontFamily: 'monospace', fontSize: '12px' }}>{status.success}</p>
      )}
      <button
        onClick={onSubmit}
        disabled={status.loading || disabled}
        style={{
          background: status.loading ? 'rgba(255,140,0,0.4)' : 'linear-gradient(135deg, #ff8c00, #ff6b00)',
          border: '2px solid #ff8c00',
          borderRadius: '10px',
          padding: '10px 24px',
          color: '#fff',
          fontFamily: 'Press Start 2P, monospace',
          fontSize: '10px',
          cursor: status.loading || disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {status.loading ? 'CREATING...' : 'LAUNCH BATTLE'}
      </button>
    </div>
  );
}
