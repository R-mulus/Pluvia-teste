import { useEffect, useState, useRef } from 'react'
import mqtt from 'mqtt'
import './MqttLogger.css'

interface MqttLoggerProps {
  onExpand?: () => void
  isFull: boolean
}

interface LogMessage {
  time: string
  topic: string
  payload: string
}

export function MqttLogger({ onExpand, isFull }: MqttLoggerProps) {
  const [status, setStatus] = useState('DESCONECTADO')
  const [topicoAlvo, setTopicoAlvo] = useState('pluvia/#')
  const [topicosInscritos, setTopicosInscritos] = useState<string[]>([])
  const [logs, setLogs] = useState<LogMessage[]>([])
  
  // Ocultar apenas pings ociosos
  const [ocultarPings, setOcultarPings] = useState(true)
  
  const clientRef = useRef<mqtt.MqttClient | null>(null)
  const terminalWindowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalWindowRef.current) {
      terminalWindowRef.current.scrollTop = terminalWindowRef.current.scrollHeight
    }
  }, [logs])

  const pushSysLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-199), { 
      time: new Date().toLocaleTimeString(), 
      topic: '[DASHBOARD SYS]', 
      payload: msg 
    }])
  }

  const ocultarPingsRef = useRef(ocultarPings);
  useEffect(() => {
    ocultarPingsRef.current = ocultarPings;
  }, [ocultarPings]);

  useEffect(() => {
    const url = import.meta.env.VITE_MQTT_WS_URL;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    pushSysLog(`Tentando conectar no broker: ${url}`);

    const client = mqtt.connect(url, {
      username: import.meta.env.VITE_MQTT_USERNAME,
      password: import.meta.env.VITE_MQTT_PASSWORD,
      clientId: 'react_logger_' + Math.random().toString(16).slice(2, 8)
    })

    clientRef.current = client

    client.on('connect', () => {
      setStatus('CONECTADO')
      pushSysLog('✅ Conexão WebSocket estabelecida.')
      
      client.subscribe('pluvia/#', (err) => {
        if (!err) {
          setTopicosInscritos(prev => prev.includes('pluvia/#') ? prev : [...prev, 'pluvia/#'])
          pushSysLog('🎧 Auto-inscrito no coringa "pluvia/#".');
        }
      })
    })

    client.on('disconnect', () => {
      setStatus('DESCONECTADO')
      pushSysLog('❌ Desconectado do Broker MQTT.')
    })

    client.on('error', (err) => {
      setStatus('ERRO')
      pushSysLog(`⚠️ ERRO DE REDE: ${err.message}`)
    })

    client.on('message', (topic, message) => {
      let displayPayload = message.toString();
      let pacoteJson = null;

      try {
        pacoteJson = JSON.parse(displayPayload);
        displayPayload = JSON.stringify(pacoteJson, null, 2);
      } catch (e) {
        console.log("ERRO DO MQTT LOGGER: ", e);
        
      }

      // FILTRO INTELIGENTE: Verifica se é telemetria E se o motor está parado (status 0)
      if (ocultarPingsRef.current && topic.includes('telemetria') && pacoteJson && pacoteJson.dados) {
        if (pacoteJson.dados.status_operacional === 0) {
          return; // Aborta e não exibe na tela
        }
      }

      setLogs((prev) => [
        ...prev.slice(-199),
        { time: new Date().toLocaleTimeString(), topic, payload: displayPayload }
      ])
    })

    return () => { if (client) client.end() }
  }, [])

  const handleSubscribe = () => {
    const topicoFormatado = topicoAlvo.trim()
    if (!topicoFormatado) {
      pushSysLog(`⚠️ Digite um tópico antes de inscrever.`);
      return;
    }

    if (topicosInscritos.includes(topicoFormatado)) {
      pushSysLog(`⚠️ Você já está inscrito no tópico: ${topicoFormatado}`);
      return;
    }

    if (clientRef.current?.connected) {
      clientRef.current.subscribe(topicoFormatado, (err) => {
        if (!err) {
          setTopicosInscritos((prev) => [...prev, topicoFormatado])
          pushSysLog(`✅ Inscrição manual realizada: ${topicoFormatado}`);
        } else {
          pushSysLog(`❌ Erro ao inscrever: ${err.message}`);
        }
      })
    } else {
      pushSysLog(`❌ Erro: O MQTT não está conectado.`);
    }
  }

  const handleUnsubscribe = (topicoParaRemover: string) => {
    if (clientRef.current?.connected) {
      clientRef.current.unsubscribe(topicoParaRemover, (err) => {
        if (!err) {
          setTopicosInscritos((prev) => prev.filter((t) => t !== topicoParaRemover))
          pushSysLog(`🗑️ Inscrição removida: ${topicoParaRemover}`);
        }
      })
    }
  }

  return (
    <article className={`card logger-card ${isFull ? 'full-mode' : ''}`}>
      <div className="logger-content-split">
        
        <div className="logger-sidebar">
          <div className="card-header-logger">
            <span className="card-label">MONITORAMENTO MQTT</span>
            <h2>Terminal de Logs {isFull && "• DEDICADO"}</h2>
            
            <div className="header-status-area">
              <span 
                className="status-badge" 
                style={{ 
                  background: status === 'CONECTADO' ? '#dcfce7' : '#fee2e2', 
                  color: status === 'CONECTADO' ? '#166534' : '#991b1b' 
                }}
              >
                ● {status}
              </span>
              
              <button className="expand-btn" onClick={onExpand} title={isFull ? "Sair da Tela Cheia" : "Modo Tela Cheia"}>
                {isFull ? '✖' : '⛶'}
              </button>
            </div>
          </div>

          <div className="logger-controls">
            <div className="input-group-custom">
              <label htmlFor="topic-input">Inscrever em tópico:</label>
              <input 
                id="topic-input"
                type="text" 
                value={topicoAlvo}
                onChange={(e) => setTopicoAlvo(e.target.value)}
                placeholder="Ex: pluvia/sistema/debug"
              />
              <div className="button-row">
                <button onClick={handleSubscribe} className="btn-primary">INSCREVER</button>
                <button onClick={() => setLogs([])} className="btn-secondary">LIMPAR TELA</button>
              </div>
            </div>

            {/* CHECKBOX ATUALIZADO */}
            <div style={{ marginTop: '1rem', padding: '0.5rem', backgroundColor: '#1f2937', borderRadius: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#d1d5db' }}>
                <input 
                  type="checkbox" 
                  checked={ocultarPings} 
                  onChange={(e) => setOcultarPings(e.target.checked)} 
                  style={{ cursor: 'pointer' }}
                />
                Ocultar pings de Heartbeat (Pivô Parado)
              </label>
            </div>

            <div className="topics-section">
              <span className="section-subtitle">Tópicos Inscritos ({topicosInscritos.length}):</span>
              {topicosInscritos.length === 0 ? (
                <p className="no-topics">Nenhum tópico inscrito no momento.</p>
              ) : (
                <div className="topics-list">
                  {topicosInscritos.map((topico, idx) => (
                    <span key={idx} className="topic-tag">
                      <span className="topic-name">{topico}</span>
                      <button 
                        className="topic-remove-btn" 
                        onClick={() => handleUnsubscribe(topico)}
                        title="Cancelar inscrição"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="terminal-wrapper">
          <div className="terminal-header">
            <span>SAÍDA DO CONSOLE MQTT</span>
            <span className="log-count">{logs.length} mensagens</span>
          </div>

          <div className="terminal-window" ref={terminalWindowRef}>
            {logs.length === 0 ? (
              <div className="terminal-empty">
                Aguardando mensagens... 
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="log-entry" style={{ paddingBottom: '0.5rem', borderBottom: '1px solid #333', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', color: '#888', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                    <span className="log-time">[{log.time}]</span>
                    <strong className="log-topic" style={{ color: log.topic.includes('DASHBOARD') ? '#fbbf24' : '#60a5fa' }}>{log.topic}</strong>
                  </div>
                  <pre className="log-payload" style={{ margin: 0, color: '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {log.payload}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </article>
  )
}