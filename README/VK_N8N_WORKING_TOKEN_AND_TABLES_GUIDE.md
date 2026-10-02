# VK → n8n: рабочая инструкция по ID, токенам и таблицам Data Tables

Версия: 2026-05-07  
Контекст: workflow `tg-ai-multipost` / публикация из Telegram в Telegram, Facebook, Instagram и VK.

---

## 0. Короткий вывод

Для публикации в VK с фото и видео нужен **долгоживущий user access token**, а не ключ сообщества.

Рабочая схема, которую мы проверили:

```text
OAuth: https://oauth.vk.com/authorize
Redirect: https://oauth.vk.com/blank.html
Token type: user access token
expires_in: 0
Права: wall + photos + video + groups + offline
```

Проверено в браузере:

```json
photos.getWallUploadServer → вернул upload_url
wall.post → вернул post_id
```

Это значит, что токен подходит для workflow.

---

## 1. Что НЕ использовать

### 1.1. Не использовать ключ сообщества для медиа

Ключ сообщества может работать для некоторых простых действий, но для нашего сценария он не подходит.

Проверенная ошибка:

```json
{
  "error_code": 27,
  "error_msg": "Group authorization failed: method is unavailable with group auth."
}
```

Она появляется на:

```text
photos.getWallUploadServer
```

Вывод:

```text
Для фото/видео-публикации в стену VK нужен user token.
Community token / group token не использовать для медиа.
```

### 1.2. Не строить OAuth-refresh workflow как основной путь

Для этой задачи не нужен отдельный OAuth-refresh workflow в n8n.

Рабочий простой вариант:

```text
получить долгоживущий user token вручную → вставить его в Data Table → использовать в workflow
```

### 1.3. Не лезть в VK ID business-профиль

Не нужны:

```text
данные организации
банковские реквизиты
профиль бизнеса VK ID
модерация бизнес-профиля
```

Это другая история. Для нашего workflow нужен VK API token.

---

## 2. Какие данные нужны для n8n

В итоге должны быть известны такие значения:

```text
vk_user_id        ID пользователя VK, который выдал токен
vk_group_id       положительный ID сообщества
vk_owner_id       отрицательный ID сообщества для wall.post
vk_access_token   долгоживущий user token
vk_token_key      ключ-алиас токена в Data Table wf_meta_tokens
vk_api_version    версия VK API
```

Пример:

```text
vk_user_id      = 30581924
vk_group_id     = 133674721
vk_owner_id     = -133674721
vk_token_key    = vk_bginfo
vk_api_version  = 5.199
```

---

## 3. Как получить ID пользователя VK (ЭТО ПОСЛЕ ПОЛУЧЕНИЯ ТОКЕНА!!!!!)

### Способ 1. Из OAuth-редиректа

После успешной авторизации VK откроет страницу вида:

```text
https://oauth.vk.com/blank.html#access_token=vk1.a.xxxxx&expires_in=0&user_id=30581924
```

Здесь:

```text
user_id=30581924
```

Это и есть ID пользователя.

### Способ 2. Через users.get

Открой в браузере:

```text
https://api.vk.com/method/users.get?access_token=ТВОЙ_ТОКЕН&v=5.199
```

Нормальный ответ:

```json
{
  "response": [
    {
      "id": 30581924,
      "first_name": "...",
      "last_name": "..."
    }
  ]
}
```

Поле `id` — это ID пользователя.

---

## 4. Как получить ID группы / сообщества

### Если в URL уже есть число

Если URL группы такой:

```text
https://vk.com/club133674721
```

или:

```text
https://vk.com/public133674721
```

то:

```text
vk_group_id = 133674721
vk_owner_id = -133674721
```

Для VK API важно:

```text
group_id  — положительный ID, используется в photos.getWallUploadServer
owner_id  — отрицательный ID, используется в wall.post
```

Пример:

```text
photos.getWallUploadServer:
group_id=133674721

wall.post:
owner_id=-133674721
```

### Если у группы красивый адрес

Например:

```text
https://vk.com/bginfo
```

Тогда `bginfo` — это screen name. Получи ID через API:

```text
https://api.vk.com/method/groups.getById?group_id=bginfogarant&access_token=ТВОЙ_ТОКЕН&v=5.199
```

В ответе ищи ID группы.

Возможный формат ответа:

