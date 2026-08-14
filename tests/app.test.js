// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { STORAGE_KEY } from '../js/storage.js';

// app.jsはモジュール読み込み時にmain()を実行するため、DOM・fetch・localStorageを整えてから
// 動的importする。起動そのものが検証対象(白画面にならないこと)なのでこの形にしている。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// FileReaderを挟むインポート経路は完了までのマイクロタスク段数が一定しないため、
// 固定回数のflushではなく条件が満たされるまで待つ。
async function waitFor(predicate, label, tries = 50) {
  for (let i = 0; i < tries; i += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(`待機がタイムアウトしました: ${label}`);
}

function setupDom() {
  document.body.innerHTML = `
    <div id="save-error-banner" hidden></div>
    <header class="app-header">
      <select id="event-select"></select>
      <button id="new-event-btn" type="button"></button>
      <button id="export-btn" type="button"></button>
      <input id="import-input" type="file" hidden>
    </header>
    <nav class="tab-nav">
      <a class="tab-link" data-route="dashboard" href="#/dashboard"></a>
      <a class="tab-link" data-route="users" href="#/users"></a>
      <a class="tab-link" data-route="gifts" href="#/gifts"></a>
    </nav>
    <main id="app"></main>
    <div id="modal-root"></div>
    <div id="dialog-root"></div>`;
}

function validState() {
  return {
    schemaVersion: 6,
    events: [{
      id: 'event1', name: 'バナイベ', periodStart: '2026-08-18', periodEnd: '2026-08-18', memo: '',
    }],
    activeEventId: 'event1',
    segments: [],
    giftMaster: [],
    giftLogs: [],
    users: [],
  };
}

async function bootApp() {
  vi.resetModules();
  await import('../js/app.js');
  await flush();
}

describe('アプリ起動', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDom();
    location.hash = '';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'しらすまん', points: 200, category: '定番' }],
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('保存データがあれば通常どおりダッシュボードを描画する', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validState()));

    await bootApp();

    expect(document.getElementById('app').textContent).toContain('イベント情報');
    expect(document.getElementById('save-error-banner').hidden).toBe(true);
  });

  it('保存データが無ければシードを取得して初期データで起動する', async () => {
    await bootApp();

    expect(fetch).toHaveBeenCalledWith('data/gifts.seed.json');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).giftMaster).toHaveLength(1);
  });

  it('保存データが壊れていても白画面にならず、救出手段付きのエラー画面を出す', async () => {
    localStorage.setItem(STORAGE_KEY, '{壊れたJSON');

    await bootApp();

    const app = document.getElementById('app');
    expect(app.textContent).toContain('画面を表示できませんでした');
    // 復旧手段が画面上に残っていることがこの画面の存在理由
    const labels = [...app.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toContain('壊れたデータを書き出す');
    expect(labels).toContain('データを消して初期化');
  });

  it('シードの取得が404になっても白画面にならずエラー画面を出す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

    await bootApp();

    expect(document.getElementById('app').textContent).toContain('ギフト初期データの取得に失敗しました');
  });

  it('configの配列が欠けた企画があっても、読み込み時に補完してダッシュボードは通常表示される', async () => {
    const broken = validState();
    broken.segments.push({
      id: 'seg1', eventId: 'event1', type: 'panelOpen', key: null, name: '壊れたパネル', date: '2026-08-18', config: {},
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(broken));

    await bootApp();

    const app = document.getElementById('app');
    expect(app.textContent).toContain('イベント情報');
    expect(app.textContent).toContain('壊れたパネル');
  });

  it('補完しきれない不整合で描画が落ちても、白画面ではなくエラー画面に切り替わる', async () => {
    const broken = validState();
    // configそのものが存在しないケース。ここまで来ると個別の補完では拾えないため、
    // 最終防衛線としてのエラー境界が働くことを確認する
    broken.segments.push({
      id: 'seg1', eventId: 'event1', type: 'panelOpen', key: null, name: '壊れたパネル', date: '2026-08-18', config: null,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(broken));

    await bootApp();

    expect(document.getElementById('app').textContent).toContain('画面を表示できませんでした');
  });
});

describe('保存失敗の警告バナー', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDom();
    location.hash = '';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validState()));
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('保存に失敗すると警告バナーが表示され、エクスポートを促す', async () => {
    await bootApp();
    const banner = document.getElementById('save-error-banner');
    expect(banner.hidden).toBe(true);

    // 起動後に容量超過が起きる状況を再現する
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    document.getElementById('new-event-btn').click();
    await flush();
    // showPromptは実DOM上のダイアログなので、OKを押して保存経路まで到達させる
    const okBtn = [...document.querySelectorAll('#dialog-root button')].find((b) => b.textContent === 'OK');
    const input = document.querySelector('#dialog-root input');
    input.value = '新イベント';
    okBtn.click();
    await flush();

    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('データが保存されていません');
    expect(banner.textContent).toContain('エクスポート');
  });
});

