# Nohi bot-server status
 Discord bot written in Node.js for providing continious status of game server - basic server information and player count (list and graph)  
 This is based(fork) on selfhosted variant of ["Game Status"/"Server Status" bot](https://github.com/Ramzi-Sah/game-status-discordbot-selfhosted) by Ramzi-Sah.

This bot is for self-hosting and may/will not work for huge amount of data. Source code is provided as it is.

**USER INTERFACE IS IN RUSSIAN**  
**ИНТЕРФЕЙС НА РУССКОМ**

**NOTE: I'm not into javascript and therefor am not aware of it possibilities and "rules". Some changes may be incorrect, but this variant serves it purpose for me good.**  
**This repository may be left abandoned after some time as I'm planing on implementing it's features in other language.**

## Credits
- [Ramzi-Sah](https://github.com/Ramzi-Sah) for creating the original bot
- [TheProKoen](https://github.com/TheProKoen) and [rizkychi](https://github.com/rizkychi) for inspiration


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

## WIKI
https://github.com/FileEditor97/Nohi-bot-server-status/wiki

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

## To-do List
- ~Add bot shutdown(restart) command~ (problematic)
- ~Fix graph's element to look better(?)~ (optimization)
- ~Figure out what with timezones, summer time (they are a bit strangely implemented, resulting in time like 25:00 and further)~
- Maintenance mode
- (Possibly) Display other information about the server
- ~Fix problem with image(graph) cutting off on mobile client~
- ~Option to toggle player data - time on server. Maybe change alltogether list to multiple collumns.~
- Fix unballanced data addition to json when refresh button is called (data must be saved with stable interval)
