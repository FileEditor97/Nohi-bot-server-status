/*
	Author: Ramzi Sah#2992
	Fork by: FileEditor97
	Description:
		creates multiple instances of the bot
*/
//---------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------
// read configs
const fs = require('fs');
if (!fs.existsSync(__dirname + '/config.json')) {
	console.warn("Config file not found! Check README.md for config.json file and place it in '"+__dirname+"' folder.");
	process.exit(0);
}
const config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

// create temp data folders
if (!fs.existsSync(__dirname + "/temp")){
    fs.mkdirSync(__dirname + "/temp");
}
if (!fs.existsSync(__dirname + "/temp/graphs")){
    fs.mkdirSync(__dirname + "/temp/graphs");
}
if (!fs.existsSync(__dirname + "/temp/data")){
    fs.mkdirSync(__dirname + "/temp/data");
}

//---------------------------------------------------------------------------------------------------
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
function getTime() {
	return new Date().toLocaleString("en-GB", timeZone)
		.replace(/,/, "")
}

// resolve discord.com
require('dns').resolve('www.discord.com', function(err) {
	if (err) {
		console.log("No connection to Discord");
		process.exit(1);
	} else {
		console.log("Connected to Discord");
	}
});

// initiation
const ChildProcess = require('child_process');
let instances = [];

const RESTART_DELAY = 10 * 1000;

function startInstance(i) {
	// create child process for instance
	let instance = ChildProcess.fork(__dirname + '/bot.js');

	instance.on('message', (m) => {
		if (m.error) {
			console.error('[%s][%s]: %s\n%s', getTime(), m.id, m.message, m.error);
		} else {
			console.log('[%s][%s]: %s', getTime(), m.id, m.message);
		}
	});

	// restart instance if it dies
	instance.on('exit', (code, signal) => {
		console.error('[%s][%s]: Instance exited (code: %s, signal: %s). Restarting in %ss...', getTime(), i, code, signal, RESTART_DELAY / 1000);
		setTimeout(() => startInstance(i), RESTART_DELAY);
	});

	// communicate id to instance
	instance.send({id: i});

	instances[i] = instance;
}

// start instances
for (let i = 0; i < config["instances"].length; i++) {
	startInstance(i);
}
