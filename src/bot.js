/*
	Author: Ramzi Sah#2992
	Fork by: FileEditor97
	Description:
		Main code
		Retrieves status message or creates new, updates every X time or on request
*/

// read configs
const fs = require('fs');
let config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

// await for instance id
let instanceId = -1;

async function sendMsg(text) {
	process.send({
		id: instanceId,
		message: text,
		error: undefined,
	});
}
async function sendError(text, err) {
	process.send({
		id: instanceId,
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

process.on('message', (m) => {
	// get message type
	if (Object.keys(m)[0] === "id") {
		// set instance id
		instanceId = m.id;

		// send ok signal to main process
		sendMsg("ID received by instance.");

		// init bot
		init();
	}
});

function init() {
	// get config
	config["instances"][instanceId]["statusUpdateTime"] = config["statusUpdateTime"];
	config = config["instances"][instanceId];

	// set config defaults
	if (config["timezone"] === "") config["timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone;
	
	// load saved graph data
	graphDataLoad();

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
const {Client, Events, EmbedBuilder, AttachmentBuilder, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, MessageFlags, RESTJSONErrorCodes, embedLength} = require('discord.js');
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// once client is ready
client.once(Events.ClientReady, async () => {
	sendMsg("Logged in as \"" + client.user.tag + "\".");

	// wait until process instance id received
	while (instanceId < 0) {
		await Sleep(1000);
	}

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
	if (config["server_enable_graph"]) generateGraph(); // needs it's own loop, as graph is generated only once every minute
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
let editGeneration = 0;
async function startStatusMessage(statusChannel, statusMessage) {
	// noinspection InfiniteLoopJS
	while (true) {
		try {
			// steam link and refresh button
			let row = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setCustomId('refresh')
						.setEmoji('🔄')
						.setLabel('Обновить')
						.setStyle(ButtonStyle.Secondary)
						.setDisabled()
				);
			if (config['steam_connect_button']) {
				row.addComponents(
					new ButtonBuilder()
						.setCustomId('steamLink')
						.setLabel('Присоединиться')
						.setStyle(ButtonStyle.Primary)
				);
			}
			if (config["server_playerlist"] === "1") {
				row.addComponents(
					new ButtonBuilder()
						.setCustomId('playerlist')
						.setEmoji('📊')
						.setLabel('Показать список игроков')
						.setStyle(ButtonStyle.Success)
				);
			}

			let embed = await generateStatusEmbed();
			let file = config["server_enable_graph"] && graphBuffer !== undefined ?
				[new AttachmentBuilder(graphBuffer, { name: "graph_" + instanceId + ".png" })] : [];
			await statusMessage.edit({
				embeds: [embed], components: [row],
				files: file
			});

			// enable refresh button after 30s, unless message was updated again in meantime
			let generation = ++editGeneration;
			setTimeout(30000).then(() => {
				if (generation !== editGeneration) return;
				row.components[0].setDisabled(false);
				return statusMessage.edit({ components: [row] });
			}).catch(error => {
				sendError("Couldn't enable refresh button.", error);
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

		await SleepCanceable(config["statusUpdateTime"] * 1000);
	}
}

// buttons pressed on status message
client.on(Events.InteractionCreate, interaction => {
	if (!interaction.isButton()) return;

	// interaction may expire (Unknown interaction) if not acknowledged within 3s - don't crash on it
	const onError = (error) => sendError("Couldn't respond to interaction.", error);

	// Check for CustomID
	//  connect button
	if (interaction.customId === 'steamLink')
		interaction.reply({ content: 'steam://connect/' + config["server_host"] + ':' + config["server_port"], flags: MessageFlags.Ephemeral }).catch(onError);

	//  refresh button
	else if (interaction.customId === 'refresh') {
		interaction.deferUpdate().catch(onError);
		cancelTimeout.abort();
	}

	//  players list button
	else if (interaction.customId === 'playerlist') {
		// acknowledge first, query can take longer than 3s
		return interaction.deferReply({ flags: MessageFlags.Ephemeral }).then(() => GameDig.query({
			type: config["server_type"],
			host: config["server_host"],
			port: config["server_port"],

			maxAttempts: 1,
			socketTimeout: 2000,
			givenPortOnly: true,
			listenUdpPort: 13550
		}).then((state) => {
			let embed = new EmbedBuilder();

			embed.setTitle('Список игроков ('+state.players.length + "/" + state.maxplayers+'):');
			embed.setColor(config["server_color"]);

			if (state.players.length > 0) embed = getPlayerlist(state, embed, true);

			return interaction.editReply({ embeds: [embed] });
		}, () => {
			return interaction.editReply({ content: "Не смог получить список игроков. Возможно, сервер оффлайн." });
		})).catch(onError);
	}

});

//----------------------------------------------------------------------------------------------------------
// fetch data
const { GameDig } = require('gamedig');
let tic = false;
let serverOnline = undefined; // last known status, to log only on change

function generateStatusEmbed() {
	let embed = new EmbedBuilder();

	// set embed name and logo
	if (config["server_title"] !== "") embed.setAuthor({ name: config["server_title"], iconURL: parse(config["server_logo"]), url: parse(config["server_url"]) });

	// set embed updated time
	tic = !tic;
	let ticEmoji = tic ? "⚪" : "⚫";

	let currentTime = new Date();

	embed.setTimestamp(currentTime);

	let serverTimeString = currentTime.toLocaleString('ru', { timeZone: config['timezone'] });

	embed.setFooter({ text: 'Время сервера : ' + serverTimeString + '\n' + ticEmoji + ' ' + "Последнее обновление" });

	// query gamedig
	return GameDig.query({
		type: config["server_type"],
		host: config["server_host"],
		port: config["server_port"],

		maxAttempts: 3,
		socketTimeout: 3000,
		attemptTimeout: 9000,
		givenPortOnly: true,
		listenUdpPort: 13550
	}).then((state) => {
		// set embed color
		embed.setColor(config["server_color"]);

		// set server name
		let serverName = config["server_name"];
		if (serverName === "") serverName = state.name || "\u200B";

		// refactor server name
		//for (let i = 0; i < serverName.length; i++) {
		//	if (serverName[i] == "^") {
		//		serverName = serverName.slice(0, i) + " " + serverName.slice(i + 2);
		//	} else if (serverName[i] == "█") {
		//		serverName = serverName.slice(0, i) + " " + serverName.slice(i + 1);
		//	} else if (serverName[i] == " ") {
		//		serverName = serverName.slice(0, i) + " " + serverName.slice(i + 2);
		//	};
		//};

		// server name field
		embed.addFields({ name: "Название сервера" + ' :', value: serverName });

		// basic server info
		if (!config["minimal"]) {
			embed.addFields(
				{ name: "Прямое подключение" + ' :', value: "`" + state.connect + "`", inline: true },
				{ name: "Режим игры" + ' :', value: (config["server_gamemode"] === "" ? config["server_type"] : config["server_gamemode"]), inline: true }
			);
			if (state.map === "") {
				embed.addFields({ name: "\u200B", value: "\u200B", inline: true });
			} else {
				embed.addFields({ name: "Карта" + ' :', value: state.map, inline: true });
			}
		}

		embed.addFields(
			{ name: "Статус" + ' :', value: "✅ " + "Онлайн", inline: true },
			{ name: "Кол-во игроков" + ' :', value: state.players.length + "/" + state.maxplayers, inline: true },
			{ name: '\u200B', value: '\u200B', inline: true }
		);

		// player list
		if (config["server_playerlist"] === "2" && state.players.length > 0) {
			embed = getPlayerlist(state, embed, false);
		}

		if (serverOnline !== true) sendMsg("Server is online.");
		serverOnline = true;

		// set bot activity
		client.user.setActivity("✅ Онлайн: " + state.players.length + "/" + state.maxplayers, { type: ActivityType.Watching });

		// add graph data
		graphDataPush(currentTime, state.players.length);

		// set graph image
		if (config["server_enable_graph"]) {
			embed.setImage(
				"attachment://graph_" + instanceId + ".png"
			);
		}
		
		return embed;
	}).catch((error) => {
		// log only when server goes offline, not every update
		if (serverOnline !== false) sendError("Couldn't query the server", error);
		serverOnline = false;

		// set bot activity
		client.user.setActivity("❌ Оффлайн.", { type: ActivityType.Watching });

		// offline status message
		embed.setColor('#ff0000');
		embed.setTitle('❌ ' + "Сервер оффлайн" + '.');

		// add graph data
		graphDataPush(currentTime, 0);

		// set graph image
		if (config["server_enable_graph"]) {
			embed.setImage(
				"attachment://graph_" + instanceId + ".png"
			);
		}
		return embed;
	});
}

// formats seconds as HH:mm (hours can exceed 24)
function formatPlaytime(seconds) {
	seconds = Math.max(0, Math.floor(Number(seconds) || 0));
	let hours = Math.floor(seconds / 3600);
	let minutes = Math.floor(seconds % 3600 / 60);
	return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
}

function getPlayerlist(state, embed, isInline) {
	// declare field label
	let field_label = "Время и Ник";

	// build one line per player
	let lines = [];
	for (let i = 0; i < state.players.length; i++) {
		let line = "";

		// set player data
		if (state.players[i]['name'] !== undefined) {
			// adding numbers to beginning of name list
			let index = i + 1 > 9 ? i + 1 : "0" + (i + 1);
			if (config["server_enable_numbers"]) {
				line += index + '〕';
			}

			// player time data (raw may be missing for some games)
			line += formatPlaytime(state.players[i].raw?.time);

			line += "｜"

			// player name data
			let player_data = state.players[i]['name'];
			if (player_data === "") {
				player_data = "*loading*";
			}
			// process name
			for (let k = 0; k < player_data.length; k++) {
				if (player_data[k] === "^") {
					player_data = player_data.slice(0, k) + " " + player_data.slice(k + 2);
				}
			}
			// handle very long strings
			// maximum char. for every field is 1024, this implementation reaches ~1000
			// 7 chars for brackets and 32 (9+22+1) per line
			player_data = (player_data.length > 22) ? player_data.substring(0, 22 - 3) + "..." : player_data;

			line += player_data;
		}
		lines.push(line);
	}

	// divide players list into fields of 30 lines, staying under discord embed limits
	// (6000 characters total, 25 fields)
	const FIELD_LINES = 30;
	const OVERHEAD = field_label.length + 2 + 8; // name + code block brackets
	let budget = 6000 - embedLength(embed.data) - 50; // reserve for "and N more"
	let fieldsLeft = 25 - (embed.data.fields?.length ?? 0) - 1;

	let fields = [];
	let shown = 0;
	while (shown < lines.length && fieldsLeft > 0) {
		let chunk = lines.slice(shown, shown + FIELD_LINES);
		// shrink chunk until it fits into remaining budget
		while (chunk.length > 0 && chunk.join("\n").length + OVERHEAD > budget) {
			chunk.pop();
		}
		if (chunk.length === 0) break;

		let value = "```\n" + chunk.join("\n") + "\n```";
		budget -= value.length + OVERHEAD;
		fieldsLeft--;
		fields.push(value);
		shown += chunk.length;
	}

	// add fields to embed
	for (let i = 0; i < fields.length; i++) {
		embed.addFields({ name: i === 0 ? field_label + ' :' : '\u200B', value: fields[i], inline: isInline });
	}
	if (shown < lines.length) {
		embed.addFields({ name: '\u200B', value: "и ещё " + (lines.length - shown) + "...", inline: false });
	}

	return embed;
}

// graph data is kept in memory and saved to disk to survive restarts
let graphData = [];
const GRAPH_PERIOD = 24 * 60 * 60 * 1000;

function graphDataFile() {
	return __dirname + '/temp/data/serverData_' + instanceId + '.json';
}

function graphDataLoad() {
	try {
		graphData = JSON.parse(fs.readFileSync(graphDataFile(), 'utf8'));
		if (!Array.isArray(graphData)) graphData = [];
	} catch (error) {
		if (error.code !== 'ENOENT') sendError("Couldn't read JSON file.", error);
		graphData = [];
	}
}

function graphDataPush(time, nbrPlayers) {
	graphData.push({ "x": time.toISOString(), "y": nbrPlayers });

	// remove data older than 24 hours
	let oldest = time.getTime() - GRAPH_PERIOD;
	let nbrOld = graphData.findIndex(point => new Date(point.x).getTime() >= oldest);
	if (nbrOld > 0) graphData.splice(0, nbrOld);

	// write to temp file and rename, so file is never read half-written
	let file = graphDataFile();
	fs.writeFile(file + '.tmp', JSON.stringify(graphData), (error) => {
		if (error) return sendError("Couldn't write JSON file.", error);
		fs.rename(file + '.tmp', file, (error) => {
			if (error) sendError("Couldn't write JSON file.", error);
		});
	});
}

//----------------------------------------------------------------------------------------------------------
// create graph
const width = 600;
const height = 400;
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
require('chartjs-adapter-date-fns');
const { toZonedTime } = require('date-fns-tz');
const canvasRenderService = new ChartJSNodeCanvas({width, height});
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
		await Sleep(60 * 1000); // every minute
		await renderGraph();
	}
}

async function renderGraph() {
	try {

		// generate graph
		let data = graphData;

		let graph_labels = [];
		let graph_datas = [];

		// set data
		for (let i = 0; i < data.length; i += 1) {
			graph_labels.push(toZonedTime (data[i]["x"], config['timezone']));
			graph_datas.push(data[i]["y"]);
		}

		let graphConfig = {
			type: 'line',

			data: {
				labels: graph_labels,
				datasets: [{
					label: 'кол-во игроков',
					data: graph_datas,

					pointRadius: 0,

					backgroundColor: hexToRgb(config["server_color"], 0.2),
					borderColor: hexToRgb(config["server_color"], 1.0),

					fill: true,
					spanGaps: true // enable for a single dataset
				}]
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
