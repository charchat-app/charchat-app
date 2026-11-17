/** 로컬 개발 전용. 공식 API/공유 DB를 대체하거나 접속하지 않는다. */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { seedStory } from '../mocks/seed/story.ts';
import { parseExpression } from '../shared/story-types/expression.ts';

export async function createStoryFixtureServer(file) {
  let state;
  try {
    state = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('로컬 예제 저장 파일을 읽을 수 없습니다.');
    state = { story: structuredClone(seedStory), receipts: {} };
  }
  parseExpression(state.story.speech);
  let queue = Promise.resolve();
  const server = createServer((req, res) => {
    queue = queue
      .then(async () => {
        const json = (status, body) => {
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(body));
        };
        const origin = req.headers.origin;
        if (origin) {
          let allowed = false;
          try {
            allowed = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
          } catch {}
          if (!allowed) return json(403, { error: 'LOCAL_ORIGIN_REQUIRED' });
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
          res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          return res.end();
        }
        if (req.url !== `/__fixtures/stories/${seedStory.id}`) return json(404, { error: 'NOT_FOUND' });
        if (req.method === 'GET') return json(200, { mode: 'fixture', story: state.story });
        if (req.method !== 'PUT') return json(405, { error: 'METHOD_NOT_ALLOWED' });
        const requestId = req.headers['idempotency-key'];
        if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(requestId))
          return json(400, { error: 'REQUEST_ID_REQUIRED' });
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024 * 1024) return json(413, { error: 'BODY_TOO_LARGE' });
          chunks.push(chunk);
        }
        let input;
        try {
          input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return json(400, { error: 'INVALID_JSON' });
        }
        const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
        const prior = Object.hasOwn(state.receipts, requestId) ? state.receipts[requestId] : undefined;
        if (prior) return prior.hash === hash ? json(200, prior.result) : json(409, { error: 'KEY_REUSED' });
        const document = input?.document;
        if (!document || document.id !== seedStory.id || document.saveState !== '임시 저장')
          return json(422, { error: 'DRAFT_FIXTURE_ONLY' });
        // 이번 작업은 표현만 편집한다. 다른 영역이 바뀌면 저장하지 않는다.
        const rest = (story) => {
          const { speech, updatedAt, ...other } = story;
          return other;
        };
        if (JSON.stringify(rest(document)) !== JSON.stringify(rest(state.story)))
          return json(422, { error: 'OTHER_FIELDS_CHANGED' });
        let speech;
        try {
          speech = parseExpression(document.speech);
        } catch {
          return json(422, { error: 'INVALID_EXPRESSION' });
        }
        const story = { ...state.story, speech, updatedAt: new Date().toISOString() };
        const result = { mode: 'fixture', story };
        const next = { story, receipts: { ...state.receipts, [requestId]: { hash, result } } };
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        const temporary = `${file}.tmp`;
        await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
        await rename(temporary, file);
        state = next;
        return json(200, result);
      })
      .catch(() => {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'FIXTURE_SAVE_FAILED' }));
      });
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = resolve(process.env.STORY_FIXTURE_FILE ?? '.local/story-fixture.json');
  const port = Number(process.env.STORY_FIXTURE_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid fixture port');
  const server = await createStoryFixtureServer(file);
  server.requestTimeout = 15000;
  server.listen(port, '127.0.0.1', () => console.log(`로컬 예제 저장 서버: http://127.0.0.1:${port} (공유 DB 미사용)`));
}
