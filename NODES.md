# Ноды workflow `tg-ai-multipost_vk`

Кратко: что делает каждая нода. Номер в имени ноды = этап (`1` старт, `2–3` настройки, `4` цикл каналов, `5–6` цикл постов и AI, `7` Telegram, `8` Facebook, `9` Instagram, `10` VK и запись результата, `11–12` итоги).

Всего 111 нод, из них 5 — заметки (sticky notes `0 README`, `0.1`–`0.4`), на логику не влияют.

---

## 1. Старт

| Нода | Тип | Что делает |
|------|-----|------------|
| `1 Schedule Trigger` | Schedule | Запускает workflow каждые 25 минут |
| `1.1 Init Run` | Set | Создаёт `run_id` (`<execution.id>-<ms>`) и `started_at` |
| `1.2 Reset run counters` | Code | Сбрасывает счётчики запуска в static data workflow (`channels`, `posts`) |

## 2–3. Настройки и каналы

| Нода | Тип | Что делает |
|------|-----|------------|
| `2 Load wf_settings` | Data Table | Читает все строки `wf_settings` (key/value) |
| `2.0.0 Load wf_meta_tokens` | Data Table | Читает токены Meta/VK из `wf_meta_tokens` (привязка по ID таблицы!) |
| `2.0.1 Settings to map` | Code | Собирает настройки в один объект, приводит типы (bool/number), ставит дефолты, добавляет `meta_tokens`, `run_id` |
| `2.1 Insert wf_runs row` | Data Table | Вставляет строку запуска в `wf_runs` со `status=running` |
| `2.2 Load wf_prompts` | Data Table | Читает промпты |
| `2.2.1 Prompts to map` | Code | Промпты → карта `{key: {system_prompt, user_template}}`; если нет `default` — подставляет встроенный |
| `3 Load wf_channels` | Data Table | Читает список каналов |
| `3.1 Filter active channels` | Code | Оставляет `active=true` с заполненным `url`; на каждый канал — элемент с настройками, промптом, `post_limit`, площадками, `meta_token_key`, `vk_owner_id`, `vk_token_key`, `rewrite_lang` |

## 4. Цикл по каналам

| Нода | Тип | Что делает |
|------|-----|------------|
| `4 SplitInBatches per channel` | Loop | Перебирает каналы по одному; когда каналы кончились — выход в `11 Aggregate run stats` |
| `4.1 Find sheet in Drive` | Google Drive | Ищет таблицу `tg-<channel_key>` в папке `gdrive_folder_id` |
| `4.1.1 Sheet found?` | If | Нашли таблицу → `4.1.5`, нет → `4.1.2` |
| `4.1.2 Create spreadsheet` | Google Sheets | Создаёт таблицу `tg-<channel_key>` с листом `posts` |
| `4.1.3 Move sheet to folder` | Google Drive | Переносит новую таблицу в папку `gdrive_folder_id` |
| `4.1.5 Use existing sheet` | Set | Берёт `spreadsheetId` найденной таблицы |
| `4.1.6 Resolve spreadsheetId` | Set | Единый `spreadsheetId` для обеих веток |
| `4.1.4 Write header row` | HTTP (Sheets API) | Перезаписывает шапку `posts!A1:AB1` (28 колонок) — выполняется при каждом запуске |
| `4.2 Channel context` | Set | Собирает полный контекст канала: `spreadsheetId`, настройки, промпт, токены FB/VK, флаги площадок |
| `4.3 Fetch posts from parser` | HTTP | `GET {parser_url}/posts?channel=…&limit=…`, заголовок `X-Parser-Token`; ошибки не роняют запуск |
| `4.4 Read existing post_uids` | Google Sheets | Читает все строки листа `posts` (для дедупликации) |
| `4.5 Filter and sort new posts` | Code | Отбрасывает посты, чей `post_uid` уже есть в таблице; нормализует поля и `media_type`; сортирует от старых к новым; пишет статистику канала в static data. Нет новых → один служебный элемент без `post_uid` |
| `4.6 Has post_uid?` | If | Есть посты → цикл постов; нет → следующий канал |

