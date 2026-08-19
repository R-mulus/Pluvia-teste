import { useState } from "react";
import "./App.css";
import { PivoController } from "./components/PivoController";
import { MQTTCard, type PayloadMQTT } from "./components/MQTTCard";
import { MqttLogger } from "./components/MqttLogger";
import { HeartbeatCard } from "./components/HeartbeatCard";

function App() {
	const [isLoggerFullScreen, setIsLoggerFullScreen] = useState(false);
	const [ultimoPayload, setUltimoPayload] = useState<PayloadMQTT | null>(null);

	return (
		<main className="dashboard">
			<section className="dashboard-header">
				<div>
					<span className="eyebrow">PLUVIA • TEST DASHBOARD</span>
					<h1>Controle do Pivô</h1>
					<p>Monitoramento e controle em tempo real</p>
				</div>

				<div className="connection">
					<span className="connection-dot"></span>
					API conectada
				</div>
			</section>

			<section className="dashboard-grid">
				<PivoController onCommandSent={setUltimoPayload} />
				<MQTTCard lastPayload={ultimoPayload} />
				<HeartbeatCard />

				{/* O Logger agora fica fixo aqui. Ele gerencia o próprio tamanho via CSS */}
				<MqttLogger
					onExpand={() => setIsLoggerFullScreen(!isLoggerFullScreen)}
					isFull={isLoggerFullScreen}
				/>
			</section>
		</main>
	);
}

export default App;
