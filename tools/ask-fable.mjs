// Sends a review brief + images + text attachments to Fable 5.2 through the Anthropic API (key: C:\Anti_Task\forge.txt).
// Usage: node tools/ask-fable.mjs <brief.md> <out.md> <effort> <file ...>   (.jpg/.png = image, anything else = text)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('C:/Hackathon/total-recall/package.json');
const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');
const [brief, out, effort, ...files] = process.argv.slice(2);
const apiKey = fs.readFileSync('C:/Anti_Task/forge.txt', 'utf8').trim();
const client = new Anthropic({ apiKey, timeout: 30 * 60 * 1000, maxRetries: 2 });

const content = [];
const texts = [];
for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    content.push({ type: 'text', text: `[${path.basename(f, ext)}]` });
    content.push({ type: 'image', source: { type: 'base64', media_type: ext === '.png' ? 'image/png' : 'image/jpeg', data: fs.readFileSync(f).toString('base64') } });
  } else texts.push(`===== ${path.basename(f)} =====\n${fs.readFileSync(f, 'utf8')}`);
}
content.push({ type: 'text', text: fs.readFileSync(brief, 'utf8') + '\n\n# Text attachments\n\n' + texts.join('\n\n') });

const t0 = Date.now();
const stream = client.beta.messages.stream({
  model: 'claude-fable-5-2',
  max_tokens: 64000,
  output_config: { effort },
  messages: [{ role: 'user', content }],
});
let n = 0;
stream.on('text', (d) => { n += d.length; if (n % 4000 < d.length) process.stdout.write(`.${n}`); });
const msg = await stream.finalMessage();
const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
const u = msg.usage;
const usd = (u.input_tokens * 8 + u.output_tokens * 40) / 1e6;
fs.writeFileSync(out, `<!-- model=${msg.model} effort=${effort} stop=${msg.stop_reason} in=${u.input_tokens} out=${u.output_tokens} ~$${usd.toFixed(2)} ${Math.round((Date.now() - t0) / 1000)}s -->\n\n${text}`);
console.log(`\n${msg.model} ${msg.stop_reason} in=${u.input_tokens} out=${u.output_tokens} ~$${usd.toFixed(2)} ${Math.round((Date.now() - t0) / 1000)}s`);
