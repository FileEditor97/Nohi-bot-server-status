/*
	Author: Ramzi Sah#2992
	Fork by: FileEditor97
	Description:
		creates bot instance and restarts it if it dies
*/
//---------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------
// read configs
const fs = require('fs');
if (!fs.existsSync(__dirname + '/config.json')) {
	console.error("Config file not found! Check README.md for config.json file and place it in '"+__dirname+"' folder.");
	process.exit(0);
}

// create temp data folders
if (!fs.existsSync(__dirname + "/temp")){
    fs.mkdirSync(__dirname + "/temp");
}
if (!fs.existsSync(__dirname + "/temp/data")){
    fs.mkdirSync(__dirname + "/temp/data");
}

//---------------------------------------------------------------------------------------------------
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
function getTime() {
	return new Date().toLocaleString("en-GB", { timeZone: timeZone })
		.replace(/,/, "")
}

// initiation
const ChildProcess = require('child_process');
let instance = undefined;
let shuttingDown = false;

// restart delay doubles on every quick crash (10s -> 20s -> ... -> 5min), resets if instance ran long enough
const RESTART_DELAY_MIN = 10 * 1000;
const RESTART_DELAY_MAX = 5 * 60 * 1000;
const STABLE_UPTIME = 5 * 60 * 1000;
let restartDelay = undefined;

function startInstance() {
	// create child process
	instance = ChildProcess.fork(__dirname + '/bot.js');
	let startedAt = Date.now();

	instance.on('message', (m) => {
		if (m.error) {
			console.error('[%s]: %s\n%s', getTime(), m.message, m.error);
		} else {
			console.log('[%s]: %s', getTime(), m.message);
		}
	});

	// restart instance if it dies
	instance.on('exit', (code, signal) => {
		instance = undefined;
		if (shuttingDown) return;

		if (Date.now() - startedAt > STABLE_UPTIME || restartDelay === undefined) {
			restartDelay = RESTART_DELAY_MIN;
		} else {
			restartDelay = Math.min(restartDelay * 2, RESTART_DELAY_MAX);
		}

		console.error('[%s]: Instance exited (code: %s, signal: %s). Restarting in %ss...', getTime(), code, signal, restartDelay / 1000);
		setTimeout(startInstance, restartDelay);
	});
}

// start instance
startInstance();

// graceful shutdown (docker stop, Ctrl+C)
function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log('[%s]: Received %s, stopping instance...', getTime(), signal);

	if (instance) instance.kill('SIGTERM');

	// exit once instance stopped, or force after 5s
	const check = setInterval(() => {
		if (instance === undefined) process.exit(0);
	}, 100);
	setTimeout(() => process.exit(0), 5000).unref();
	check.unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
