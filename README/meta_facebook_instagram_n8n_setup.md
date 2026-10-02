# Meta/Facebook + Instagram для n8n: единая инструкция

Цель: получить и проверить данные для публикации из n8n в Facebook Page и Instagram Business Account.

n8n:

```text
https://n8n-my-vfm2011.amvera.io
```

Что в итоге нужно получить для каждой страницы:

```text
fb_page_id          → n8n → Data Tables → wf_channels → fb_page_id
ig_business_id      → n8n → Data Tables → wf_channels → ig_business_id
Page Access Token   → n8n → Credentials → Facebook Graph API
```

---

## 1. Проверить доступ к Facebook Page

Открой:

```text
https://business.facebook.com/latest/settings/pages
```

Дальше:

```text
Настройки компании
→ Аккаунты
→ Страницы
→ выбери нужную страницу
→ Люди / People
```

Проверь, что у твоего пользователя есть право создавать контент.

Нужно видеть право/задачу:

```text
CREATE_CONTENT
```

или полный доступ к странице.

Проверь каждую страницу, с которой будет работать workflow:

```text
CenterAI
Bginfo
другие страницы, если будут
```

---

## 2. Проверить привязку Instagram к Facebook Page

Открой:

```text
https://business.facebook.com/latest/settings/accounts/instagram-accounts
```

Дальше:

```text
Настройки компании
→ Аккаунты
→ Аккаунты Instagram
```

Проверь, что нужный Instagram-аккаунт есть в Business Manager.

Потом открой:

```text
https://business.facebook.com/latest/settings/pages
```

Дальше:

```text
Страницы
→ выбери Facebook Page
```

Проверь, что нужный Instagram-аккаунт связан именно с этой страницей.

Если Instagram не связан со страницей, `ig_business_id` через Graph API не появится.

---

## 3. Проверить тип Instagram-аккаунта

Instagram должен быть профессиональным:

```text
Business / Бизнес
```

или:

```text
Creator / Автор
```

На телефоне:

```text
Instagram
→ Профиль
→ ☰
→ Настройки и конфиденциальность
→ Тип аккаунта и инструменты
```

Если аккаунт личный, переключи на профессиональный и привяжи к нужной Facebook Page.

---

## 4. Открыть Meta App

Открой:

```text
https://developers.facebook.com/apps/
```

Выбери приложение, через которое уже работаешь:

```text
tg-public-channel-parser
```

Проверь:

```text
App settings → Roles
```

Твой пользователь должен быть:

```text
Administrator
```

или:

```text
Developer
```

---

## 5. Включить Instagram API в приложении

Внутри приложения открой:

```text
Use cases / Сценарии использования
```

Найди:

```text
Instagram API
```

или:

```text
Instagram API with Facebook Login
```

Нажми:

```text
Set up / Настроить
```

Это нужно, чтобы в токене были Instagram permissions.

---

## 6. Взять App ID и App Secret

Открой внутри приложения:

```text
App settings
→ Basic
```

Скопируй:

```text
App ID
App Secret
```

`App Secret` показывается через:

```text
Show / Показать
```

Не сохраняй `App Secret` в Markdown, GitHub, скриншоты или чат.

---

## 7. Открыть Graph API Explorer

Открой:

```text
https://developers.facebook.com/tools/explorer/
```

Справа выбери:

```text
Приложение Meta → tg-public-channel-parser
```

В поле:

```text
Пользователь или Страница
```

выбери:

```text
Маркер пользователя / User Token
```

---

## 8. Добавить permissions

В правой панели открой список permissions.

Если строка:

```text
Добавить разрешение
```

не нажимается, нажми на нижний выпадающий список:

```text
Выбранные варианты / Selected options
```

Добавь permissions:

```text
pages_show_list
pages_read_engagement
pages_manage_posts
pages_manage_metadata
instagram_basic
instagram_content_publish
business_management
publish_video
```

`publish_video` нужен для видео в Facebook. Для Instagram-видео основное — `instagram_content_publish`.

---

## 9. Сгенерировать short-lived User Token

