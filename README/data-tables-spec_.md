# Data Tables — спецификация для workflow `tg-ai-multipost`

В n8n должны быть созданы **четыре** Data Tables. Они хранят бизнес-настройки (URL парсера, ID папки Drive, список каналов, промпты, историю запусков) и **не заменяют** Credentials. Реальные API-ключи Telegram, Google, OpenRouter и Meta живут в стандартных n8n Credentials.

Все таблицы создаются один раз через UI: **Settings → Data tables → New**. После создания добавляются нужные колонки, затем строки.

## Соглашения

- Имена таблиц и колонок — латиница, snake_case. Это требование `AGENTS.md` и упрощает выражения в нодах.
- Тип `string` означает обычный текстовый столбец, `bool` — boolean, `number` — числовой.
- Все «ключевые» столбцы (`key`, `run_id`) — string и должны быть уникальны в пределах таблицы. n8n не принуждает уникальность на уровне БД, но workflow рассчитывает на это.

## 1. `wf_settings` — глобальные настройки

Хранилище ключ-значение для всех настроек, которые могут меняться без редактирования workflow.

| Колонка | Тип    | Описание |
| ------- | ------ | -------- |
| `key`   | string | Уникальный ключ настройки. |
| `value` | string | Значение. Хранится как строка; для bool используются `true`/`false`, для чисел — десятичная запись. |
| `note`  | string | Комментарий, для людей. |

Стартовый набор строк:

| key                     | value                                                                 | note |
| ----------------------- | --------------------------------------------------------------------- | ---- |
| `parser_url`            | `https://<your-parser>.onrender.com`                                  | Базовый URL parser-сервиса на Render. Без trailing slash. |
| `parser_token`          | пусто или `<random_string>`                                           | Токен для header `X-Parser-Token`. Должен совпадать с `PARSER_TOKEN` на Render. |
| `gdrive_folder_id`      | `0AB...XYZ`                                                           | ID папки Google Drive, в которой workflow создаёт и ищет Sheets-файлы по каналам. |
| `default_post_limit`    | `10`                                                                  | Сколько последних постов запрашивать у parser, если у канала не задан собственный лимит. |
| `report_chat_id`        | `-1001234567890`                                                      | Chat ID закрытой Telegram-группы для отчёта. Бот должен быть добавлен в группу. |
| `publish_telegram`      | `true`                                                                | Глобальный мастер-выключатель публикации в Telegram. |
| `publish_facebook`      | `true`                                                                | Мастер-выключатель Facebook. |
| `publish_instagram`     | `true`                                                                | Мастер-выключатель Instagram. |
| `ai_model`              | `openai/gpt-4o-mini`                                                  | Имя модели в OpenRouter. Передаётся в `lmChatOpenRouter`. |
| `ai_fallback_to_source` | `false`                                                               | Если `true`, при ошибке AI workflow публикует исходный текст. По умолчанию `false`. |
| `caption_long_mode`     | `split`                                                               | `split` — длинная подпись уходит отдельным сообщением; `truncate` — обрезается до лимита Telegram. |
| `reprocess_failed`      | `false`                                                               | `true` — повторно обрабатывать посты со статусом `failed`/`processing` из Sheets. По умолчанию `false`. |
| `instagram_poll_max`    | `12`                                                                  | Максимум попыток опроса Instagram media container до признания неудачи. |
| `instagram_poll_delay`  | `5`                                                                   | Задержка между опросами Instagram media container, секунды. |
cloudinary_cloud_name        dn3b8ezpw             Cloudinary cloud name для загрузки Instagram-видео
cloudinary_upload_preset     n8n_instagram_video     Unsigned upload preset Cloudinary для Instagram-видео
cloudinary_folder            n8n/instagram           Папка Cloudinary для видео, загруженных из n8n
publish_vk					false					Мастер-выключатель VK. |

## 2. `wf_channels` — каналы-источники

