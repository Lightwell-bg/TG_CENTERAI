# TG_CENTERAI — AI-автопостинг из Telegram

n8n-workflow `tg-ai-multipost_vk`: каждые 25 минут забирает новые посты из публичных Telegram-каналов, переписывает их через AI (OpenRouter) и публикует в **Telegram → Facebook Page → Instagram → VK**. Дубли отсекаются через Google Sheets (по одной таблице на канал), итог запуска пишется в `wf_runs` и отправляется отчётом в Telegram.

```text
Schedule (25 мин)
→ настройки из n8n Data Tables (wf_settings / wf_meta_tokens / wf_prompts / wf_channels)
→ цикл по активным каналам
   → Google Sheet канала (найти или создать)
   → parser-сервис  GET /posts
   → отсев дублей по post_uid
   → цикл по новым постам (от старых к новым)
      → AI-рерайт (JSON: telegram_html / facebook_text / instagram_caption / skip_post)
      → Telegram → Facebook → Instagram → VK
      → общий статус → строка в Google Sheets
→ итоги запуска → wf_runs + Telegram-отчёт
```

Описание каждой ноды — в [`NODES.md`](NODES.md).

---

## Структура репозитория

| Путь | Что это |
|------|---------|
| `tg-ai-multipost_vk.json` | Workflow n8n (импортируется в n8n) |
| `NODES.md` | Краткое описание всех нод workflow |
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
| `instagram_poll_delay` | Пауза перед проверкой IG-видео (сек) |

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
4. **Импорт workflow** — n8n → *Workflows → Import from File* → `tg-ai-multipost_vk.json`. После импорта:
   - проставить credentials во всех Telegram / Google / OpenRouter / Facebook нодах;
   - в `2.0.0 Load wf_meta_tokens` заново выбрать таблицу `wf_meta_tokens` (она привязана по ID, а не по имени);
   - убедиться, что `10.1 Update sheet row` пишет в `posts!A:AB`.
5. **Первый тест** — один активный канал, `post_limit = 1`, включён только `publish_telegram`, *Execute Workflow*. Потом включать FB / IG / VK по одной.

Пошагово и с диагностикой: [`README/README.md`](README/README.md).

---

## Как обновить локально

### 1. Подтянуть изменения из GitHub

```bash
cd TG_CENTERAI                 # папка с клоном репозитория
git status                     # убедиться, что нет несохранённых правок
git fetch origin
git checkout main
git pull origin main
```

Если изменения лежат в отдельной ветке (например, `claude/...`) и ещё не слиты в `main` — влить её в локальный `main` и отправить на GitHub:

```bash
git checkout main
git pull origin main
git fetch origin <имя-ветки>
git merge origin/<имя-ветки>
git push origin main
```

Либо слить ветку через Pull Request на GitHub, а локально сделать `git pull origin main`.

### 2. Обновить workflow в n8n

Git сам по себе n8n не обновляет — JSON нужно импортировать заново.

1. В n8n открыть текущий workflow → *⋯ → Download* (резервная копия).
2. Деактивировать старый workflow (переключатель *Active*).
3. *Workflows → Import from File* → выбрать обновлённый `tg-ai-multipost_vk.json`.
4. Проверить credentials в нодах и таблицу в `2.0.0 Load wf_meta_tokens`.
5. Тестовый прогон (*Execute Workflow*), затем активировать новый и удалить/архивировать старый.

Если в обновлении менялись Data Tables (новые поля / ключи) — сначала добавить их в n8n по `README/data-tables-spec.md`.

### 3. Обновить parser-сервис

Локально:

```bash
cd parser-render-template
npm install                    # подтянуть зависимости, если менялся package.json
npm start
curl "http://localhost:3000/health"   # поле version должно совпадать с VERSION в server.js
```

На Render: закоммитить и запушить изменения в репозиторий, подключённый к Render-сервису (автодеплой), либо *Manual Deploy → Deploy latest commit*. После деплоя проверить `https://<service>.onrender.com/health`.

### 4. Отправить свои изменения

Если правили workflow в n8n — экспортировать его (*⋯ → Download*), заменить `tg-ai-multipost_vk.json` и закоммитить:

```bash
git add tg-ai-multipost_vk.json NODES.md
git commit -m "Обновлён workflow: <что изменилось>"
git push origin <ваша-ветка>
```

Перед коммитом убедиться, что в JSON нет токенов (credentials n8n в экспорт не попадают, но значения, вписанные прямо в ноды, — попадают).

---

## Безопасность

Не хранить в репозитории, Markdown, скриншотах и чатах: токен Telegram-бота, ключ OpenRouter, Facebook Page Access Token, VK user token, Cloudinary API Secret, `PARSER_TOKEN`. Все токены соцсетей живут в Data Table `wf_meta_tokens`, ключи API — в Credentials n8n. Если токен засветился — перевыпустить.
