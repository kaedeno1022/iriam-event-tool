// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { renderSetlist } from '../js/views/setlistView.js';
import { showAlert, showConfirm, showPrompt } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
}));

function buildState() {
  return {
    events: [{ id: 'event1' }],
    activeEventId: 'event1',
    segments: [{
      id: 'seg-setlist',
      eventId: 'event1',
      type: 'setlist',
      key: 'setlist',
      name: 'ラスラン',
      config: { songs: [] },
    }],
  };
}

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function findButton(text, root = document) {
  return [...root.querySelectorAll('button')].find((b) => b.textContent === text);
}

describe('renderSetlist', () => {
  let container;
  let rerender;
  let state;

  beforeEach(() => {
    vi.clearAllMocks();
    showAlert.mockResolvedValue(undefined);
    showConfirm.mockResolvedValue(true);
    showPrompt.mockResolvedValue(null);

    document.body.innerHTML = '<div id="root"></div>';
    container = document.getElementById('root');
    state = buildState();
    rerender = () => {
      container.replaceChildren();
      renderSetlist({ state, save: vi.fn(), rerender, container });
    };
    rerender();
  });

  it('未登録時は「セトリ未登録」と表示され、済み0/全0曲と表示される', () => {
    expect(container.textContent).toContain('セトリ未登録');
    expect(container.textContent).toContain('済み 0 / 全0曲');
  });

  it('「＋ 曲を追加」でprompt入力した曲名が一覧に追加される(done:falseで開始)', async () => {
    showPrompt.mockResolvedValueOnce('曲A');
    findButton('＋ 曲を追加', container).click();
    await flush();

    expect(state.segments[0].config.songs).toHaveLength(1);
    expect(state.segments[0].config.songs[0]).toMatchObject({ title: '曲A', done: false });
    expect(container.querySelector('.song-title-input').value).toBe('曲A'); // 曲名はinputのvalueとして描画される(textContentには現れない)
  });

  it('曲名入力をキャンセルすると追加されない', async () => {
    showPrompt.mockResolvedValueOnce(null);
    findButton('＋ 曲を追加', container).click();
    await flush();

    expect(state.segments[0].config.songs).toHaveLength(0);
  });

  it('済みチェックボックスをONにするとdoneがtrueになり、済み件数表示が更新される', () => {
    state.segments[0].config.songs.push({ id: 's1', title: '曲A', done: false });
    rerender();

    const checkbox = container.querySelector('input[type="checkbox"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(state.segments[0].config.songs[0].done).toBe(true);
    expect(container.textContent).toContain('済み 1 / 全1曲');
  });

  it('曲名の入力欄を編集するとtitleが更新される', () => {
    state.segments[0].config.songs.push({ id: 's1', title: '曲A', done: false });
    rerender();

    const titleInput = container.querySelector('.song-title-input');
    titleInput.value = '曲A(改題)';
    titleInput.dispatchEvent(new Event('input'));

    expect(state.segments[0].config.songs[0].title).toBe('曲A(改題)');
  });

  it('↓ボタンで曲順が入れ替わる', () => {
    state.segments[0].config.songs.push(
      { id: 's1', title: '曲A', done: false },
      { id: 's2', title: '曲B', done: false },
    );
    rerender();

    const downBtns = [...container.querySelectorAll('button')].filter((b) => b.title === '下へ');
    downBtns[0].click(); // 曲Aを下へ

    expect(state.segments[0].config.songs.map((s) => s.title)).toEqual(['曲B', '曲A']);
  });

  it('先頭の曲は「上へ」、末尾の曲は「下へ」が無効化される', () => {
    state.segments[0].config.songs.push(
      { id: 's1', title: '曲A', done: false },
      { id: 's2', title: '曲B', done: false },
    );
    rerender();

    const upBtns = [...container.querySelectorAll('button')].filter((b) => b.title === '上へ');
    const downBtns = [...container.querySelectorAll('button')].filter((b) => b.title === '下へ');
    expect(upBtns[0].disabled).toBe(true);
    expect(downBtns[0].disabled).toBe(false);
    expect(upBtns[1].disabled).toBe(false);
    expect(downBtns[1].disabled).toBe(true);
  });

  it('削除ボタンで確認後にその曲が一覧から消える', async () => {
    state.segments[0].config.songs.push({ id: 's1', title: '曲A', done: false });
    rerender();

    showConfirm.mockResolvedValueOnce(true);
    [...container.querySelectorAll('button')].find((b) => b.title === '削除').click();
    await flush();

    expect(state.segments[0].config.songs).toHaveLength(0);
  });

  it('削除確認をキャンセルすると曲は残る', async () => {
    state.segments[0].config.songs.push({ id: 's1', title: '曲A', done: false });
    rerender();

    showConfirm.mockResolvedValueOnce(false);
    [...container.querySelectorAll('button')].find((b) => b.title === '削除').click();
    await flush();

    expect(state.segments[0].config.songs).toHaveLength(1);
  });
});

describe('renderSetlist - segmentId指定(日付ベースの非既定インスタンス)', () => {
  it('segmentId指定時は、key==="setlist"でなくてもそのsegmentを直接表示する', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const container = document.getElementById('root');
    const state = buildState();
    state.segments.push({
      id: 'seg-extra', eventId: 'event1', type: 'setlist', key: null, name: '2部のセトリ', config: { songs: [] },
    });

    renderSetlist({
      state, save: vi.fn(), rerender: vi.fn(), container, segmentId: 'seg-extra',
    });

    expect(container.querySelector('.segment-name-header').value).toBe('2部のセトリ');
  });
});
