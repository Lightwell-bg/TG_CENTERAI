# tg-public-channel-parser — шаблон сервиса для Render.com

Минимальный read-only API для получения последних постов публичного Telegram-канала через `t.me/s`. Этот сервис — отдельный компонент основного n8n workflow `tg-ai-multipost`. Сам по себе ничего не публикует, не работает с Google, Meta или OpenRouter и не хранит токенов соцсетей.

Этот каталог — **шаблон**. Чтобы пользоваться им в production:

1. Скопируйте содержимое каталога в отдельный пустой Git-репозиторий (например, `tg-public-channel-parser`).
2. Запушьте его на GitHub.
3. Задеплойте репозиторий на Render.com как Web Service по инструкции ниже.
4. Положите получившийся public URL в Data Table `wf_settings.parser_url` в n8n.

## Эндпоинты

### `GET /health`

Проверка работоспособности. Всегда открыта (даже если включён `PARSER_TOKEN`), чтобы Render mог делать health-check.

```json
{ "ok": true, "version": "parser-v9-rich-links", "tokenProtected": false }
```

### `GET /posts?channel=<channel>&limit=<n>&before=<id>`

Возвращает последние посты канала.

Query params:

| Параметр  | Тип    | По умолчанию | Описание |
| --------- | ------ | ------------ | -------- |
| `channel` | string | —            | Обязательный. Канал в любом виде: `https://t.me/cnn`, `t.me/cnn`, `@cnn`, `cnn`. |
| `limit`   | int    | 20           | 1..100. Сколько последних постов вернуть. |
| `before`  | string | пусто        | Опционально, post id для пагинации (передаётся в `t.me/s/<channel>?before=...`). |
| `token`   | string | пусто        | Альтернатива header `X-Parser-Token`, см. ниже. |

Ответ:

```json
{
  "channel": "cnn",
  "count": 1,
  "posts": [
    {
      "id": 12345,
      "text": "Смотрите выступление Как рассказывать истории (https://www.youtube.com/watch?v=XXX) — обязательно.",
      "text_plain": "Смотрите выступление Как рассказывать истории (https://www.youtube.com/watch?v=XXX) — обязательно.",
      "text_html": "Смотрите выступление <a href=\"https://www.youtube.com/watch?v=XXX\">Как рассказывать истории</a> — обязательно.",
      "links": [
        {
          "text": "Как рассказывать истории",
          "url": "https://www.youtube.com/watch?v=XXX",
          "type": "external"
        }
      ],
      "views": 1024,
      "date": "2026-04-30T14:00:00+00:00",
      "author": "cnn",
      "photo_url": "https://cdn4.telesco.pe/file/...",
      "video_url": "",
      "post_url": "https://t.me/cnn/12345",
      "media_type": "photo",
      "post_uid": "cnn_12345"
    }
  ]
}
```

Поля `media_type` и `post_uid` рассчитываются на стороне парсера специально для дедупликации в n8n:

- `media_type` — `"video"` если есть `video_url`, иначе `"photo"` если есть `photo_url`, иначе `"none"`.
- Для **видео** без картинки в верстке канала парсер дополнительно запрашивает embed `?embed=1` и кладёт превью (`og:image`) в **`photo_url`**, чтобы n8n мог отправить картинку, если Bot API не скачивает MP4 по URL.
- `post_uid` — стабильный ключ `${channel}_${id}`, по которому workflow проверяет, обрабатывался ли пост раньше.

## Сохранение ссылок и форматирования

Начиная с `parser-v9-rich-links` каждый пост содержит три текстовых представления:

| Поле | Назначение |
|------|-----------|
| `text` | Основной текст для n8n/AI. Скрытые ссылки раскрыты в формате `Название (URL)`. Используйте это поле как `source_text` в AI-промпте. |
| `text_plain` | То же что `text`. Дублируется для явности. |
| `text_html` | HTML с кликабельными `<a href="">`, `<b>`, `<i>`, `<code>`. Передавайте в AI, если нужно сохранить форматирование. |
| `links` | Структурированный список всех ссылок из поста. |

### Формат элемента `links`

```json
{
  "text": "VoiceDash",
  "url": "https://voicedash.ai/",
  "type": "external"
}
```

- `type` = `"telegram"` если ссылка ведёт на `t.me` или `telegram.me`, иначе `"external"`.
- Дубли URL убраны, порядок соответствует порядку в посте.
- `t.me`-ссылки (на предыдущие выпуски, подборки, гайды) **не удаляются** — они попадают в `links` с `type: "telegram"`.

### Пример: пост со списком инструментов

`text` в ответе:

```
▪️VoiceDash (https://voicedash.ai/): преобразует речь в текст
▪️Flipbook (https://flipbook.page/): визуальные истории
▪️HyperFrames (https://github.com/heygen-com/hyperframes): GitHub-библиотека
```

`links` в ответе:

```json
[
  { "text": "VoiceDash", "url": "https://voicedash.ai/", "type": "external" },
  { "text": "Flipbook", "url": "https://flipbook.page/", "type": "external" },
  { "text": "HyperFrames", "url": "https://github.com/heygen-com/hyperframes", "type": "external" }
]
```

### Использование в n8n

- `source_text` в AI-промпте берите из `post.text` — ссылки уже внутри.
- Для передачи ссылок отдельным блоком в промпт используйте `post.links` (например, сериализуйте как `JSON.stringify(post.links)`).
- `text_html` удобен если AI-агент поддерживает HTML-ввод.

При ошибке возвращается `4xx`/`5xx` с понятным `{ "error": "...", "details": "..." }`. Это позволяет n8n включить ошибку в отчёт, но не валит весь запуск.

## Опциональная защита токеном

Если задана переменная окружения `PARSER_TOKEN`, любой запрос на `/posts` должен включать тот же токен:

- через header `X-Parser-Token: <value>`, либо
- через query `?token=<value>`.

Если значения нет или они не совпадают, парсер вернёт `401 Unauthorized`. Это полезно для production, чтобы случайные внешние запросы не нагружали Render-инстанс. В n8n этот же токен лежит в `wf_settings.parser_token` и подставляется в HTTP-узле.

`/health` намеренно остаётся открытым, чтобы Render и uptime-мониторинги работали без знания токена.

## Локальный запуск

```bash
npm install
npm start
# По умолчанию http://localhost:3000
curl "http://localhost:3000/health"
curl "http://localhost:3000/posts?channel=durov&limit=3"
```

При желании защитить локальный запуск — создайте `.env` (см. `.env.example`) и передайте переменные через `dotenv`/Render. В шаблоне намеренно нет dependency на `dotenv`, чтобы Render точно использовал свои переменные окружения, а не файл `.env`.

## Деплой на Render.com

1. Зарегистрируйтесь на [render.com](https://render.com/) и подключите свой GitHub-аккаунт.
2. Запушьте этот шаблон в собственный пустой репозиторий, например `https://github.com/<you>/tg-public-channel-parser`.
3. В Render выберите **New → Web Service** и подключите репозиторий.
4. Настройки:
   - **Environment**: `Node`
   - **Region**: ближайший
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: для MVP подходит `Free`. Учтите, что free-инстансы Render «засыпают» после простоя, и первый запрос может занять 30+ секунд — это нормально.
   - **Health Check Path**: `/health`
5. Environment variables (раздел **Environment** в настройках сервиса):
   - `PARSER_TOKEN` — рандомная строка (минимум 32 символа). Можно оставить пустым на этапе тестирования, тогда `/posts` будет открытым.
   - `PORT` пробрасывает Render сам, переопределять не нужно.
6. После первого деплоя Render выдаст public URL вида `https://<service>.onrender.com`. Проверьте:
   ```bash
   curl "https://<service>.onrender.com/health"
   curl "https://<service>.onrender.com/posts?channel=durov&limit=3" \
     -H "X-Parser-Token: <PARSER_TOKEN>"
   ```
7. Пропишите URL и токен в Data Table `wf_settings`:
   - ключ `parser_url` = `https://<service>.onrender.com`
   - ключ `parser_token` = значение `PARSER_TOKEN` (если используется)

## Render Blueprint (опционально)

Если хотите выкатить инфраструктуру одним кликом — положите рядом файл `render.yaml`:

```yaml
services:
  - type: web
    name: tg-public-channel-parser
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: PARSER_TOKEN
        sync: false
```

`sync: false` означает, что Render не будет хранить токен в blueprint и попросит ввести его руками при деплое.

## Ограничения

- Парсер работает только с **публичными** Telegram-каналами. Приватные каналы и каналы с capcha-проверкой не поддерживаются — это намеренное ограничение, потому что сервис не использует Bot API и не имеет авторизации.
- Telegram периодически меняет HTML-разметку `t.me/s`. Если разметка изменится, парсер начнёт возвращать пустые поля или 500 — обновите селекторы в `server.js`.
- Прямые URL медиа из Telegram **временные**. Для надёжной публикации используйте посты сразу после получения, не складывайте `photo_url`/`video_url` в долговременное хранилище без отдельной перекачки.
- Free-инстанс Render засыпает; если для вас важен первый-запросный latency — поставьте либо платный план, либо внешний uptime-monitor, который пингует `/health` раз в 5 минут.

## Связанные документы

- [`workflows/tg-ai-multipost.md`](../../workflows/bundles/tg-ai-multipost.md) — основной n8n workflow, который потребляет этот парсер.
- [`docs/parser-render-template/data-tables-spec.md`](./data-tables-spec.md) — схема `wf_settings`, `wf_channels`, `wf_prompts`, `wf_runs`, в т.ч. ключей `parser_url` и `parser_token`.
