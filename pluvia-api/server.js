require('dotenv').config(); // Adicione no topo do arquivo
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

let clientesConectados = [];

mqttClient.on('message', (topic, message) => {
  if (topic === 'pluvia/telemetria/pivo-teste') {
    const dadosTelemetria = message.toString();
    clientesConectados.forEach(cliente => cliente.write(`data: ${dadosTelemetria}\n\n`));
  }
});

app.post('/api/comando', (req, res) => {
  const { deviceId, command, targetPosition, startPosition, direction, irrigar, lamina } = req.body;
  
  // Monta o payload dinamicamente ignorando o que for undefined
  const comandoMqtt = { action: command };
  if (targetPosition !== undefined) comandoMqtt.targetPosition = targetPosition;
  if (startPosition !== undefined) comandoMqtt.startPosition = startPosition;
  if (direction !== undefined) comandoMqtt.direction = direction;
  if (irrigar !== undefined) comandoMqtt.irrigar = irrigar;
  if (lamina !== undefined) comandoMqtt.lamina = lamina;

  const payloadObjeto = {
    messageId: Math.random().toString(16).slice(2, 8),
    deviceId: deviceId,
    type: 'command',
    timestamp: new Date().toISOString(),
    command: comandoMqtt
  };

  const payloadMqtt = JSON.stringify(payloadObjeto);
  mqttClient.publish(`pluvia/comando/${deviceId}`, payloadMqtt);
  
  res.status(200).json({ 
    sucesso: true, 
    mensagem: `Comando ${command.toUpperCase()} enviado ao pivô`,
    payload: payloadObjeto 
  });
});

app.get('/api/telemetria', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'http://localhost:5173'
  });
  
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