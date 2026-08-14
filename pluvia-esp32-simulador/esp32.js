const mqtt = require('mqtt');

const mqttClient = mqtt.connect(
  'mqtts://cacae761e2044bfcbeda02403a81dd9c.s1.eu.hivemq.cloud:8883',
    {
        username: 'esp32-pivo-teste',
        password: '12345678',
        clientId: 'esp32_mock_' + Math.random().toString(16).slice(2, 8)
    }
);

const TOPICO_COMANDO = 'pluvia/comando/pivo-teste';
const TOPICO_TELEMETRIA = 'pluvia/telemetria/pivo-teste';

// Estados Globais
let posicaoAtual = 0;
let statusPivo = 'DESLIGADO'; // Pode ser: DESLIGADO, RODANDO, PAUSADO
let motorInterval = null;

let irrigandoAtual = false;
let laminaAtual = 0;
let velocidadeAtualMs = 1000; 

// Variáveis de Missão (Memória do CLP para conseguir retomar)
let alvoAtual = 0;
let sentidoAtual = 'horario';

mqttClient.on('connect', () => {
  console.log('🤖 Falso ESP32 conectado (Máquina de Estados)!');
  mqttClient.subscribe(TOPICO_COMANDO);
});

function enviarTelemetria() {
  const payload = JSON.stringify({
    deviceId: 'pivo-teste',
    status: statusPivo,
    position: posicaoAtual,
    irrigando: irrigandoAtual,
    lamina: laminaAtual,
    velocidadeMs: velocidadeAtualMs,
    timestamp: new Date().toISOString()
  });

  mqttClient.publish(TOPICO_TELEMETRIA, payload);
  console.log(`📡 Status: ${statusPivo} | Posição: ${posicaoAtual}° | Água: ${irrigandoAtual ? 'SIM' : 'NÃO'}`);
}

// O motor foi isolado em uma função para podermos chamar no "start" e no "resume"
function iniciarMotor() {
  if (motorInterval) clearInterval(motorInterval);
  
  motorInterval = setInterval(() => {
    // 1. Move fisicamente 1 grau
    if (sentidoAtual === 'horario') {
      posicaoAtual++;
      if (posicaoAtual >= 360) posicaoAtual = 0;
    } else {
      posicaoAtual--;
      if (posicaoAtual < 0) posicaoAtual = 359;
    }
    
    // 2. Envia a nova posição
    enviarTelemetria();

    // 3. Verifica se chegou no alvo
    if (posicaoAtual === alvoAtual) {
      console.log('✅ Posição alvo alcançada! Desligando motor e bomba.');
      statusPivo = 'DESLIGADO';
      irrigandoAtual = false;
      enviarTelemetria();
      clearInterval(motorInterval);
    }
  }, velocidadeAtualMs); 
}

mqttClient.on('message', (topic, message) => {
  const dados = JSON.parse(message.toString());
  
  if (dados.command) {
    const acao = dados.command.action;

    // ----- ESTADO: START -----
    if (acao === 'start') {
      alvoAtual = Number(dados.command.targetPosition);
      sentidoAtual = dados.command.direction;
      const inicio = dados.command.startPosition;
      
      if (inicio !== undefined && inicio !== null && inicio !== '') {
          posicaoAtual = Number(inicio);
      }

      irrigandoAtual = !!dados.command.irrigar;
      laminaAtual = irrigandoAtual ? Number(dados.command.lamina) : 0;
      velocidadeAtualMs = irrigandoAtual ? Math.max(laminaAtual * 200, 200) : 400;

      statusPivo = 'RODANDO';
      console.log(`\n⚡ INICIANDO MISSÃO: De ${posicaoAtual}° para ${alvoAtual}° (Sentido: ${sentidoAtual})`);
      enviarTelemetria();

      if (posicaoAtual === alvoAtual) {
          statusPivo = 'DESLIGADO';
          irrigandoAtual = false;
          enviarTelemetria();
          return;
      }
      iniciarMotor();
    }
    
    // ----- ESTADO: STOP (Pausa) -----
    else if (acao === 'stop') {
      console.log('\n🛑 PARADA SOLICITADA. Cortando motores.');
      if (motorInterval) clearInterval(motorInterval);
      statusPivo = 'PAUSADO';
      enviarTelemetria();
    }

    // ----- ESTADO: RESUME (Retomar) -----
    else if (acao === 'resume') {
      if (statusPivo === 'PAUSADO') {
        console.log('\n▶️ RETOMANDO OPERAÇÃO. Religando motores.');
        statusPivo = 'RODANDO';
        enviarTelemetria();
        iniciarMotor();
      }
    }

    // ----- ESTADO: CANCEL (Abortar) -----
    else if (acao === 'cancel') {
      console.log('\n⏹️ MISSÃO ABORTADA PELO OPERADOR.');
      if (motorInterval) clearInterval(motorInterval);
      statusPivo = 'DESLIGADO';
      irrigandoAtual = false;
      enviarTelemetria();
    }
  }
});