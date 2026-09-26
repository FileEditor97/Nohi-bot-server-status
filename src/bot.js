/*
	Author: Ramzi Sah#2992
	Fork by: FileEditor97
	Description:
		Main code
		Retrieves status message or creates new, updates every X minutes
*/

// read configs
const fs = require('fs');
const config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

async function sendMsg(text) {
	process.send({
		message: text,
		error: undefined,
	});
}
async function sendError(text, err) {
	process.send({
		message: text,
		error: (err === undefined ? "No message" : err.stack),
	});
}

// log stray promise rejections (e.g. Discord API errors) instead of crashing the instance
process.on('unhandledRejection', (error) => {
	sendError("Unhandled promise rejection.", error);
});

// stop cleanly when main process asks (docker stop, Ctrl+C) or dies
function shutdown() {
	client.destroy().finally(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('disconnect', shutdown);

function init() {
	// set config defaults
	if (config["timezone"] === "") config["timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// load saved graph data
	for (let serverId = 0; serverId < config["servers"].length; serverId++) {
		graphDataLoad(serverId);
	}

	// connect to discord API, exit on failure so main process restarts the instance
	client.login(config["discordBotToken"]).catch((error) => {
		sendError("Couldn't log in to Discord.", error);
		process.exit(1);
	});
}

function parse(text) {
	return (text === "" ? undefined : text)
}

//----------------------------------------------------------------------------------------------------------
// timers
const { setTimeout } = require('timers/promises');
function Sleep(ms) {
	return setTimeout(ms);
}

//----------------------------------------------------------------------------------------------------------
// create client
const {Client, Events, EmbedBuilder, AttachmentBuilder, GatewayIntentBits, RESTJSONErrorCodes} = require('discord.js');
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// once client is ready
client.once(Events.ClientReady, async () => {
	sendMsg("Logged in as \"" + client.user.tag + "\".");

	// get channel
	let statusChannel = client.channels.cache.get(config["serverStatusChannelId"]);
	if (statusChannel === undefined) {
		sendError("Channel by ID '" + config["serverStatusChannelId"] + "' not found.");
		process.exit(1);
	}

	// get a status message
	let statusMessage = await getStatusMessage(statusChannel);
	if (statusMessage === undefined) {
		sendError("Couldn't retrieve or create status message.");
		process.exit(1);
	}

	// render first graph before first status update
	if (config["server_enable_graph"]) await renderGraph();

	// start server status loop
	startStatusMessage(statusChannel, statusMessage);

	// start generate graph loop
	if (config["server_enable_graph"]) generateGraph(); // needs it's own loop, as graph is generated only once every 5 minutes
});

// if reconnecting
client.on(Events.ShardReconnecting, () => {
	sendMsg("Reconnecting...");
});


//----------------------------------------------------------------------------------------------------------
// create/get last status message
async function getStatusMessage(statusChannel) {
	// get last message
	let statusMessage = await getLastMessage(statusChannel);
	if (statusMessage !== undefined) {
		// return last message if exists
		return statusMessage;
	}

	// OR create new message
	let embed = new EmbedBuilder();
	embed.setTitle("Запускаю панель...");
	embed.setColor('#ffff00');

	return await statusChannel.send({ embeds: [embed] }).then((sentMessage) => {
		return sentMessage;
	});
}

function getLastMessage(statusChannel) {
	return statusChannel.messages.fetch({ limit: 20 }).then(messages => {
		// select bot messages
		messages = messages.filter(msg => (msg.author.id === client.user.id && !msg.system));

		// return first message
		return messages.first();
	}).catch(function () {});
}


//----------------------------------------------------------------------------------------------------------
// main loops
let tic = false;
async function startStatusMessage(statusChannel, statusMessage) {
	// noinspection InfiniteLoopJS
	while (true) {
		try {
			let fields = await Promise.all(queryServers());

			let embed = new EmbedBuilder();

			// set embed name and logo
			if (config["title"] !== "") embed.setAuthor({ name: config["title"], iconURL: parse(config["logo"]), url: parse(config["url"]) });

			// set embed times
			tic = !tic;
			let ticEmoji = tic ? "⚪" : "⚫";

			let currentTime = new Date();

			embed.setTimestamp(currentTime);

			let serverTimeString = currentTime.toLocaleString('ru', { timeZone: config['timezone'] });

			embed.setFooter({ text: 'Время сервера : ' + serverTimeString + '\n' + ticEmoji + ' ' + "Последнее обновление" });

			// set color, red if any server is offline
			if (fields.some(field => !field["online"])) {
				embed.setColor('#ff0000');
			} else {
				embed.setColor(config["embed_color"]);
			}

			// Set fields
			for (let i=0; i<fields.length; i++) {
				if (fields[i]["online"]) {
					embed.addFields({ name: '​\n> ▶ '+fields[i]["name"], value: '> ✅ Онлайн - '+fields[i]["count"]+"/"+fields[i]["max"], inline: false },
						{ name: 'Прямое подключение:', value: "`"+fields[i]["host"]+':'+fields[i]["port"]+"`", inline: true },
						{ name: 'Карта:', value: (fields[i]["map"] ? "`"+fields[i]["map"]+"`" : "-"), inline: true });
				} else {
					embed.addFields({ name: '​\n> ▶ '+fields[i]["name"], value: '❌ Офлайн', inline: false });
				}
			}
			// { name: 'Кол-во игроков:', value: fields[i]["count"]+"/"+fields[i]["max"], inline: true }

			// Set graph if available
			let file = [];
			if (config["server_enable_graph"] && graphBuffer !== undefined) {
				embed.setImage("attachment://graph.png");
				file = [new AttachmentBuilder(graphBuffer, { name: "graph.png" })];
			}

			// Edit embed
			await statusMessage.edit({
				embeds: [embed],
				files: file
			});
		} catch (error) {
			if (error.code === RESTJSONErrorCodes.UnknownMessage) {
				// status message was deleted - create new one
				sendMsg("Status message was deleted, creating new one.");
				statusMessage = await getStatusMessage(statusChannel).catch(() => undefined);
				if (statusMessage === undefined) {
					sendError("Couldn't retrieve or create status message.");
					process.exit(1);
				}
				continue;
			}
			sendError("Couldn't edit embed message.", error);
		}

		await Sleep(config["statusUpdateTime"] * 1000);
	}
}

//----------------------------------------------------------------------------------------------------------
// fetch data
const { GameDig } = require('gamedig');
let serversOnline = []; // last known status of every server, to log only on change

function queryServers() {
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
			listenUdpPort: 13550
		}).then((state) => {
			data["online"] = true;

			data["count"] = state.players.length;
			data["max"] = state.maxplayers;

			data["map"] = state.map;

			if (serversOnline[serverId] !== true) sendMsg("Server '" + data["name"] + "' is online.");
			serversOnline[serverId] = true;

			// add graph data
			graphDataPush(serverId, currentTime, state.players.length);

			return data;
		}).catch((error) => {
			// log only when server goes offline, not every update
			if (serversOnline[serverId] !== false) sendError("Couldn't query the server '" + data["name"] + "'.", error);
			serversOnline[serverId] = false;

			// add graph data
			graphDataPush(serverId, currentTime, 0);

			return data;
		}));
	}

	return promises;
}

