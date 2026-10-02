# tg-ai-multipost_vk

Краткий README для комплекта `tg-ai-multipost_vk`.

Workflow берёт последние посты из публичных Telegram-каналов, проверяет дубли через Google Sheets, переписывает текст через OpenRouter и публикует результат в:

```text
Telegram → Facebook Page → Instagram → VK
```

VK-ветка в актуальном workflow **есть**: используются `publish_vk`, `vk_owner_id`, `vk_token_key`, `vk_access_token`, `vk_status`, `vk_result`, а также VK API-методы для фото, видео и текстовых постов.

---

## 1. Файлы комплекта

| Файл | Для чего |
|------|----------|
| `tg-ai-multipost_vk.json` | Основной n8n workflow для импорта |
| `tg-ai-multipost_vk.md` | Описание архитектуры workflow |
| `data-tables-spec.md` | Спецификация Data Tables и Google Sheets |
| `server.js` | Parser-сервис публичных Telegram-каналов |
| `package.json` | Зависимости parser-сервиса |
| `meta_facebook_instagram_n8n_setup.md` | Настройка Meta / Facebook / Instagram |
| `cloudinary_n8n_settings_guide.md` | Настройка Cloudinary для Instagram-видео |
| `VK_N8N_WORKING_TOKEN_AND_TABLES_GUIDE.md` | Настройка VK: ID, owner_id, long-lived user token |
| `README.md` | Этот краткий входной файл |

---

## 2. Общая схема

```text
Schedule Trigger
→ загрузка wf_settings / wf_meta_tokens / wf_prompts / wf_channels
→ цикл по активным Telegram-каналам
→ parser-сервис /posts
→ Google Sheets dedupe по post_uid
→ AI rewrite через OpenRouter
→ Telegram
→ Facebook
→ Instagram
→ VK
→ Google Sheets result
→ Telegram report
```

---

## 3. Быстрый порядок запуска

### Шаг 1. Запустить parser-сервис

Parser нужен для чтения публичных Telegram-каналов.

Файлы:

```text
server.js
package.json
```

Локально:

```bash
npm install
npm start
```

Проверка:

```bash
curl "http://localhost:3000/health"
curl "http://localhost:3000/posts?channel=durov&limit=3"
```

На Render:

```text
New Web Service
Build Command: npm install
Start Command: npm start
Health Check Path: /health
```

URL Render записать в:

```text
wf_settings.parser_url
```

Если используешь защиту:

```text
Render env: PARSER_TOKEN
n8n: wf_settings.parser_token
```

---

### Шаг 2. Создать Data Tables в n8n

Создать 5 таблиц:

```text
wf_settings
wf_channels
wf_meta_tokens
wf_prompts
wf_runs
```

Поля и примеры строк: см. `data-tables-spec.md`.

Особенно проверить:

```text
wf_channels.rewrite_lang
wf_channels.vk_owner_id
wf_channels.vk_token_key
wf_meta_tokens.vk_bginfo
wf_settings.publish_vk
```

---

### Шаг 3. Подготовить credentials

В n8n должны быть credentials:

| Credential | Для чего |
|------------|----------|
| Telegram API | Публикация в TG и отчёт |
| Google Drive OAuth2 | Поиск / перемещение Sheets |
| Google Sheets OAuth2 | Создание / чтение / запись Sheets |
| OpenRouter API | AI rewrite |
| Facebook Graph API | Instagram Graph API nodes |

Meta Page tokens и VK token хранятся в:

```text
wf_meta_tokens.access_token
```

---

### Шаг 4. Настроить Meta / Instagram

Подробно:

```text
meta_facebook_instagram_n8n_setup.md
```

В таблицах нужны:

```text
wf_channels.fb_page_id
wf_channels.ig_business_id
wf_channels.meta_token_key
wf_meta_tokens.access_token
```

---

### Шаг 5. Настроить Cloudinary

Подробно:

```text
cloudinary_n8n_settings_guide.md
```

В `wf_settings` нужны:

```text
cloudinary_cloud_name
cloudinary_upload_preset
cloudinary_folder
```

Cloudinary используется для стабильных URL фото/видео в Instagram.

