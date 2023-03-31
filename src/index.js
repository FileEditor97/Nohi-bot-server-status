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
	console.warn("Config file not found! Check README.md for config.json file and place it in '"+__dirname+"' folder.");
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
function getTime() {
	return new Date().toISOString().
  		replace(/T/, ' ').      // replace T with a space
  		replace(/\..+/, '')     // delete the dot and everything after
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
var instances = [];

// start instances
for (let i = 0; i < config["instances"].length; i++) {
	// create child process for every instance
	let instance = ChildProcess.fork(__dirname + '/bot.js');
	
	instance.on('message', (m) => {
		if (m.error) {
			console.error(`[${getTime()}][${m.id}]: ${m.message}\n${m.error}`);
		}
		console.log(`[${getTime()}][${m.id}]: ${m.message}`);
	});
	
	// communicate id to instance
	instance.send({id: i});
	
	// push to instances list
	instances.push(instance);
};
