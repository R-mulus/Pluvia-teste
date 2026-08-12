const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');

const app = express();

// 1. Configuração de CORS permitindo especificamente a porta do react e mesmo assim não funcionou kkkkkkk
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const mqttClient = mqtt.connect(
  'mqtts://cacae761e2044bfcbeda02403a81dd9c.s1.eu.hivemq.cloud:8883',
  {
      username: 'pluvia-api',
      password: '12345678',
      clientId: 'pluvia_api_' + Math.random().toString(16).slice(2, 8)
  }
);

mqttClient.on('connect', () => {
    console.log('✅ Conectado ao HiveMQ!');
});

mqttClient.on('error', (err) => {
    console.error('❌ Erro MQTT:', err.message);
});

mqttClient.on('reconnect', () => {
    console.log('🔄 Tentando reconectar ao HiveMQ...');
});

mqttClient.on('close', () => {
    console.log('🔌 Conexão MQTT fechada');
});

let clientesConectados = [];

mqttClient.on('connect', () => {
  console.log('✅ API conectada ao broker MQTT!');
  mqttClient.subscribe('pluvia/telemetria/pivo-teste');
});

mqttClient.on('message', (topic, message) => {
  if (topic === 'pluvia/telemetria/pivo-teste') {
    const dadosTelemetria = message.toString();
    console.log(`📥 Telemetria recebida: ${dadosTelemetria}`);
    clientesConectados.forEach(cliente => cliente.write(`data: ${dadosTelemetria}\n\n`));
  }
});

app.post('/api/comando', (req, res) => {
  const { deviceId, command, targetPosition } = req.body;
  const payloadMqtt = JSON.stringify({
    messageId: Math.random().toString(16).slice(2, 8),
    deviceId: deviceId,
    type: 'command',
    timestamp: new Date().toISOString(),
    command: { action: command, targetPosition: targetPosition }
  });

  mqttClient.publish(`pluvia/comando/${deviceId}`, payloadMqtt);
  res.status(200).json({ sucesso: true, mensagem: 'Comando enviado ao pivô' });
});

// NOVA ROTA SSE COM CORS CORRIGIDO
app.get('/api/telemetria', (req, res) => {
  // O writeHead força os cabeçalhos a irem imediatamente para o navegador
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'http://localhost:5173'
  });
  
  // O TRUQUE: Manda um dado vazio imediatamente para o navegador saber que a conexão foi aceita
  res.write('data: {"status": "CONECTADO", "position": 0}\n\n');
  
  clientesConectados.push(res);

  req.on('close', () => {
    clientesConectados = clientesConectados.filter(c => c !== res);
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 API do Pluvia rodando na porta ${PORT}`);
});