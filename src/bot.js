/*
	Author: Ramzi Sah#2992
	Fork by: FileEditor97
	Desription:
		Main code
		Retrieves status message or creates new, updates every sycle time or on request
*/

// read configs
const fs = require('fs');
var config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

let serversOffline = new Set();

async function sendMsg(text) {
	process.send({
		message: text,
		error: undefined,
	});
}
async function sendError(text, err) {
	process.send({
		message: text,
		error: (err == undefined ? "No message" : err.stack),
	});
}

function init() {
	// set config defaults
	if (config["timezone"] == "") config["timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone;
	
	// connect to discord API
	client.login(config["discordBotToken"]);
};

function parse(text) {
	return (text == "" ? undefined : text)
}

//----------------------------------------------------------------------------------------------------------
// timers
const { setTimeout } = require('timers/promises');
function Sleep(ms) {
	return setTimeout(ms);
}

let cancelTimeout = new AbortController();
async function SleepCanceable(ms) {
	try {
		await setTimeout(ms, undefined, { signal: cancelTimeout.signal });
	} catch (error) {
		if (error.name === 'AbortError')
			cancelTimeout = new AbortController();
	}
}

//----------------------------------------------------------------------------------------------------------
// create client
const {Client, EmbedBuilder, AttachmentBuilder, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType} = require('discord.js');
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// once client is ready
client.on('ready', async () => {
	sendMsg("Logged in as \"" + client.user.tag + "\".");

	// get channel
	let statusChannel = client.channels.cache.get(config["serverStatusChannelId"]);
	if (statusChannel == undefined) {
		sendError("Channel by ID '" + config["serverStatusChannelId"] + "' not found.");
		process.exit(1);
	};

	// get a status message
	let statusMessage = await getStatusMessage(statusChannel);
	if (statusMessage == undefined) {
		sendError("Couldn't retrieve or create status message.");
		process.exit(1);
	};

	// start server status loop
	startStatusMessage(statusMessage);

	// start generate graph loop
	generateGraph(); // needs it's own loop, as graph is generated only once every minute
});

// if reconnecting
client.once('reconnecting', c => {
	sendMsg("Reconnecting...")
});


//----------------------------------------------------------------------------------------------------------
// create/get last status message
async function getStatusMessage(statusChannel) {
	// get last message
	let statusMessage = await getLastMessage(statusChannel);
	if (statusMessage != undefined) {
		// return last message if exists
		return statusMessage;
	};

	// OR create new message
	let embed = new EmbedBuilder();
	embed.setTitle("Starting up the panel...");
	embed.setColor('#ffff00');

	return await statusChannel.send({ embeds: [embed] }).then((sentMessage) => {
		return sentMessage;
	});
};

function getLastMessage(statusChannel) {
	return statusChannel.messages.fetch({ limit: 20 }).then(messages => {
		// select bot messages
		messages = messages.filter(msg => (msg.author.id == client.user.id && !msg.system));

		// return first message
		return messages.first();
	}).catch(function () {
		return;
	});
};


//----------------------------------------------------------------------------------------------------------
// main loops
const dns = require('dns');
var tic = false;
async function startStatusMessage(statusMessage) {
	while (true) {
		dns.resolve('www.discord.com', err => {
			if (err) {
				sendError("Lost connection to Discord.");
				process.exit(1);
			}
		});

		Promise.all(generateStatusEmbed()).then(fields => {
			let embed = new EmbedBuilder();

			// set embed name and logo
			if (config["title"] != "") embed.setAuthor({ name: config["title"], iconURL: parse(config["logo"]), url: parse(config["url"]) });

			// set embed times
			tic = !tic;
			let ticEmojy = tic ? "⚪" : "⚫";

			let currentTime = new Date();

			embed.setTimestamp(currentTime);

			let serverTimeString = currentTime.toLocaleString('ru', { timeZone: config['timezone'] });

			embed.setFooter({ text: 'Server time : ' + serverTimeString + '\n' + ticEmojy + ' ' + "Last updated" });

			// set color
			if (serversOffline.length > 0) {
				embed.setColor('#ff0000');
			} else {
				embed.setColor(config["embed_color"]);
			}	

			// Set fields
			for (let i=0; i<fields.length; i++) {
				if (fields[i]["online"]) {
					embed.addFields({ name: '\u200b\n> '+fields[i]["name"], value: '> ✅ Онлайн', inline: false },
						{ name: 'Прямое подключение :', value: "`"+fields[i]["host"]+':'+fields[i]["port"]+"`", inline: true },
						{ name: 'Карта :', value: "`"+fields[i]["map"]+"`", inline: true },
						{ name: 'Кол-во игроков :', value: fields[i]["count"]+"/"+fields[i]["max"], inline: false });
				} else {
					embed.addFields({ name: '\u200b\n> '+fields[i]["name"], value: '❌ Офлайн', inline: false });
				}
			}

			// Set graph if available
			if (config["server_enable_graph"]) {
				embed.setImage("attachment://graph.png");
			};
			let file = config["server_enable_graph"] && fs.existsSync(__dirname + "/temp/graphs/graph.png") ? 
				[new AttachmentBuilder(__dirname + "/temp/graphs/graph.png")] : [];
			
			// Edit embed
			statusMessage.edit({
				embeds: [embed],
				files: file
			}).catch(error => {
				sendError("Couldn't edit embed message.", error);
			});
		}).catch(e => sendError("Problem with promises.", e));

		await SleepCanceable(config["statusUpdateTime"] * 1000);
	};
};

//----------------------------------------------------------------------------------------------------------
// fetch data
const { GameDig } = require('gamedig');
function generateStatusEmbed() {
	let promises = [];

	// query gamedig
	const serverType = config["server_type"];

	for (let serverId=0; serverId<config["servers"].length; serverId++) {
		const host = config["servers"][serverId]["host"];
		const port = config["servers"][serverId]["port"];

		let data = {
			"name": config["servers"][serverId]["name"],
			"online": false,
			"count": 0,
			"max": 0,
			"host": host,
			"port": port,
			"map": ""
		};

		let currentTime = new Date();
		
		promises.push(GameDig.query({
			type: serverType,
			host: host,
			port: port,
	
			maxRetries: 3,
			socketTimeout: 3000,
			attemptTimeout: 10000,
			givenPortOnly: true,
		}).then((state) => {	
			data["online"] = true;

			data["count"] = state.players.length;
			data["max"] = state.maxplayers;

			data["map"] = state.map;
	
			// add graph data
			graphDataPush(serverId, currentTime, state.players.length);
			
			return data;
		}).catch((error) => {
			sendError("Couldn't query the server", error);
	
			// add server to offline list
			serversOffline.add(serverId);
	
			// add graph data
			graphDataPush(serverId, currentTime, 0);

			return data;
		}));
	}

	return promises;
};

function graphDataPush(serverId, time, nbrPlayers) {
	// save data to json file
	fs.readFile(__dirname + '/temp/data/serverData_' + serverId + '.json', (err, data) => {
		// create file if does not exist
		if (err) {
			fs.writeFile(__dirname + '/temp/data/serverData_' + serverId + '.json', JSON.stringify([]), (error) => {if (error) throw error});
			return;
		};

		let json;
		// read old data and concat new data
		try {
			json = JSON.parse(data);
		} catch (error) {
			sendError("Couldn't read JSON file.", error);
			json = JSON.parse("[]");
		};

		// remove ~24 hour old data
		let nbrMuchData = json.length - 24 * 60 * 60 / config["statusUpdateTime"];
		if (nbrMuchData > 0) {
			json.splice(0, nbrMuchData);
		};

		json.push({ "x": time, "y": nbrPlayers });

		// append data file 
		fs.writeFile(__dirname + '/temp/data/serverData_' + serverId + '.json', JSON.stringify(json), () => {});
	});
};

//----------------------------------------------------------------------------------------------------------
// create graph
const width = 600;
const height = 400;
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
require('chartjs-adapter-date-fns');
const { toZonedTime } = require('date-fns-tz');
var canvasRenderService = new ChartJSNodeCanvas({ width, height });
var timeFormat = {
	'millisecond': 'HH:mm',
	'second': 'HH:mm',
	'minute': 'HH:mm',
	'hour': 'HH:mm',
	'day': 'HH:mm',
	'week': 'HH:mm',
	'month': 'HH:mm',
	'quarter': 'HH:mm',
	'year': 'HH:mm',
};
async function generateGraph() {
	while (client.token != null) { // client.token is not null if it's alive (logged in)
		try {

			// servers
			let graph_datasets = [];
			let graph_labels = [];
			for (let serverId=0; serverId<config["servers"].length; serverId++) {
				// generate graph
				let data = [];
				try {
					data = JSON.parse(fs.readFileSync(__dirname + '/temp/data/serverData_' + serverId + '.json', { encoding: 'utf8', flag: 'r' }));
				} catch (error) {
					data = [];
				}

				const addLabels = (graph_labels.length == 0);
				let server_datas = [];
				for (let j = 0; j < data.length; j++) {
					server_datas.push(data[j]["y"]);
					if (addLabels) {
						graph_labels.push(toZonedTime(data[j]["x"], config['timezone']));
					}
				}
				
				graph_datasets.push({
					label: config["servers"][serverId]["name"],
					data: server_datas,

					pointRadius: 0,

					backgroundColor: hexToRgb(config["servers"][serverId]["color"], 0.2),
					borderColor: hexToRgb(config["servers"][serverId]["color"], 1.0),

					fill: false,
					spanGaps: true // enable for a single dataset
				})
			}

			let graphConfig = {
				type: 'line',

				data: {
					labels: graph_labels,
					datasets: graph_datasets
				},

				options: {
					plugins: {
						decimation: {
							enabled: true,
							algorithm: 'lttb',
							samples: 500
						},
						legend: {
							display: true,
							labels: {
								color: 'rgb(192,192,192)'
							}
						},
					},

					scales: {
						yAxes: {
							display: true,
							beginAtZero: true,
							ticks: {
								color: 'rgb(192,192,192)',
								precision: 0
							},
							grid: {
								color: 'rgba(255,255,255,0.2)',
								lineWidth: 0.5
							}
						},
						xAxes: {
							display: true,
							type: 'time',
							ticks: {
								color: 'rgb(192,192,192)',
								maxRotation: 0,
								autoSkip: true,
								maxTicksLimit: 10
							},
							time: {
								parser: 'HH:mm',
								displayFormats: timeFormat,
								unit: 'hour',
								stepSize: 1
							},
							grid: {
								color: 'rgba(255,255,255,0.2)',
								lineWidth: 0.5
							}
						}
					},
					datasets: {
						normalized: true
					},
					elements: {
						point: {
							radius: 0
						},
						line: {
							borderWidth: 3 // line width
						}
					},
					animation: {
						duration: 0
					},
					responsiveAnimationDuration: 0,
					hover: {
						animationDuration: 0
					}
				},
			};

			let graphFile = 'graph.png';

			canvasRenderService.renderToBuffer(graphConfig).then(data => {
				fs.writeFileSync(__dirname + '/temp/graphs/' + graphFile, data);
			}).catch((error) => {
				sendError("Couldn't render graph.", error);
			});

		} catch (error) {
			sendError("Couldn't generate graph image.", error);
		};

		await Sleep(60 * 1000); // every 2 minutes
	};
};

// does what its name says
function hexToRgb(hex, opacity) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? "rgba(" + parseInt(result[1], 16) + ", " + parseInt(result[2], 16) + ", " + parseInt(result[3], 16) + ", " + opacity + ")" : null;
};

// Start
init();