## 5–6. Цикл по постам и AI-рерайт

| Нода | Тип | Что делает |
|------|-----|------------|
| `5 SplitInBatches per post` | Loop | Перебирает новые посты; когда кончились — назад к `4` (следующий канал) |
| `5.1 Reserve row` | Set | Пустой проброс (бывшая резервация строки в Sheets, сейчас ничего не пишет) |
| `5.2 Build AI input` | Code | Подставляет в `user_template` `{{source_text}}`, `{{channel_name}}`, `{{post_url}}`, `{{date}}`, `{{media_type}}`; добавляет язык `rewrite_lang`, список ссылок и HTML оригинала → `ai_user_message` |
| `6 AI Agent rewrite` | AI Agent | Рерайт поста; system prompt из `wf_prompts` + жёсткое требование языка; ответ строго JSON |
| `6.0.1 OpenRouter Chat Model` | LLM | Модель `ai_model` через OpenRouter, `temperature 0.3`, `maxTokens 6000` |
| `6.1 Sanitize AI text` | Code | Разбирает JSON ответа AI, чистит текст (t.me-ссылки, «Источник», мусорные обёртки), режет Telegram-текст на подпись (1024) и «хвост», готовит тексты FB/IG, URL картинок/превью, флаги `ai_ok`, `skip_post`, `skip_reason` |
| `6.1.1 Skip ad/spam?` | If | `skip_post=true` (реклама/спам) → `6.1.2`, иначе → `6.2` |
| `6.1.2 Mark skipped ad` | Set | Ставит всем площадкам `skipped`, `overall_status=skipped` → сразу в `10` |
| `6.2 AI ok?` | If | AI отработал → публикация (`7.1`), нет → `6.3` |
| `6.3 Mark AI failed` | Set | Ставит всем площадкам `skipped` с текстом `AI failed: …` → в `10` |

## 7. Telegram

| Нода | Тип | Что делает |
|------|-----|------------|
| `7.1 TG enabled?` | If | `publish_telegram=true` и есть `target_tg_chat` → публикация, иначе → `7.1.6` |
| `7.1.1 TG media switch` | Switch | По `media_type`: photo / video / text (none и всё прочее → text) |
| `7.1.2.0 Download photo binary` | HTTP | Скачивает фото в бинарь |
| `7.1.2.00 Prepare TG photo text` | Code | Делит HTML на подпись (≤1024) и хвост по границе абзаца |
| `7.1.2 TG send photo` | Telegram | Отправляет фото с подписью |
| `7.1.2.1 TG photo has tail?` | If | Есть хвост → `7.1.2.2`, нет → статус |
| `7.1.2.2 TG send tail` | Telegram | Хвост текста ответом на сообщение с фото |
| `7.1.3.0 Download video binary` | HTTP | Скачивает видео в бинарь |
| `7.1.3 TG send video` | Telegram | Отправляет видео с подписью |
| `7.1.3.1 Video URL fetch failed?` | If | Ошибка отправки видео → фолбэк `7.1.3.2`, иначе → проверка хвоста |
| `7.1.3.2 TG fallback: parser thumb?` | If | Есть превью (`photo_url`) → отправить фото, иначе → только текст |
| `7.1.3.3.0 Download thumb binary` | HTTP | Скачивает превью видео |
| `7.1.3.3 TG fallback send photo (thumb)` | Telegram | Отправляет превью вместо видео |
| `7.1.3.5 Photo thumb sent?` | If | Превью не ушло (ошибка) → текст, ушло → статус |
| `7.1.3.4 TG fallback text only` | Telegram | Отправляет только текст (≤4096) |
| `7.1.3.5 TG video has tail?` | If | Есть хвост после видео → `7.1.3.6`, иначе → статус |
| `7.1.3.6 TG send video tail` | Telegram | Хвост текста ответом на видео |
| `7.1.4 TG send text` | Telegram | Текстовый пост (HTML, без превью ссылок) |
| `7.1.5 TG status` | Code | Формирует `tg_status` (success/failed) и `tg_result`; защищает от двойного учёта одного поста в рамках запуска |
| `7.1.6 TG skipped` | Set | `tg_status=skipped` («TG disabled or no target chat») |
| `7.1.7 Merge TG` | Merge | Сводит ветки TG → Facebook |

