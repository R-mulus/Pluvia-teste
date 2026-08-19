require('dotenv').config();
const mqtt = require('mqtt');

const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: 'esp32_mock_' + Math.random().toString(16).slice(2, 8)
});

const FAZENDA_ID = '1';
const PIVO_ID = 'pivo-teste';
const TOPICO_COMANDO = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/${PIVO_ID}/comando`;
const TOPICO_TELEMETRIA = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/${PIVO_ID}/telemetria`;
const TOPICO_DEBUG = `pluvia/sistema/debug`; 

let posicaoAtual = 0;
let statusOperacional = 0; 
let motorInterval = null;

let irrigandoAtual = 0;
let laminaAtual = 0;
let velocidadeAtualMs = 1000; 
let alvoAtual = 0;
let sentidoAtual = 0;

mqttClient.on('connect', () => {
  console.log('🤖 Falso ESP32 conectado!');
  mqttClient.subscribe(TOPICO_COMANDO);
  mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ origem: "ESP32_CLP", acao: "🟡 Hardware Simulado Inicializado" }));
});

function enviarTelemetria() {
  const payload = JSON.stringify({
    meta: { timestamp: Math.floor(Date.now() / 1000), pivo_id: PIVO_ID },
    tipo: 'telemetria',
    dados: {
      angulo_atual: posicaoAtual,
      pressao: irrigandoAtual ? 4.5 : 0.0,
      tensao_rede: 380,
      tensao_motor: statusOperacional ? 380 : 0,
      corrente: statusOperacional ? 12.3 : 0.0,
      status_operacional: statusOperacional,
      irrigacao_ativa: irrigandoAtual,
      lamina_aplicada: laminaAtual,
      velocidade_ms: velocidadeAtualMs
    }
  });

  mqttClient.publish(TOPICO_TELEMETRIA, payload);
}

function iniciarMotor() {
  if (motorInterval) clearInterval(motorInterval);
  
  motorInterval = setInterval(() => {
    if (sentidoAtual === 0) {
      posicaoAtual++;
      if (posicaoAtual >= 360) posicaoAtual = 0;
    } else {
      posicaoAtual--;
      if (posicaoAtual < 0) posicaoAtual = 359;
    }
    
    enviarTelemetria();

    if (posicaoAtual === alvoAtual) {
      statusOperacional = 0;
      irrigandoAtual = 0;
      enviarTelemetria();
      clearInterval(motorInterval);
      mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ origem: "ESP32_CLP", acao: "✅ ALVO ALCANÇADO. Motores e bomba desligados." }));
    }
  }, velocidadeAtualMs); 
}

mqttClient.on('message', (topic, message) => {
  const envelope = JSON.parse(message.toString());
  
  if (envelope.tipo === 'instantaneo' && envelope.dados !== undefined) {
    const { start, direcao, irrigacao, lamina, angulo_inicial, angulo_final } = envelope.dados;

    if (start === 1) { 
      // Comportamento Modbus Retentivo: Só sobrescreve se o valor vier no JSON.
      if (angulo_final !== undefined) alvoAtual = angulo_final;
      if (direcao !== undefined) sentidoAtual = direcao;
      
      // Só teleporta o pivô se ele estiver parado E o usuário enviou um início
      if (angulo_inicial !== undefined && statusOperacional === 0) {
          posicaoAtual = angulo_inicial;
      }

      if (irrigacao !== undefined) {
          irrigandoAtual = irrigacao;
          laminaAtual = irrigandoAtual ? lamina : 0;
          velocidadeAtualMs = irrigandoAtual ? Math.max(laminaAtual * 200, 200) : 400;
      }

      statusOperacional = 1;
      mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ 
        origem: "ESP32_CLP", 
        acao: "⚡ M100=1 (START). Iniciando deslocamento.", 
        direcao_atual: sentidoAtual === 0 ? 'Horário' : 'Anti-horário',
        alvo: alvoAtual
      }));
      
      enviarTelemetria();

      if (posicaoAtual === alvoAtual) {
          statusOperacional = 0;
          irrigandoAtual = 0;
          enviarTelemetria();
          return;
      }
      iniciarMotor();
    } 
    else if (start === 0) { 
      if (motorInterval) clearInterval(motorInterval);
      statusOperacional = 0;
      enviarTelemetria();
      mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ origem: "ESP32_CLP", acao: "🛑 M100=0 (STOP). Cortando contatores." }));
    }
  }
});