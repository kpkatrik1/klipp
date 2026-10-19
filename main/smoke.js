// Developer smoke harness, active only when KLIPP_SMOKE=<dir> is set (see index.js, which
// also points userData into that dir so real data is never touched). Seeds clips, shows the
// popup, drives the renderer, writes screenshots + report.json to <dir>, then quits.
import fs from 'node:fs';
import path from 'node:path';
import { screen, clipboard } from 'electron';
import { writePayload } from './paster.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function runSmoke({ app, popup, store, persistence, dir, log }) {
  fs.mkdirSync(dir, { recursive: true });
  const wc = popup.window.webContents;
  const report = { steps: [] };

  const shot = async (name) => {
    const img = await wc.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
  };
  const js = (code) => wc.executeJavaScript(code, true);
  const dom = () => js(`({
    rows: [...document.querySelectorAll('.row')].map(r => ({
      text: r.querySelector('.text')?.textContent, selected: r.classList.contains('selected'),
      num: r.querySelector('.num')?.textContent, pinned: !!r.querySelector('.pin'),
      title: r.querySelector('.title')?.textContent,
    })),
    tabs: [...document.querySelectorAll('.tab')].map(t => t.textContent + (t.classList.contains('active') ? '*' : '')),
    preview: document.getElementById('preview').textContent.slice(0, 80),
    status: document.getElementById('status').textContent,
    query: document.getElementById('search').value,
    focused: document.activeElement?.id,
  })`);
  const clickTab = (view) => js(`document.querySelector('.tab[data-view=' + ${JSON.stringify(JSON.stringify(view))} + ']').click()`);
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    wc.sendInputEvent({ type: 'char', keyCode, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await sleep(120);
  };
  const type = async (s) => { for (const ch of s) await key(ch); };
  const step = async (name, extra = {}) => report.steps.push({ step: name, dom: await dom(), ...extra });

  try {
    await sleep(800);
    const seed = ['Första klippet med test i sig', 'Andra raden, också test', 'gcloud projects list', 'Hej poll', 'https://example.com/ett/långt/url-klipp'];
    seed.reverse().forEach((text, i) => store.add({ kind: 'text', text, hash: 'seed' + i, html: i === seed.length - 1 ? '<b>x</b>' : undefined }));
    await sleep(200);

    popup.show();
    await sleep(900);
    await step('shown', {
      bounds: popup.window.getBounds(),
      cursor: screen.getCursorScreenPoint(),
      displays: screen.getAllDisplays().map(d => ({ bounds: d.bounds, scale: d.scaleFactor })),
    });
    await shot('01-shown');

    await type('test');
    await sleep(200);
    await step('typed "test"');
    await shot('02-search');

    await key('Down');
    await step('ArrowDown');

    for (let i = 0; i < 4; i++) await key('Backspace');
    await sleep(200);
    const first = store.list('history')[0];
    await js(`window.klipp.togglePin(${JSON.stringify(first.id)})`);
    await sleep(250);
    await step('cleared + pinned first');
    await shot('03-pinned');

    await clickTab('pinned');
    await sleep(250);
    await step('tab Fästa');
    await shot('04-pinned-tab');

    const g = await js(`window.klipp.addGroup("Mallar")`);
    await js(`window.klipp.moveToGroup(${JSON.stringify(first.id)}, ${JSON.stringify(g.id)})`);
    await sleep(250);
    await clickTab(g.id);
    await sleep(250);
    await step('group Mallar');
    await shot('05-group');

    await js(`window.klipp.update(${JSON.stringify(first.id)}, { title: "Rubrik", text: "Redigerad text 123" })`);
    await sleep(250);
    await step('edited', { stored: store.get(first.id)?.text });
    await shot('06-edited');

    await clickTab('history');
    await sleep(150);
    await type('123');
    await sleep(200);
    await step('search edited');

    const before = clipboard.readText();
    const second = store.list('history')[1];
    writePayload([store.get(first.id), second], true, persistence);
    report.steps.push({ step: 'writePayload multi plain', clipboard: clipboard.readText(), expected: [store.get(first.id).text, second.text].join('\n') });
    writePayload([store.get(first.id)], false, persistence);
    report.steps.push({ step: 'writePayload single rich', clipboard: clipboard.readText(), html: clipboard.readHTML().includes('<b>x</b>') });
    clipboard.writeText(before);

    await js(`window.klipp.removeGroup(${JSON.stringify(g.id)})`);
    await sleep(250);
    report.steps.push({ step: 'group removed', pinned: store.get(first.id)?.pinned, groupId: store.get(first.id)?.groupId, groups: store.toJSON().groups.length });

    await js(`window.klipp.remove([${JSON.stringify(second.id)}])`);
    await sleep(250);
    report.steps.push({ step: 'removed second', gone: store.get(second.id) === undefined });

    popup.window.close();
    await sleep(300);
    popup.show();
    await sleep(300);
    report.steps.push({ step: 'close() hides instead of destroying', destroyed: popup.window.isDestroyed(), visibleAfterShow: popup.isVisible() });
    await popup.hide();

    report.ok = true;
  } catch (err) {
    report.ok = false;
    report.error = String(err?.stack ?? err);
  }
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  log('smoke: klar, ok =', report.ok, report.error ?? '');
  app.exit(report.ok ? 0 : 1);
}