---

### Шаг 6. Настроить VK

Подробно:

```text
VK_N8N_WORKING_TOKEN_AND_TABLES_GUIDE.md
```

Минимум:

```text
wf_settings.publish_vk = true

wf_meta_tokens:
key = vk_bginfo
page_name = VK BG Info
access_token = long-lived user token, expires_in=0

wf_channels:
vk_owner_id = -ID_ГРУППЫ
vk_token_key = vk_bginfo
```

Важно:

```text
Для VK нужен user access token.
Community / group token для медиа не использовать.
```

---

### Шаг 7. Импортировать workflow

В n8n:

```text
Workflows → Import from File → tg-ai-multipost_vk.json
```

После импорта проверить:

```text
1. credentials во всех Telegram / Google / OpenRouter / Facebook nodes;
2. Data Table nodes видят правильные таблицы;
3. 2.0.0 Load wf_meta_tokens смотрит на wf_meta_tokens;
4. 10.1 Update sheet row пишет в диапазон posts!A:AB.
```

Если в `10.1 Update sheet row` стоит:

```text
posts!A:Z:append
```

заменить на:

```text
posts!A:AB:append
```

Потому что текущая шапка и тело строки содержат 28 колонок, включая:

```text
vk_status
vk_result
```

---

## 4. Первый тест

Для первого прогона лучше оставить один канал и одну площадку.

В `wf_settings`:

```text
publish_telegram = true
publish_facebook = false
publish_instagram = false
publish_vk = false
```

В `wf_channels`:

```text
active = true только у одного тестового канала
post_limit = 1
target_tg_chat = тестовый Telegram-канал / группа
rewrite_lang = RU
```

Запуск:

```text
Open workflow → Execute Workflow
```

Проверить ноды:

```text
4.3 Fetch posts from parser
4.5 Filter and sort new posts
6.1 Sanitize AI text
7.1.5 TG status
10.1 Update sheet row
12 Send Telegram report
```

---

## 5. Полный тест

После успешного TG-теста включать площадки по одной:

```text
publish_facebook = true
publish_instagram = true
publish_vk = true
```

Проверить по веткам:

```text
8.1.5 FB status
9.1.6 IG status
10.1.5 VK status
10 Compute overall status
10.1 Update sheet row
```

Успех по VK:

```text
vk_status = success
vk_result = post_id: ...
```

---

## 6. Быстрая диагностика

| Проблема | Где смотреть | Что проверить |
|----------|--------------|---------------|
| Parser 401 | `4.3 Fetch posts from parser` | `parser_token` совпадает с `PARSER_TOKEN` |
| Нет новых постов | `4.5 Filter and sort new posts` | `post_uid` уже есть в Google Sheets |
| TG не публикует | `7.1.*` | бот добавлен в канал и имеет права |
| FB permissions | `8.1.*` | `fb_page_id`, `meta_token_key`, Page token |
| IG не готов | `9.1.*` | `instagram_poll_max`, `instagram_poll_delay`, Cloudinary URL |
| VK skipped | `10.1.0 VK enabled?` | `publish_vk`, `vk_owner_id`, `vk_access_token` |
| VK error 27 | VK photo upload | используется group/community token вместо user token |
| Sheets не пишет VK | `10.1 Update sheet row` | диапазон должен быть `posts!A:AB:append` |

---

## 7. Безопасность

Не хранить в GitHub, Markdown, скриншотах и чатах:

```text
Telegram bot token
OpenRouter API key
Facebook Page Access Token
VK user access token
Cloudinary API Secret
PARSER_TOKEN
```

Если токен попал в чат или на скриншот — перевыпустить.

---

## 8. Документы подробнее

| Тема | Файл |
|------|------|
| Архитектура workflow | `tg-ai-multipost_vk.md` |
| Data Tables | `data-tables-spec.md` |
| Parser | `server.js`, `package.json` |
| Meta / Facebook / Instagram | `meta_facebook_instagram_n8n_setup.md` |
| Cloudinary | `cloudinary_n8n_settings_guide.md` |
| VK | `VK_N8N_WORKING_TOKEN_AND_TABLES_GUIDE.md` |