## 8. Facebook Page

| Нода | Тип | Что делает |
|------|-----|------------|
| `8.1 FB enabled?` | If | `publish_facebook=true`, есть `fb_page_id` и `fb_access_token` → публикация, иначе → `8.1.6` |
| `8.1.1 FB media switch` | Switch | photo / video / text |
| `8.1.2 FB post photo` | HTTP | `POST /{page}/photos` (фото по URL + подпись) |
| `8.1.2.9 Download FB video binary` | HTTP | Скачивает видео (результат дальше не используется — FB берёт видео по `file_url`) |
| `8.1.2.95 Fix FB video binary metadata` | Code | Проставляет имя/MIME `video/mp4` бинарю |
| `8.1.3 FB post video` | HTTP | `POST graph-video…/{page}/videos` с `file_url` и описанием (≤2000) |
| `8.1.4 FB post text` | HTTP | `POST /{page}/feed` — текстовый пост |
| `8.1.5 FB status` | Code | Формирует `fb_status` / `fb_result` (`post_id` или текст ошибки) |
| `8.1.6 FB skipped` | Set | `fb_status=skipped` |
| `8.1.7 Merge FB` | Merge | Сводит ветки FB → Instagram |

## 9. Instagram

| Нода | Тип | Что делает |
|------|-----|------------|
| `9.1 IG eligible?` | If | `publish_instagram=true`, есть `ig_business_id`, есть медиа → дальше, иначе → `9.1.8` |
| `9.0.9 IG fix fake video` | Code | Если `video_url` — это YouTube/Google Drive, а не файл, — переводит пост в photo/text |
| `9.1.0 IG media switch` | Switch | photo / video (текстовые посты IG не публикует) |
| `9.1.0.5 Upload photo to Cloudinary` | HTTP | Загружает фото в Cloudinary по URL (`public_id = post_uid`) |
| `9.1.1.1 IG create photo container` | Graph API | Создаёт IMAGE-контейнер; картинка через Cloudinary-трансформацию 1080×1350 с белыми полями |
| `Wait` | Wait | Пауза 30 сек, затем сразу публикация фото |
| `9.1.0.1 Download IG video binary` | HTTP | Скачивает видео (таймаут 120 с) |
| `9.1.0.2 Fix IG video binary metadata` | Code | Имя файла `<post_uid>.mp4`, MIME `video/mp4`; без бинаря — ошибка |
| `9.1.0.3 Upload IG video to Cloudinary` | HTTP | Загружает видео в Cloudinary (unsigned preset) |
| `9.1.0.4 Save IG public video URL` | Code | Строит URL с трансформацией под Reels: mp4, H.264/AAC, 1080×1920 с чёрными полями → `ig_video_url` |
| `9.1.1.2 IG create video container` | Graph API | Создаёт REELS-контейнер |
| `9.1.2 IG wait for container` | Wait | Ждёт `instagram_poll_delay` секунд |
| `9.1.3 IG container status` | Graph API | Запрашивает `status_code` контейнера |
| `9.1.4 IG ready?` | If | `FINISHED` → публикация, иначе → `9.1.7` |
| `9.1.5 IG publish` | Graph API | `media_publish` с `creation_id` |
| `9.1.6 IG status` | Code | `ig_status` / `ig_result`, переносит статусы TG/FB |
| `9.1.7 IG not ready (timeout)` | Code | `ig_status=failed` с причиной (контейнер не готов / ошибка создания) |
| `9.1.8 IG skipped` | Set | `ig_status=skipped` («no media» или «IG disabled») |
| `9.1.9 Merge IG` | Merge (3 входа) | Сводит ветки IG → VK |

## 10. VK и запись результата

