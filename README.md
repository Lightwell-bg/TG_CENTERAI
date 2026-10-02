# TG_CENTERAI — AI-автопостинг из Telegram

n8n-workflow `tg-ai-multipost_vk` (актуальная версия — **v2**, `tg-ai-multipost_vk_v2.json`): каждые 25 минут забирает новые посты из публичных Telegram-каналов, переписывает их через AI (OpenRouter) и публикует в **Telegram → Facebook Page → Instagram → VK**. Дубли отсекаются через Google Sheets (по одной таблице на канал), итог запуска пишется в `wf_runs` и отправляется отчётом в Telegram.

```text
Schedule (25 мин)
→ настройки из n8n Data Tables (wf_settings / wf_meta_tokens / wf_prompts / wf_channels)
→ цикл по активным каналам
   → Google Sheet канала (найти или создать)
   → parser-сервис  GET /posts
   → отсев дублей по post_uid
   → цикл по новым постам (от старых к новым)
      → префильтр (слишком короткие посты — без AI)
      → AI-рерайт + оценка важности 1–10 (видео — мягче) + антиповтор тем
      → неважное / реклама / повтор → skipped
      → Telegram → Facebook → Instagram → VK
      → общий статус → строка в Google Sheets
→ итоги запуска → wf_runs + Telegram-отчёт
```

Описание каждой ноды — в [`NODES.md`](NODES.md).

---

## Структура репозитория

| Путь | Что это |
|------|---------|
| `tg-ai-multipost_vk_v2.json` | **Workflow n8n v2 — импортировать этот** |
| `tg-ai-multipost_vk.json` | Workflow v1 (предыдущая версия, для истории) |
| `tables/*.csv` | Экспорт Data Tables из n8n (`wf_settings`, `wf_channels`, `wf_prompts`, `wf_runs`, `wf_meta_tokens`) |
| `NODES.md` | Краткое описание всех нод workflow |
| `UPDATE.md` | Инструкция по обновлению (v1 → v2, таблицы, git, n8n) |
| `parser-render-template/` | Parser-сервис (Node.js/Express): читает `t.me/s/<канал>`, отдаёт посты в JSON |
| `parser-render-template/server.js` | Эндпоинты `/health`, `/posts`, `/tg-preview` |
| `README/README.md` | Пошаговый запуск и диагностика |
| `README/tg-ai-multipost_vk.md` | Архитектура workflow (mermaid-схема, ветки) |
| `README/data-tables-spec.md` | Data Tables: поля и примеры строк (актуальная версия) |
| `README/data-tables-spec_.md` | Старая версия спецификации (без VK) |
| `README/meta_facebook_instagram_n8n_setup.md` | Настройка Meta: Facebook Page, Instagram Business, токены |
| `README/cloudinary_n8n_settings_guide.md` | Cloudinary для медиа Instagram |
| `README/VK_N8N_WORKING_TOKEN_AND_TABLES_GUIDE.md` | VK: owner_id, long-lived user token |
| `AI_автопостинг_из_Telegram_для_Kwork.pdf` | Описание проекта для Kwork |

---

## Что нужно для работы

**Сервисы:** n8n (с Data Tables и LangChain-нодами), parser-сервис (Render.com или локально), Google Drive + Sheets, OpenRouter, Telegram-бот, Meta (Facebook Page + Instagram Business), Cloudinary, VK (user token).

**Credentials в n8n:** `telegramApi`, `googleDriveOAuth2Api`, `googleSheetsOAuth2Api`, `openRouterApi`, `facebookGraphApi`.

**Data Tables в n8n:** `wf_settings`, `wf_channels`, `wf_meta_tokens`, `wf_prompts`, `wf_runs` — поля в [`README/data-tables-spec.md`](README/data-tables-spec.md).

Главные ключи `wf_settings`:

| Ключ | Назначение |
|------|------------|
| `parser_url`, `parser_token` | Адрес parser-сервиса и его токен (`PARSER_TOKEN`) |
| `gdrive_folder_id` | Папка Drive, где лежат таблицы `tg-<channel_key>` |
| `report_chat_id` | Чат для отчёта о запуске |
| `publish_telegram` / `publish_facebook` / `publish_instagram` / `publish_vk` | Включение площадок |
| `ai_model` | Модель OpenRouter (по умолчанию `openai/gpt-4o-mini`) |
| `default_post_limit` | Сколько постов брать с канала (по умолчанию 10) |
| `cloudinary_cloud_name`, `cloudinary_upload_preset`, `cloudinary_folder` | Cloudinary для Instagram |
| `instagram_poll_delay`, `instagram_poll_max` | Пауза между проверками IG-контейнера (сек) и макс. число проверок. Рекомендуется `30` и `10` |
| `importance_min`, `importance_min_video`, … | v2: отбор по важности — все ключи и значения по умолчанию в [`NODES.md`](NODES.md#что-нового-в-v2) |

---

## Быстрый старт

1. **Parser-сервис**
   ```bash
   cd parser-render-template
   npm install
   npm start                      # http://localhost:3000
   curl "http://localhost:3000/health"
   curl "http://localhost:3000/posts?channel=durov&limit=3"
   ```
   В production — Render.com (Build `npm install`, Start `npm start`, Health `/health`, env `PARSER_TOKEN`). Подробно: [`parser-render-template/README.md`](parser-render-template/README.md).
2. **Data Tables** — создать 5 таблиц и заполнить (`README/data-tables-spec.md`).
3. **Credentials** — создать в n8n 5 credentials из списка выше.
4. **Импорт workflow** — n8n → *Workflows → Import from File* → `tg-ai-multipost_vk_v2.json`. После импорта:
   - проставить credentials во всех Telegram / Google / OpenRouter / Facebook нодах;
   - убедиться, что `10.1 Update sheet row` пишет в `posts!A:AB`.
5. **Первый тест** — один активный канал, `post_limit = 1`, включён только `publish_telegram`, *Execute Workflow*. Потом включать FB / IG / VK по одной.

Пошагово и с диагностикой: [`README/README.md`](README/README.md).

---

## Обновление

Пошаговая инструкция: **[`UPDATE.md`](UPDATE.md)** — git, что конкретно добавить в таблицы, импорт workflow, проверка, включение, откат.

Коротко, забрать изменения в локальный клон:

```bash
cd TG_CENTERAI
git checkout main
git pull origin main
```

После `git pull` workflow в n8n сам не обновляется — новый JSON импортируется вручную (см. `UPDATE.md`, шаг 3).

---

## Безопасность

Не хранить в репозитории, Markdown, скриншотах и чатах: токен Telegram-бота, ключ OpenRouter, Facebook Page Access Token, VK user token, Cloudinary API Secret, `PARSER_TOKEN`. Все токены соцсетей живут в Data Table `wf_meta_tokens`, ключи API — в Credentials n8n. Если токен засветился — перевыпустить. При экспорте `wf_meta_tokens` в `tables/` колонку `access_token` очищать перед коммитом.
