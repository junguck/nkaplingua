/** Banque simulée en HTTP pour jouer en local sans clé : node src/tools/fake-bank.ts [port] [latence_ms] */
import { FakeBank, startFakeBankServer } from '../bank/fake.ts';

const port = Number(process.argv[2] ?? 8788);
const latency = Number(process.argv[3] ?? 0);
await startFakeBankServer(new FakeBank(), port, latency);
console.log(JSON.stringify({ msg: 'Banque simulée prête', url: `http://127.0.0.1:${port}/api/v1`, latency_ms: latency }));
