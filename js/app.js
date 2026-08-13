import {
  initState, saveState, exportStateAsFile, importStateFromFile, getActiveEventId, setActiveEvent, createEvent,
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

function renderPage() {
  const route = currentRoute();
  const app = document.getElementById('app');
  const ctx = {
    state, save: () => saveState(state), rerender: renderPage, container: app,
  };

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
}

async function main() {
  state = await initState();
  renderEventSwitcher();

  window.addEventListener('hashchange', renderPage);

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

  document.getElementById('export-btn').addEventListener('click', () => exportStateAsFile(state));

  document.getElementById('import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!(await showConfirm('現在のデータを上書きしてインポートします。よろしいですか？'))) {
      e.target.value = '';
      return;
    }
    try {
      const parsed = await importStateFromFile(file);
      saveState(parsed);
      location.reload();
    } catch (err) {
      await showAlert(`インポートに失敗しました: ${err.message}`);
    }
    e.target.value = '';
  });

  renderPage();
}

main();
