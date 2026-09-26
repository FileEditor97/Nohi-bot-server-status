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
	console.error("Config file not found! Check README.md for config.json file and place it in '"+__dirname+"' folder.");
	process.exit(0);
}
const config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

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
let instances = [];
let shuttingDown = false;

// restart delay doubles on every quick crash (10s -> 20s -> ... -> 5min), resets if instance ran long enough
const RESTART_DELAY_MIN = 10 * 1000;
const RESTART_DELAY_MAX = 5 * 60 * 1000;
const STABLE_UPTIME = 5 * 60 * 1000;
let restartDelays = [];

function startInstance(i) {
	// create child process for instance
	let instance = ChildProcess.fork(__dirname + '/bot.js');
	let startedAt = Date.now();

	instance.on('message', (m) => {
		if (m.error) {
			console.error('[%s][%s]: %s\n%s', getTime(), m.id, m.message, m.error);
		} else {
			console.log('[%s][%s]: %s', getTime(), m.id, m.message);
		}
	});

	// restart instance if it dies
	instance.on('exit', (code, signal) => {
		instances[i] = undefined;
		if (shuttingDown) return;

		if (Date.now() - startedAt > STABLE_UPTIME || restartDelays[i] === undefined) {
			restartDelays[i] = RESTART_DELAY_MIN;
		} else {
			restartDelays[i] = Math.min(restartDelays[i] * 2, RESTART_DELAY_MAX);
		}

		console.error('[%s][%s]: Instance exited (code: %s, signal: %s). Restarting in %ss...', getTime(), i, code, signal, restartDelays[i] / 1000);
		setTimeout(() => startInstance(i), restartDelays[i]);
	});

	// communicate id to instance
	instance.send({id: i});

	instances[i] = instance;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// start instances, one by one with a delay
async function createInstances(count) {
	for (let i = 0; i < count; i++) {
		if (shuttingDown) return;
		startInstance(i);

		// wait
		await sleep(20000);
	}
}
createInstances(config["instances"].length);

// graceful shutdown (docker stop, Ctrl+C)
function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log('[%s]: Received %s, stopping instances...', getTime(), signal);

	for (const instance of instances) {
		if (instance) instance.kill('SIGTERM');
	}

	// exit once all instances stopped, or force after 5s
	const check = setInterval(() => {
		if (instances.every(instance => instance === undefined)) process.exit(0);
	}, 100);
	setTimeout(() => process.exit(0), 5000).unref();
	check.unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
