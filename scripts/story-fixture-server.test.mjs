// 실행 환경: Node 24 이상(검증 v24.20.0). `npm run test:fixtures`로 실행한다(Jest 대상 아님).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStoryFixtureServer } from './story-fixture-server.mjs';

async function start(file) {
  const server = await createStoryFixtureServer(file);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/__fixtures/stories/seed-story-001`;
  return { server, url, stop: () => new Promise((resolve) => server.close(resolve)) };
}
const put = (url, document, key) =>
  fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ document }),
  });
test('저장·프로세스 재시작 복원·중복 요청·원문 보존을 검증한다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'charchat-fixture-test-'));
  let fixture;
  try {
    const file = join(dir, 'story.json');
    fixture = await start(file);
    const original = (await (await fetch(fixture.url)).json()).story;
    const changed = structuredClone(original);
    changed.speech.style = { mode: 'custom', text: `  {{user}}\n${'가'.repeat(1001)}  ` };
    const first = await put(fixture.url, changed, 'request-one');
    assert.equal(first.status, 200);
    const saved = await first.json();
    assert.deepEqual(saved.story.intros, original.intros);
    assert.deepEqual(saved.story.speech, changed.speech);
    await fixture.stop();
    fixture = await start(file);
    assert.deepEqual((await (await fetch(fixture.url)).json()).story, saved.story);
    const next = structuredClone(saved.story);
    next.speech.tense = 'present';
    assert.equal((await put(fixture.url, next, 'request-two')).status, 200);
    const replay = await put(fixture.url, changed, 'request-one');
    assert.deepEqual(await replay.json(), saved);
    assert.equal((await (await fetch(fixture.url)).json()).story.speech.tense, 'present');
    assert.equal((await put(fixture.url, next, 'request-one')).status, 409);
    const invalid = structuredClone(next);
    invalid.title = '다른 영역 덮어쓰기';
    assert.equal((await put(fixture.url, invalid, 'other-fields')).status, 422);
    assert.equal((await (await fetch(fixture.url)).json()).story.title, original.title);
    const wrong = structuredClone(next);
    wrong.speech.composition = 'unknown';
    assert.equal((await put(fixture.url, wrong, 'invalid-enum')).status, 422);
    assert.equal((await fetch(fixture.url, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  } finally {
    if (fixture) await fixture.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
