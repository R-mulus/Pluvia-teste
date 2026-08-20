/**
 * @file Pluvia_ESP32_Control.ino
 * @brief Firmware Industrial do Projeto Pluvia para ESP32
 * @details Integração Modbus RTU (Delta AS228), MQTT (Padrão Envelope), LittleFS e Watchdog.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ModbusMaster.h>
#include <ArduinoJson.h> // Requer ArduinoJson v7+
#include <LittleFS.h>
#include <esp_task_wdt.h>
#include <time.h>

// ==============================================================================
// 1. CONFIGURAÇÕES GERAIS E CREDENCIAIS
// ==============================================================================
#define WIFI_SSID       "PLUVIA"
#define WIFI_PASSWORD   "12345678"

#define MQTT_SERVER     "137.131.236.30" // IP da sua VPS OCI
#define MQTT_PORT       1883
#define MQTT_USER       "Teste"
#define MQTT_PASS       "Venividivici"

#define FAZENDA_ID      "fazenda-01"
#define PIVO_ID         "pivo-01"

// ==============================================================================
// 2. HARDWARE RS485 E MODBUS (Validado)
// ==============================================================================
#define MAX485_RX       16
#define MAX485_TX       17
#define MAX485_RE_DE    4

#define MODBUS_BAUD     9600
#define PLC_SLAVE_ID    1

#define WDT_TIMEOUT     15 // Watchdog de 15 segundos

// Configuração da Porta COM1 do ESP32 (Serial1) solicitada
#define MODBUS_SERIAL   Serial1

// MAPA DE ENDEREÇOS MODBUS NATIVOS - SÉRIE AS (DELTA)
// Na série AS, a conversão é direta (1 para 1). O offset é 0!
const uint16_t ADDR_M_START         = 0x0064; // M100
const uint16_t ADDR_M_AGUA          = 0x0065; // M101
const uint16_t ADDR_M_DIR           = 0x0066; // M102
const uint16_t ADDR_M_HEARTBEAT     = 0x00C7; // M199

const uint16_t ADDR_D_ANG_ATUAL     = 0x0064; // D100 (32 bits)
const uint16_t ADDR_D_ANG_INICIAL   = 0x00C8; // D200 (32 bits)
const uint16_t ADDR_D_ANG_FINAL     = 0x00CA; // D202 (32 bits)
const uint16_t ADDR_D_LAMINA        = 0x00CC; // D204

const uint16_t ADDR_D_PRESSAO       = 0x012C; // D300
const uint16_t ADDR_D_TENSAO_REDE   = 0x012E; // D302
const uint16_t ADDR_D_TENSAO_MOTOR  = 0x0130; // D304
const uint16_t ADDR_D_CORRENTE      = 0x0132; // D306

// Objetos Globais
WiFiClient espClient;
PubSubClient mqttClient(espClient);
ModbusMaster node;

// ==============================================================================
// 3. TÓPICOS MQTT (Padrão Pluvia v1)
// ==============================================================================
String topicTelemetria;
String topicAlarme;
String topicStatus;
String topicComando;
String topicComandoResp;
String topicCronograma;
String topicCronogramaResp;

void buildTopics() {
  String base = String("pluvia/v1/fazendas/") + FAZENDA_ID + "/pivos/" + PIVO_ID + "/";
  topicTelemetria     = base + "telemetria";
  topicAlarme         = base + "sistema/alarme";
  topicStatus         = base + "sistema/status";
  topicComando        = base + "comando";
  topicComandoResp    = base + "comando/resposta";
  topicCronograma     = base + "cronograma";
  topicCronogramaResp = base + "cronograma/resposta";
}

// Controle de tempo para telemetria
unsigned long lastTelemetryTime = 0;

// ==============================================================================
// 4. FUNÇÕES DE SUPORTE E CALLBACKS (RS485)
// ==============================================================================
void preTransmission()  { digitalWrite(MAX485_RE_DE, 1); }
void postTransmission() { digitalWrite(MAX485_RE_DE, 0); }

// ==============================================================================
// 5. PUBLICADOR DE FEEDBACKS (PADRÃO ENVELOPE)
// ==============================================================================
void publishFeedback(String topicDestino, String msgIdRef, String status, String mensagem) {
  JsonDocument resp;
  
  // Bloco META
  JsonObject meta = resp["meta"].to<JsonObject>();
  meta["msg_id_referencia"] = msgIdRef;
  meta["timestamp"] = time(nullptr);
  
  // Bloco TIPO
  resp["tipo"] = "feedback";
  
  // Bloco DADOS
  JsonObject dados = resp["dados"].to<JsonObject>();
  dados["status"] = status;
  dados["mensagem"] = mensagem;

  char buffer[256];
  serializeJson(resp, buffer);
  mqttClient.publish(topicDestino.c_str(), buffer);
  
  Serial.println("[MQTT] Feedback publicado em: " + topicDestino);
}

// ==============================================================================
// 6. PROCESSAMENTO DE COMANDOS E MODBUS
// ==============================================================================
bool executeModbusCommand(uint8_t start, uint8_t direcao, uint8_t irrigacao, uint16_t lamina, uint32_t angulo_inicial, uint32_t angulo_final) {
  uint8_t result;
  
  // 1. Grava Parâmetros Numéricos de Configuração Primeiro
  // Lâmina (16 bits)
  result = node.writeSingleRegister(ADDR_D_LAMINA, lamina);
  if (result != node.ku8MBSuccess) return false;

  // Ângulo Inicial (32 bits exige dividir em 2 registradores, ex: D200 e D201)
  node.clearTransmitBuffer();
  node.setTransmitBuffer(0, angulo_inicial & 0xFFFF);         // Low Word
  node.setTransmitBuffer(1, (angulo_inicial >> 16) & 0xFFFF); // High Word
  result = node.writeMultipleRegisters(ADDR_D_ANG_INICIAL, 2);
  if (result != node.ku8MBSuccess) return false;

  // Ângulo Final (32 bits exige dividir em 2 registradores, ex: D202 e D203)
  node.clearTransmitBuffer();
  node.setTransmitBuffer(0, angulo_final & 0xFFFF);         // Low Word
  node.setTransmitBuffer(1, (angulo_final >> 16) & 0xFFFF); // High Word
  result = node.writeMultipleRegisters(ADDR_D_ANG_FINAL, 2);
  if (result != node.ku8MBSuccess) return false;

  // 2. Grava Ações Direcionais e Válvula de Água
  result = node.writeSingleCoil(ADDR_M_DIR, direcao);
  if (result != node.ku8MBSuccess) return false;
  
  result = node.writeSingleCoil(ADDR_M_AGUA, irrigacao);
  if (result != node.ku8MBSuccess) return false;
  
  // 3. Dar o START por último (Para garantir que o CLP já possui os limites acima lidos na memória)
  result = node.writeSingleCoil(ADDR_M_START, start);
  if (result != node.ku8MBSuccess) return false;

  return true;
}

void processInstantaneo(JsonObject dados, String msgId) {
  // Validação de Segurança do JSON (Se faltar qualquer chave, bloqueia)
  if (!dados.containsKey("start") || !dados.containsKey("direcao") || 
      !dados.containsKey("irrigacao") || !dados.containsKey("lamina") || 
      !dados.containsKey("angulo_inicial") || !dados.containsKey("angulo_final")) {
      
      publishFeedback(topicComandoResp, msgId, "erro", "Payload invalido: Parametros ausentes no bloco dados.");
      return;
  }

  // Execução via Modbus com função modular
  bool sucesso = executeModbusCommand(
    dados["start"], dados["direcao"], dados["irrigacao"], 
    dados["lamina"], dados["angulo_inicial"], dados["angulo_final"]
  );

  if (sucesso) {
    publishFeedback(topicComandoResp, msgId, "sucesso", "Parametros gravados no CLP com sucesso.");
  } else {
    publishFeedback(topicComandoResp, msgId, "erro", "Falha de comunicacao RS485 com o CLP.");
  }
}

// ==============================================================================
// 7. SISTEMA DE ARQUIVOS (LITTLEFS) E CRONOGRAMAS
// ==============================================================================
bool salvarCronograma(int id, JsonObject dados) {
  String filepath = "/cronograma_" + String(id) + ".json";
  
  // Abre o arquivo para escrita ("w" substitui se já existir)
  File file = LittleFS.open(filepath, "w");
  if (!file) {
    Serial.println("[LittleFS] Falha ao abrir arquivo para escrita: " + filepath);
    return false;
  }
  
  // Converte o JSON para String antes de salvar (Garante integridade no disco)
  String jsonStr;
  serializeJson(dados, jsonStr);
  file.print(jsonStr);
  file.close();
  
  Serial.println("[LittleFS] Cronograma salvo com sucesso: " + jsonStr);
  return true;
}

bool removerCronograma(int id) {
  String filepath = "/cronograma_" + String(id) + ".json";
  
  if (LittleFS.exists(filepath)) {
    bool sucesso = LittleFS.remove(filepath);
    if (sucesso) Serial.println("[LittleFS] Cronograma removido: " + filepath);
    return sucesso;
  }
  
  Serial.println("[LittleFS] Cronograma nao encontrado para remocao: " + filepath);
  return false;
}

void processAgendado(JsonObject dados, String msgId) {
  // Validação de Integridade do Payload de Cronograma
  if (!dados.containsKey("acao") || !dados.containsKey("cronograma_id")) {
    publishFeedback(topicCronogramaResp, msgId, "erro", "Payload invalido: Faltam parametros 'acao' ou 'cronograma_id'.");
    return;
  }

  String acao = dados["acao"].as<String>();
  int id = dados["cronograma_id"].as<int>();
  
  // Roteamento da Ação
  if (acao == "adicionar") {
    // Nova validação focada no Unix Timestamp e bloco de comando
    if (!dados.containsKey("timestamp_inicio") || !dados.containsKey("comando")) {
      publishFeedback(topicCronogramaResp, msgId, "erro", "Payload invalido: Faltam 'timestamp_inicio' ou 'comando'.");
      return;
    }

    if (salvarCronograma(id, dados)) {
      publishFeedback(topicCronogramaResp, msgId, "sucesso", "Cronograma " + String(id) + " salvo na flash do ESP32.");
    } else {
      publishFeedback(topicCronogramaResp, msgId, "erro", "Falha de hardware ao gravar cronograma no LittleFS.");
    }
  } 
  else if (acao == "remover") {
    if (removerCronograma(id)) {
      publishFeedback(topicCronogramaResp, msgId, "sucesso", "Cronograma " + String(id) + " removido da memoria do ESP32.");
    } else {
      publishFeedback(topicCronogramaResp, msgId, "erro", "Cronograma " + String(id) + " nao encontrado ou falha na remocao.");
    }
  } 
  else {
    publishFeedback(topicCronogramaResp, msgId, "erro", "Acao desconhecida no cronograma: " + acao);
  }
}

void checkSchedules() {
  static unsigned long lastCheckTime = 0;
  // Varre os cronogramas a cada 10 segundos para não onerar o processador
  if (millis() - lastCheckTime < 10000) return; 
  lastCheckTime = millis();

  long tempo_atual = time(nullptr);
  if (tempo_atual < 1000000000) return; // Aguarda o relógio (NTP) atualizar pela primeira vez

  File root = LittleFS.open("/");
  if (!root || !root.isDirectory()) return;

  File file = root.openNextFile();
  while (file) {
    String fileName = String(file.name());
    
    // Tratamento nativo para o nome do arquivo independente da versão da biblioteca LittleFS
    if (fileName.startsWith("/")) fileName = fileName.substring(1); 

    if (fileName.startsWith("cronograma_") && fileName.endsWith(".json")) {
      
      // LER PARA STRING PRIMEIRO EVITA ERROS CRÍTICOS DE STREAM DO LITTLEFS QUE GERAVAM ZEROS
      String fileContent = file.readString();
      file.close(); // Fecha imediatamente para evitar travamentos de leitura na Flash

      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, fileContent);

      if (!err && doc.containsKey("timestamp_inicio")) {
        long ts_inicio = doc["timestamp_inicio"].as<long>();

        // É HORA DE INICIAR A IRRIGAÇÃO AGENDADA?
        if (tempo_atual >= ts_inicio) {
          Serial.println("\n[Scheduler] Disparando cronograma vencido: " + fileName);
          Serial.println("[Scheduler] Lendo do Disco: " + fileContent);

          JsonObject cmd = doc["comando"];
          int id = doc["cronograma_id"].as<int>();

          if (cmd.isNull()) {
             Serial.println("[Scheduler] ERRO: Bloco 'comando' corrompido ou inexistente no JSON.");
             LittleFS.remove("/" + fileName);
             return;
          }

          // CORREÇÃO CRÍTICA: Extração convertida via int para blindar contra falsos 0s
          uint8_t start     = (uint8_t)cmd["start"].as<int>();
          uint8_t direcao   = (uint8_t)cmd["direcao"].as<int>();
          uint8_t irrigacao = (uint8_t)cmd["irrigacao"].as<int>();
          uint16_t lamina   = (uint16_t)cmd["lamina"].as<int>();
          uint32_t ang_init = (uint32_t)cmd["angulo_inicial"].as<long>();
          uint32_t ang_fin  = (uint32_t)cmd["angulo_final"].as<long>();

          // Log de depuração para você visualizar o que o ESP está mandando para o CLP
          Serial.printf("[Modbus] Executando Agendado -> Start:%d, Dir:%d, Agua:%d, Lamina:%d\n", start, direcao, irrigacao, lamina);

          bool sucesso = executeModbusCommand(start, direcao, irrigacao, lamina, ang_init, ang_fin);

          if (sucesso) {
            publishFeedback(topicCronogramaResp, "auto-exec-" + String(id), "sucesso", "Cronograma " + String(id) + " executado no horario agendado.");
            LittleFS.remove("/" + fileName); // Remove o cronograma apenas após executar com sucesso!
            
            // CORREÇÃO DE ARQUITETURA: Retorna imediatamente para não quebrar a varredura do LittleFS
            return; 
          } else {
            publishFeedback(topicCronogramaResp, "auto-exec-" + String(id), "erro", "Falha RS485 ao executar cronograma " + String(id));
          }
        }
      }
    } else {
      file.close(); // Fecha se não for arquivo de cronograma
    }
    
    file = root.openNextFile();
  }
}

// ==============================================================================
// 8. ROTEADOR MQTT E VALIDADOR DE ENVELOPE
// ==============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String incomingTopic = String(topic);
  Serial.println("\n[MQTT] Mensagem recebida no topico: " + incomingTopic);

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);

  if (err) {
    Serial.println("[MQTT] Erro: JSON invalido.");
    return;
  }

  // 1. Validação Obrigatória do Padrão Envelope
  if (!doc.containsKey("meta") || !doc.containsKey("tipo") || !doc.containsKey("dados")) {
    Serial.println("[MQTT] Erro: Payload nao obedece ao Padrao Envelope.");
    return;
  }

  JsonObject meta = doc["meta"];
  String tipo = doc["tipo"].as<String>();
  JsonObject dados = doc["dados"];
  
  String msgId = meta.containsKey("msg_id") ? meta["msg_id"].as<String>() : "sem_id";
  String respTopic = (tipo == "instantaneo") ? topicComandoResp : topicCronogramaResp;

  // 2. Validação de TTL (Time-To-Live) contra comandos fantasmas no Broker
  long tempo_atual = time(nullptr);
  if (tempo_atual > 1000000000 && meta.containsKey("timestamp") && meta.containsKey("ttl_segundos")) {
    
    // CORREÇÃO: Usamos long long (64 bits) para evitar estouro de memória se o JSON vier em milissegundos
    long long msg_timestamp = meta["timestamp"].as<long long>();
    int ttl = meta["ttl_segundos"].as<int>();
    
    // AUTO-CORREÇÃO: Se o número for maior que o limite de segundos (ano 2038+), 
    // significa que o Worker/Nuvem enviou em milissegundos (13 dígitos). O ESP corrige sozinho.
    if (msg_timestamp > 2147483647LL) {
      msg_timestamp = msg_timestamp / 1000;
    }
    
    long diferenca = tempo_atual - (long)msg_timestamp;

    if (diferenca > ttl) {
      // Agora o ESP imprime o cálculo exato no Monitor Serial para você auditar
      Serial.printf("[MQTT] Erro TTL: Relogio ESP=%ld, Msg Timestamp=%ld, Atraso=%ld seg, Limite=%d\n", 
                     tempo_atual, (long)msg_timestamp, diferenca, ttl);
                     
      publishFeedback(respTopic, msgId, "erro", "Comando expirado e descartado por seguranca (TTL excedido).");
      return;
    }
  }

  // 3. Roteamento baseado no campo "tipo"
  if (incomingTopic == topicComando && tipo == "instantaneo") {
    processInstantaneo(dados, msgId);
  } 
  else if (incomingTopic == topicCronograma && tipo == "agendado") {
    processAgendado(dados, msgId);
  }
  else {
    Serial.println("[MQTT] Erro: Incompatibilidade entre topico e tipo do Envelope.");
  }
}

// ==============================================================================
// 9. TELEMETRIA E GERENCIAMENTO DE REDE
// ==============================================================================
void publishTelemetry() {
  // Lógica de leitura do CLP
  uint8_t result = node.readHoldingRegisters(ADDR_D_ANG_ATUAL, 2); // Lê D100 e D101 (32 bits)
  
  if (result == node.ku8MBSuccess) {
    uint16_t lowWord = node.getResponseBuffer(0);
    uint16_t highWord = node.getResponseBuffer(1);
    uint32_t anguloAtual = (highWord << 16) | lowWord;

    // Montar o Envelope da Telemetria
    JsonDocument doc;
    doc["meta"]["timestamp"] = time(nullptr);
    doc["tipo"] = "telemetria";
    doc["dados"]["angulo_atual"] = anguloAtual;
    
    char buffer[256];
    serializeJson(doc, buffer);
    mqttClient.publish(topicTelemetria.c_str(), buffer);
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Conectando ao MQTT...");
    
    // Configura o Last Will and Testament (LWT) no Padrão Envelope
    String lwtPayload = "{\"meta\":{\"timestamp\":" + String(time(nullptr)) + "},\"tipo\":\"status\",\"dados\":{\"estado\":\"offline\"}}";
    
    if (mqttClient.connect(PIVO_ID, MQTT_USER, MQTT_PASS, topicStatus.c_str(), 1, true, lwtPayload.c_str())) {
      Serial.println(" Conectado!");
      
      // Publica o status online ao conectar
      String onlinePayload = "{\"meta\":{\"timestamp\":" + String(time(nullptr)) + "},\"tipo\":\"status\",\"dados\":{\"estado\":\"online\"}}";
      mqttClient.publish(topicStatus.c_str(), onlinePayload.c_str(), true);
      
      // Inscreve nos tópicos operacionais
      mqttClient.subscribe(topicComando.c_str(), 1); // QoS 1 garante a entrega
      mqttClient.subscribe(topicCronograma.c_str(), 1);
    } else {
      Serial.print(" Falha: ");
      Serial.print(mqttClient.state());
      delay(5000);
    }
  }
}

// ==============================================================================
// 10. SETUP E LOOP PRINCIPAL
// ==============================================================================
void setup() {
  Serial.begin(115200);
  
  // Inicialização do LittleFS (true = Formata automaticamente se falhar ao montar)
  if (!LittleFS.begin(true)) {
    Serial.println("[LittleFS] Erro Critico: Falha ao montar o sistema de arquivos!");
  } else {
    Serial.println("[LittleFS] Sistema de arquivos montado com sucesso.");
  }
  
  // Configuração Segura e Robusta do WDT
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  esp_task_wdt_config_t twdt_config = {
      .timeout_ms = WDT_TIMEOUT * 1000,
      .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
      .trigger_panic = true,
  };
  esp_err_t err = esp_task_wdt_init(&twdt_config);
  if (err == ESP_ERR_INVALID_STATE) esp_task_wdt_reconfigure(&twdt_config);
  esp_task_wdt_add(NULL);
#else
  esp_task_wdt_init(WDT_TIMEOUT, true);
  esp_task_wdt_add(NULL);
#endif

  buildTopics();

  // Modbus configurado explicitamente para a Porta COM1 do ESP32 (Serial1)
  MODBUS_SERIAL.begin(MODBUS_BAUD, SERIAL_8E1, MAX485_RX, MAX485_TX);
  pinMode(MAX485_RE_DE, OUTPUT);
  digitalWrite(MAX485_RE_DE, 0);

  node.begin(PLC_SLAVE_ID, MODBUS_SERIAL);
  node.preTransmission(preTransmission);
  node.postTransmission(postTransmission);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
  
  // CORREÇÃO: Offset zero para garantir Unix Timestamp puro (UTC).
  // A conversão do fuso do Brasil (-3h) deve ser feita APENAS no Worker/Nuvem na hora de criar o timestamp_inicio.
  configTime(0, 0, "pool.ntp.org"); 

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024); // Buffer largo suficiente para suportar o JSON Envelope
}

void loop() {
  esp_task_wdt_reset(); // Alimenta o cão de guarda para evitar reboots não planejados
  
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Executa o agendador autônomo (O coração do pivô offline)
  checkSchedules();

  // Rotina contínua de telemetria (ex: a cada 2 segundos)
  if (millis() - lastTelemetryTime > 2000) {
    lastTelemetryTime = millis();
    publishTelemetry();
  }
}