В Graph API Explorer нажми:

```text
Generate Access Token
```

В окне Meta:

```text
1. Продолжи под своим Facebook-аккаунтом.
2. Выбери все Facebook Pages, с которыми должен работать workflow.
3. Выбери все связанные Instagram-аккаунты.
4. Подтверди доступы.
```

Важно: если хочешь работать и с CenterAI, и с Bginfo, на этом шаге выбери обе страницы и оба Instagram-аккаунта.

После генерации появится временный User Token.

Его пока не вставляем в n8n.

---

## 10. Получить `fb_page_id`, `ig_business_id` и временные Page tokens

В Graph API Explorer поставь:

```text
Method: GET
```

В строку запроса вставь:

```text
/me/accounts?fields=id,name,tasks,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}
```

Нажми:

```text
Отправить
```

В ответе найди нужные страницы.

Для каждой страницы сохрани:

```text
id                                   → fb_page_id
name                                 → название страницы для проверки
access_token                         → временный Page Access Token
instagram_business_account.id        → ig_business_id
instagram_business_account.username  → Instagram username
tasks                                → права пользователя на странице
```

Проверь, что в `tasks` есть:

```text
CREATE_CONTENT
```

Желательно также:

```text
MANAGE
MODERATE
ADVERTISE
ANALYZE
```

Пример для Bginfo:

```text
fb_page_id = 710790195660970
ig_business_id = 17841401208724248
Instagram username = bginfo.su
```

---

## 11. Обменять short-lived User Token на long-lived User Token

Открой терминал: Git Bash, Linux, macOS Terminal или PowerShell.

Выполни:

```bash
APP_ID='ТВОЙ_APP_ID'
read -rsp "APP_SECRET: " APP_SECRET; echo
read -rsp "SHORT_LIVED_USER_TOKEN: " SHORT_TOKEN; echo

curl -sS -G 'https://graph.facebook.com/v25.0/oauth/access_token' \
  --data-urlencode 'grant_type=fb_exchange_token' \
  --data-urlencode "client_id=$APP_ID" \
  --data-urlencode "client_secret=$APP_SECRET" \
  --data-urlencode "fb_exchange_token=$SHORT_TOKEN"

unset APP_SECRET SHORT_TOKEN
```

В ответе скопируй:

```text
access_token
```

Это long-lived User Token.

Ожидаемый ответ:

```json
{
  "access_token": "EAAB...",
  "token_type": "bearer",
  "expires_in": 5183944
}
```

Если ошибка — short-lived token уже истёк. Вернись в Graph API Explorer и снова нажми `Generate Access Token`.

---

## 12. Через long-lived User Token получить финальные Page Access Tokens

В терминале выполни:

```bash
read -rsp "LONG_LIVED_USER_TOKEN: " LONG_TOKEN; echo

curl -sS -G 'https://graph.facebook.com/v25.0/me/accounts' \
  --data-urlencode 'fields=id,name,tasks,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}' \
  --data-urlencode "access_token=$LONG_TOKEN"

unset LONG_TOKEN
```

В ответе снова найди нужные страницы.

Для каждой страницы сохрани:

```text
id → fb_page_id
access_token → финальный Page Access Token
instagram_business_account.id → ig_business_id
```

Именно этот Page Access Token вставляется в n8n Credential.

---

## 13. Проверить Page Access Token в Debugger

Открой:

```text
https://developers.facebook.com/tools/debug/accesstoken/
```

Вставь Page Access Token.

Нажми:

```text
Debug
```

Проверь:

```text
Type: Page
Valid: Yes
App ID: tg-public-channel-parser
Expires: желательно Never или без короткого срока
```

Проверь scopes:

```text
pages_show_list
pages_read_engagement
pages_manage_posts
pages_manage_metadata
instagram_basic
instagram_content_publish
business_management
publish_video
```

Если `Type` не `Page`, значит ты вставил не тот токен.

Если `Valid` не `Yes`, токен не использовать.

---

## 14. Проверить Page Token через Graph API Explorer

Открой:

