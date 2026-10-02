# Cloudinary для Instagram-видео в n8n: настройка и добавление данных в Data Tables

Инструкция для workflow `tg-ai-multipost`.

Цель: сделать стабильную публикацию видео в Instagram. Instagram плохо принимает временные `video_url` из Telegram CDN (`cdn*.telesco.pe`). Поэтому видео надо сначала загрузить в Cloudinary, получить стабильный публичный `https` URL, а уже его передавать в Instagram как `video_url`.

---

## 1. Что в итоге должно получиться

В workflow появится такая логика:

```text
Telegram video_url
→ n8n скачивает видео
→ n8n загружает видео в Cloudinary
→ Cloudinary возвращает secure_url
→ Instagram получает video_url = secure_url
→ Instagram публикует Reels/video
```

В n8n в `wf_settings` нужно добавить 3 настройки:

```text
cloudinary_cloud_name
cloudinary_upload_preset
cloudinary_folder
```

Пример:

```text
cloudinary_cloud_name      mycloudname
cloudinary_upload_preset   n8n_instagram_video
cloudinary_folder          n8n/instagram
```

---

## 2. Официальные ссылки

Cloudinary:

```text
Cloudinary
https://cloudinary.com/

Cloudinary Console
https://console.cloudinary.com/

Upload presets documentation
https://cloudinary.com/documentation/upload_presets

Create upload presets in Console
https://cloudinary.com/documentation/create_upload_presets_in_console_tutorial

Upload API reference
https://cloudinary.com/documentation/image_upload_api_reference

Programmatic uploads
https://cloudinary.com/documentation/upload_images

Video API / video resource type
https://cloudinary.com/documentation/cloudinary_video
```

n8n:

```text
Твой n8n
https://n8n-my-vfm2011.amvera.io
```

---

## 3. Важная безопасность

Для MVP мы используем **Unsigned Upload Preset**.

Это удобно, потому что n8n сможет загружать видео в Cloudinary без API Secret.

Но важно понимать:

```text
Unsigned preset — это публичный upload preset.
Если кто-то узнает cloud_name + upload_preset, он потенциально сможет загружать файлы в твой Cloudinary.
```

Поэтому:

```text
1. Используй отдельный preset только для этого workflow.
2. Ограничь папку загрузки.
3. Ограничь allowed formats.
4. Не публикуй upload_preset в открытом GitHub.
5. Для продакшена лучше перейти на signed upload через API Key + API Secret.
```

Для текущего MVP unsigned upload нормален.

---

# Часть A. Настройка Cloudinary

## 4. Зарегистрироваться / войти в Cloudinary

Открой:

```text
https://cloudinary.com/
```

Нажми:

```text
Sign Up
```

или:

```text
Log In
```

После входа откроется Cloudinary Console.

Если не открылось автоматически, перейди:

```text
https://console.cloudinary.com/
```

---

## 5. Найти `Cloud name`

В Cloudinary Console открой Dashboard.

Обычно `Cloud name` виден на главной странице Dashboard или в блоке Product Environment Credentials.

Найди значение:

```text
Cloud name
```

Пример:

```text
mycloudname
```

Скопируй его.

Это значение потом вставим в n8n:

```text
cloudinary_cloud_name = mycloudname
```

Важно:

```text
Cloud name — это НЕ API Key и НЕ API Secret.
```

---

## 6. Открыть настройки Upload

В Cloudinary Console нажми значок шестерёнки или открой настройки:

```text
Settings
```

Дальше открой раздел:

```text
Upload
```

Потом найди вкладку:

```text
Upload presets
```

Официальный путь в Cloudinary Console:

```text
Console → Settings → Upload → Upload Presets
```

---

## 7. Создать Upload Preset

На вкладке `Upload presets` нажми:

```text
Add upload preset
```

или:

```text
Create upload preset
```

---

## 8. Настроить Upload Preset

Заполни поля.

### Preset name

```text
Preset name: n8n_instagram_video
```

Можно использовать другое имя, но лучше оставить такое, чтобы было понятно, зачем preset нужен.

---

### Signing Mode

Найди поле:

```text
Signing Mode
```

Выбери:

```text
Unsigned
```

Важно: для n8n HTTP Request без API Secret нужен именно `Unsigned`.

---

### Folder / Asset folder

Найди поле:

```text
Folder
```

или:

```text
Asset folder
```

Вставь:

```text
n8n/instagram
```

Это значит, что загруженные видео будут складываться в Cloudinary в папку:

```text
n8n/instagram
```

---

### Resource type

Если есть поле:

```text
Resource type
```

выбери:

```text
Auto
```

или:

```text
Video
```

Если такого поля нет — ничего страшного. В n8n мы будем грузить видео через endpoint:

```text
/video/upload
```

То есть Cloudinary сам будет понимать, что это video resource.

---

### Allowed formats

Если есть настройка ограничений форматов, укажи:

```text
mp4
mov
```

Для начала можно оставить только:

```text
mp4
```

---

### Use filename / Unique filename

