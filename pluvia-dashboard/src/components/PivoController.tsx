import { useEffect, useState } from "react";
import "./PivoController.css";
import { type PayloadMQTT } from "./MQTTCard";

interface PivoControllerProps {
  onCommandSent?: (payload: PayloadMQTT) => void;
}

type PayloadComando = {
  deviceId: string;
  command: "start" | "stop" | "resume" | "cancel";
  startPosition?: number;
  targetPosition?: number;
  direction?: string;
  irrigar?: boolean;
  lamina?: number;
};

export function PivoController({ onCommandSent }: PivoControllerProps) {
  const [statusTexto, setStatusTexto] = useState("DESLIGADO");
  const [posicaoAtual, setPosicaoAtual] = useState(0);
  const [telemetriaAgua, setTelemetriaAgua] = useState(false);
  const [telemetriaLamina, setTelemetriaLamina] = useState(0);
  const [telemetriaVelocidade, setTelemetriaVelocidade] = useState(0);

  const [posicaoInicial, setPosicaoInicial] = useState("");
  const [posicaoAlvo, setPosicaoAlvo] = useState("");
  const [modoSentido, setModoSentido] = useState("auto");
  const [vaiIrrigar, setVaiIrrigar] = useState(false);
  const [inputLamina, setInputLamina] = useState("10");

  const formBloqueado = statusTexto === "RODANDO" || statusTexto === "PAUSADO" || statusTexto === "AJUSTANDO POSIÇÃO";

  useEffect(() => {
    const tunelSSE = new EventSource("http://localhost:3000/api/telemetria");
    
    tunelSSE.onmessage = (event) => {
      const envelope = JSON.parse(event.data);
      
      if (envelope.tipo === 'telemetria' && envelope.dados) {
        const d = envelope.dados;
        
        if (d.angulo_atual !== undefined) {
          setPosicaoAtual(d.angulo_atual);
        }
        
        setStatusTexto(prev => {
          if (d.status_operacional === 1) return "RODANDO";
          if (d.status_operacional === 2) return "AJUSTANDO POSIÇÃO";
          if (d.status_operacional === 0) {
            if (prev === "PAUSADO") return "PAUSADO";
            return "DESLIGADO";
          }
          return prev;
        });
        
        if (d.irrigacao_ativa !== undefined) setTelemetriaAgua(d.irrigacao_ativa === 1);
        if (d.lamina_aplicada !== undefined) setTelemetriaLamina(d.lamina_aplicada);
        if (d.velocidade_ms !== undefined) setTelemetriaVelocidade(d.velocidade_ms);
      }
    };
    return () => tunelSSE.close();
  }, []);

  const valorInicialCalc = posicaoInicial !== "" ? Number(posicaoInicial) : posicaoAtual;
  const valorAlvoCalc = Number(posicaoAlvo || 0);

  let sentidoCalculado = "horario";
  if (valorAlvoCalc < valorInicialCalc) sentidoCalculado = "antihorario";
  const sentidoFinal = modoSentido === "auto" ? sentidoCalculado : modoSentido;

  const despacharComando = async (acao: "start" | "stop" | "resume" | "cancel") => {
    
    if (acao === "start") {
      if (!posicaoAlvo) {
        alert("Por favor, informe a posição alvo.");
        return;
      }
      
      // VALIDAÇÃO REQUISITADA: Impede envio se o ponto de partida e chegada forem idênticos
      if (valorAlvoCalc === valorInicialCalc) {
        alert("Ação Bloqueada: O ângulo alvo não pode ser igual ao ângulo de partida (atual ou inicial).");
        return;
      }
    }

    if (acao === "cancel" || acao === "stop") {
      setStatusTexto(acao === "stop" ? "PAUSADO" : "DESLIGADO");
    }

    const payloadBody: PayloadComando = {
      deviceId: "pivo-01",
      command: acao,
    };

    if (acao === "start") {
      payloadBody.startPosition = valorInicialCalc;
      payloadBody.targetPosition = valorAlvoCalc;
      payloadBody.direction = sentidoFinal;
      payloadBody.irrigar = vaiIrrigar;
      payloadBody.lamina = vaiIrrigar ? Number(inputLamina) : 0;
    }

    try {
      const response = await fetch("http://localhost:3000/api/comando", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });

      const data = await response.json();
      if (data.payload && onCommandSent) onCommandSent(data.payload);
    } catch (error) {
      console.error("Erro:", error);
    }
  };

  return (
    <>
      <article className="card position-card">
        <div className="card-header">
          <div>
            <span className="card-label">TELEMETRIA</span>
            <h2>Posição atual</h2>
          </div>
          <span
            className="status-badge"
            style={{color: 'white',
              backgroundColor:
                statusTexto === "RODANDO" ? "#059669" : 
                statusTexto === "AJUSTANDO POSIÇÃO" ? "#8b5cf6" : 
                statusTexto === "PAUSADO" ? "#d97706" : 
                "#4b5563",
            }}
          >
            {statusTexto}
          </span>
        </div>

        <div className="position-value">
          <strong>{posicaoAtual}</strong>
          <span>°</span>
        </div>

        {/* NOVO DESIGN DO PAINEL DE INFORMAÇÕES */}
        <div style={{ 
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', 
          marginTop: '1.5rem', padding: '1rem', 
          backgroundColor: '#111827', borderRadius: '8px', border: '1px solid #374151' 
        }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sistema Hídrico</span>
            <div style={{ fontWeight: 'bold', color: telemetriaAgua ? '#3b82f6' : '#9ca3af', marginTop: '0.25rem', fontSize: '0.9rem' }}>
              {telemetriaAgua ? `Ativo (${telemetriaLamina} mm)` : "Inativo (A Seco)"}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Velocidade</span>
            <div style={{ fontWeight: 'bold', color: '#e5e7eb', marginTop: '0.25rem', fontSize: '0.9rem' }}>
              {telemetriaVelocidade > 0 && (statusTexto === "RODANDO" || statusTexto === "AJUSTANDO POSIÇÃO")
                ? `${(1000 / telemetriaVelocidade).toFixed(2)} °/s`
                : "0.00 °/s"}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pressão na Linha</span>
            <div style={{ fontWeight: 'bold', color: '#e5e7eb', marginTop: '0.25rem', fontSize: '0.9rem' }}>
              {telemetriaAgua ? "4.5 Bar" : "0.0 Bar"}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tensão da Rede</span>
            <div style={{ fontWeight: 'bold', color: '#e5e7eb', marginTop: '0.25rem', fontSize: '0.9rem' }}>
              380 V
            </div>
          </div>
        </div>
      </article>

      <article className="card control-card" style={{ opacity: formBloqueado ? 0.7 : 1, transition: "opacity 0.3s" }}>
        <div className="card-header">
          <div>
            <span className="card-label">
              CONTROLE {formBloqueado && "(BLOQUEADO EM OPERAÇÃO)"}
            </span>
            <h2>Locomoção</h2>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem", pointerEvents: formBloqueado ? "none" : "auto" }}>
          <div style={{ padding: "1rem", borderRadius: "8px", border: "1px solid #374151" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: "bold" }}>
              <input type="checkbox" checked={vaiIrrigar} onChange={(e) => setVaiIrrigar(e.target.checked)} style={{ width: "18px", height: "18px" }} />
              Ativar Bomba D'água
            </label>

            {vaiIrrigar && (
              <div style={{ marginTop: "1rem" }}>
                <label style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: "0.25rem", display: "block" }}>Lâmina D'água (mm)</label>
                <div className="input-group">
                  <input type="number" value={inputLamina} style={{border: "1px solid #374151"}} onChange={(e) => setInputLamina(e.target.value)} placeholder="Ex: 10" min="1" />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: "0.25rem", display: "block" }}>Início</label>
              <div className="input-group">
                <input type="number" value={posicaoInicial} style={{border: "1px solid #374151"}} onChange={(e) => setPosicaoInicial(e.target.value)} placeholder="Ex: 25" />
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: "0.25rem", display: "block" }}>Alvo</label>
              <div className="input-group">
                <input id="target" type="number" style={{border: "1px solid #374151"}} value={posicaoAlvo} onChange={(e) => setPosicaoAlvo(e.target.value)} placeholder="Ex: 90" />
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: "0.25rem", display: "block" }}>Sentido de Rotação</label>
            <select value={modoSentido} onChange={(e) => setModoSentido(e.target.value)} style={{ width: "100%", padding: "0.75rem", backgroundColor: "white", color: "black", border: "1px solid #374151", borderRadius: "6px" }}>
              <option value="auto">Automático ({sentidoCalculado.toUpperCase()})</option>
              <option value="horario">Forçar HORÁRIO</option>
              <option value="antihorario">Forçar ANTI-HORÁRIO</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
          {statusTexto === "RODANDO" || statusTexto === "AJUSTANDO POSIÇÃO" ? (
            <button onClick={() => despacharComando("stop")} style={{ width: "100%", backgroundColor: "#ef4444", color: "white", fontWeight: "bold" }}>
              PARAR PIVÔ
            </button>
          ) : statusTexto === "PAUSADO" ? (
            <>
              <button onClick={() => despacharComando("resume")} style={{ flex: 1, backgroundColor: "#3b82f6", color: "white", fontWeight: "bold" }}>
                RETOMAR
              </button>
              <button onClick={() => despacharComando("cancel")} style={{ flex: 1, backgroundColor: "#4b5563", color: "white", fontWeight: "bold" }}>
                CANCELAR
              </button>
            </>
          ) : (
            <button onClick={() => despacharComando("start")} style={{ width: "100%", fontWeight: "bold" }}>
              START PIVÔ
            </button>
          )}
        </div>
      </article>
    </>
  );
}