```text
https://developers.facebook.com/tools/explorer/
```

Справа выбери нужную страницу или вручную вставь Page Access Token.

Проверка страницы:

```text
Method: GET
Path: /me?fields=id,name
```

Нажми:

```text
Отправить
```

Ожидаемый ответ:

```json
{
  "id": "ID_СТРАНИЦЫ",
  "name": "НАЗВАНИЕ_СТРАНИЦЫ"
}
```

Не проверяй `tasks` через Page Token. Так не надо:

```text
/me?fields=id,name,tasks
```

`tasks` проверяются только через User Token:

```text
/me/accounts?fields=id,name,tasks,access_token
```

---

## 15. Проверить тестовую публикацию в Facebook Page

В Graph API Explorer выбери Page Token нужной страницы.

Поставь:

```text
Method: POST
Path: /FB_PAGE_ID/feed
```

Например:

```text
/710790195660970/feed
```

Слева во вкладке:

```text
Параметры
```

добавь:

```text
message = test from page token
```

Нажми:

```text
Отправить
```

Успешный ответ:

```json
{
  "id": "FB_PAGE_ID_POST_ID"
}
```

После проверки зайди на страницу Facebook и удали тестовый пост.

Если ошибка `(#200) Permissions error`, значит:

```text
1. выбран не Page Token;
2. нет pages_manage_posts;
3. нет pages_read_engagement;
4. у пользователя нет CREATE_CONTENT на странице;
5. страница не была выбрана при Generate Access Token.
```

---

## 16. Проверить Instagram ID через Page Token

В Graph API Explorer выбери Page Token нужной страницы.

Поставь:

```text
Method: GET
Path: /FB_PAGE_ID?fields=name,instagram_business_account{id,username},connected_instagram_account{id,username}
```

Например:

```text
/710790195660970?fields=name,instagram_business_account{id,username},connected_instagram_account{id,username}
```

Нажми:

```text
Отправить
```

Ожидаемый ответ:

```json
{
  "name": "Bginfo",
  "instagram_business_account": {
    "id": "17841401208724248",
    "username": "bginfo.su"
  },
  "connected_instagram_account": {
    "id": "17841401208724248",
    "username": "bginfo.su"
  },
  "id": "710790195660970"
}
```

Если `instagram_business_account` не вернулся:

```text
1. проверь instagram_basic;
2. проверь instagram_content_publish;
3. проверь, что Instagram профессиональный;
4. проверь, что Instagram связан именно с этой Facebook Page;
5. заново сгенерируй токен, выбрав нужный Instagram-аккаунт.
```

---

## 17. Записать ID в n8n Data Tables

Открой n8n:

```text
https://n8n-my-vfm2011.amvera.io
```

Дальше:

```text
Data tables
→ wf_channels
```

Для каждой строки канала заполни:

```text
fb_page_id
ig_business_id
```

Пример:

```text
key: Begin
url: https://t.me/inclient
fb_page_id: 710790195660970
ig_business_id: 17841401208724248
```

Проверь, что включены флаги:

```text
active = true
publish_facebook = true
publish_instagram = true
```

Если `publish_facebook` и `publish_instagram` у тебя лежат в `wf_settings`, проверь их там:

```text
Data tables
→ wf_settings
```

---

## 18. Вставить Page Access Token в n8n Credential

Открой:

```text
https://n8n-my-vfm2011.amvera.io
```

Дальше:

```text
Credentials
→ Facebook Graph account CenterAI
```

В поле:

```text
Access Token
```

вставь Page Access Token.

Нажми:

```text
Save
```

Потом:

```text
Test
```

Должно быть:

```text
Connection tested successfully
```

Важно: один `Facebook Graph API` credential содержит один Access Token.

Если в workflow один credential и в нём Page Token только одной страницы, он может не публиковать в другую страницу.

Для работы с несколькими Facebook Pages нужно заранее решить схему:

```text
1. отдельный credential под каждую Page;
или
2. динамические Page tokens через HTTP Request;
или
3. отдельный workflow на каждую Page.
```

---