Если есть такие поля, можно поставить:

```text
Use filename: true
Unique filename: false
Overwrite: true или false
```

Для нашего workflow удобно:

```text
Use filename: true
Unique filename: false
Overwrite: true
```

Почему: мы будем передавать `public_id = post_uid`. Если один и тот же пост будет обработан повторно, Cloudinary сможет перезаписать файл или вернуть тот же public_id.

Если не уверен — оставь значения по умолчанию.

---

## 9. Сохранить preset

Нажми:

```text
Save
```

или:

```text
Save changes
```

После сохранения у тебя должны быть 2 главных значения:

```text
cloudinary_cloud_name      <твой Cloud name>
cloudinary_upload_preset   n8n_instagram_video
```

И дополнительно:

```text
cloudinary_folder          n8n/instagram
```

---

# Часть B. Добавление данных в n8n Data Tables

## 10. Открыть n8n

Перейди:

```text
https://n8n-my-vfm2011.amvera.io
```

---

## 11. Открыть Data Tables

В левом меню n8n открой:

```text
Data tables
```

Открой таблицу:

```text
wf_settings
```

---

## 12. Добавить настройку `cloudinary_cloud_name`

Добавь новую строку.

Поля:

```text
key: cloudinary_cloud_name
value: <твой Cloud name из Cloudinary>
note: Cloudinary cloud name для загрузки Instagram-видео
```

Пример:

```text
key: cloudinary_cloud_name
value: mycloudname
note: Cloudinary cloud name для загрузки Instagram-видео
```

---

## 13. Добавить настройку `cloudinary_upload_preset`

Добавь новую строку.

Поля:

```text
key: cloudinary_upload_preset
value: n8n_instagram_video
note: Unsigned upload preset Cloudinary для Instagram-видео
```

---

## 14. Добавить настройку `cloudinary_folder`

Добавь новую строку.

Поля:

```text
key: cloudinary_folder
value: n8n/instagram
note: Папка Cloudinary для видео, загруженных из n8n
```

---

## 15. Как должна выглядеть часть `wf_settings`

В итоге в `wf_settings` должны быть строки:

```text
key                         value                   note
cloudinary_cloud_name        mycloudname             Cloudinary cloud name для загрузки Instagram-видео
cloudinary_upload_preset     n8n_instagram_video     Unsigned upload preset Cloudinary для Instagram-видео
cloudinary_folder            n8n/instagram           Папка Cloudinary для видео, загруженных из n8n
```

---

# Часть C. Проверка, что настройки дошли до workflow

## 16. Запустить workflow с начала

Открой workflow:

```text
tg-ai-multipost
```

Нажми:

```text
Execute Workflow
```

Важно: запускай workflow с начала, потому что `wf_settings` читается в начале workflow.

---

## 17. Проверить наличие Cloudinary-полей в Execution Data

Дойди до ноды:

```text
9.1.0 IG media switch
```

Открой Input → JSON.

Проверь, есть ли поля:

```json
{
  "cloudinary_cloud_name": "mycloudname",
  "cloudinary_upload_preset": "n8n_instagram_video",
  "cloudinary_folder": "n8n/instagram"
}
```

Если эти поля есть — всё хорошо.

---

## 18. Если Cloudinary-полей нет в Input

Это значит, что нода, которая собирает channel context, не пробрасывает новые settings дальше.

Скорее всего, надо поправить ноду:

```text
4.2 Channel context
```

или ту Code/Set-ноду, где из `settingsMap` собираются поля для канала.

Нужно добавить туда поля:

```js
cloudinary_cloud_name: settings.cloudinary_cloud_name || '',
cloudinary_upload_preset: settings.cloudinary_upload_preset || '',
cloudinary_folder: settings.cloudinary_folder || 'n8n/instagram',
```

Если в этой ноде используется другой объект, например `settingsMap`, тогда добавь так:

```js
cloudinary_cloud_name: settingsMap.cloudinary_cloud_name || '',
cloudinary_upload_preset: settingsMap.cloudinary_upload_preset || '',
cloudinary_folder: settingsMap.cloudinary_folder || 'n8n/instagram',
```

После правки снова запусти workflow с начала и проверь Input у `9.1.0 IG media switch`.

---

# Часть D. Тестовый upload в Cloudinary через n8n

Этот блок нужен, чтобы проверить Cloudinary до подключения Instagram.

## 19. Создать временную тестовую ветку

Можно временно добавить после ноды, где уже есть binary-видео:

```text
Download IG video binary
```

или использовать уже существующую ноду:

```text
9.1.0.1 Download IG video binary
```

После неё добавь HTTP Request:

```text
TEST Upload video to Cloudinary
```

---

## 20. Настроить HTTP Request для Cloudinary upload

Тип ноды:

```text
HTTP Request
```

Поля:

```text
Method: POST
URL: =https://api.cloudinary.com/v1_1/{{ $json.cloudinary_cloud_name }}/video/upload
Authentication: None
Send Body: true
Body Content Type: Form-Data
```

