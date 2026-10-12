// Stand-in for the DeepL API in e2e tests: answers "[TARGET] original text"
// so tests can check what was translated into which language, offline and free.
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 3199);

createServer((req, res) => {
  if (
    req.method !== "POST" ||
    !req.headers.authorization?.startsWith("DeepL-Auth-Key ")
  ) {
    res.writeHead(403).end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const { text, target_lang, source_lang } = JSON.parse(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        translations: text.map((t) => {
          // Like DeepL: detect the source (Hangul → KO, otherwise EN) and
          // return text already in the target language unchanged.
          const detected = source_lang ?? (/[\uac00-\ud7a3]/.test(t) ? "KO" : "EN");
          const same = detected === target_lang.split("-")[0];
          return { detected_source_language: detected, text: same ? t : `[${target_lang}] ${t}` };
        }),
      }),
    );
  });
}).listen(port, "127.0.0.1", () => console.log(`mock DeepL on ${port}`));