| Нода | Тип | Что делает |
|------|-----|------------|
| `10.1.0 VK enabled?` | If | Не `skip_post`, `publish_vk=true`, есть `vk_owner_id` и `vk_access_token` → публикация, иначе → `10.1.6` |
| `10.1.1 VK media switch` | Switch | photo / video / прочее → текст |
| `10.1.2 VK get photo upload server` | HTTP | `photos.getWallUploadServer` — URL для загрузки фото |
| `10.1.2.1 VK download photo` | HTTP | Скачивает фото |
| `10.1.2.2 VK upload photo` | HTTP | Загружает фото на `upload_url` |
| `10.1.2.3 VK save photo` | HTTP | `photos.saveWallPhoto` |
| `10.1.2.4 VK wall post photo` | HTTP | `wall.post` от имени группы с вложением `photo<owner>_<id>` |
| `10.1.4 VK video save` | HTTP | `video.save` (`wallpost=1`) — получает `upload_url` |
| `10.1.4.1 VK download video` | HTTP | Скачивает видео |
| `10.1.4.2 VK upload video` | HTTP | Загружает видео на `upload_url` (ВК сам публикует на стене) |
| `10.1.3 VK post text` | HTTP | `wall.post` — текстовый пост (текст ≤2000, берётся FB-версия) |
| `10.1.5 VK status` | Code | `vk_status` / `vk_result` (`post_id`/`video_id` или ошибка VK), переносит статусы TG/FB/IG |
| `10.1.6 VK skipped` | Set | `vk_status=skipped` («VK not configured») |
| `10 Compute overall status` | Set | Итог по посту: `success` (все ок) / `partial` / `failed` / `skipped`; собирает `error_message` и `result_json` |
| `10.0.1 Prepare Sheets body` | Code | Готовит строку из 28 значений для листа `posts` |
| `10.1 Update sheet row` | HTTP (Sheets API) | Дописывает строку в `posts!A:AB` (append) — по ней пост считается обработанным |
| `10.2 Push post counter` | Code | Добавляет итог поста в static data для отчёта → назад в `5` (следующий пост) |

## 11–12. Итоги запуска

| Нода | Тип | Что делает |
|------|-----|------------|
| `11 Aggregate run stats` | Code | Считает каналы/посты/дубли/успехи/ошибки, определяет статус запуска, формирует HTML-отчёт (время по Москве), решает `should_log`; очищает static data |
| `11.05 Should log?` | If | Пишем в `wf_runs` только при реальных ошибках площадок (IG rate limit не считается) или `status=failed` |
| `11.1 Update wf_runs row` | Data Table | Upsert строки запуска по `run_id` |
| `11.1 Send report?` | If | Отчёт отправляется, если были новые посты или есть что логировать |
| `12 Send Telegram report` | Telegram | Отчёт в `report_chat_id` (≤4000 символов) |

---

## Замечания по текущей версии

Найдено при разборе JSON — стоит проверить/починить:

- **`reprocess_failed` не работает.** Ключ читается в `2.0.1`, но `4.2 Channel context` его не пробрасывает, поэтому в `4.5` он всегда `false` — посты с `failed` повторно не обрабатываются.
- **Нет цикла опроса IG-видео.** `instagram_poll_max` нигде не используется: `9.1.4 IG ready?` проверяет статус один раз, и если видео ещё обрабатывается — сразу `failed (timeout)`. Для фото — фиксированный `Wait` 30 с без проверки статуса.
- **Ошибки VK не попадают в текст отчёта.** `11 Aggregate run stats` учитывает `vk_status=failed` для `should_log`, но в блоке «Ошибки» перечисляет только TG/FB/IG.
- **Захардкоженный Cloudinary.** В `9.1.0.5`, `9.1.1.1` и `6.1` фолбэк `cloud_name = dn3b8ezpw`; в `6.1` фолбэк parser URL `tg-public-channel-parser.onrender.com`. Если `wf_settings` не заполнен — уйдёт в чужой/старый аккаунт.
- **`4.1.4 Write header row`** перезаписывает шапку при каждом запуске (лишний вызов Sheets API на канал).
- **`8.1.2.9` / `8.1.2.95`** скачивают видео, но `8.1.3 FB post video` всё равно шлёт `file_url` — загрузка лишняя.
- **`2.0.0 Load wf_meta_tokens`** привязана к таблице по ID — после импорта в другой n8n выбрать таблицу заново.