Каждая строка описывает один публичный Telegram-канал, который workflow обрабатывает.

| Колонка          | Тип    | Описание |
| ---------------- | ------ | -------- |
| `key`            | string | Уникальный slug канала (например `cnn_news`). Используется в имени Sheets-файла и логах. |
| `url`            | string | URL канала, например `https://t.me/cnn`. Парсер сам нормализует. |
| `active`         | bool   | `true` — канал участвует в запуске; `false` — workflow его пропускает. |
| `post_limit`     | number | Сколько последних постов брать у этого канала. Если пусто — берётся `wf_settings.default_post_limit`. |
| `target_tg_chat` | string | Chat ID целевого Telegram-канала для публикации (с минусом для каналов/супергрупп). |
| `fb_page_id`     | string | ID Facebook Page для публикации. Пусто = пропустить FB для этого канала. |
| `ig_business_id` | string | Instagram Business Account ID, привязанный к той же Page. Пусто = пропустить IG. |
| `prompt_key`     | string | Ключ из `wf_prompts`. Пусто = используется промпт `default`. |
| `note`           | string | Комментарий для людей. |

Пример строки:

```text
key             = "tech_news"
url             = "https://t.me/durov"
active          = true
post_limit      = 5
target_tg_chat  = "-1001111111111"
fb_page_id      = "100000000000000"
ig_business_id  = "17841400000000000"
prompt_key      = "tech_neutral"
note            = "Канал Дурова — основной источник новостей про мессенджер"
```

## 3. `wf_prompts` — промпты для AI-рерайта

| Колонка         | Тип    | Описание |
| --------------- | ------ | -------- |
| `key`           | string | Уникальный ключ промпта. Канал ссылается на него через `wf_channels.prompt_key`. |
| `system_prompt` | string | System message для AI Agent. Описывает роль, стиль, запреты. |
| `user_template` | string | Шаблон user message с плейсхолдерами `{{source_text}}`, `{{channel_name}}`, `{{post_url}}`, `{{date}}`, `{{media_type}}`. |
| `note`          | string | Комментарий. |

Минимальный обязательный набор: одна строка с `key = "default"`.

Пример строки:

```text
key = "default"

system_prompt = """
Ты — редактор новостной ленты.
Твоя задача — переписать пост так, чтобы он не был похож на оригинал, но сохранил все факты, даты, имена, числа, места и смысл.
Правила:
- НЕ выдумывать новые факты, даты, имена, цифры или цитаты.
- НЕ добавлять ссылки, которых не было в оригинале.
- НЕ упоминать "источник", "Telegram", "t.me" и подобные служебные ссылки.
- НЕ превращать пост в рекламу, если оригинал не был рекламным.
- Сохранять язык оригинала (если оригинал на русском — отвечай на русском).
- Подпись для Instagram — короче (до 1500 знаков), в конце 3-7 уместных хэштегов.
- Если в исходном тексте нет смысловой нагрузки или это спам — верни пустой rewritten_text и заполни warnings.
Ответ строго в JSON по предоставленной схеме.
"""

user_template = """
Канал: {{channel_name}}
Дата: {{date}}
Тип медиа: {{media_type}}
Ссылка на оригинал: {{post_url}}

Исходный текст:
\"\"\"
{{source_text}}
\"\"\"
"""

note = "Дефолтный нейтральный рерайт."
```

В workflow expressions это будет выглядеть так:

```text
={{ $node["3 Load wf_prompts"].json.find(p => p.key === ($json.prompt_key || "default")).system_prompt }}
```

## 4. `wf_runs` — история запусков