Body Parameters:

### Параметр 1

```text
Name: file
Parameter Type: n8n Binary File
Input Data Field Name: data
```

### Параметр 2

```text
Name: upload_preset
Parameter Type: Form Data
Value: ={{ $json.cloudinary_upload_preset }}
```

### Параметр 3

```text
Name: folder
Parameter Type: Form Data
Value: ={{ $json.cloudinary_folder || 'n8n/instagram' }}
```

### Параметр 4

```text
Name: public_id
Parameter Type: Form Data
Value: ={{ $json.post_uid || $('5 SplitInBatches per post').item.json.post_uid }}
```

Options:

```text
Timeout: 300000
```

Settings:

```text
Continue On Fail: true
Always Output Data: true
```

---

## 21. Успешный ответ Cloudinary

Если всё настроено правильно, Output должен содержать:

```json
{
  "asset_id": "...",
  "public_id": "n8n/instagram/vibecoding_tg_3085",
  "resource_type": "video",
  "secure_url": "https://res.cloudinary.com/..."
}
```

Главное поле:

```text
secure_url
```

Именно его потом надо передавать в Instagram:

```text
video_url = secure_url
```

---

## 22. Проверить файл в Cloudinary

Открой Cloudinary Console:

```text
https://console.cloudinary.com/
```

Перейди:

```text
Media Library
```

Найди папку:

```text
n8n/instagram
```

Там должен появиться загруженный `.mp4`.

---

# Часть E. Типичные ошибки

## 23. `Upload preset not found`

Ошибка означает:

```text
Неверно указано имя upload preset.
```

Проверь в n8n:

```text
wf_settings → cloudinary_upload_preset
```

Значение должно совпадать с Cloudinary preset name:

```text
n8n_instagram_video
```

---

## 24. `Upload preset must be whitelisted for unsigned uploads`

Причина:

```text
Preset создан как Signed, а n8n пытается грузить без подписи.
```

Решение:

```text
Cloudinary Console
→ Settings
→ Upload
→ Upload presets
→ открыть preset
→ Signing Mode = Unsigned
→ Save
```

---

## 25. `Invalid cloud name`

Причина:

```text
Неверный cloudinary_cloud_name.
```

Проверь:

```text
Cloudinary Console → Dashboard → Cloud name
```

И в n8n:

```text
wf_settings → cloudinary_cloud_name
```

---

## 26. `Invalid image file` или ошибка формата

Причина:

```text
Видео загружается не туда или файл скачался неправильно.
```

Проверь:

```text
1. В Download IG video binary есть Binary → data.
2. В Cloudinary URL используется /video/upload, а не /image/upload.
3. binary data имеет mimeType video/mp4.
```

---

## 27. Cloudinary upload прошёл, но Instagram всё равно не публикует

Проверь:

```text
1. secure_url открывается в браузере без авторизации.
2. URL начинается с https://res.cloudinary.com/
3. В Instagram-ноду передаётся именно secure_url, а не старый Telegram video_url.
4. В IG create video container:
   media_type = REELS
   video_url = {{ $json.ig_video_url }}
```

---

# Часть F. Какие данные хранить в Data Tables, а какие нет

## Можно хранить в `wf_settings`

```text
cloudinary_cloud_name
cloudinary_upload_preset
cloudinary_folder
```

## Нельзя хранить в Markdown / скриншотах / открытых файлах

```text
Cloudinary API Secret
Meta Page Access Token
Meta App Secret
```

## Для unsigned upload API Secret не нужен

Для текущей схемы n8n использует:

```text
cloud_name
upload_preset
folder
```

и не использует:

```text
api_secret
```

---

# Короткий чек-лист

```text
1. Открыть https://cloudinary.com/
2. Зарегистрироваться / войти.
3. Открыть https://console.cloudinary.com/
4. Найти Cloud name.
5. Открыть Settings → Upload → Upload presets.
6. Нажать Add upload preset.
7. Preset name = n8n_instagram_video.
8. Signing Mode = Unsigned.
9. Folder = n8n/instagram.
10. Allowed formats = mp4, mov.
11. Save.
12. В n8n открыть https://n8n-my-vfm2011.amvera.io.
13. Data tables → wf_settings.
14. Добавить:
    cloudinary_cloud_name
    cloudinary_upload_preset
    cloudinary_folder
15. Запустить workflow с начала.
16. Проверить, что поля дошли до 9.1.0 IG media switch.
17. Проверить upload через HTTP Request на:
    https://api.cloudinary.com/v1_1/{{ cloudinary_cloud_name }}/video/upload
18. Убедиться, что Cloudinary вернул secure_url.
```

---

# Итог

После этой настройки n8n сможет брать Telegram-видео, загружать его в Cloudinary и получать стабильный URL:

```text
https://res.cloudinary.com/...
```

Именно этот URL надо использовать в Instagram-нode:

```text
9.1.1.2 IG create video container
video_url = {{ $json.ig_video_url }}
media_type = REELS
```
