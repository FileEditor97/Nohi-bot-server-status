/*
	Author: Ramzi Sah#2992
	Fork by: FileEditor97
	Desription:
		creates multiple instances of the bot
*/
//---------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------
// read configs
const fs = require('fs');
if (!fs.existsSync(__dirname + '/config.json')) {
	console.error("Config file not found! Check README.md for config.json file and place it in '"+__dirname+"' folder.");
	process.exit(0);
}
const config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

// create temp data folders
if (!fs.existsSync(__dirname + "/temp")){
    fs.mkdirSync(__dirname + "/temp");
};
if (!fs.existsSync(__dirname + "/temp/graphs")){
    fs.mkdirSync(__dirname + "/temp/graphs");
};
if (!fs.existsSync(__dirname + "/temp/data")){
    fs.mkdirSync(__dirname + "/temp/data");
};

//---------------------------------------------------------------------------------------------------
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
function getTime() {
	return new Date().toLocaleString("en-GB", timeZone)
		.replace(/,/, "")
}

// resolve discord.com
require('dns').resolve('www.discord.com', function(err) {
	if (err) {
		console.log('[%s]: No connection to Discord', getTime());
		process.exit(1);
	} else {
		console.log('[%s]: Connected to Discord', getTime());
	}
});

// initiation
const ChildProcess = require('child_process');

async function createInstance() {
	// create child process
	let instance = ChildProcess.fork(__dirname + '/bot.js');
	
	instance.on('message', (m) => {
		if (m.error) {
			console.error('[%s]: %s\n%s', getTime(), m.message, m.error);
		} else {
			console.log('[%s]: %s', getTime(), m.message);
		}
	});
}

// start instances
createInstance()
