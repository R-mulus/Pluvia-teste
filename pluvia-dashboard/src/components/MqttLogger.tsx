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
  
  const clientRef = useRef<mqtt.MqttClient | null>(null)
  const terminalWindowRef = useRef<HTMLDivElement>(null)

  // Scroll apenas interno dentro da caixa de logs sem mexer na tela inteira
  useEffect(() => {
    if (terminalWindowRef.current) {
      terminalWindowRef.current.scrollTop = terminalWindowRef.current.scrollHeight
    }
  }, [logs])

    useEffect(() => {
    const url = import.meta.env.VITE_MQTT_WS_URL;
    const client = mqtt.connect(url, {
      username: import.meta.env.VITE_MQTT_USERNAME,
      password: import.meta.env.VITE_MQTT_PASSWORD,
      clientId: 'react_logger_' + Math.random().toString(16).slice(2, 8)
    })

    clientRef.current = client
    client.on('connect', () => setStatus('CONECTADO'))
    client.on('disconnect', () => setStatus('DESCONECTADO'))
    client.on('error', () => setStatus('ERRO'))

    client.on('message', (topic, message) => {
      setLogs((prev) => [
        ...prev.slice(-199),
        { 
          time: new Date().toLocaleTimeString(), 
          topic, 
          payload: message.toString() 
        }
      ])
    })

    return () => { if (client) client.end() }
  }, [])

  const handleSubscribe = () => {
    const topicoFormatado = topicoAlvo.trim()
    if (!topicoFormatado) return

    if (clientRef.current?.connected) {
      clientRef.current.subscribe(topicoFormatado, (err) => {
        if (!err) {
          if (!topicosInscritos.includes(topicoFormatado)) {
            setTopicosInscritos((prev) => [...prev, topicoFormatado])
          }
        }
      })
    }
  }

  const handleUnsubscribe = (topicoParaRemover: string) => {
    if (clientRef.current?.connected) {
      clientRef.current.unsubscribe(topicoParaRemover, (err) => {
        if (!err) {
          setTopicosInscritos((prev) => prev.filter((t) => t !== topicoParaRemover))
        }
      })
    }
  }

  return (
    <article className={`card logger-card ${isFull ? 'full-mode' : ''}`}>
      <div className="logger-content-split">
        
        {/* COLUNA DA ESQUERDA: CONTROLES E TÓPICOS */}
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
              
              {!isFull && (
                <button className="expand-btn" onClick={onExpand} title="Modo Tela Cheia">
                  ⛶
                </button>
              )}
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
                placeholder="Ex: pluvia/telemetria/#"
              />
              <div className="button-row">
                <button onClick={handleSubscribe} className="btn-primary">INSCREVER</button>
                <button onClick={() => setLogs([])} className="btn-secondary">LIMPAR TELA</button>
              </div>
            </div>

            {/* LISTA DE TÓPICOS INSCRITOS */}
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

        {/* COLUNA DA DIREITA: TERMINAL COM SCROLL ISOLADO */}
        <div className="terminal-wrapper">
          <div className="terminal-header">
            <span>SAÍDA DO CONSOLE MQTT</span>
            <span className="log-count">{logs.length} mensagens</span>
          </div>

          <div className="terminal-window" ref={terminalWindowRef}>
            {logs.length === 0 ? (
              <div className="terminal-empty">
                Aguardando mensagens... Clique em INSCREVER para começar a escutar.
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="log-entry">
                  <span className="log-time">[{log.time}]</span>
                  <span className="log-topic">{log.topic}</span>
                  <span className="log-payload">{log.payload}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </article>
  )
}