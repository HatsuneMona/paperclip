const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { localize } = require('./localize.cjs');

function fixture(t, source, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paperclip-i18n-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'View.tsx'), source);
  for (const [file, content] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  const translations = {
    Save: '保存', Tasks: '任务', Token: '令牌', Secret: '密钥',
    'Hello {{v0}}': '你好 {{v0}}', 'https://example.com': '不应替换',
    '/api/issues': '不应替换', 'in_progress': '不应替换',
  };
  const apply = () => localize({ root, translations, mode: 'apply' });
  const read = (file = 'View.tsx') => fs.readFileSync(path.join(root, file), 'utf8');
  return { root, apply, read, translations };
}

test('translates display text and interpolations without changing dynamic values', (t) => {
  const f = fixture(t, 'export const View = ({name}) => <><button title="Save">Save</button><p>{`Hello ${name}`}</p><p>{name}</p></>;');
  assert.equal(f.apply().changedFiles, 1);
  const result = f.read();
  assert.match(result, /title=\{uiT\(/);
  assert.match(result, /v0: \(name\)/);
  assert.match(result, /<p>\{name\}<\/p>/);
});

test('preserves code, URLs, API modules and canonical enum values', (t) => {
  const f = fixture(t, 'export const View = () => <><code>Save</code><pre>Token</pre><kbd>Save</kbd><a href="https://example.com">https://example.com</a><p>{"/api/issues"}</p></>; export const item = {value: "in_progress"};', {
    'api/example.ts': 'export const payload = {title: "Save"};',
  });
  const before = f.read();
  f.apply();
  assert.equal(f.read(), before);
  assert.equal(f.read('api/example.ts'), 'export const payload = {title: "Save"};');
});

test('preserves label/title discriminators and protocol model labels', (t) => {
  const f = fixture(t, 'const items = [{ label: "Tasks", title: "Secret" }]; export const check = x => x.label === "Tasks" || x.title === "Secret";', {
    'lib/model.ts': 'export const model = {label: "Token"};',
  });
  const before = f.read();
  f.apply();
  assert.equal(f.read(), before);
  assert.equal(f.read('lib/model.ts'), 'export const model = {label: "Token"};');
});

test('does not rewrite existing translation calls, and repeated application is idempotent', (t) => {
  const f = fixture(t, 'import { t as uiT } from "@/i18n"; export const View = () => <><p>{uiT("existing", {title: "Save"})}</p><button>Save</button></>;');
  f.apply();
  const before = f.read();
  const messages = f.read('i18n/messages/en.json');
  assert.match(before, /uiT\("existing", \{title: "Save"\}\)/);
  assert.equal(f.apply().totalEdits, 0);
  assert.equal(f.read(), before);
  assert.equal(f.read('i18n/messages/en.json'), messages);
  assert.equal((before.match(/import \{ t as uiT \}/g) || []).length, 1);
});

test('applies outer templates with translated conditional branches in a single pass', (t) => {
  const f = fixture(t, 'export const View = ({ok}) => <p>{`Hello ${ok ? "Save" : "Token"}`}</p>;');
  f.apply();
  const result = f.read();
  assert.match(result, /v0: \(ok \? uiT\(/);
  assert.equal(f.apply().totalEdits, 0);
  assert.equal(f.read(), result);
});

test('preserves enum-typed label properties and JSX attributes', (t) => {
  const f = fixture(t, 'type Props = {label: "Save" | "Token"}; export const View = () => <Thing label="Save" />; const data = {label: "Token"};');
  const before = f.read();
  f.apply();
  assert.equal(f.read(), before);
});

test('keeps directive prologues and shebangs ahead of injected imports', (t) => {
  const f = fixture(t, '#!/usr/bin/env node\n"use client";\nexport const View = () => <button>Save</button>;');
  f.apply();
  assert.ok(f.read().startsWith('#!/usr/bin/env node\n"use client";\nimport { t as uiT }'));
  assert.equal(f.apply().totalEdits, 0);
});


test('refreshes existing messages from dictionary edits without rewriting source', (t) => {
  const f = fixture(t, 'export const View = () => <button>Save</button>;');
  f.apply();
  const before = f.read();
  f.translations.Save = '存储';
  assert.equal(f.apply().totalEdits, 0);
  assert.equal(f.read(), before);
  const messages = JSON.parse(f.read('i18n/messages/zh-CN.json')).messages;
  assert.deepEqual(Object.values(messages), ['存储']);
});
