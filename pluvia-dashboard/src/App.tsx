import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [status, setStatus] = useState('DESLIGADO')
  const [posicaoAtual, setPosicaoAtual] = useState(0)
  const [posicaoAlvo, setPosicaoAlvo] = useState('')

  useEffect(() => {
    const tunelSSE = new EventSource(
      'http://localhost:3000/api/telemetria'
    )

    tunelSSE.onmessage = (event) => {
      const dados = JSON.parse(event.data)

      setPosicaoAtual(dados.position)
      setStatus(dados.status)
    }

    return () => tunelSSE.close()
  }, [])

  const handleStart = async () => {
    if (!posicaoAlvo) {
      alert('Por favor, informe a posição alvo.')
      return
    }

    setStatus('ENVIANDO COMANDO...')

    try {
      await fetch('http://localhost:3000/api/comando', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: 'pivo-teste',
          command: 'start',
          targetPosition: Number(posicaoAlvo),
        }),
      })
    } catch (error) {
      console.error('Erro:', error)
    }
  }

  return (
    <main className="dashboard">
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

      <section className="dashboard-grid">

        {/* CARD DE POSIÇÃO */}
        <article className="card position-card">

          <div className="card-header">
            <div>
              <span className="card-label">TELEMETRIA</span>
              <h2>Posição atual</h2>
            </div>

            <span className="status-badge">
              {status}
            </span>
          </div>

          <div className="position-value">
            <strong>{posicaoAtual}</strong>
            <span>°</span>
          </div>

          <div className="position-info">
            <span>Posição angular do pivô</span>
            <span className="live">
              ● AO VIVO
            </span>
          </div>

        </article>

        {/* CARD DE CONTROLE */}
        <article className="card control-card">

          <div className="card-header">
            <div>
              <span className="card-label">CONTROLE</span>
              <h2>Nova posição</h2>
            </div>
          </div>

          <label htmlFor="target">
            Posição alvo
          </label>

          <div className="input-group">
            <input
              id="target"
              type="number"
              value={posicaoAlvo}
              onChange={(e) => setPosicaoAlvo(e.target.value)}
              placeholder="90"
            />

            <span>°</span>
          </div>

          <button onClick={handleStart}>
            START PIVÔ
          </button>

        </article>

      </section>
    </main>
  )
}

export default App