```json
{
  "response": [
    {
      "id": 133674721,
      "name": "..."
    }
  ]
}
```

или в новом формате:

```json
{
  "response": {
    "groups": [
      {
        "id": 133674721,
        "name": "..."
      }
    ]
  }
}
```

После этого считаем:

```text
vk_group_id = 133674721
vk_owner_id = -133674721
```

---

## 5. Как получить ID приложения

Есть два разных понятия, их не надо путать.

### 5.1. ID твоего собственного приложения

Открыть:

```text
https://dev.vk.com/ru/admin/apps-list
```

Дальше:

```text
Приложения → нужное приложение → карточка справа → ID
```

Пример:

```text
ID: 54582722
```

Это ID твоего приложения.

Важно: в нашем тесте mini-app с собственным ID давал рабочий токен только на 24 часа:

```text
expires_in=86400
```

А при добавлении `offline` мог возвращать:

```json
{
  "error": "invalid_request",
  "error_description": "invalid scope"
}
```

Поэтому для долгоживущего токена ниже используется совместимый OAuth client_id.

### 5.2. OAuth client_id для получения долгоживущего токена

Для простого долгоживущего user token рабочая схема — открыть OAuth-ссылку с совместимым client_id, который принимает `offline`.

Проверенный первым кандидат:

```text
5776857
```

Это `VK Admin (iOS)` из старого списка OAuth-приложений.

Если когда-то он перестанет работать, запасные кандидаты:

```text
2685278   Kate Mobile
6287487   vk.com
```

Не использовать:

```text
6121396
```

Он в тесте вернул:

```json
{
  "error": "invalid_request",
  "error_description": "application is blocked"
}
```

---

## 6. Как получить долгоживущий user token

### 6.1. Перед началом

В браузере должен быть залогинен тот VK-аккаунт, который:

```text
является администратором / редактором нужного сообщества
```

Если аккаунт не имеет прав на группу, токен может быть рабочим, но публикация в группу не пройдёт.

---

### 6.2. Рабочая OAuth-ссылка

Открой:

```text
https://oauth.vk.com/authorize?client_id=5776857&scope=335892&redirect_uri=https%3A%2F%2Foauth.vk.com%2Fblank.html&display=page&response_type=token&revoke=1&v=5.199
```

Где:

```text
client_id=5776857
scope=335892
redirect_uri=https://oauth.vk.com/blank.html
response_type=token
revoke=1
v=5.199
```

`scope=335892` — это сумма прав:

```text
photos  = 4
video   = 16
wall    = 8192
offline = 65536
groups  = 262144

4 + 16 + 8192 + 65536 + 262144 = 335892
```

То есть:

```text
photos + video + wall + offline + groups
```

---

### 6.3. Что должно получиться

После подтверждения доступа VK откроет страницу:

```text
https://oauth.vk.com/blank.html#access_token=vk1.a.xxxxx&expires_in=0&user_id=30581924
```

Проверь обязательно:

```text
expires_in=0
```

Это главный признак долгоживущего токена.

Если видишь:

```text
expires_in=86400
```

это токен на 24 часа. Для боевого workflow такой токен не использовать.

---

### 6.4. Что копировать

Из адресной строки копируй только значение после:

```text
access_token=
```

и до:

```text
&expires_in=
```

Пример формата:

