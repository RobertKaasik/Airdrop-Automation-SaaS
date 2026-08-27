# AIRDROP-X — production runbook

Этот runbook фиксирует текущую архитектуру MVP и безопасный порядок запуска,
остановки, мониторинга и восстановления. Он не выбирает хостинг, домен,
платёжный адрес или поставщика секретов: эти значения задаёт оператор после
отдельной юридической и security-проверки.

## 1. Текущая топология и ограничения

В production должны работать ровно два отдельных процесса:

1. Web/API: `python -m uvicorn server:app ... --workers 1`.
2. Telegram polling bot: `python tg_bot.py`.

Для текущей версии обязателен **один Uvicorn worker** и **один экземпляр
Telegram-бота**. Причины:

- база — локальная SQLite в WAL-режиме;
- APScheduler запускается внутри web-процесса;
- короткоживущие quote/session-кэши, rate limits и часть состояния находятся в
  памяти процесса;
- несколько web-workers продублируют scheduler jobs и разделят in-memory
  состояние; несколько bot-процессов будут конкурировать за Telegram polling.

Масштабирование на несколько workers допустимо только после переноса базы в
серверную СУБД, кэшей/rate limits в общее хранилище и scheduler в отдельный
singleton worker.

## 2. Подготовка окружения

1. Создать отдельного непривилегированного системного пользователя для сервиса.
2. Установить зависимости в выделенное виртуальное окружение.
3. Передать `.env` или эквивалентные переменные через защищённое хранилище
   секретов. Реальный `.env` не копировать в репозиторий, логи или тикеты.
4. Оператор самостоятельно задаёт точный HTTPS-origin, домен и публичный
   receiving address. Приватные ключи и seed-фразы сервису не нужны.
5. Выполнить безопасную проверку конфигурации:

```powershell
python scripts/preflight_production.py
```

Скрипт не показывает значения секретов, не обращается к блокчейну и ничего не
отправляет. До исправления всех строк `ERROR` запуск запрещён.

Минимальные production-условия:

- `APP_ENV=production`;
- `APP_RELOAD=false`;
- `APP_ALLOWED_ORIGINS` содержит только точные HTTPS origins без `*`, localhost
  и путей;
- `APP_TRUST_PROXY_HEADERS=true` только если контролируемый reverse proxy
  удаляет входящие клиентские forwarding-заголовки и формирует их заново;
- секреты Telegram, SMTP, WalletConnect и provider API находятся только в
  окружении;
- `SUBSCRIPTION_PAYMENTS_ENABLED=false`, пока платёжный поток не прошёл
  независимую проверку.

## 3. Запуск процессов

Все команды выполняются из корня проекта одним и тем же production-окружением.
Значения путей и адресов ниже — placeholders, их нельзя копировать буквально.

Web/API за reverse proxy на том же хосте:

```powershell
python -m uvicorn server:app `
  --host 127.0.0.1 `
  --port 8000 `
  --workers 1 `
  --proxy-headers `
  --forwarded-allow-ips 127.0.0.1
```

Если reverse proxy находится на другом приватном узле, оператор задаёт его
точный доверенный IP и закрывает Uvicorn firewall-ом от публичного доступа.
Значение `*` для `--forwarded-allow-ips` не использовать.

Telegram запускается отдельным процессом:

```powershell
python tg_bot.py
```

Оба процесса следует оформить как отдельные службы в выбранном оператором
process supervisor: автоматический старт после reboot, ограниченный restart
backoff, отдельные stdout/stderr logs и ровно один экземпляр каждого процесса.
Не запускать `server.py` с reload и не использовать `--workers` больше `1`.

Правильный порядок старта:

1. Web/API.
2. Проверка локального `/api/health`.
3. Telegram bot.
4. Проверка публичного HTTPS endpoint.

Порядок остановки для обслуживания: сначала Telegram bot, затем Web/API.

## 4. HTTPS и reverse proxy

Reverse proxy обязан:

- завершать TLS на действительном сертификате и перенаправлять HTTP на HTTPS;
- проксировать запросы только на приватный `127.0.0.1:8000` либо закрытый
  внутренний адрес;
- ограничить размер request body и задать конечные read/connect timeouts;
- заменять, а не дописывать недоверенные `X-Forwarded-For` и
  `X-Forwarded-Proto`;
- передавать исходный `Host`;
- не публиковать `.env`, `*.db`, `*.db-wal`, `*.db-shm`, `core/`, `scripts/`,
  backup-каталог и browser profiles как статические файлы;
- сохранять security headers приложения или усиливать их, не ослабляя CSP.

После настройки проверить с внешней сети:

- HTTP всегда переходит на HTTPS;
- неправильный Origin не получает CORS-доступ;
- `/api/health` отвечает, а внутренний порт `8000` снаружи недоступен;
- `.env`, база и backup-файлы возвращают 404/403 и никогда не скачиваются.

## 5. Health monitoring и логи

`GET /api/health` возвращает HTTP 200 только когда доступны SQLite и
APScheduler. При деградации ядра возвращается HTTP 503. Поле `capabilities`
показывает только булевы признаки конфигурации и не раскрывает секреты.

Локальная проверка:

```powershell
$response = Invoke-RestMethod `
  -Uri 'http://127.0.0.1:8000/api/health' `
  -Method Get `
  -TimeoutSec 10

if ($response.status -ne 'ok' -or
    $response.database -ne 'ok' -or
    $response.scheduler -ne 'running') {
    throw 'AIRDROP-X health check failed.'
}
```

