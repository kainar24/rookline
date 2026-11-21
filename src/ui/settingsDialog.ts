import { CONFIG } from '../analysis/config';
import { clearCache } from '../cache/idbCache';
import { t } from '../i18n/i18n';
import { MODEL_CHOICES } from '../llm/claude';
import type { Settings, ThemePref } from '../settings';
import { h } from './dom';

/** Modal settings dialog. `onSave` receives the edited copy. */
export function openSettingsDialog(current: Settings, onSave: (s: Settings) => void) {
  const s: Settings = { ...current };
  const dlg = h('dialog', { class: 'settings-dialog' });

  const depthOut = h('output', { class: 'depth-out' }, String(s.depth));
  const depth = h('input', {
    type: 'range',
    min: String(CONFIG.depth.min),
    max: String(CONFIG.depth.max),
    step: '1',
    value: String(s.depth),
    id: 'set-depth',
  });
  depth.addEventListener('input', () => {
    s.depth = Number(depth.value);
    depthOut.textContent = depth.value;
  });

  const lang = h('select', { id: 'set-lang' }, h('option', { value: 'ru' }, 'Русский'), h('option', { value: 'en' }, 'English'));
  lang.value = s.lang;
  lang.addEventListener('change', () => (s.lang = lang.value as Settings['lang']));

  const theme = h(
    'select',
    { id: 'set-theme' },
    h('option', { value: 'system' }, t('themeSystem')),
    h('option', { value: 'light' }, t('themeLight')),
    h('option', { value: 'dark' }, t('themeDark')),
  );
  theme.value = s.theme;
  theme.addEventListener('change', () => (s.theme = theme.value as ThemePref));

  const key = h('input', { type: 'password', id: 'set-key', autocomplete: 'off', placeholder: 'sk-ant-…', spellcheck: false });
  key.value = s.apiKey;
  key.addEventListener('input', () => (s.apiKey = key.value.trim()));

  const model = h('input', { type: 'text', id: 'set-model', list: 'model-list', spellcheck: false });
  model.value = s.model;
  model.addEventListener('input', () => (s.model = model.value.trim()));
  const models = h('datalist', { id: 'model-list' }, MODEL_CHOICES.map((m) => h('option', { value: m })));

  const cacheMsg = h('span', { class: 'muted small' });
  const field = (label: string, forId: string, control: HTMLElement, hint?: string) =>
    h('div', { class: 'field' }, h('label', { for: forId }, label), control, hint ? h('p', { class: 'muted small' }, hint) : null);

  dlg.append(
    h(
      'form',
      { method: 'dialog', class: 'settings-form' },
      h('h2', null, t('settingsTitle')),
      field(t('language'), 'set-lang', lang),
      field(t('theme'), 'set-theme', theme),
      field(t('depth'), 'set-depth', h('div', { class: 'range-row' }, depth, depthOut), t('depthHint')),
      field(t('apiKey'), 'set-key', key, t('apiKeyHint')),
      field(t('model'), 'set-model', h('div', null, model, models)),
      h(
        'div',
        { class: 'field' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            on: {
              click: async () => {
                await clearCache();
                cacheMsg.textContent = t('cacheCleared');
              },
            },
          },
          t('clearCache'),
        ),
        ' ',
        cacheMsg,
      ),
      h(
        'div',
        { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn', on: { click: () => dlg.close() } }, t('close')),
        h(
          'button',
          {
            type: 'submit',
            class: 'btn btn-primary',
            on: {
              click: () => {
                if (!s.model) s.model = current.model;
                onSave(s);
              },
            },
          },
          t('save'),
        ),
      ),
    ),
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}
