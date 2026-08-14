import './App.css'
import { useState } from 'react'
import { MqttLogger } from './components/MqttLogger'
import { PivoController } from './components/PivoController'


function App() {
  const [isLoggerFullScreen, setIsLoggerFullScreen] = useState(false)

  // Se o modo tela cheia estiver ativo, renderizamos apenas o Logger
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
        
        <PivoController />

        {/* Passamos uma função para o Logger abrir a si mesmo em tela cheia */}
        <MqttLogger 
          onExpand={() => setIsLoggerFullScreen(true)} 
          isFull={false} 
        />

        {/* EXEMPLO PARA O FUTURO:
          <PainelMeteorologico />
          <ListaDeAlertas /> 
        */}

      </section>
    </main>
  )
}

export default App