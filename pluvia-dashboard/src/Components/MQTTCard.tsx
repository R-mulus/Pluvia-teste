export interface PayloadMQTT {
  meta: {
    msg_id: string;
    timestamp_envio: number;
    ttl_segundos: number;
  };
  tipo: string;
  dados: {
    start: number;
    direcao: number;
    irrigacao: number;
    lamina: number;
    angulo_inicial: number;
    angulo_final: number;
  };
}

interface MQTTCardProps {
  lastPayload: PayloadMQTT | null;
}

export function MQTTCard({ lastPayload }: MQTTCardProps) {
  return (
    <article className="card mqtt-card">
      <div className="card-header">
        <div>
          <span className="card-label">PUBLISHER MQTT</span>
          <h2>Payload de Saída (JSON)</h2>
        </div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        {lastPayload ? (
          <pre
            style={{
              backgroundColor: '#111827',
              color: '#34d399',
              padding: '1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              overflowX: 'auto',
              fontFamily: 'monospace',
              border: '1px solid #374151',
              margin: 0
            }}
          >
            <code>{JSON.stringify(lastPayload, null, 2)}</code>
          </pre>
        ) : (
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', fontStyle: 'italic', margin: '1rem 0 0 0' }}>
            Aguardando envio de comandos...
          </p>
        )}
      </div>
    </article>
  );
}