```text
vk1.a.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Не копируй:

```text
access_token=
&expires_in=0
&user_id=...
```

Нужен только сам токен.

---

## 7. Проверка токена

Новый токен сначала проверяем в браузере.

### 7.1. Проверка пользователя

```text
https://api.vk.com/method/users.get?access_token=ТВОЙ_ТОКЕН&v=5.199
```

Ожидаемый результат:

```json
{
  "response": [
    {
      "id": 30581924
    }
  ]
}
```

### 7.2. Проверка сервера загрузки фото

```text
https://api.vk.com/method/photos.getWallUploadServer?group_id=133674721&access_token=ТВОЙ_ТОКЕН&v=5.199
```

Ожидаемый результат:

```json
{
  "response": {
    "album_id": -14,
    "upload_url": "https://pu.vk.com/...",
    "user_id": 30581924
  }
}
```

Если есть `upload_url`, токен подходит для фото-публикации.

### 7.3. Проверка текстового поста

Осторожно: эта ссылка реально создаёт пост в группе.

```text
https://api.vk.com/method/wall.post?owner_id=-133674721&from_group=1&message=TEST%20VK%20long%20token&access_token=ТВОЙ_ТОКЕН&v=5.199
```

Ожидаемый результат:

```json
{
  "response": {
    "post_id": 106
  }
}
```

Если вернулся `post_id`, публикация работает.

### 7.4. Удаление тестового поста

Если тестовый пост создался, удали его:

```text
https://api.vk.com/method/wall.delete?owner_id=-133674721&post_id=106&access_token=ТВОЙ_ТОКЕН&v=5.199
```

Ожидаемый результат:

```json
{
  "response": 1
}
```

---

## 8. Типовые ошибки

### Ошибка: `Anonymous token is invalid`

Пример:

```json
{
  "error_code": 1116,
  "error_msg": "Anonymous token is invalid"
}
```

Частая причина: перед токеном случайно вставлена лишняя буква или пробел.

Было неправильно:

```text
access_token=Тvk1.a.xxxxx
```

Правильно:

```text
access_token=vk1.a.xxxxx
```

Токен должен начинаться строго с:

```text
vk1.a.
```

---

### Ошибка: `invalid scope`

Пример:

```json
{
  "error": "invalid_request",
  "error_description": "invalid scope"
}
```

Обычно это значит:

```text
вы пытаетесь получить offline-токен через приложение, которому VK не разрешает этот scope
```

Решение:

```text
использовать проверенную OAuth-ссылку с client_id=5776857 и scope=335892
```

---

### Ошибка: `application is blocked`

Пример:

```json
{
  "error": "invalid_request",
  "error_description": "application is blocked"
}
```

В тесте так ответил:

```text
client_id=6121396
```

Решение:

```text
не использовать 6121396
```

---

### Ошибка: `Group authorization failed`

Пример:

```json
{
  "error_code": 27,
  "error_msg": "Group authorization failed: method is unavailable with group auth."
}
```

Причина:

```text
используется community token / group token
```

Решение:

```text
использовать user access token
```

---

## 9. Как заполнить текущие Data Tables n8n

У тебя сейчас есть три важные таблицы:

```text
wf_settings
wf_meta_tokens
wf_channels
```

---

### 9.1. Таблица `wf_settings`

Сейчас есть строка:

```text
key = publish_vk
value = false
```

Для включения VK надо поставить:

```text
key = publish_vk
value = true
```

Остальные глобальные настройки VK можно не добавлять, если workflow берёт токен и owner_id из `wf_channels` + `wf_meta_tokens`.

Рекомендованная глобальная константа, если ClaudeCode будет её добавлять:

```text
key = vk_api_version
value = 5.199
```

Но если workflow уже жёстко использует `5.199`, можно не добавлять.

---

### 9.2. Таблица `wf_meta_tokens`

Смысл таблицы:

```text
хранит токены под короткими ключами
```

У тебя уже есть строка:

```text
key = vk_bginfo
page_name = VK BG Info
access_token = <твой VK user token>
```

Что сделать:

```text
заменить <твой VK user token> на новый боевой долгоживущий токен
```

Пример строки:

```text
key:          vk_bginfo
page_name:    VK BG Info
access_token: vk1.a.xxxxxxxxxxxxxxxxx
```

Важно:

```text
не вставлять токен в wf_channels
не вставлять токен в workflow JSON
не отправлять токен в чат
```

В `wf_channels` должен быть только ключ:

```text
vk_token_key = vk_bginfo
```

---

### 9.3. Таблица `wf_channels`

Смысл VK-полей:

```text
vk_owner_id   куда публиковать в VK
vk_token_key  каким токеном публиковать
```

Для группы:

```text
vk_group_id = 133674721
vk_owner_id = -133674721
```

В таблице `wf_channels` используется именно:

```text
vk_owner_id
```

То есть туда пишем отрицательный ID:

```text
-133674721
```

---

## 10. Что конкретно поправить в твоих текущих строках

### 10.1. `bg_dnevnik`

Сейчас у тебя строка примерно такая:

```text
key          = bg_dnevnik
url          = https://t.me/bg_dnevnik
vk_owner_id  = -123456789
vk_token_key = vk_bginfo
```

Нужно заменить placeholder:

```text
vk_owner_id = -133674721
```

Если целевая VK-группа другая — ставишь отрицательный ID той группы.

Итог:

```text
key          = bg_dnevnik
vk_owner_id  = -133674721
vk_token_key = vk_bginfo
```

### 10.2. Остальные каналы

Если их тоже надо публиковать в тот же VK-паблик, заполни так же:

```text
vk_owner_id  = -133674721
vk_token_key = vk_bginfo
```

Если какой-то канал не должен идти в VK, оставь пустыми:

```text
vk_owner_id  =
vk_token_key =
```

---

## 11. Итоговая схема значений

Минимальная настройка для одного VK-паблика:

### `wf_settings`

```text
publish_vk = true
```

### `wf_meta_tokens`

```text
key          = vk_bginfo
page_name    = VK BG Info
access_token = НОВЫЙ_ДОЛГОЖИВУЩИЙ_USER_TOKEN
```

### `wf_channels`

```text
vk_owner_id  = -133674721
vk_token_key = vk_bginfo
```

---

## 12. Как должна работать VK-ветка в workflow

### Текст без медиа

```text
wall.post
```

Параметры:

```text
owner_id     = vk_owner_id
from_group   = 1
message      = vk_text
access_token = token by vk_token_key
v            = 5.199
```

### Фото

Логика:

```text
1. photos.getWallUploadServer
2. загрузить файл на upload_url
3. photos.saveWallPhoto
4. wall.post с attachments=photo{owner_id}_{id}
```

Важно:

```text
photos.getWallUploadServer использует group_id положительный
wall.post использует owner_id отрицательный
```

Если в таблице хранится только `vk_owner_id`, то `group_id` считается так:

```text
group_id = Math.abs(vk_owner_id)
```

Пример:

```text
vk_owner_id = -133674721
group_id    = 133674721
```

### Видео

Логика:

```text
1. video.save
2. загрузить видео на upload_url
3. wall.post с video attachment
```

---

## 13. Безопасность

Ты уже несколько раз показывал токены в чате и на скринах. Для финальной настройки сделай так:

1. Получи новый токен тем же рабочим способом.
2. Проверь, что:

```text
expires_in=0
```

3. Проверь:

```text
photos.getWallUploadServer
wall.post
```

4. Вставь новый токен в `wf_meta_tokens`.
5. Не показывай новый токен в чате.
6. Старые засвеченные токены больше не используй.

Если токен попал:

```text
в чат
на скриншот
в экспорт workflow
в Git
в CSV, который отправлялся наружу
```

считай его скомпрометированным.

---

## 14. Чек-лист

### Получение данных

- [ ] Получен `vk_user_id` из OAuth-редиректа или `users.get`
- [ ] Получен `vk_group_id`
- [ ] Посчитан `vk_owner_id = -vk_group_id`
- [ ] Получен долгоживущий user token
- [ ] Проверено `expires_in=0`
- [ ] Проверено `photos.getWallUploadServer`
- [ ] Проверено `wall.post`
- [ ] Удалён тестовый пост

### Таблицы n8n

- [ ] `wf_settings.publish_vk = true`
- [ ] В `wf_meta_tokens` есть строка `vk_bginfo`
- [ ] В `wf_meta_tokens.access_token` вставлен новый долгоживущий токен
- [ ] В нужных строках `wf_channels.vk_owner_id` указан отрицательный ID группы
- [ ] В нужных строках `wf_channels.vk_token_key` указан ключ токена, например `vk_bginfo`
- [ ] В каналах, которые не надо публиковать в VK, VK-поля оставлены пустыми

---

## 15. Источники и проверенные факты

- Для долгоживущего токена нужен scope `offline`; при успехе VK возвращает `expires_in=0`.
- Для API-запросов к VK нужен access token и версия API.
- Для загрузки фото на стену группы в текущей практике нужен user token; group/community token может падать на `photos.getWallUploadServer`.
- Старые OAuth client_id и числовые scope проверяются через обычный `oauth.vk.com/authorize`.

Ссылки для справки:

```text
https://oauth.vk.com/authorize
https://oauth.vk.com/blank.html
https://api.vk.com/method/users.get
https://api.vk.com/method/groups.getById
https://api.vk.com/method/photos.getWallUploadServer
https://api.vk.com/method/photos.saveWallPhoto
https://api.vk.com/method/wall.post
https://api.vk.com/method/wall.delete
https://api.vk.com/method/video.save
https://raw.githubusercontent.com/vkhost/vkhost.github.io/master/script.js
```