describe('インポート', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDom();
    location.hash = '';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validState()));
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function attachFile(content) {
    const input = document.getElementById('import-input');
    const file = new File([content], 'import.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    return input;
  }

  const dialogButton = (label) => [...document.querySelectorAll('#dialog-root button')].find((b) => b.textContent === label);

  it('保存に失敗したら成功したように見せず、原因を伝えるアラートと警告バナーを出す', async () => {
    await bootApp();

    const imported = validState();
    imported.events[0].name = 'インポート後のイベント';
    // 本体の保存だけを失敗させる(バックアップ書き込みは成功させ、経路を素直に通す)
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function mocked(key, value) {
      if (key === STORAGE_KEY) throw new DOMException('quota', 'QuotaExceededError');
      return realSetItem.call(this, key, value);
    });

    attachFile(JSON.stringify(imported));
    await waitFor(() => dialogButton('OK'), '上書き確認ダイアログ');
    dialogButton('OK').click();
    await waitFor(() => /保存できませんでした/.test(document.getElementById('dialog-root').textContent), '失敗アラート');

    // 保存されたデータは元のまま。ここで無言のままreloadすると、利用者には
    // 「インポートしたのに反映されていない」としか見えなくなる
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).events[0].name).toBe('バナイベ');
    expect(document.getElementById('dialog-root').textContent).toContain('保存できませんでした');
    expect(document.getElementById('save-error-banner').hidden).toBe(false);
    // jsdomはlocation.reload()をconsole.errorへ「navigation」として報告するため、
    // reloadを呼んでいないことを直接検証できる(呼ぶと画面ごとバナーが捨てられる)
    const navigated = console.error.mock.calls.some((c) => /navigation/i.test(String(c[0])));
    expect(navigated).toBe(false);

    // バナーの「今すぐエクスポート」が書き出すのは利用者自身のデータでなければならない。
    // stateを取り込み失敗したファイルへ差し替えていると、ここが'インポート後のイベント'になる
    let exported = null;
    // jsdomはcreateObjectURLを実装していないため、spyOnではなく生やす
    URL.createObjectURL = (blob) => { exported = blob; return 'blob:test'; };
    URL.revokeObjectURL = () => {};
    [...document.querySelectorAll('#save-error-banner button')]
      .find((b) => b.textContent === '今すぐエクスポート').click();

    expect(JSON.parse(await exported.text()).events[0].name).toBe('バナイベ');
  });

  it('保存に失敗したら、直前に取った無価値なバックアップを残さない', async () => {
    await bootApp();

    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function mocked(key, value) {
      if (key === STORAGE_KEY) throw new DOMException('quota', 'QuotaExceededError');
      return realSetItem.call(this, key, value);
    });

    attachFile(JSON.stringify(validState()));
    await waitFor(() => dialogButton('OK'), '上書き確認ダイアログ');
    dialogButton('OK').click();
    await waitFor(() => /保存できませんでした/.test(document.getElementById('dialog-root').textContent), '失敗アラート');

    // 失敗時のバックアップは本体と同じ内容の重複でしかない。容量超過が失敗の主因なので、
    // ツール自身が無駄に1件分を占有し続けないこと
    expect(localStorage.getItem('iriamEventTool:backup:v2')).toBeNull();
  });

  it('退避自体が失敗した場合は、以前のインポートで取った古いバックアップを消さない', async () => {
    // 退避が失敗した時は上書きされていないので、前回のバックアップがまだ生きている
    localStorage.setItem('iriamEventTool:backup:v2', JSON.stringify({ marker: '前回のバックアップ' }));
    await bootApp();

    // 本体もバックアップも書けない状態にする
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    attachFile(JSON.stringify(validState()));
    await waitFor(() => dialogButton('OK'), '上書き確認ダイアログ');
    dialogButton('OK').click();
    // 退避失敗の続行確認 → OK
    await waitFor(() => /バックアップ作成に失敗/.test(document.getElementById('dialog-root').textContent), '退避失敗の確認');
    dialogButton('OK').click();
    await waitFor(() => /保存できませんでした/.test(document.getElementById('dialog-root').textContent), '失敗アラート');

    expect(JSON.parse(localStorage.getItem('iriamEventTool:backup:v2')).marker).toBe('前回のバックアップ');
  });

  it('保存に成功した場合はreloadして新しいデータを読み直す', async () => {
    await bootApp();
    console.error.mockClear();

    attachFile(JSON.stringify(validState()));
    await waitFor(() => dialogButton('OK'), '上書き確認ダイアログ');
    dialogButton('OK').click();
    await waitFor(() => console.error.mock.calls.some((c) => /navigation/i.test(String(c[0]))), 'reload実行');

    const navigated = console.error.mock.calls.some((c) => /navigation/i.test(String(c[0])));
    expect(navigated).toBe(true);
  });

  it('外部画像URLを含むファイルは、件数を確認ダイアログに出す', async () => {
    await bootApp();

    const imported = validState();
    imported.segments.push({
      id: 'seg1', eventId: 'event1', type: 'panelOpen', key: null, name: 'パネル', date: '2026-08-18', config: { imageUrl: 'https://evil.example.com/a.png', conditions: [] },
    });

    attachFile(JSON.stringify(imported));
    await waitFor(() => /外部サイトの画像URL/.test(document.getElementById('dialog-root').textContent), '外部画像の警告');

    expect(document.getElementById('dialog-root').textContent).toContain('外部サイトの画像URLが1件');
  });

  it('この版より新しいスキーマのファイルは取り込まず、理由を伝える', async () => {
    await bootApp();

    attachFile(JSON.stringify({ ...validState(), schemaVersion: 999 }));
    await waitFor(() => /インポートに失敗しました/.test(document.getElementById('dialog-root').textContent), '失敗アラート');

    expect(document.getElementById('dialog-root').textContent).toContain('インポートに失敗しました');
    expect(document.getElementById('dialog-root').textContent).toContain('新しい版');
  });
});

describe('他タブによる上書きの検知', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDom();
    location.hash = '';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validState()));
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('別タブが同じキーを更新すると警告ダイアログを出す', async () => {
    await bootApp();

    window.dispatchEvent(new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: JSON.stringify(validState()),
    }));
    await flush();

    expect(document.getElementById('dialog-root').textContent).toContain('別のタブ');
  });

  it('無関係なキーの更新では警告しない', async () => {
    await bootApp();

    window.dispatchEvent(new StorageEvent('storage', { key: 'other:key', newValue: 'x' }));
    await flush();

    expect(document.getElementById('dialog-root').textContent).toBe('');
  });
});
