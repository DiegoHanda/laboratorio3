import { createPool, waitForDb, migrate, seed } from './db.js';
import { createApp } from './app.js';

const pool = createPool();
await waitForDb(pool);
await migrate(pool);
await seed(pool);

const port = Number(process.env.PORT || 3000);
const server = createApp(pool).listen(port, () => console.log(`API escuchando en :${port}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
}
