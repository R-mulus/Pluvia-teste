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
const TOPICO_TELEMETRIA_SUB = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/+/telemetria`;

mqttClient.on('connect', () => {
    console.log('✅ API conectada ao Mosquitto na VPS!');
    mqttClient.subscribe(TOPICO_TELEMETRIA_SUB);
});

let clientesConectados = [];

mqttClient.on('message', (topic, message) => {
  if (topic.includes('telemetria')) {
    clientesConectados.forEach(cliente => cliente.write(`data: ${message.toString()}\n\n`));
  }
});

app.post('/api/comando', (req, res) => {
  // Agora desestruturamos o deviceId recebido do PivoController
  const { deviceId, command, targetPosition, startPosition, direction, irrigar, lamina } = req.body;
  
  const payloadObjeto = {
    meta: {
      msg_id: Math.random().toString(16).slice(2, 8) + '-' + Math.floor(Date.now() / 1000),
      timestamp_envio: Math.floor(Date.now() / 1000),
      ttl_segundos: 60
    },
    tipo: 'instantaneo',
    dados: {
      start: (command === 'start' || command === 'resume') ? 1 : 0
    }
  };

  if (command === 'start') {
    payloadObjeto.dados.direcao = direction === 'antihorario' ? 1 : 0;
    payloadObjeto.dados.irrigacao = irrigar ? 1 : 0;
    payloadObjeto.dados.lamina = Number(lamina) || 0;
    
    if (startPosition !== undefined && startPosition !== "") {
        payloadObjeto.dados.angulo_inicial = Number(startPosition);
    }
    
    payloadObjeto.dados.angulo_final = Number(targetPosition) || 0;
  }

  const payloadMqtt = JSON.stringify(payloadObjeto);
  
  // Tópico de publicação montado corretamente usando a rota dinâmica
  const topicoPublicacao = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/${deviceId || PIVO_ID}/comando`;
  mqttClient.publish(topicoPublicacao, payloadMqtt);
  
  res.status(200).json({ sucesso: true, payload: payloadObjeto });
});

app.get('/api/telemetria', (req, res) => {
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