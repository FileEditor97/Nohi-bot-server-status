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

// initiation
const ChildProcess = require('child_process');
var instances = [];

//---------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------
// start instances
for (let i = 0; i < config["instances"].length; i++) {
	// create child process for every instance
	let instance = ChildProcess.fork(__dirname + '/bot.js');
	
	instance.on('message', function(m) {
		console.log('[instance ' + m.instanceid + ']:', m.message);
	});
	
	// communicate id to instance
	instance.send({id: i});
	
	// push to instances list
	instances.push(instance);
};