// graph data is kept in memory and saved to disk to survive restarts
let graphData = [];
const GRAPH_PERIOD = 24 * 60 * 60 * 1000;

function graphDataFile(serverId) {
	return __dirname + '/temp/data/serverData_' + serverId + '.json';
}

function graphDataLoad(serverId) {
	try {
		graphData[serverId] = JSON.parse(fs.readFileSync(graphDataFile(serverId), 'utf8'));
		if (!Array.isArray(graphData[serverId])) graphData[serverId] = [];
	} catch (error) {
		if (error.code !== 'ENOENT') sendError("Couldn't read JSON file.", error);
		graphData[serverId] = [];
	}
}

function graphDataPush(serverId, time, nbrPlayers) {
	let data = graphData[serverId];
	data.push({ "x": time.toISOString(), "y": nbrPlayers });

	// remove data older than 24 hours
	let oldest = time.getTime() - GRAPH_PERIOD;
	let nbrOld = data.findIndex(point => new Date(point.x).getTime() >= oldest);
	if (nbrOld > 0) data.splice(0, nbrOld);

	graphDataSave(serverId, JSON.stringify(data));
}

// write to temp file and rename, so file is never read half-written
// if temp file can't be created (no write permission on the folder), overwrite the file directly
let graphDataAtomic = true;
let graphDataWriteFailed = []; // log write errors only once per server, not every update

