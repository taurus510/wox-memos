import http from "node:http";
import type { AddressInfo } from "node:net";

export interface CapturedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: unknown;
}

export interface MockServer {
  url: string;
  requests: CapturedRequest[];
  close(): Promise<void>;
}

/** Start a real loopback HTTP server so client tests exercise the actual wire format. */
export async function startMockServer(
  respond: (req: CapturedRequest, res: http.ServerResponse) => void,
): Promise<MockServer> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = raw;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          /* leave as string */
        }
      }
      const captured: CapturedRequest = {
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: req.headers,
        body,
      };
      requests.push(captured);
      respond(captured, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}`,
    requests,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    },
  };
}

export function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
