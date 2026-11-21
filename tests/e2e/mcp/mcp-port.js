/**
 * A free loopback port for one MCP spec file's app.
 *
 * The app listens on the fixed default port unless `OPENPEN_MCP_PORT` is set.
 * A fixed port makes the MCP specs depend on the machine: a running OpenPen
 * with MCP on, or another MCP spec file running in a parallel worker, already
 * holds it, and the client then reaches the wrong app or nothing at all. Each
 * spec file instead asks the OS for a free port and passes it to the app it
 * launches, so its client always talks to its own app.
 */
import net from 'node:net';

/** @returns {Promise<number>} */
export function reserveMcpPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {net.AddressInfo} */ (server.address());
      server.close(() => resolve(port));
    });
  });
}

/** Launch overrides that point the app's MCP server at `port`. */
export function mcpPortEnv(port) {
  return { env: { OPENPEN_MCP_PORT: String(port) } };
}

/**
 * Whether something already accepts connections on `port` at 127.0.0.1.
 * Specs that must use the default port check this before launching their app
 * and skip the tests that need the server when it is taken, since the app
 * could not listen there.
 */
export function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}
