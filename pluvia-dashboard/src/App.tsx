import './App.css'
import { PivoController } from './components/PivoController'

function App() {
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

        {/* EXEMPLO PARA O FUTURO:
          <PainelMeteorologico />
          <ListaDeAlertas /> 
        */}

      </section>
    </main>
  )
}

export default App