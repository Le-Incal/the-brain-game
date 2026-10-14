/** Railway start command: serve the built game and the voice routes. */
import path from 'node:path';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
// Both guides' welcomes are recorded as the server starts, so no visitor waits for one.
const app = createApp({ env: process.env, distDir: path.resolve('dist'), warmWelcomes: true });
app.listen(port, '0.0.0.0', () => {
  console.log(`[brain-game] listening on :${port}`);
});
