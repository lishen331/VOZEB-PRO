import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const env = { ...process.env, VOZEB_PRO_E2E_DATABASE_URL: "" };
const used = new Set();
for (const name of ["VOZEB_PRO_E2E_PORT", "VOZEB_PRO_PROTOCOL_FIXTURE_PORT", "VOZEB_PRO_PAYMENT_FIXTURE_PORT", "VOZEB_PRO_RUNNINGHUB_FIXTURE_PORT"]) {
    let port;
    do {
        port = await new Promise((resolve, reject) => {
            const server = net.createServer();
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => {
                const address = server.address();
                if (!address || typeof address === "string") return server.close(() => reject(new Error("Fixture port allocation failed")));
                server.close((error) => (error ? reject(error) : resolve(address.port)));
            });
        });
    } while (used.has(port));
    used.add(port);
    env[name] = String(port);
}
const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url)), "test", "--config", "playwright.media.config.ts", ...process.argv.slice(2)], { cwd, env, stdio: "inherit", windowsHide: true });
child.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
});
child.once("exit", (code) => {
    process.exitCode = code ?? 1;
});
