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

// Estado "Físico" do nosso pivô simulado
let posicaoAtual = 0;
let statusPivo = 'DESLIGADO';
let motorInterval = null;

mqttClient.on('connect', () => {
  console.log('🤖 Falso ESP32 / CLP Simulado conectado!');
  
  mqttClient.subscribe(TOPICO_COMANDO, (err) => {
    if (!err) console.log(`🎧 Escutando ordens em: ${TOPICO_COMANDO}`);
  });
});

// Função para publicar a telemetria de volta para a nuvem
function enviarTelemetria() {
  const payload = JSON.stringify({
    deviceId: 'pivo-teste',
    status: statusPivo,
    position: posicaoAtual,
    timestamp: new Date().toISOString()
  });

  mqttClient.publish(TOPICO_TELEMETRIA, payload);
  console.log(`📡 Telemetria enviada -> Status: ${statusPivo} | Posição: ${posicaoAtual}°`);
}

mqttClient.on('message', (topic, message) => {
  const dados = JSON.parse(message.toString());
  
  if (dados.command && dados.command.action === 'start') {
    const alvo = dados.command.targetPosition;
    console.log(`\n⚡ COMANDO START RECEBIDO! Indo de ${posicaoAtual}° para ${alvo}°...`);
    
    statusPivo = 'RODANDO';
    
    // Evita rodar dois motores ao mesmo tempo se o usuário clicar duas vezes
    if (motorInterval) clearInterval(motorInterval);

    // Simula a lógica Ladder do CLP (Contador)
    motorInterval = setInterval(() => {
      if (posicaoAtual < alvo) {
        posicaoAtual++;
        enviarTelemetria();
      } else {
        console.log('✅ Posição alvo alcançada! Desligando motor.');
        statusPivo = 'DESLIGADO';
        enviarTelemetria();
        clearInterval(motorInterval);
      }
    }, 1000); // Incrementa a cada 1 segundo
  }
});