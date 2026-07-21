import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const SEP = "|||WONDER|||";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function reminders() {
  const script = `tell application "Reminders"
set output to ""
repeat with r in (reminders whose completed is false)
set output to output & id of r & "${SEP}" & name of r & "${SEP}" & name of container of r & linefeed
end repeat
return output
end tell`;
  const { stdout } = await exec("osascript", ["-e", script], { timeout: 15000 });
  return stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [id, title, list] = line.split(SEP);
    return { id, title, list, source: "reminders" };
  });
}

export function localTasksApi() {
  return {
    name: "local-tasks-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!url.pathname.startsWith("/api/local-tasks")) return next();
        try {
          if (url.pathname === "/api/local-tasks" && req.method === "GET") {
            return json(res, 200, { ok: true, tasks: await reminders() });
          }
          if (url.pathname === "/api/local-tasks" && req.method === "POST") {
            const input = await body(req);
            const title = String(input.title || "").trim();
            if (!title) return json(res, 400, { error: "Task title required" });
            const script = `on run argv
tell application "Reminders" to make new reminder at default list with properties {name:item 1 of argv}
end run`;
            await exec("osascript", ["-e", script, title], { timeout: 15000 });
            return json(res, 201, { ok: true, title });
          }
          return json(res, 404, { error: "Not found" });
        } catch (error) {
          return json(res, 503, { error: "Allow Wonder to access Reminders in macOS Privacy settings.", detail: error.message });
        }
      });
    },
  };
}
