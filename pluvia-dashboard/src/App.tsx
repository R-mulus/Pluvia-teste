import { useState } from 'react'
import './App.css'
import { PivoController } from './components/PivoController'
import { MQTTCard, type PayloadMQTT } from './components/MQTTCard'
import { MqttLogger } from './components/MqttLogger'

function App() {
  const [isLoggerFullScreen, setIsLoggerFullScreen] = useState(false)
  const [ultimoPayload, setUltimoPayload] = useState<PayloadMQTT | null>(null)

  // Modo tela cheia para o Logger
  if (isLoggerFullScreen) {
    return (
      <main className="full-screen-view">
        <button 
          className="btn-back" 
          onClick={() => setIsLoggerFullScreen(false)}
        >
          ← VOLTAR AO DASHBOARD
        </button>
        <MqttLogger isFull={true} />
      </main>
    )
  }

  return (
    <main className="dashboard">
      {/* HEADER DO DASHBOARD */}
      <section className="dashboard-header">
        <div>
          <span className="eyebrow">PLUVIA • TEST DASHBOARD</span>
          <h1>Controle do Pivô</h1>
          <p>Monitoramento e controle em tempo real</p>
        </div>

        <div className="connection">
          <span className="connection-dot"></span>
          API conectada
        </div>
      </section>

      {/* GRID ONDE OS COMPONENTES VÃO ENTRAR */}
      <section className="dashboard-grid">
        <PivoController onCommandSent={setUltimoPayload} />
        
        {/* Card do Payload JSON que você pediu */}
        <MQTTCard lastPayload={ultimoPayload} />

        {/* Logger do seu colega com suporte a tela cheia */}
        <MqttLogger 
          onExpand={() => setIsLoggerFullScreen(true)} 
          isFull={false} 
        />
      </section>
    </main>
  )
}

export default App