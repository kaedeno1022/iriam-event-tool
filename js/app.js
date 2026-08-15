import {
  initState, saveState, scheduleSave, flushScheduledSave, exportStateAsFile, importStateFromFile,
  getActiveEventId, setActiveEvent, createEvent, setSaveErrorHandler,
  StateLoadError, downloadJsonText, backupCurrentState, readBackupRaw, clearStoredState,
  countExternalImageUrls, clearBackupState, STORAGE_KEY,
} from './storage.js';
import { tuesdayWeekRange } from './dateUtils.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPanelOpen } from './views/panelOpenView.js';
import { renderShiraPai } from './views/shiraPaiView.js';
import { renderShopGacha } from './views/shopGachaView.js';
import { renderCategoryEndurance } from './views/categoryEnduranceView.js';
import { renderSetlist } from './views/setlistView.js';
import { renderCounter } from './views/counterView.js';
import { renderUsers } from './views/userView.js';
import { renderGiftMaster } from './views/giftMasterView.js';
import { el } from './render.js';
import { showAlert, showConfirm, showPrompt } from './views/dialogs.js';

const routes = {
  dashboard: renderDashboard,
  users: renderUsers,
  gifts: renderGiftMaster,
};

// type別のview一覧。ダッシュボードのカレンダーから日付ベースの非既定インスタンス(タブに
// 紐づかないsegment)を開く際、segment.idだけを手がかりに正しいviewへ振り分ける。
const VIEW_BY_TYPE = {
  panelOpen: renderPanelOpen,
  shiraPai: renderShiraPai,
  shopGacha: renderShopGacha,
  categoryEndurance: renderCategoryEndurance,
  setlist: renderSetlist,
  counter: renderCounter,
};

function renderSegmentById(ctx, segmentId) {
  const segment = ctx.state.segments.find((s) => s.id === segmentId);
  if (!segment) {
    ctx.container.append(el('p', {}, 'この企画は見つかりません。'));
    return;
  }
  const render = VIEW_BY_TYPE[segment.type];
  if (!render) {
    ctx.container.append(el('p', {}, '未対応の企画タイプです。'));
    return;
  }
  render({ ...ctx, segmentId });
}

let state;

function currentRoute() {
  return location.hash.replace('#/', '') || 'dashboard';
}

// --- sticky要素の高さ調整 ---
// .app-header/.tab-navはposition:stickyで積み重なるが、バナーの表示有無やヘッダーの折り返しで
// 実際の高さが変わる。固定pxで決め打つとタブナビがヘッダーの下に隠れるため、実測値を
// CSS変数に書き込んで追従させる(css/style.cssの--banner-height/--header-height側で参照)。
function updateStickyOffsets() {
  const banner = document.getElementById('save-error-banner');
  const header = document.querySelector('.app-header');
  const bannerHeight = banner && !banner.hidden ? banner.offsetHeight : 0;
  const headerHeight = header ? header.offsetHeight : 0;
  document.documentElement.style.setProperty('--banner-height', `${bannerHeight}px`);
  document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
}

function watchStickyOffsets() {
  updateStickyOffsets();
  // ResizeObserver未対応環境(jsdomでのテスト実行時など)ではwindowのresizeだけで代用する。
  if (typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', updateStickyOffsets);
    return;
  }
  const banner = document.getElementById('save-error-banner');
  const header = document.querySelector('.app-header');
  const observer = new ResizeObserver(updateStickyOffsets);
  if (banner) observer.observe(banner);
  if (header) observer.observe(header);
}

// --- 保存失敗の警告バナー ---
// 保存はほぼ全ての操作から呼ばれるため、失敗しても画面は正常に見えてしまう。
// 一度でも失敗したら、成功するまで消えない警告を常時表示する。
function renderSaveErrorBanner(err) {
  const banner = document.getElementById('save-error-banner');
  if (!banner) return;
  if (!err) {
    banner.replaceChildren();
    banner.hidden = true;
    return;
  }
  const isQuota = err.name === 'QuotaExceededError' || /quota/i.test(err.message ?? '');
  const detail = isQuota
    ? 'ブラウザの保存容量が上限に達したか、プライベートブラウズのため保存できません。'
    : `保存時にエラーが発生しました(${err.name || 'Error'})。`;
  banner.replaceChildren(el('div', { class: 'banner-inner' }, [
    el('strong', {}, '⚠ データが保存されていません'),
    el('span', {}, `${detail} この画面での記録はリロードすると失われます。今すぐエクスポートしてバックアップしてください。`),
    el('button', {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => exportStateAsFile(state),
    }, '今すぐエクスポート'),
  ]));
  banner.hidden = false;
}

