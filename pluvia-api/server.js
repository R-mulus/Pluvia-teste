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

const FAZENDA_ID = '1';
const TOPICO_TELEMETRIA_SUB = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/+/telemetria`;
const TOPICO_DEBUG = `pluvia/sistema/debug`;

mqttClient.on('connect', () => {
    console.log('✅ API conectada ao Mosquitto!');
    mqttClient.subscribe(TOPICO_TELEMETRIA_SUB);
    mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ origem: "API_REST", acao: "🟢 Serviço Node.js Iniciado e Conectado" }));
});

let clientesConectados = [];

mqttClient.on('message', (topic, message) => {
  if (topic.includes('telemetria')) {
    const dadosTelemetria = message.toString();
    clientesConectados.forEach(cliente => cliente.write(`data: ${dadosTelemetria}\n\n`));
  }
});

app.post('/api/comando', (req, res) => {
  const { deviceId, command, targetPosition, startPosition, direction, irrigar, lamina } = req.body;
  
  const payloadObjeto = {
    meta: {
      msg_id: Math.random().toString(16).slice(2, 8) + '-' + Date.now(),
      timestamp_envio: Math.floor(Date.now() / 1000),
      ttl_segundos: 60
    },
    tipo: 'instantaneo',
    dados: {
      // 1 liga os motores (start/resume), 0 corta (stop/cancel)
      start: (command === 'start' || command === 'resume') ? 1 : 0
    }
  };

  // Se for START, envia todos os registradores Modbus. Se for RESUME, envia apenas o Start acima.
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
  const topicoPublicacao = `pluvia/v1/fazendas/${FAZENDA_ID}/pivos/${deviceId}/comando`;
  
  mqttClient.publish(topicoPublicacao, payloadMqtt);
  
  mqttClient.publish(TOPICO_DEBUG, JSON.stringify({ 
    origem: "API_REST", 
    aviso: `POST recebido: Ação [${command.toUpperCase()}]`,
    payload_despachado: payloadObjeto.dados
  }));
  
  res.status(200).json({ 
    sucesso: true, 
    mensagem: `Comando ${command.toUpperCase()} enviado`,
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
  
  res.write('data: {"tipo":"sistema","dados":{"mensagem":"Túnel SSE conectado com sucesso"}}\n\n');
  clientesConectados.push(res);
  
  req.on('close', () => {
    clientesConectados = clientesConectados.filter(c => c !== res);
  });
});

app.listen(3000, () => {
  console.log(`🚀 API do Pluvia rodando na porta 3000`);
});