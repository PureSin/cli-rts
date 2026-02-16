import http from "node:http";

export async function emitCommand(eventType: string, port: number): Promise<void> {
  // Read JSON from stdin
  let input = "";
  try {
    input = await readStdin();
  } catch {
    // No stdin available — send empty payload
  }

  let payload: Record<string, unknown> = {};
  if (input.trim()) {
    try {
      payload = JSON.parse(input);
    } catch {
      // Invalid JSON — send raw as message
      payload = { raw: input };
    }
  }

  const body = JSON.stringify({ eventType, payload });

  try {
    await postToServer(port, body);
  } catch {
    // Daemon not running — silently fail
  }

  // Always exit 0
  process.exit(0);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }

    let data = "";
    const timeout = setTimeout(() => resolve(data), 3000);

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => { clearTimeout(timeout); resolve(data); });
    process.stdin.on("error", () => { clearTimeout(timeout); reject(); });
  });
}

function postToServer(port: number, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/events",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 3000,
      },
      (res) => {
        res.resume();
        res.on("end", resolve);
      }
    );

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}