// --- エラー画面 ---
// 描画中の例外で画面が空のまま操作不能になるのを防ぐ。原因に関わらず、
// 「データを救出する」「やり直す」手段だけは必ず画面上に残す。
function renderErrorScreen(container, err) {
  const raw = err instanceof StateLoadError ? err.raw : null;
  const backupRaw = readBackupRaw();

  const actions = [
    el('button', {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => location.reload(),
    }, '再読み込み'),
  ];

  if (raw) {
    actions.push(el('button', {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => downloadJsonText(raw, 'iriam-event-tool_破損データ'),
    }, '壊れたデータを書き出す'));
  } else if (state) {
    actions.push(el('button', {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => exportStateAsFile(state),
    }, '現在のデータをエクスポート'));
  }

  if (backupRaw) {
    actions.push(el('button', {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => downloadJsonText(backupRaw, 'iriam-event-tool_バックアップ'),
    }, 'インポート前のバックアップを書き出す'));
  }

  actions.push(el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: async () => {
      if (!(await showConfirm('保存データを削除して初期状態から開き直します。先に「書き出す」で救出しておくことを強く推奨します。実行しますか？'))) return;
      clearStoredState();
      location.reload();
    },
  }, 'データを消して初期化'));

  container.replaceChildren(el('section', { class: 'error-screen' }, [
    el('h2', {}, '画面を表示できませんでした'),
    el('p', {}, err?.message || String(err)),
    el('p', { class: 'empty-hint' }, 'データが失われないよう、まず下のボタンで書き出してから操作してください。'),
    el('div', { class: 'form-row inline' }, actions),
  ]));
}

function renderPage() {
  const route = currentRoute();
  const app = document.getElementById('app');
  const ctx = {
    state,
    save: () => saveState(state),
    // テキスト入力用の遅延保存。1文字ごとにstate全体を直列化するとログ増加時に入力が重くなる。
    // viewは saveText = save を既定にしているので、渡さなければ従来通り即時保存になる。
    saveText: () => scheduleSave(state),
    rerender: renderPage,
    container: app,
  };

  // 描画の途中で例外が出ると、replaceChildren()で消した後の空画面のまま操作不能になる。
  // 企画1つの不整合でツール全体が使えなくなるのを避けるため、ここで受け止める。
  try {
    if (route.startsWith('segment/')) {
      document.querySelectorAll('.tab-link').forEach((btn) => btn.classList.remove('active'));
      app.replaceChildren();
      renderSegmentById(ctx, route.slice('segment/'.length));
      return;
    }

    const resolvedRoute = routes[route] ? route : 'dashboard';
    document.querySelectorAll('.tab-link').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.route === resolvedRoute);
    });
    app.replaceChildren();
    routes[resolvedRoute](ctx);
  } catch (err) {
    console.error(err);
    renderErrorScreen(app, err);
  }
}

function renderEventSwitcher() {
  const select = document.getElementById('event-select');
  const activeId = getActiveEventId(state);
  select.replaceChildren(...state.events.map((ev) => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = ev.name;
    opt.selected = ev.id === activeId;
    return opt;
  }));
}

// --- 他タブによる上書きの検知 ---
// stateはメモリ上のcachedStateを丸ごと書き戻すため、同じブラウザで2つのタブを開いていると
// 後から保存した側が相手の変更を全て破棄する。マージはせず(仕様上、同時編集は非対応)、
// 気づかないまま作業が失われることだけを防ぐ。
let externalChangeNotified = false;
function watchExternalChanges() {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue === null) return;
    if (externalChangeNotified) return;
    externalChangeNotified = true;
    showAlert(
      '別のタブ(または別ウィンドウ)でこのツールのデータが更新されました。\n'
      + 'このタブで操作を続けると、相手の変更を上書きして失う可能性があります。\n'
      + '片方のタブを閉じ、残す方を再読み込みしてください。',
    );
  });
}

