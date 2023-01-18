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

// await for instance id
var instanceId = -1;

process.on('message', function(m) {
	// get message type
	if (Object.keys(m)[0] == "id") {
		// set instance id
		instanceId = m.id
		
		// send ok signal to main process
		process.send({
			instanceid : instanceId,
			message : "Instance started."
		});
		
		// init bot
		init();
	};
});

function init() {
	// get config
	config["instances"][instanceId]["statusUpdateTime"] = config["statusUpdateTime"];
	config = config["instances"][instanceId];
	
	// connect to discord API
	client.login(config["discordBotToken"]);
};

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
require('dotenv').config();
const {Client, EmbedBuilder, AttachmentBuilder, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require('discord.js');
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

//----------------------------------------------------------------------------------------------------------
// once client is ready
client.on('ready', async () => {
	process.send({
		instanceid : instanceId,
		message : "Logged in as \"" + client.user.tag + "\"."
	});
	
	// wait until process instance id receaived
	while (instanceId < 0) {
		await Sleep(1000);
	};
	
	// get broadcast channel
	let statusChannel = client.channels.cache.get(config["serverStatusChannelID"]);
	
	if (statusChannel == undefined) {
		console.error('['+instanceId+'] ERROR: Channel id \"" + config["serverStatusChannelID"] + "\" does not exist.');
		return;
	};
	
	// get a status message
	let statusMessage = await getStatusMessage(statusChannel);
	
	if (statusMessage == undefined) {
		console.error('['+instanceId+'] ERROR at retrieving status message');
		return;
	};

	// start server status loop
	startStatusMessage(statusMessage);
	
	// start generate graph loop
	generateGraph(); // needs it's own loop, as graph is generated only once every minute
});

client.once('reconnecting', c => {
	process.send({
		instanceid : instanceId,
		message : "🔃 Reconnecting..."
	});
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
	embed.setTitle("Запускаю панель...");
	embed.setColor('#ffff00');
	
	return await statusChannel.send({ embeds: [embed] }).then((sentMessage) => {
		return sentMessage;
	});	
};

function getLastMessage(statusChannel) {
	return statusChannel.messages.fetch({limit: 20}).then(messages => {
		// select bot messages
		messages = messages.filter(msg => (msg.author.id == client.user.id && !msg.system));
		
		// return first message
		return messages.first();
	}).catch(function() {
		return;
	});
};


//----------------------------------------------------------------------------------------------------------
// main loops
async function startStatusMessage(statusMessage) {
	while(client.token != null){ // client.token is not null if it's alive (logged in)
		require('dns').resolve('www.discord.com', function(err) {
			if (err) {
				console.log("Lost connection to Discord");
				process.exit(1);
			}
		});
		try {
			// steam link and refresh button button
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
			if (config["server_playerlist"] == "1") {
				row.addComponents(
					new ButtonBuilder()
						.setCustomId('playerlist')
						.setEmoji('📊')
						.setLabel('Показать список игроков')
						.setStyle(ButtonStyle.Success)
				);
			}
		
			let embed = await generateStatusEmbed();
			statusMessage.edit({ embeds: [embed], components: [row],
				files: (config["server_enable_graph"]) ? [new AttachmentBuilder(__dirname + "/temp/graphs/graph_" + instanceId + ".png")] : []
			}).then(() => setTimeout(10000).finally(() => {
				row.components[0].setDisabled(false);
				statusMessage.edit({ components: [row] }).catch(console.error);
			})).catch(console.error);
		} catch (error) {
			console.error('['+instanceId+'] ERROR at editing status message: ', error);
		};

		await SleepCanceable(config["statusUpdateTime"] * 1000);
	};
};

// buttons pressed on status message
client.on('interactionCreate', interaction => {
	if (!interaction.isButton()) return;

	// Check for CustomID
	//  connect button
	if (interaction.customId == 'steamLink')
		interaction.reply({ content: 'steam://connect/' + config["server_host"] + ':' + config["server_port"], ephemeral: true })

	//  refresh button
	else if (interaction.customId == 'refresh') {
		interaction.deferUpdate();
		cancelTimeout.abort();
	}

	//  playerlist button
	else if (interaction.customId == 'playerlist') {
		return gamedig.query({
			type: config["server_type"],
			host: config["server_host"],
			port: config["server_port"],

			maxAttempts: 1,
			socketTimeout: 1000,
			givenPortOnly: true,
			debug: false
		}).then((state) => {
			let embed = new EmbedBuilder();

			embed.setTitle('Список игроков ('+state.players.length + "/" + state.maxplayers+'):');
			embed.setColor(config["server_color"]);

			embed = getPlayerlist(state, embed, true);

			interaction.reply({ embeds: [embed], ephemeral: true });
		}).catch(function(error) {
			interaction.reply({ content: "Не смог получить список игроков. Возможно, сервер оффлайн.", ephemeral: true });
		});
	}

});

//----------------------------------------------------------------------------------------------------------
// fetch data
const gamedig = require('gamedig');
var tic = false;
function generateStatusEmbed() {
	let embed = new EmbedBuilder();

	// set embed name and logo
	embed.setAuthor({ name: config["server_title"], iconURL: config["server_logo"], url: config["server_url"]});
	
	// set embed updated time
	tic = !tic;
	let ticEmojy = tic ? "⚪" : "⚫";
	
	let currentTime = new Date();

	embed.setTimestamp(currentTime);

	let serverTimeString = currentTime.toLocaleString('ru', {timeZone: config['timezone']});

	embed.setFooter({ text: 'Время сервера : ' + serverTimeString + '\n' + ticEmojy + ' ' + "Последнее обновление" });
	
	// query gamedig
	return gamedig.query({
		type: config["server_type"],
		host: config["server_host"],
		port: config["server_port"],

		maxAttempts: 5,
		socketTimeout: 2000,
		givenPortOnly: true,
		debug: false
	}).then((state) => {
		// set embed color
		embed.setColor(config["server_color"]);

		// set server name
		let serverName = config["server_name"];
		// OR get servername from gamedig
		//let serverName = state.name;
			
		// refactor server name
		for (let i = 0; i < serverName.length; i++) {
			if (serverName[i] == "^") {
				serverName = serverName.slice(0, i) + " " + serverName.slice(i+2);
			} else if (serverName[i] == "█") {
				serverName = serverName.slice(0, i) + " " + serverName.slice(i+1);
			} else if (serverName[i] == "�") {
				serverName = serverName.slice(0, i) + " " + serverName.slice(i+2);
			};
		};
			
		// server name field
		embed.addFields({ name: "Название сервера" + ' :', value: serverName});

		// basic server info
		if (!config["minimal"]) {
			embed.addFields(
				{ name: "Прямое подключение" + ' :', value: "`" + state.connect + "`", inline: true },
				{ name: "Режим игры" + ' :', value: (config["server_gamemode"] == "" ? config["server_type"] : config["server_gamemode"]), inline: true },
			);
			if (state.map == "") {
				embed.addFields({ name: "\u200B", value: "\u200B", inline: true });
			} else {
				embed.addFields({ name: "Карта" + ' :', value: state.map, inline: true });
			};
		};

		embed.addFields(
			{ name: "Статус" + ' :', value: "✅ " + "Онлайн", inline: true },
			{ name: "Кол-во игроков" + ' :', value: state.players.length + "/" + state.maxplayers, inline: true },
			{ name: '\u200B', value: '\u200B', inline: true }
		);
			
		// player list
		if (config["server_playerlist"] == "2" && state.players.length > 0) {
			embed = getPlayerlist(state, embed, false);
		};
			
		// set bot activity
		client.user.setActivity("✅ Онлайн: " + state.players.length + "/" + state.maxplayers, { type: 'WATCHING' });

		// add graph data
		graphDataPush(currentTime, state.players.length);

		// set graph image
		if (config["server_enable_graph"]) {
			embed.setImage(
				"attachment://graph_" + instanceId + ".png"
			);
		};

		return embed
	}).catch(function(error) {
		console.error('['+instanceId+'] ERROR at quering the server: ', error);
			
		// set bot activity
		client.user.setActivity("❌ Оффлайн.", { type: 'WATCHING' });
	
		// offline status message
		embed.setColor('#ff0000');
		embed.setTitle('❌ ' + "Сервен оффлайн" + '.');

		// add graph data
		graphDataPush(currentTime, 0);

		return embed
	});
};

function getPlayerlist(state, embed, isInline) {
	// recover game data
	let dataKeys = Object.keys(state.players[0]);
			
	// set name as first
	if (dataKeys.includes('name')) {
		dataKeys = dataKeys.filter(e => e !== 'name');
		dataKeys.splice(0, 0, 'name');
	};
	
	// remove some unwanted data
	dataKeys = dataKeys.filter(e => 
		e !== 'frags' && 
		e !== 'score' && 
		e !== 'guid' && 
		e !== 'id' && 
		e !== 'team' &&
		e !== 'squad' &&
		// e !== 'raw' && // need to parse raw data -> time and score
		e !== 'skin'
	);
		
	// declare field label
	let field_label = "Время и Ник";

	let fields = [];
	let j = 0;
	fields[j] = "```\n";
	for (let i = 0; i < state.players.length; i++) {
		// devides playerlist into multiple fields if character limit reached for one field
		if ((i + 1 - j * 30) > 30) {
			fields[j] += "```";
			j++;
			fields[j] = "```\n";
			/* field_value += "и еще " + (state.players.length - 64) + "...";
			break; */
		}

		// set player data
		if (state.players[i]['name'] != undefined) {
			let player_data = null;

			// adding numbers to beginning of name list
			let index = i + 1 > 9 ? i + 1 : "0" + (i + 1);
			if (config["server_enable_numbers"]) {
				fields[j] += index + '〕';
			};

			// player time data
			player_data = state.players[i]['raw'].time;
			if (player_data == undefined) {
				player_data = 0;
			};
			// process time
			let date = new Date(player_data * 1000).toISOString().substring(11,19).split(":");
			date = date[0] + ":" + date[1];
			fields[j] += date;

			fields[j] += "｜"

			// player name data
			player_data = state.players[i]['name'];
			if (player_data == "") {
				player_data = "*loading*";
			};
			// process name
			for (let k = 0; k < player_data.length; k++) {
				if (player_data[k] == "^") {
					player_data = player_data.slice(0, k) + " " + player_data.slice(k+2);
				};
			};
			// handle very long strings
			// maximum char. for every field is 1024, this implimentation reaches ~1000
			// 7 chars for brackets and 32 (9+22+1) per line
			player_data = (player_data.length > 22) ? player_data.substring(0, 22 - 3) + "..." : player_data;

			fields[j] += player_data;

		};
		fields[j] += "\n";
	};
	fields[j] += "```";

	// add fields to embed
	embed.addFields({ name: field_label + ' :', value: fields[0], inline: isInline });
	for (let i = 1; i < fields.length; i++) {
		embed.addFields({ name: '\u200B', value: fields[i], inline: isInline});
	};

	return embed;
};

function graphDataPush(time, nbrPlayers) {
	// save data to json file
	fs.readFile(__dirname + '/temp/data/serverData_' + instanceId + '.json', function (err, data) {
		// create file if does not exist
		if (err) {
			fs.writeFile(__dirname + '/temp/data/serverData_' + instanceId + '.json', JSON.stringify([]),function(err){if (err) throw err;});
			return;
		};
		
		let json;
		// read old data and concat new data
		try {
			json = JSON.parse(data);
		} catch (err) {
			console.error('['+instanceId+'] ERROR at reading JSON data: ', err);
			json = JSON.parse("[]");
		};
		
		// 1 day history
		let nbrMuchData = json.length - 24 * 60 * 60 / config["statusUpdateTime"];
		if (nbrMuchData > 0) {
			json.splice(0, nbrMuchData);
		};
		
		json.push({"x": time, "y": nbrPlayers});
		
		// rewrite data file 
		fs.writeFile(__dirname + '/temp/data/serverData_' + instanceId + '.json', JSON.stringify(json), function(err){});
	});
};

//----------------------------------------------------------------------------------------------------------
// create graph
const width = 600;
const height = 400;
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
require('chartjs-adapter-date-fns');
const { utcToZonedTime }  = require('date-fns-tz');
var canvasRenderService = new ChartJSNodeCanvas({width, height});
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
	while(client.token != null){ // client.token is not null if it's alive (logged in)
		try {

			// generate graph
			let data = [];

			try {
				data = JSON.parse(fs.readFileSync(__dirname + '/temp/data/serverData_' + instanceId + '.json', {encoding:'utf8', flag:'r'}));
			} catch (error) {
				data = [];
			}

			let graph_labels = [];
			let graph_datas = [];
				
			// set data
			for (let i = 0; i < data.length; i += 1) {
				graph_labels.push(utcToZonedTime(data[i]["x"], config['timezone']));
				graph_datas.push(data[i]["y"]);
			};

			let graphConfig =  {
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

			let graphFile = 'graph_' + instanceId + '.png';
				
			canvasRenderService.renderToBuffer(graphConfig).then(data => {
				fs.writeFileSync(__dirname + '/temp/graphs/' + graphFile, data);
			}).catch(function(error) {
				console.error('['+instanceId+'] ERROR at rendering graph: ', error);
			});

		} catch (error) {
			console.error('['+instanceId+'] ERROR at generating graph image: ', error);
		};

		await Sleep(60 * 1000); // every minute
	};
};

// does what its name says
function hexToRgb(hex, opacity) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? "rgba(" + parseInt(result[1], 16) + ", " + parseInt(result[2], 16) + ", " + parseInt(result[3], 16) + ", " + opacity + ")" : null;
};
