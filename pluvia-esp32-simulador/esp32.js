require('dotenv').config();
const mqtt = require('mqtt');

const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: 'esp32_mock_' + Math.random().toString(16).slice(2, 8)
});

const FAZENDA_ID = 'fazenda-01';
const PIVO_ID = 'pivo-01';
const TOPICO_COMANDO = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/${PIVO_ID}/comando`;
const TOPICO_TELEMETRIA = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/${PIVO_ID}/telemetria`;
const TOPICO_RESPOSTA = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/${PIVO_ID}/comando/resposta`;
const TOPICO_DEBUG = `pluvia/sistema/debug`;

let posicaoAtual = 0;
let statusOperacional = 0; 
let motorInterval = null;

let irrigandoAtual = 0;
let laminaAtual = 0;
let alvoAtual = 0;
let sentidoAtual = 0;
let velocidadeAtualMs = 1000;

let missaoPendente = { alvo: 0, sentido: 0, irrigacao: 0, lamina: 0 };

mqttClient.on('connect', () => {
  console.log('🤖 Gêmeo Digital do CLP Delta conectado!');
  mqttClient.subscribe(TOPICO_COMANDO);
  mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ acao: "Hardware Simulado Online" }));
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
      lamina_aplicada: laminaAtual,
      irrigacao_ativa: irrigandoAtual,
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
    
    // Atualiza o dashboard
    enviarTelemetria();

    // 1. Gera log visível no terminal do VSCode a cada grau!
    console.log(`[MOTOR] Posição Atual: ${posicaoAtual}° -> Buscando Alvo: ${alvoAtual}°`);

    if (posicaoAtual === alvoAtual) {
      if (statusOperacional === 2) {
        console.log('🔄 Ajuste concluído. Engatando missão principal.');
        mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ acao: "Ajuste concluído. Engatando missão." }));
        
        statusOperacional = 1;
        alvoAtual = missaoPendente.alvo;
        sentidoAtual = missaoPendente.sentido;
        irrigandoAtual = missaoPendente.irrigacao;
        laminaAtual = irrigandoAtual ? missaoPendente.lamina : 0;
        velocidadeAtualMs = irrigandoAtual ? Math.max(laminaAtual * 200, 200) : 400;
        iniciarMotor(); 
      } else {
        console.log('✅ Alvo final alcançado. Desligando.');
        mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ acao: "Alvo alcançado. Desligando motores." }));
        
        statusOperacional = 0;
        irrigandoAtual = 0;
        clearInterval(motorInterval);
        enviarTelemetria();
      }
    }
  }, velocidadeAtualMs); 
}

mqttClient.on('message', (topic, message) => {
  const envelope = JSON.parse(message.toString());
  
  if (envelope.tipo === 'instantaneo' && envelope.dados) {
    const { start, direcao, irrigacao, lamina, angulo_inicial, angulo_final } = envelope.dados;

    if (start === 1) { 
      if (angulo_inicial !== undefined && angulo_inicial !== posicaoAtual && statusOperacional === 0) {
        console.log(`\n⚙️ Modo de Ajuste: Movendo de ${posicaoAtual}° para ${angulo_inicial}° a seco.`);
        mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ acao: `Iniciando ajuste de ${posicaoAtual}° para ${angulo_inicial}°` }));
        
        statusOperacional = 2; 
        missaoPendente.alvo = angulo_final;
        missaoPendente.sentido = direcao;
        missaoPendente.irrigacao = irrigacao;
        missaoPendente.lamina = lamina;

        alvoAtual = angulo_inicial;
        sentidoAtual = angulo_inicial > posicaoAtual ? 0 : 1; 
        irrigandoAtual = 0; 
        velocidadeAtualMs = 200; 
      } 
      else {
        console.log(`\n⚡ Missão Principal (M100=1). Alvo: ${angulo_final}°`);
        mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ acao: "Iniciando missão principal", alvo: angulo_final }));
        
        statusOperacional = 1;
        if (angulo_final !== undefined) alvoAtual = angulo_final;
        if (direcao !== undefined) sentidoAtual = direcao;
        if (irrigacao !== undefined) {
            irrigandoAtual = irrigacao;
            laminaAtual = irrigandoAtual ? lamina : 0;
        }
        velocidadeAtualMs = irrigandoAtual ? Math.max(laminaAtual * 200, 200) : 400;
      }

      enviarTelemetria();
      
      const resp = JSON.stringify({
        meta: { msg_id_referencia: envelope.meta.msg_id, timestamp_resposta: Math.floor(Date.now() / 1000) },
        tipo: 'feedback',
        dados: { status: 'sucesso', detalhe: 'Comando processado com exito.' }
      });
      mqttClient.publish(TOPICO_RESPOSTA, resp);

      if (posicaoAtual !== alvoAtual) {
          iniciarMotor();
      } else if (statusOperacional === 2) {
          iniciarMotor(); 
      }
    } 
    else if (start === 0) { 
      console.log('\n🛑 PARADA SOLICITADA. Cortando motores.');
      mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ acao: "Motores cortados." }));
      
      if (motorInterval) clearInterval(motorInterval);
      statusOperacional = 0;
      enviarTelemetria();
    }
  }
});

setInterval(() => {
  if (statusOperacional === 0) {
    enviarTelemetria();
  }
}, 2000);