# Data Tables — спецификация для `tg-ai-multipost_vk`

Краткая спецификация таблиц n8n Data Tables для текущего workflow с Telegram / Facebook / Instagram / VK.

Создание:

```text
n8n → Data Tables → New Table → добавить поля
```

Служебные поля n8n `id`, `createdAt`, `updatedAt` вручную не создавать.

---

## 0. Таблицы

| Таблица | Назначение |
|---------|------------|
| `wf_settings` | Глобальные настройки |
| `wf_channels` | Каналы-источники и целевые площадки |
| `wf_meta_tokens` | Meta и VK токены по ключам |
| `wf_prompts` | Промпты AI |
| `wf_runs` | История запусков |

---

## 1. `wf_settings`

### Поля

| Поле | Тип | Пример | Описание |
|------|-----|--------|----------|
| `key` | string | `parser_url` | Ключ |
| `value` | string | `https://tg-public-channel-parser.onrender.com` | Значение |
| `note` | string | `Базовый URL parser-сервиса` | Комментарий |

### Основные строки

| key | пример value | назначение |
|-----|--------------|------------|
| `parser_url` | `https://tg-public-channel-parser.onrender.com` | URL parser-сервиса |
| `parser_token` | пусто / `<token>` | Токен parser-сервиса |
| `gdrive_folder_id` | `1QTK...` | Папка Google Drive для Sheets |
| `default_post_limit` | `3` | Лимит постов по умолчанию |
| `report_chat_id` | `-1003737019955` | TG-группа для отчёта |
| `publish_telegram` | `true` | Включить TG |
| `publish_facebook` | `true` | Включить FB |
| `publish_instagram` | `true` | Включить IG |
| `publish_vk` | `true` / `false` | Включить VK |
| `ai_model` | `openai/gpt-4o-mini` | Модель OpenRouter |
| `ai_fallback_to_source` | `false` | Публиковать исходник при сбое AI |
| `caption_long_mode` | `split` | Режим длинных TG-подписей |
| `reprocess_failed` | `false` | Повторять failed |
| `instagram_poll_max` | `20` | Кол-во проверок IG container |
| `instagram_poll_delay` | `90` | Пауза IG polling, сек |
| `cloudinary_cloud_name` | `dn3b8ezpw` | Cloudinary cloud name |
| `cloudinary_upload_preset` | `n8n_instagram_video` | Unsigned preset |
| `cloudinary_folder` | `n8n/instagram` | Папка Cloudinary |

---

## 2. `wf_channels`

Одна строка = один Telegram-канал.

### Поля

| Поле | Тип | Пример | Описание |
|------|-----|--------|----------|
| `key` | string | `bg_dnevnik` | Уникальный ключ канала |
| `url` | string | `https://t.me/bg_dnevnik` | Источник |
| `active` | boolean | `true` | Обрабатывать канал |
| `post_limit` | number | `3` | Сколько постов брать |
| `target_tg_chat` | string | `-1003530642392` | Куда публиковать в TG |
| `fb_page_id` | string | `710790195660970` | Facebook Page ID |
| `ig_business_id` | string | `17841401208724248` | Instagram Business ID |
| `vk_owner_id` | string | `-133674721` | VK owner_id группы с минусом |
| `meta_token_key` | string | `bginfo` | Ключ Meta-токена |
| `vk_token_key` | string | `vk_bginfo` | Ключ VK-токена |
| `prompt_key` | string | `default` | Ключ промпта |
| `rewrite_lang` | string | `RU` | Язык рерайта |
| `note` | string | `Новости Болгарии` | Комментарий |

### Пример строки

```text
key:             bg_dnevnik
url:             https://t.me/bg_dnevnik
active:          true
post_limit:      3

target_tg_chat:  -1003530642392
fb_page_id:      710790195660970
ig_business_id:  17841401208724248

vk_owner_id:     -133674721
meta_token_key:  bginfo
vk_token_key:    vk_bginfo

prompt_key:      default
rewrite_lang:    RU
note:            Информационный канал
```

---

## 3. `wf_meta_tokens`

Хранит токены, на которые ссылается `wf_channels`.

### Поля

| Поле | Тип | Пример | Описание |
|------|-----|--------|----------|
| `key` | string | `vk_bginfo` | Ключ токена |
| `page_name` | string | `VK BG Info` | Понятное имя |
| `access_token` | string | `vk1.a...` | Токен |

