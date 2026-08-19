import { useEffect, useState } from 'react';

export function HeartbeatCard() {
  const [ultimaMensagem, setUltimaMensagem] = useState<Date | null>(null);
  const [online, setOnline] = useState(false);
  const [pingStatus, setPingStatus] = useState("Aguardando sinal...");

  useEffect(() => {
    const tunelSSE = new EventSource("http://localhost:3000/api/telemetria");
    
    tunelSSE.onmessage = () => {
      setUltimaMensagem(new Date());
      setOnline(true);
      setPingStatus("Telemetria Estável");
    };

    return () => tunelSSE.close();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (ultimaMensagem) {
        const diferencaTempo = new Date().getTime() - ultimaMensagem.getTime();
        // 4 segundos de tolerância antes de declarar timeout
        if (diferencaTempo > 4000) {
          setOnline(false);
          setPingStatus("Sem comunicação (>4s)");
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [ultimaMensagem]);

  // Função utilitária para formatar a hora sem usar dependências externas
  const formataHora = (data: Date | null) => {
    if (!data) return "--:--:--";
    return data.toLocaleTimeString('pt-BR');
  };

  return (
    <article className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Cabeçalho do Card */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="card-label" style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            DIAGNÓSTICO DE REDE
          </span>
          <h2 style={{ margin: '0.25rem 0 0 0', fontSize: '1.25rem', color: '#f3f4f6' }}>
            Conexão MQTT
          </h2>
        </div>

        {/* Badge Animada de Status */}
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '0.5rem', 
          backgroundColor: online ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
          padding: '0.25rem 0.75rem', borderRadius: '9999px', 
          border: `1px solid ${online ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}` 
        }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            backgroundColor: online ? '#10b981' : '#ef4444',
            boxShadow: online ? '0 0 8px #10b981' : '0 0 8px #ef4444',
          }} />
          <strong style={{ color: online ? '#10b981' : '#ef4444', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
            {online ? 'ONLINE' : 'OFFLINE'}
          </strong>
        </div>
      </div>

      {/* Grid de Informações Técnicas */}
      <div style={{ 
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', 
        backgroundColor: '#111827', padding: '1rem', borderRadius: '8px', border: '1px solid #374151' 
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', letterSpacing: '0.05em' }}>ÚLTIMO SINAL LIDO</span>
          <span style={{ fontSize: '1.1rem', color: '#e5e7eb', fontFamily: 'monospace' }}>
            {formataHora(ultimaMensagem)}
          </span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', letterSpacing: '0.05em' }}>QUALIDADE DO LINK</span>
          <span style={{ fontSize: '0.9rem', color: online ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
            {pingStatus}
          </span>
        </div>
      </div>

    </article>
  );
}