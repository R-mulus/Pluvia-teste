require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');

const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: 'pluvia_api_' + Math.random().toString(16).slice(2, 8)
});

const FAZENDA_ID = 'fazenda-01';
const PIVO_ID = 'pivo-01';
const BASE_TOPIC = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/+`;

mqttClient.on('connect', () => {
    console.log('✅ API conectada ao Broker MQTT!');
    // Inscrição nos novos tópicos de normalização
    mqttClient.subscribe(`${BASE_TOPIC}/telemetria`);
    mqttClient.subscribe(`${BASE_TOPIC}/sistema/alarme`);
    mqttClient.subscribe(`${BASE_TOPIC}/sistema/status`);
    mqttClient.subscribe(`${BASE_TOPIC}/comando/resposta`);
});

let clientesConectados = [];

mqttClient.on('message', (topic, message) => {
  // Repassa qualquer mensagem recebida no broker para o frontend via SSE
  try {
    const dataStr = message.toString();
    const payloadJson = JSON.parse(dataStr);
    
    // Empacota o tópico junto com o payload para o frontend saber o que renderizar
    const sseEvent = JSON.stringify({ topic, payload: payloadJson });
    clientesConectados.forEach(cliente => cliente.write(`data: ${sseEvent}\n\n`));
  } catch (e) {
    console.error("Erro ao fazer parse da mensagem MQTT:", e);
  }
});

app.post('/api/comando', (req, res) => {
  const { deviceId, command } = req.body;
  // const { deviceId, command, targetPosition, startPosition, direction, irrigar, lamina } = req.body;

  if (command !== 'start') {
    return res.status(501).json({
      erro: 'nao_implementado',
      mensagem: `Comando "${command}" ainda não implementado no firmware do ESP32. Apenas "start" está disponível.`
    });
  }
  
  // Normalização estrita do Envelope de Comando Instantâneo
  const payloadObjeto = {
    meta: {
      msg_id: Math.random().toString(16).slice(2, 8) + '-' + Math.floor(Date.now() / 1000),
      timestamp: Math.floor(Date.now() / 1000), // Exigido pelo Watchdog/TTL do ESP32
      ttl_segundos: 60
    },
    tipo: 'instantaneo',
    dados: {
      start: (command === 'start' || command === 'resume') ? 1 : 0,
      direcao: direction === 'antihorario' ? 1 : 0,
      irrigacao: irrigar ? 1 : 0,
      lamina: Number(lamina) || 0,
      angulo_inicial: startPosition !== undefined && startPosition !== "" ? Number(startPosition) : 0,
      angulo_final: targetPosition !== undefined && targetPosition !== "" ? Number(targetPosition) : 0
    }
  };

  const payloadMqtt = JSON.stringify(payloadObjeto);
  const topicoPublicacao = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/${deviceId || PIVO_ID}/comando`;
  
  mqttClient.publish(topicoPublicacao, payloadMqtt);
  
  res.status(200).json({ sucesso: true, payload: payloadObjeto });
});

// Rota renomeada para indicar que envia um stream de vários eventos, não só telemetria
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'http://localhost:5173'
  });
  clientesConectados.push(res);
  req.on('close', () => clientesConectados = clientesConectados.filter(c => c !== res));
});

app.listen(3000, () => console.log(`🚀 API rodando na porta 3000`));