### Примеры строк

| key | page_name | тип |
|-----|-----------|-----|
| `centerai` | `AI center` | Meta Page token |
| `bginfo` | `BGINFOSU` | Meta Page token |
| `vk_bginfo` | `VK BG Info` | VK long-lived user token |

Правила:

```text
Meta: в access_token хранится Page Access Token.
VK: в access_token хранится long-lived user token с expires_in=0.
```

Токены не публиковать в Markdown, GitHub, скриншотах и чатах.

---

## 4. `wf_prompts`

### Поля

| Поле | Тип | Пример | Описание |
|------|-----|--------|----------|
| `key` | string | `default` | Ключ промпта |
| `system_prompt` | string | большой текст | Системная инструкция |
| `user_template` | string | шаблон | User prompt с плейсхолдерами |
| `note` | string | `Дефолтный рерайт` | Комментарий |

### Обязательная строка

```text
key = default
```

### Минимальный `user_template`

```text
Канал: {{channel_name}}
Дата: {{date}}
Тип медиа: {{media_type}}
Ссылка на оригинал: {{post_url}}

Исходный текст:
"""
{{source_text}}
"""
```

### Ожидаемый JSON от AI

```json
{
  "rewritten_text": "",
  "telegram_html": "",
  "facebook_text": "",
  "instagram_caption": "",
  "is_ad": false,
  "skip_post": false,
  "skip_reason": "",
  "warnings": []
}
```

---

## 5. `wf_runs`

Workflow сам пишет сюда историю запусков.

### Поля

| Поле | Тип | Пример |
|------|-----|--------|
| `run_id` | string | `1810-1778073900370` |
| `started_at` | string | `2026-05-06T13:25:00.371Z` |
| `finished_at` | string | `2026-05-06T13:26:10.000Z` |
| `status` | string | `success` / `partial` / `failed` |
| `channels_total` | number | `5` |
| `posts_fetched` | number | `15` |
| `duplicates` | number | `10` |
| `posts_new` | number | `5` |
| `success` | number | `4` |
| `partial` | number | `1` |
| `failed` | number | `0` |
| `report_text` | string | HTML-отчёт |

Стартовые строки руками не нужны.

---

## 6. Google Sheets history

Это не Data Table n8n.

Файл на каждый канал:

```text
tg-<channel_key>
```

Лист:

```text
posts
```

### Шапка листа

Диапазон:

```text
posts!A1:AB1
```

| № | Колонка |
|---|---------|
| 1 | `created_at` |
| 2 | `updated_at` |
| 3 | `run_id` |
| 4 | `channel_key` |
| 5 | `post_uid` |
| 6 | `post_id` |
| 7 | `post_url` |
| 8 | `post_date` |
| 9 | `views` |
| 10 | `source_text` |
| 11 | `source_text_hash` |
| 12 | `media_type` |
| 13 | `photo_url` |
| 14 | `video_url` |
| 15 | `rewritten_text` |
| 16 | `instagram_caption` |
| 17 | `tg_status` |
| 18 | `tg_result` |
| 19 | `fb_status` |
| 20 | `fb_result` |
| 21 | `ig_status` |
| 22 | `ig_result` |
| 23 | `overall_status` |
| 24 | `error_message` |
| 25 | `source_json` |
| 26 | `vk_status` |
| 27 | `vk_result` |
| 28 | `result_json` |

Append range должен быть:

```text
posts!A:AB:append
```

---

## 7. Минимум для VK

### `wf_settings`

```text
publish_vk = true
```

### `wf_meta_tokens`

```text
key          = vk_bginfo
page_name    = VK BG Info
access_token = long-lived user token
```

### `wf_channels`

```text
vk_owner_id  = -133674721
vk_token_key = vk_bginfo
```

Важно:

```text
vk_owner_id = ID группы с минусом.
```

---

## 8. Проверка перед запуском

- [ ] Созданы все 5 Data Tables.
- [ ] В `wf_channels` есть `rewrite_lang`.
- [ ] В `wf_meta_tokens` есть Meta-токены и `vk_bginfo`.
- [ ] В `wf_settings` заполнены `parser_url`, `gdrive_folder_id`, `report_chat_id`.
- [ ] В `wf_settings` выставлены нужные `publish_*`.
- [ ] В Google Sheets используется `A:AB`, а не `A:Z`.
- [ ] VK token проверен через `photos.getWallUploadServer` и `wall.post`.