async function main() {
  setSaveErrorHandler(renderSaveErrorBanner);

  state = await initState();
  renderEventSwitcher();
  watchExternalChanges();
  watchStickyOffsets();

  window.addEventListener('hashchange', renderPage);
  // 遅延保存が保留されたままページを離れると、直前の入力が失われるため書き切る。
  // beforeunloadだけでは足りない: iOS Safariはタブをバックグラウンドで破棄する際に
  // これを発火しないことがある。配信中にスマホでホーム画面へ戻る操作がまさにその状況なので、
  // pagehideとvisibilitychange(hidden)も併せて拾う。
  window.addEventListener('beforeunload', flushScheduledSave);
  window.addEventListener('pagehide', flushScheduledSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushScheduledSave();
  });

  document.getElementById('event-select').addEventListener('change', (e) => {
    setActiveEvent(state, e.target.value);
    saveState(state);
    renderPage();
  });

  document.getElementById('new-event-btn').addEventListener('click', async () => {
    const name = await showPrompt('イベント名を入力');
    if (!name || !name.trim()) return;
    const { periodStart, periodEnd } = tuesdayWeekRange();
    createEvent(state, { name: name.trim(), periodStart, periodEnd });
    saveState(state);
    renderEventSwitcher();
    renderPage();
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    flushScheduledSave();
    exportStateAsFile(state);
  });

  document.getElementById('import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = await importStateFromFile(file);
      const externalImages = countExternalImageUrls(parsed);
      const imageWarning = externalImages > 0
        ? `\n\nこのファイルには外部サイトの画像URLが${externalImages}件含まれます。表示すると、その配信元にアクセス元の情報が渡ります。`
        : '';
      if (!(await showConfirm(`現在のデータを上書きしてインポートします。よろしいですか？${imageWarning}`))) {
        e.target.value = '';
        return;
      }
      // 上書きは元に戻せないため、直前のデータを退避してから置き換える
      flushScheduledSave();
      const backedUp = backupCurrentState(state);
      if (!backedUp && !(await showConfirm('インポート前のバックアップ作成に失敗しました(容量不足の可能性)。元のデータは復元できなくなります。それでも続行しますか？'))) {
        e.target.value = '';
        return;
      }
      // 保存できたことを確認してからreloadする。失敗を無視すると、直後のreloadで
      // 警告バナーごと画面が捨てられ、利用者には「インポートしたのに元のままだ」と
      // しか見えなくなる。直前にバックアップも書いているため、全経路の中でここが
      // 最も容量超過を起こしやすい。
      if (!saveState(parsed)) {
        // インポートは成立していないので、stateは元のまま保持する(parsedに差し替えると
        // 画面のDOMだけが旧stateに束縛されたまま残り、バナーの「今すぐエクスポート」が
        // 利用者自身のデータではなく取り込もうとしたファイルの中身を書き出してしまう)。
        // 元データはlocalStorageに無傷で残っている。
        // 直前に取ったバックアップは本体と同じ内容の重複でしかなく、復元価値が無い。
        // 失敗の主因は容量超過なので、ツール自身が無駄に1件分を占有し続けないよう消す。
        // ただし退避自体が失敗していた場合は、上書きされずに残っている「以前のインポートで
        // 取ったバックアップ」が生きているため消してはいけない。
        if (backedUp) clearBackupState();
        await showAlert('インポートしたデータを保存できませんでした(保存容量の上限に達している可能性があります)。\n元のデータはそのまま残っています。画面上部の警告からエクスポートしてバックアップを取り、ブラウザの保存領域を空けてからやり直してください。');
        e.target.value = '';
        return;
      }
      location.reload();
    } catch (err) {
      await showAlert(`インポートに失敗しました: ${err.message}`);
    }
    e.target.value = '';
  });

  renderPage();
}

main().catch((err) => {
  console.error(err);
  renderErrorScreen(document.getElementById('app'), err);
});
