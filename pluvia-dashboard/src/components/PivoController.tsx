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

  const formBloqueado = statusTexto === "RODANDO" || statusTexto === "PAUSADO";

  useEffect(() => {
    const tunelSSE = new EventSource("http://localhost:3000/api/telemetria");
    
    tunelSSE.onmessage = (event) => {
      const envelope = JSON.parse(event.data);
      
      // O Filtro rigoroso impede que pacotes vazios mudem os dados na tela
      if (envelope.tipo === 'telemetria' && envelope.dados) {
        const d = envelope.dados;
        
        if (d.angulo_atual !== undefined) {
          setPosicaoAtual(d.angulo_atual);
        }
        
        // Uso de função de atualização prévia (evita o loop do useEffect)
        setStatusTexto(prev => {
          if (d.status_operacional === 1) return "RODANDO";
          if (d.status_operacional === 0 && prev === "RODANDO") return "PAUSADO";
          if (prev !== "PAUSADO") return "DESLIGADO";
          return prev;
        });
        
        if (d.irrigacao_ativa !== undefined) setTelemetriaAgua(d.irrigacao_ativa === 1);
        if (d.lamina_aplicada !== undefined) setTelemetriaLamina(d.lamina_aplicada);
        if (d.velocidade_ms !== undefined) setTelemetriaVelocidade(d.velocidade_ms);
      }
    };

    return () => tunelSSE.close();
  }, []); // <-- Array VAZIO! O túnel nunca mais vai ser fechado e reaberto!

  const valorInicialCalc = posicaoInicial !== "" ? Number(posicaoInicial) : posicaoAtual;
  const valorAlvoCalc = Number(posicaoAlvo || 0);

  let sentidoCalculado = "horario";
  if (valorAlvoCalc < valorInicialCalc) sentidoCalculado = "antihorario";
  const sentidoFinal = modoSentido === "auto" ? sentidoCalculado : modoSentido;

  const despacharComando = async (acao: "start" | "stop" | "resume" | "cancel") => {
    if (acao === "start" && !posicaoAlvo) {
      alert("Por favor, informe a posição alvo.");
      return;
    }

    if (acao === "cancel" || acao === "stop") {
      setStatusTexto(acao === "stop" ? "PAUSADO" : "DESLIGADO");
    }

    const payloadBody: PayloadComando = {
      deviceId: "pivo-teste",
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
                statusTexto === "RODANDO"
                  ? "#059669"
                  : statusTexto === "PAUSADO"
                  ? "#d97706"
                  : "#4b5563",
            }}
          >
            {statusTexto}
          </span>
        </div>

        <div className="position-value">
          <strong>{posicaoAtual}</strong>
          <span>°</span>
        </div>

        <div className="position-info" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Ângulo do pivô</span>
            <span className="live">● AO VIVO</span>
          </div>
          <hr style={{ borderColor: "#374151", margin: "0.5rem 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span style={{ color: "#9ca3af" }}>Sistema Hídrico:</span>
            <strong style={{ color: telemetriaAgua ? "#3b82f6" : "#9ca3af" }}>
              {telemetriaAgua ? `💧 IRRIGANDO (${telemetriaLamina}mm)` : "☀️ SECO"}
            </strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span style={{ color: "#9ca3af" }}>Velocidade atual:</span>
            <strong>
              {telemetriaVelocidade > 0 && statusTexto === "RODANDO"
                ? `${(1000 / telemetriaVelocidade).toFixed(2)} °/seg`
                : "0 °/seg"}
            </strong>
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
                  <input type="number" value={inputLamina} style={{border: "1px solid #374151",}} onChange={(e) => setInputLamina(e.target.value)} placeholder="Ex: 10" min="1" />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: "0.25rem", display: "block" }}>Início</label>
              <div className="input-group">
                <input type="number" value={posicaoInicial} style={{border: "1px solid #374151",}} onChange={(e) => setPosicaoInicial(e.target.value)} placeholder="Ex: 25" />
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: "0.25rem", display: "block" }}>Alvo</label>
              <div className="input-group">
                <input id="target" type="number" style={{border: "1px solid #374151",}} value={posicaoAlvo} onChange={(e) => setPosicaoAlvo(e.target.value)} placeholder="Ex: 90" />
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
          {statusTexto === "RODANDO" ? (
            <button onClick={() => despacharComando("stop")} style={{ width: "100%", backgroundColor: "#ef4444", color: "white" }}>
              🛑 PARAR PIVÔ
            </button>
          ) : statusTexto === "PAUSADO" ? (
            <>
              <button onClick={() => despacharComando("resume")} style={{ flex: 1, backgroundColor: "#3b82f6", color: "white" }}>
                ▶️ RETOMAR
              </button>
              <button onClick={() => despacharComando("cancel")} style={{ flex: 1, backgroundColor: "#4b5563", color: "white" }}>
                ⏹️ CANCELAR
              </button>
            </>
          ) : (
            <button onClick={() => despacharComando("start")} style={{ width: "100%" }}>
              START PIVÔ
            </button>
          )}
        </div>
      </article>
    </>
  );
}