function graphDataSave(serverId, json) {
	let file = graphDataFile(serverId);
	let onDone = (error) => {
		if (error) {
			if (!graphDataWriteFailed[serverId]) sendError("Couldn't write JSON file, graph data won't survive restart. Check write permissions of '" + __dirname + "/temp/data'.", error);
			graphDataWriteFailed[serverId] = true;
		} else {
			if (graphDataWriteFailed[serverId]) sendMsg("JSON file '" + file + "' is writable again.");
			graphDataWriteFailed[serverId] = false;
		}
	};

	if (!graphDataAtomic) return fs.writeFile(file, json, onDone);

	fs.writeFile(file + '.tmp', json, (error) => {
		if (error && (error.code === 'EACCES' || error.code === 'EPERM')) {
			if (graphDataAtomic) sendMsg("Can't create temp file in '" + __dirname + "/temp/data', writing JSON files directly.");
			graphDataAtomic = false;
			return fs.writeFile(file, json, onDone);
		}
		if (error) return onDone(error);
		fs.rename(file + '.tmp', file, onDone);
	});
}

//----------------------------------------------------------------------------------------------------------
// create graph
const width = 600;
const height = 400;
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
require('chartjs-adapter-date-fns');
const { toZonedTime } = require('date-fns-tz');
const canvasRenderService = new ChartJSNodeCanvas({ width, height });
const timeFormat = {
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

let graphBuffer = undefined; // latest rendered graph image

async function generateGraph() {
	while (client.token != null) { // client.token is not null if it's alive (logged in)
		await Sleep(300 * 1000); // every 5 minutes
		await renderGraph();
	}
}

async function renderGraph() {
	try {

		// servers, each with its own time points
		let graph_datasets = [];
		for (let serverId=0; serverId<config["servers"].length; serverId++) {
			let server_datas = graphData[serverId].map(point => ({
				x: toZonedTime(point["x"], config['timezone']).getTime(),
				y: point["y"]
			}));

			graph_datasets.push({
				label: config["servers"][serverId]["name"],
				data: server_datas,

				pointRadius: 0,

				backgroundColor: hexToRgb(config["servers"][serverId]["color"], 0.2),
				borderColor: hexToRgb(config["servers"][serverId]["color"], 1.0),

				fill: false,
				spanGaps: true // enable for a single dataset
			});
		}

		let graphConfig = {
			type: 'line',

			data: {
				datasets: graph_datasets
			},

			options: {
				parsing: false, // data is already in {x, y} format
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
					y: {
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
					x: {
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
						borderWidth: 2 // line width
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

		graphBuffer = await canvasRenderService.renderToBuffer(graphConfig);
	} catch (error) {
		sendError("Couldn't render graph.", error);
	}
}

// does what its name says
function hexToRgb(hex, opacity) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? "rgba(" + parseInt(result[1], 16) + ", " + parseInt(result[2], 16) + ", " + parseInt(result[3], 16) + ", " + opacity + ")" : null;
}

// Start
init();