| Колонка           | Тип    | Описание |
| ----------------- | ------ | -------- |
| `run_id`          | string | UUID запуска. Workflow сам генерит при старте. |
| `started_at`      | string | ISO-8601 время начала. |
| `finished_at`     | string | ISO-8601 время окончания. На промежуточном этапе — пусто. |
| `status`          | string | `running` / `success` / `partial` / `failed`. |
| `channels_total`  | number | Сколько активных каналов было в запуске. |
| `posts_fetched`   | number | Сколько постов вернул parser суммарно. |
| `duplicates`      | number | Сколько постов отфильтровано как дубли. |
| `posts_new`       | number | Сколько новых постов пошло в обработку. |
| `success`         | number | Сколько постов опубликовано во всех включённых площадках. |
| `partial`         | number | Сколько опубликовано не на всех площадках. |
| `failed`          | number | Сколько упало с ошибкой. |
| `report_text`     | string | Готовый текст отчёта, который ушёл в Telegram-группу. |

Workflow вставляет строку при старте (`status=running`, прочие counter — пусто/0) и обновляет её в самом конце.

## Шаблон Google Sheets для каналов

Каждый Sheets-файл создаётся **на канал** в папке `gdrive_folder_id`. Имя файла — `tg-<channel_key>` (без расширения, потому что это нативный Google Sheet, а не загруженный xlsx). На первом листе `posts` шапка:

| Колонка             | Описание |
| ------------------- | -------- |
| `created_at`        | Время резервирования строки (ISO-8601). |
| `updated_at`        | Время последнего обновления строки. |
| `run_id`            | UUID запуска, в котором пост обработался впервые. |
| `channel_key`       | `wf_channels.key`. |
| `post_uid`          | Стабильный ключ `${channel}_${id}` от parser. **Главный ключ дедупликации**. |
| `post_id`           | Числовой ID поста в канале. |
| `post_url`          | Ссылка на исходный пост в `t.me`. |
| `post_date`         | Дата исходного поста. |
| `views`             | Количество просмотров на момент парсинга. |
| `source_text`       | Исходный текст. |
| `source_text_hash`  | SHA-1/SHA-256 от source_text — на случай, если канал отредактирует пост. |
| `media_type`        | `photo` / `video` / `none`. |
| `photo_url`         | Прямой URL фото (временный!). |
| `video_url`         | Прямой URL видео (временный!). |
| `rewritten_text`    | Результат AI. |
| `instagram_caption` | Версия для IG, обычно короче. |
| `tg_status`         | `success` / `failed` / `skipped`. |
| `tg_result`         | message_id или текст ошибки. |
| `fb_status`         | `success` / `failed` / `skipped`. |
| `fb_result`         | post_id или текст ошибки. |
| `ig_status`         | `success` / `failed` / `skipped`. |
| `ig_result`         | media_id или текст ошибки. |
| `overall_status`    | Итоговый статус: `success` / `partial` / `failed` / `processing`. |
| `error_message`     | Краткое описание основной ошибки, если была. |
| `source_json`       | Полный JSON поста от parser (для аудита). |
| `result_json`       | JSON со всеми ответами площадок. |

Workflow создаёт лист и записывает шапку автоматически при первой обработке нового канала — руками заводить колонки не нужно.

## Чек-лист первичной настройки

1. Создать Data Table `wf_settings`, добавить колонки `key`, `value`, `note`, заполнить минимум `parser_url`, `gdrive_folder_id`, `report_chat_id`, `default_post_limit`, `ai_model`.
2. Создать Data Table `wf_channels`, добавить все колонки выше, добавить минимум 1 строку с `active=true`.
3. Создать Data Table `wf_prompts`, добавить колонки и обязательную строку `key=default`.
4. Создать Data Table `wf_runs`, добавить колонки. Стартовых строк не нужно.
5. Подключить Credentials в n8n: `telegramApi`, `googleDriveOAuth2Api`, `googleSheetsOAuth2Api`, `openRouterApi`, `facebookGraphApi`.
6. Импортировать `workflows/bundles/tg-ai-multipost.json` и привязать каждый узел к нужному credential. Имена credentials в JSON — placeholder, n8n при импорте предложит выбрать существующий.
7. Запустить workflow вручную (Execute Workflow) и проверить отчёт в Telegram-группе.
