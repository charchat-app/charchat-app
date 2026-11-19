/**
 * 실제 앱 어댑터 → 로컬 FastAPI → 격리 PostgreSQL 계약 검사. TypeScript 의존성 사용.
 * 실행 환경: Node 24 이상(검증 v24.20.0). 사용: node scripts/test-expression-server.cjs <API 주소> <스토리 id>
 */
if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error(`Node 24 이상이 필요합니다. 현재: ${process.version}`);
  process.exit(1);
}
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
  const { createCommonSaveRepository } = require('../features/story-publish/commonRepository.ts');
  const common = createCommonSaveRepository(base);
  const commonInitial = await common.load(id);
  const overflow = {
    ...commonInitial,
    speech: { ...commonInitial.speech, style: { mode: 'custom', text: '😀'.repeat(1001) } },
  };
  const draftSaved = await common.save(overflow, 'draft', 'manual', 'live-common-overflow');
  assert.equal(draftSaved.speech.style.text, overflow.speech.style.text);
  await assert.rejects(
    () => common.save(draftSaved, 'private', 'manual', 'live-common-invalid'),
    (error) => error.status === 422 && error.code === 'CUSTOM_STYLE_TOO_LONG',
  );
  const fixedStyle = { ...draftSaved.speech, style: { mode: 'custom', text: '원문 {{user}}' } };
  // CREATE-US-03: 인트로 0개는 완성 저장을 거절한다.
  await assert.rejects(
    () => common.save({ ...draftSaved, speech: fixedStyle, intros: [] }, 'private', 'manual', 'live-intro-none'),
    (error) => error.status === 422 && error.code === 'INTRO_REQUIRED',
  );
  const characterId = draftSaved.characters[0].id;
  const { emptyScene } = require('../shared/story-types/initialState.ts');
  // CREATE-US-04: 미완성 날짜·초과 장소·지운 호감도도 임시 저장 원문으로 보존한다.
  const partialScene = {
    ...emptyScene(),
    dateMode: 'world',
    era: '제국력',
    year: '302',
    timeFormat: '12h',
    hour: '7',
    meridiem: 'pm',
    place: '가'.repeat(31),
    characters: [{ characterId, clothing: '검은 코트\n', innerThought: '' }],
  };
  const introDraft = {
    ...draftSaved,
    speech: fixedStyle,
    intros: [
      { id: null, clientKey: 'live-intro-b', title: '😀'.repeat(31), messages: [], scene: emptyScene() },
      {
        id: null,
        clientKey: 'live-intro-a',
        title: '첫 만남',
        messages: [
          { id: null, clientKey: 'live-im-1', speakerKind: 'narrator', characterId: null, body: ' *비* \n' },
          { id: null, clientKey: 'live-im-2', speakerKind: 'character', characterId, body: '{{user}}?' },
        ],
        scene: partialScene,
      },
    ],
    relations: [
      {
        clientKey: 'live-rel-1',
        sourceKind: 'character',
        sourceCharacterId: characterId,
        targetKind: 'user',
        targetCharacterId: null,
        label: '소꿉친구',
      },
    ],
    // AC09: 호감도는 관계와 독립. 지운 값('')도 임시 저장한다.
    affinities: [{ sourceCharacterId: characterId, targetKind: 'user', targetCharacterId: null, value: '' }],
  };
  const introSaved = await common.save(introDraft, 'draft', 'manual', 'live-intro-draft');
  const introLoaded = await common.load(id);
  assert.deepEqual(
    introLoaded.intros.map((intro) => [intro.id, intro.title, intro.messages.map((m) => [m.id, m.body])]),
    introSaved.intros.map((intro) => [intro.id, intro.title, intro.messages.map((m) => [m.id, m.body])]),
  );
  assert.equal(introLoaded.intros[0].title, '😀'.repeat(31));
  assert.equal(introLoaded.intros[1].messages[1].characterId, characterId);
  assert.deepEqual(introLoaded.intros[1].scene, partialScene);
  assert.deepEqual(introLoaded.intros[0].scene, emptyScene());
  assert.deepEqual(
    introLoaded.relations.map((r) => [r.sourceCharacterId, r.targetKind, r.label]),
    [[characterId, 'user', '소꿉친구']],
  );
  assert.deepEqual(introLoaded.affinities, introDraft.affinities);
  await assert.rejects(
    () => common.save(introLoaded, 'private', 'manual', 'live-intro-title'),
    (error) => error.status === 422 && error.code === 'INTRO_TITLE_TOO_LONG',
  );
  const fixedIntro = { ...introLoaded.intros[1] };
  await assert.rejects(
    () => common.save({ ...introLoaded, intros: [fixedIntro] }, 'private', 'manual', 'live-scene-date'),
    (error) => error.status === 422 && error.code === 'INITIAL_DATE_INVALID',
  );
  fixedIntro.scene = { ...fixedIntro.scene, month: '6', day: '1', minute: '05', place: '골목' };
  await assert.rejects(
    () => common.save({ ...introLoaded, intros: [fixedIntro] }, 'private', 'manual', 'live-affinity'),
    (error) => error.status === 422 && error.code === 'AFFINITY_INVALID',
  );
  const fixedAffinities = [{ ...introLoaded.affinities[0], value: '-35' }];
  // 두 번째를 첫 번째로 옮기고(기본 변경) 제목 없는 첫 인트로를 삭제해 완성 저장한다.
  const completed = await common.save(
    { ...introLoaded, intros: [fixedIntro], affinities: fixedAffinities },
    'private',
    'manual',
    'live-common-private',
  );
  assert.equal(completed.saveState, 'private');
  const reloaded = await common.load(id);
  assert.equal(reloaded.speech.style.text, '원문 {{user}}');
  assert.deepEqual(
    reloaded.intros.map((intro) => intro.id),
    [introLoaded.intros[1].id],
  );
  assert.equal(reloaded.intros[0].messages[0].body, ' *비* \n');
  assert.deepEqual(reloaded.intros[0].scene, fixedIntro.scene);
  assert.equal(reloaded.relations[0].label, '소꿉친구');
  assert.deepEqual(reloaded.affinities, fixedAffinities);
  const published = await common.save(completed, 'public', 'manual', 'live-common-public');
  assert.equal(published.saveState, 'public');
  await assert.rejects(
    () => common.save(published, 'draft', 'manual', 'live-common-back'),
    (error) => error.status === 409,
  );
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
      commonSaveAndCompletionValidation: true,
      introSaveRestoreAndValidation: true,
      initialStateSaveRestoreAndValidation: true,
    }),
  );
}
main().catch(() => {
  console.error('실제 앱-API-로컬 DB 통합검사 실패');
  process.exitCode = 1;
});
