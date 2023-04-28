# Nohi bot-server status
 Discord bot written in Node.js for providing continious status of game server - basic server information and player count (list and graph)  
 This is based(fork) on selfhosted variant of ["Game Status"/"Server Status" bot](https://github.com/Ramzi-Sah/game-status-discordbot-selfhosted) by Ramzi-Sah.

This bot is for self-hosting and may/will not work for huge amount of data. Source code is provided as it is.

**USER INTERFACE IS IN ENGLISH**
**ИНТЕРФЕЙС НА АНГЛИЙСКОМ**
[See all available languages here / Все доступные языки тут] (https://github.com/FileEditor97/Nohi-bot-server-status/branches)

**NOTE: As i'm still learning js, there may be some errors and bad implimentations. If you hava any suggestions, contact me bellow.**  

## Credits
- [Ramzi-Sah](https://github.com/Ramzi-Sah) for creating the original bot
- [TheProKoen](https://github.com/TheProKoen) and [rizkychi](https://github.com/rizkychi) for inspiration

## Contacts
**Discord:** GreenLord#0593

## WIKI
https://github.com/FileEditor97/Nohi-bot-server-status/wiki

### Example
[<img alt="example of bot message" src="https://i.imgur.com/e3PKXen.png">](https://i.imgur.com/e3PKXen.png)


# *English description*

## Requirements
- Node.js and NPM (latest stable version)
- NVM (for managing Node version)
- Discord bot application

## Installing and Running (short)
1. Have Node.js installed (I recommend reading proper tutorial for installation on your OS)
2. Download source code
3. In directory where file `package.json` is located, run `npm install` command to download necesary dependencies
4. Configure bot by editing file `src/config.json` in any text editor or terminal (unix - using `nano src/config.json`). *See below*
5. Run bot using command `node src/index.js` or in background with `node src/index.js &`


## Changes by FileEditor
- Dependencies version set to latest (at the time of this message)
- Graph "fixed" and customized for my needs
- Graphs are uploaded directly from bot's source foulder, rather than thru web server (as I'm not into js)
- More setup fields in config
- Removed unwanted code
- Removed web-server as it's not required
- Refresh button (after clicking it stays disabled for 10 seconds)
- Playerlist format changed to more compact (especialy for viewing on mobile)
- Timezone problem fixed, now it's more flexible for configuration.
- Playerlist displays every player (maximum of 25*30 = 750)
- Button for displaying playerlist and option

## To-do List
- ~Add bot shutdown(restart) command~ (problematic)
- ~Fix graph's element to look better(?)~ (optimization)
- ~Figure out what with timezones, summer time (they are a bit strangely implemented, resulting in time like 25:00 and further)~
- Maintenance mode
- ~(Possibly) Display other information about the server~
- ~Fix problem with image(graph) cutting off on mobile client~
- ~Option to toggle player data - time on server. Maybe change alltogether list to multiple collumns.~
- Fix unballanced data addition to json when refresh button is called (data must be saved with stable interval)
- ~Button for displaying players on server and fix some elements~


# *Описание на русском*

## Требования
- Node.js и NPM (последняя стабильная версия)
- NVM (для управления версий Node)
- Приложение бота в панели разработчика Discord

## Установка и запуск (short)
1. Установите Node.js (я рекомендую прочитать соответствующее руководство по установке в вашей ОС)
2. Загрузите исходный код
3. В каталоге, где находится файл `package.json`, запустите команду `npm install`, чтобы загрузить необходимые модули
4. Настройте бота, отредактировав файл `src/config.json` в любом текстовом редакторе или терминале (unix – используя `nano src/config.json`). *Смотри ниже*
5. Запустите бота с помощью команды `node src/index.js` или в фоновом режиме с помощью `node src/index.js &`


## Отличия от оригинала
- Установлена ​​последняя версия модулей (на момент появления этого сообщения)
- График "исправлен" и настроен под мои нужды
- Графики загружаются напрямую из исходного файла бота, а не через веб-сервер (так как я не увлекаюсь js)
- Дополнительные поля настройки в конфиге
- Удален нежелательный код
- Удален веб-сервер за ненадобностью
- Кнопка «Обновить» (после нажатия она остается неактивной в течение первых 10 секунд)
- Формат списка игроков изменен на более компактный (особенно для просмотра на мобильных устройствах)
- Исправлена ​​проблема с часовым поясом, теперь он более гибкий для настройки.
- В списке игроков отображается каждый игрок (максимум 25*30 = 750)
- Кнопка для показания списка игроков и конфиг
