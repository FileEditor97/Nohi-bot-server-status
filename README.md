# Nohi bot-server status
 Discord bot written in Node.js for providing continious status of game server - basic server information and player count (list and graph)
 This is based(fork) on selfhosted variant of "Game Status"/"Server Status" [bot](https://github.com/Ramzi-Sah/game-status-discordbot-selfhosted) by Ramzi-Sah.

**NOTE: I'am not into javascript and therefor am not aware of it possibilities and "rules". Some changes may be incorrect, but this variant serves it purpose for me good.**
**This repository may be left abandoned after some time as I'm planing on implementing it's features in other language.**

## Credits
- [Ramzi-Sah](https://github.com/Ramzi-Sah) for creating the original bot
- [TheProKoen](https://github.com/TheProKoen) and [rizkychi](https://github.com/rizkychi) for inspiration


## Requirements
- Node.js and NPM (latest stable version)
- NVM (for managing Node version)
- Discord bot application

## Installing and Running (short)
- Have Node.js installed (I recommend reading proper tutorial for installation on your OS)
- Download source code
- In directory where file `package.json` is located, run `npm install` command to download necesary dependencies
- Configure bot by editing file `src/config.json` in any text editor or terminal (unix - using `nano src/config.json`). *See below*
- Run bot using command `node src/index.js` or in background with `node src/index.js &`


## Changes by FileEditor
- Dependencies version set to latest (at the time of this message)
- Graph "fixed" and customized for my needs
- Graphs are uploaded directly from bot's source foulder, rather than thru web server (as I'm not into js)
- **User interface translated to russian**
- More setup fields in config
- Removed unwanted code
- Removed web-server as it's not required

## To-do List
- Add bot shutdown(restart) command
- Fix graph's element to look better(?)
- Figure out what with timezones, summer time (they are a bit strangely implemented, resulting in time like 25:00 and further)
- Maintenance mode
- (Possibly) Display other information about the server
- Fix problem with image(graph) cutting off on mobile client


## src/config.json
```json
{
	"statusUpdateTime" : 60, -time in seconds, how often bot will update server status
	"ownerID" : "", -no current use, MAY be left empty 

	"instances": [
		{
			"discordBotToken" : "", -bot's token generated in discord's developer panel
			"serverStatusChannelId" : "", -channel ID, where status message will be posted, ex. 4127481751675634412

			"timezone" : "", -server's time zone, ex. Europe/Moscow
			
			"server_type" : "", -game type, available at gamedig documentation page, ex. garrysmod
			"server_host" : "", -server's IP address, ex. 123.45.67.89
			"server_port" : "", -server's port, ex. 27015
			"server_join" : "", -server's direct link for connecting to the server, MAY be left empty
			
			"server_title" : "", -server's custom name, for displaying purpose
			"server_name" : "", -server's name, as is displayed in server list (actual name)
			"server_logo" : "", -server's logo, link to an image ending with .png or other format
			"server_url" : "", -server's URL like discord link or website, clickable on server's custom name
			"server_color" : "#00FF00", -color which will be used on embed and graph, hex color
			
			"steam_btn" : true, -connect button below
			"minimal" : false, -without sertain elements
			"server_enable_playerlist" : true, -player list
			"server_enable_graph" : true, -graph below player list
			"server_enable_numbers" : false -numbers each player on player list
		}
	]
}
```