## 19. Проверить, какие ноды используют Facebook Graph credential

В workflow `tg-ai-multipost` этот credential используется в Facebook и Instagram-нодах:

```text
8.1.2 FB post photo
8.1.3 FB post video
8.1.4 FB post text
9.1.1.1 IG create photo container
9.1.1.2 IG create video container
9.1.3 IG container status
9.1.5 IG publish
```

Открой каждую из этих нод и проверь:

```text
Credential = нужный Facebook Graph API credential
Graph API Version = v25.0 или актуальная доступная версия
```

---

## 20. Проверить Facebook-ветку в workflow

Запусти workflow с начала:

```text
Execute Workflow
```

Открой ноду:

```text
8.1 FB enabled?
```

В Input должно быть:

```json
{
  "publish_facebook": true,
  "fb_page_id": "ID_СТРАНИЦЫ"
}
```

Нода должна уйти в:

```text
True Branch
```

Потом проверь одну из нод:

```text
8.1.2 FB post photo
8.1.4 FB post text
```

Успешный ответ:

```json
{
  "id": "FB_PAGE_ID_POST_ID"
}
```

---

## 21. Проверить Instagram-ветку в workflow

Открой ноду:

```text
9.1 IG eligible?
```

В Input должно быть:

```json
{
  "publish_instagram": true,
  "ig_business_id": "IG_BUSINESS_ID",
  "media_type": "photo"
}
```

или:

```json
{
  "publish_instagram": true,
  "ig_business_id": "IG_BUSINESS_ID",
  "media_type": "video"
}
```

Нода должна уйти в:

```text
True Branch
```

Потом проверь:

```text
9.1.1.1 IG create photo container
```

или:

```text
9.1.1.2 IG create video container
```

Ожидаемый ответ:

```json
{
  "id": "CONTAINER_ID"
}
```

Потом:

```text
9.1.3 IG container status
```

Ожидаемый ответ:

```json
{
  "status_code": "FINISHED"
}
```

Потом:

```text
9.1.5 IG publish
```

Ожидаемый ответ:

```json
{
  "id": "INSTAGRAM_MEDIA_ID"
}
```

---

## 22. Если токен протух

Ошибка:

```text
Session has expired
```

или:

```text
invalid_token
```

Действия:

```text
1. Открыть Graph API Explorer.
2. Снова Generate Access Token.
3. Выбрать нужные Pages и Instagram accounts.
4. Обменять short-lived User Token на long-lived User Token.
5. Через long-lived User Token получить Page Access Token.
6. Проверить Page Token в Debugger.
7. Заменить токен в n8n Credential.
```

---

## 23. Если Facebook даёт `(#200) Permissions error`

Проверь по порядку:

```text
1. В Graph API Explorer выбран Page Token, не User Token.
2. Debugger показывает Type: Page.
3. Debugger показывает Valid: Yes.
4. В scopes есть pages_manage_posts.
5. В scopes есть pages_read_engagement.
6. Через /me/accounts у страницы есть task CREATE_CONTENT.
7. Тестовый POST /FB_PAGE_ID/feed работает в Graph API Explorer.
8. В n8n в credential вставлен именно этот Page Token.
```

---

## 24. Если Instagram не публикует

Проверь по порядку:

```text
1. В wf_channels заполнен ig_business_id.
2. publish_instagram = true.
3. media_type не равен none.
4. Debugger показывает instagram_basic.
5. Debugger показывает instagram_content_publish.
6. Instagram связан с нужной Facebook Page.
7. Instagram является Business или Creator.
8. GET /FB_PAGE_ID?fields=instagram_business_account{id,username} возвращает нужный id.
```

---

## 25. Что нельзя сохранять в файлах и скриншотах

Не сохраняй в Markdown, GitHub, скриншоты и чат:

```text
Page Access Token
User Access Token
Long-lived User Token
App Secret
```

Можно сохранять:

```text
fb_page_id
ig_business_id
username страницы
названия нод
порядок действий
```

Если токен попал на скриншот или в файл, считай его скомпрометированным и получи новый.
