# Обновление до v2 — пошагово

Порядок: **git → таблицы в n8n → workflow в n8n → проверка → включение**. Делать по шагам сверху вниз.

---

## Шаг 1. Забрать изменения в локальный клон

```bash
cd TG_CENTERAI
git checkout main
git pull origin main
git fetch origin claude/bold-brahmagupta-229rk3
git merge origin/claude/bold-brahmagupta-229rk3
git push origin main
```

После этого в папке есть `tg-ai-multipost_vk_v2.json` и этот файл.

---

## Шаг 2. Таблицы в n8n

Новые таблицы не нужны. Меняется только `wf_settings`, плюс чистка `wf_runs`.
`wf_channels`, `wf_prompts`, `wf_meta_tokens` — **не трогать**.

### 2.1. `wf_settings` — добавить 7 строк

n8n → **Data tables → `wf_settings` → Add row**, по одной строке:

| key | value | note |
|-----|-------|------|
| `importance_filter` | `true` | v2: отбор постов по важности и префильтр коротких постов |
| `importance_min` | `6` | v2: мин. оценка AI (1–10) для поста без видео |
| `importance_min_video` | `4` | v2: мин. оценка AI (1–10) для поста с видео |
| `min_text_length` | `80` | v2: мин. длина текста у поста без фото/видео |
| `min_text_length_media` | `20` | v2: мин. длина подписи у фото/видео |
| `topic_dedupe` | `true` | v2: не публиковать одну новость из разных каналов |
| `topic_dedupe_hours` | `48` | v2: сколько часов помнить опубликованные темы |

`key` и `value` писать точно как в таблице — маленькими буквами, без пробелов. Колонка `note` — просто комментарий.

### 2.2. `wf_settings` — изменить 2 строки

| key | было | стало |
|-----|------|-------|
| `instagram_poll_delay` | `90` | `30` |
| `instagram_poll_max` | `20` | `10` |

Полное содержимое `wf_settings` после шагов 2.1–2.2 — в файле [`tables/wf_settings.csv`](tables/wf_settings.csv).

### 2.3. `wf_runs` — удалить мусор

Удалить все строки, где `status` = `running`. Это висящие записи от v1 (больше 12 000 штук), v2 их больше не создаёт.

---

## Шаг 3. Workflow в n8n

1. Открыть старый workflow **`tg-ai-multipost_vk`** → выключить переключатель **Active** (вверху справа). Не удалять.
2. **Workflows → Add workflow → ⋯ (меню) → Import from File** → выбрать `tg-ai-multipost_vk_v2.json` → **Save**. Имя нового workflow: `tg-ai-multipost_vk v2`.
3. Открыть ноды с красным значком и выбрать в них существующие credentials:
   - Telegram: `7.1.2 TG send photo`, `7.1.2.2`, `7.1.3`, `7.1.3.3`, `7.1.3.4`, `7.1.3.6`, `7.1.4`, `12 Send Telegram report` → `Telegram API`;
   - Google Drive: `4.1 Find sheet in Drive`, `4.1.3 Move sheet to folder`;
   - Google Sheets: `4.1.2 Create spreadsheet`, `4.1.4 Write header row`, `4.4 Read existing post_uids`, `10.1 Update sheet row`;
   - OpenRouter: `6.0.1 OpenRouter Chat Model`;
   - Facebook Graph API: `9.1.1.1`, `9.1.1.2`, `9.1.3`, `9.1.5`.

   Если credentials в n8n по одному на тип — n8n обычно подставляет их сам, и красных значков нет.
4. Таблицы выбирать **не нужно**: все ноды Data Table привязаны к таблицам по имени (`wf_settings`, `wf_channels`, `wf_prompts`, `wf_meta_tokens`, `wf_runs`).
5. **Save**.

---

## Шаг 4. Проверочный запуск

1. В v2 нажать **Execute Workflow**.
2. Дождаться конца (с видео для Instagram — до ~10 минут на пост).
3. Проверить отчёт в Telegram-группе отчётов:
   - заголовок `tg-ai-multipost v2`;
   - блок **⏭ Пропущено** — у каждого поста причина: `low importance 3/10 (min 6): …`, `duplicate of recent topic: …`, `too short text-only post …`, `video without description …`;
   - блок **🔴 Ошибки** — ошибки по площадкам (TG / FB / IG / VK).
4. Проверить, что посты, которые прошли фильтр, появились в TG / FB / IG / VK.

Если что-то упало — открыть **Executions**, найти красную ноду, по её имени смотреть [`NODES.md`](NODES.md).

---

## Шаг 5. Включить

В v2 включить **Active**. Старый `tg-ai-multipost_vk` оставить выключенным; удалить через несколько дней, когда v2 работает стабильно.

Важно: **не держать оба workflow активными одновременно** — посты будут публиковаться дважды.

---

## Настройка фильтра в работе

Через неделю работы посмотреть в Google Sheets канала (`tg-<канал>`) столбец `result_json` → блок `importance` (оценка, порог, причина) и в отчётах — что пропущено:

| Ситуация | Что поменять в `wf_settings` |
|----------|------------------------------|
| Пропускаются нормальные посты | `importance_min` → `5` |
| Проходит мусор | `importance_min` → `7` |
| Видео пропускаются | `importance_min_video` → `3` |
| Проходят слабые видео | `importance_min_video` → `5` |
| Нужно отключить фильтр полностью | `importance_filter` → `false` |

Изменения в `wf_settings` действуют со следующего запуска, workflow трогать не нужно.

---

## Обновление parser-сервиса

В v2 parser не менялся. Если он изменится в будущем:

```bash
cd parser-render-template
npm install
npm start
curl "http://localhost:3000/health"
```

На Render — запушить изменения в репозиторий, подключённый к Render, или **Manual Deploy → Deploy latest commit**, затем проверить `https://<service>.onrender.com/health`.

---

## Откат на v1

1. В `tg-ai-multipost_vk v2` выключить **Active**.
2. В `tg-ai-multipost_vk` включить **Active**.

Таблицы совместимы в обе стороны: новые строки в `wf_settings` v1 просто не читает.
