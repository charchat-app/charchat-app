/** 실제 앱 어댑터 → 로컬 FastAPI → 격리 PostgreSQL 계약 검사. Node24, TypeScript 의존성 사용. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const project = path.resolve(__dirname, '..');
const original = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return original.call(this, name.startsWith('@/') ? path.join(project, name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = function (module, filename) {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(result.outputText, filename);
};
const { createServerExpressionRepository } = require('../features/story-publish/serverRepository.ts');
async function main() {
  const url = new URL(process.argv[2]);
  assert.equal(url.hostname, '127.0.0.1');
  // 앱 설정(EXPO_PUBLIC_API_URL)과 같이 API 접두사까지 포함한 주소를 넘긴다.
  const base = `${url.origin}/api/v1`;
  const id = process.argv[3];
  const repo = createServerExpressionRepository(base);
  const initial = await repo.load(id);
  assert.equal(initial.speech.pointOfView, 'third_person');
  assert.equal(initial.saveState, '임시 저장');
  const text = '  {{user}}\n' + '가'.repeat(1001) + '  ';
  const draft = { ...initial, speech: { ...initial.speech, tense: 'present', style: { mode: 'custom', text } } };
  const first = await repo.save(draft, 'live-app-one');
  assert.equal(first.speech.style.text, text);
  const second = await repo.save({ ...first, speech: { ...first.speech, composition: 'action' } }, 'live-app-two');
  assert.equal(second.speech.composition, 'action');
  const replay = await repo.save(draft, 'live-app-one');
  assert.deepEqual(replay, first);
  const restored = await createServerExpressionRepository(base).load(id);
  assert.equal(restored.speech.style.text, text);
  assert.equal(restored.speech.composition, 'action');
  assert.equal(restored.speech.tense, 'present');
  assert.equal(restored.title, initial.title);
  assert.equal(Object.hasOwn(restored, 'characters'), false);
  const { createServerFewshotRepository } = require('../features/story-publish/fewshotRepository.ts');
  const fewRepo = createServerFewshotRepository(base);
  const liveCharacters = await fewRepo.loadCharacters(id);
  assert.ok(liveCharacters.length > 0);
  const empty = await fewRepo.load(id);
  assert.equal(empty.fewshots.length, 0);
  const character = empty.characters[0];
  assert.ok(character);
  const fewDraft = {
    ...empty,
    fewshots: [
      {
        id: null,
        clientKey: 'live-ga',
        messages: [
          { id: null, clientKey: 'live-ma', speakerKind: 'character', characterId: character.id, body: text },
          { id: null, clientKey: 'live-mb', speakerKind: 'narrator', characterId: null, body: '지문 원문' },
        ],
      },
      {
        id: null,
        clientKey: 'live-gb',
        messages: [{ id: null, clientKey: 'live-mc', speakerKind: 'user', characterId: null, body: '유저 본문' }],
      },
    ],
  };
  const created = await fewRepo.save(fewDraft, 'live-fewshots-one');
  assert.ok(created.fewshots[0].id && created.fewshots[0].messages[0].id);
  const originalMessageId = created.fewshots[0].messages[0].id;
  const changed = {
    ...created,
    fewshots: [
      created.fewshots[1],
      {
        ...created.fewshots[0],
        messages: [created.fewshots[0].messages[1], { ...created.fewshots[0].messages[0], body: text + '수정' }],
      },
    ],
  };
  await fewRepo.save(changed, 'live-fewshots-two');
  const replayFewshots = await fewRepo.save(fewDraft, 'live-fewshots-one');
  assert.deepEqual(replayFewshots, created);
  const ordered = await fewRepo.load(id);
  assert.equal(ordered.fewshots[0].id, created.fewshots[1].id);
  assert.equal(ordered.fewshots[1].messages[1].id, originalMessageId);
  assert.equal(ordered.fewshots[1].messages[1].body, text + '수정');
  const remaining = { ...ordered, fewshots: [{ ...ordered.fewshots[1], messages: [ordered.fewshots[1].messages[1]] }] };
  await fewRepo.save(remaining, 'live-fewshots-three');
  const afterDelete = await fewRepo.load(id);
  assert.equal(afterDelete.fewshots.length, 1);
  assert.equal(afterDelete.fewshots[0].messages.length, 1);
  await fewRepo.save({ ...afterDelete, fewshots: [] }, 'live-fewshots-four');
  assert.equal((await fewRepo.load(id)).fewshots.length, 0);
  assert.deepEqual((await repo.load(id)).speech, restored.speech);
  console.log(
    JSON.stringify({
      passed: true,
      actualAppAdapter: true,
      fewshotCrudAndTwoLevelOrder: true,
      fastApi: true,
      isolatedPostgres: true,
      rawTextPreserved: true,
      replayDidNotOverwriteLaterSave: true,
      sharedDatabaseUsed: false,
    }),
  );
}
main().catch(() => {
  console.error('실제 앱-API-로컬 DB 통합검사 실패');
  process.exitCode = 1;
});