Рекомендуемый минимум мониторинга:

- локальный health check каждые 60 секунд;
- отдельная проверка публичного HTTPS URL;
- alert после трёх последовательных ошибок, а не после одного сетевого сбоя;
- alert на restart-loop обоих процессов, заполнение диска, ошибки SQLite,
  массовые 5xx/429 внешних провайдеров и неудачные backups;
- срок хранения логов и доступ к ним определяются политикой данных.

Health endpoint проверяет ядро, но не выполняет реальные Telegram, email,
Uniswap, LI.FI, Aave или blockchain операции. Их доступность следует оценивать
по метрикам ошибок и безопасным синтетическим проверкам без транзакций.

## 6. Аварийное отключение платежей

Kill switch не требует изменения кода:

1. Остановить приём новых покупок на внешних каналах.
2. Установить `SUBSCRIPTION_PAYMENTS_ENABLED=false` в защищённом окружении.
3. Перезапустить только Web/API одним worker.
4. Убедиться, что `/api/health` показывает
   `capabilities.subscription_payments_enabled=false`.
5. Проверить, что создание новой платёжной сессии возвращает контролируемую
   недоступность и не показывает пользователю адрес для новой оплаты.

Не менять receiver/mode в попытке «перенаправить» уже созданные сессии и не
удалять записи платежей из SQLite. Pending-сессии нельзя подтверждать, пока
kill switch выключен; уже активированные подписки остаются в базе. Повторное
включение допустимо только после устранения причины, preflight и отдельного
ручного settlement-теста в точной production-сети.

## 7. Резервное копирование SQLite

Нельзя копировать только `airdrop_x.db` обычной файловой командой, пока сервис
работает: свежие committed-данные могут находиться в `airdrop_x.db-wal`.
Используйте SQLite online backup API через включённый скрипт:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\backup_sqlite.ps1 `
  -DatabasePath .\airdrop_x.db `
  -DestinationDirectory '<ENCRYPTED_BACKUP_DIRECTORY>' `
  -PythonExecutable python
```

Скрипт:

- требует явные source и destination;
- принимает только `.db`, `.sqlite` и `.sqlite3`;
- проверяет source через `PRAGMA integrity_check`;
- создаёт согласованный snapshot с учётом WAL;
- повторно выполняет `integrity_check` на backup;
- никогда не перезаписывает и не удаляет файлы;
- создаёт рядом SHA-256 manifest.

Backup-каталог должен быть вне web-root, с ограниченным ACL, шифрованием и
копией на другом failure-domain. Оператор задаёт retention согласно политике
данных. Как минимум раз в месяц выполняется тест восстановления на отдельной
машине или в изолированном каталоге.

Проверка любой копии без изменения файла:

```powershell
python scripts/sqlite_backup.py --check-only '<PATH_TO_BACKUP.sqlite3>'
```

## 8. Restore drill и реальное восстановление

Автоматического restore-скрипта намеренно нет: замена активной базы —
разрушительная операция и требует подтверждённого maintenance window.

Безопасный порядок:

1. Зафиксировать причину и выбранный backup; проверить его SHA-256 после
   переноса и выполнить `--check-only`.
2. Остановить Telegram bot, затем Web/API. Убедиться, что процессов Uvicorn,
   bot и открытых maintenance shell с SQLite больше нет.
3. Скопировать backup в новый staging-файл и снова выполнить
   `PRAGMA integrity_check` через `--check-only`.
4. Создать новый timestamped rollback-каталог вне web-root.
5. Переместить существующие `airdrop_x.db`, `airdrop_x.db-wal` и
   `airdrop_x.db-shm` в rollback-каталог. Не удалять их.
6. Скопировать проверенный staging-файл как новый `airdrop_x.db`. Не переносить
   старые WAL/SHM рядом с восстановленной базой.
7. Запустить Web/API с одним worker, проверить `/api/health`, вход тестового
   оператора и ожидаемые записи без выполнения платежей/транзакций.
8. Только после успешной проверки запустить Telegram bot.

При неуспешном restore снова остановить оба процесса, сохранить неудачный
вариант для анализа и вернуть весь исходный комплект DB/WAL/SHM из rollback.

## 9. Release и incident checklist

Перед каждым выпуском:

```powershell
python -m unittest -v test_subscription_lifecycle.py
python -m unittest -v test_telegram_wallet_backend.py
python -m unittest -v test_provider_outages.py
python -m unittest -v test_sqlite_backup.py
python test_integration.py
python test_stealth.py
node test_subscription_frontend.js
node test_wallet_session_frontend.js
node test_mobile_responsive.js
node scripts/check-locales.js
node scripts/check-backend-translations.js
node scripts/check-pricing.js
npm run build:ui
python scripts/preflight_production.py
```

Затем сделать новый проверенный backup, развернуть код, перезапустить процессы
в правильном порядке и провести ручной smoke-test без реального перевода денег.

При инциденте сначала сохраняют логи и backup, затем используют минимальный
kill switch: отключают платежи, Telegram bot или весь Web/API в зависимости от
затронутой функции. Никогда не запрашивают у пользователя seed-фразу, private
key или пароль для диагностики.
