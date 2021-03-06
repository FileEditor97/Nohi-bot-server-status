/*
	Author: Ramzi Sah#2992
	Fork by: FileEditor97
	Desription:
		main bot code
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
	config["instances"][instanceId]["ownerID"] = config["ownerID"];
	config = config["instances"][instanceId];
	
	// connect to discord API
	client.login(config["discordBotToken"]);
};


//----------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------
// common
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
const {Client, MessageEmbed, MessageAttachment, Intents, MessageActionRow, MessageButton} = require('discord.js');
const client = new Client({
	messageEditHistoryMaxSize: 0,
	intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES],
    partials: [
        'CHANNEL', // Required to receive DMs
    ]
});

//----------------------------------------------------------------------------------------------------------
// on client ready
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
		process.send({
			instanceid : instanceId,
			message : "ERROR: Channel id \"" + config["serverStatusChannelID"] + "\" does not exist."
		});
		return;
	};
	
	// get a status message
	let statusMessage = await getStatusMessage(statusChannel);
	
	if (statusMessage == undefined) {
		process.send({
			instanceid : instanceId,
			message : "ERROR: Could not send the status message."
		});
		return;
	};

	// start server status loop
	startStatusMessage(statusMessage);
	
	// start generate graph loop
	generateGraph(); // needs it's own loop, as graph is generated only once every minute
});

//----------------------------------------------------------------------------------------------------------
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
	let embed = new MessageEmbed();
	embed.setTitle("???????????????? ????????????...");
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
	}).catch(function(error) {
		return;
	});
};

//----------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------
// main loops
async function startStatusMessage(statusMessage) {
	while(client.token != null){ // client.token is not null if it's alive (logged in)
		try {
			// steam link and refresh button button
			let row = new MessageActionRow()
				.addComponents(
					new MessageButton()
						.setCustomId('refresh')
						.setEmoji('????')
						.setLabel('????????????????')
						.setStyle('SECONDARY')
						.setDisabled()
				);
			if (config['steam_connect_button']) {
				row.addComponents(
					new MessageButton()
						.setCustomId('steamLink')
						.setLabel('????????????????????????????')
						.setStyle('PRIMARY')
				);
			}
		
			let embed = await generateStatusEmbed();
			statusMessage.edit({ embeds: [embed], components: [row],
				files: (config["server_enable_graph"] && embed.image != null) ? [new MessageAttachment(__dirname + "/temp/graphs/graph_" + instanceId + ".png")] : []
			}).then(() => setTimeout(10000).finally(() => {
				row.components[0].setDisabled(false);
				statusMessage.edit({components: [row]});
			}));
		} catch (error) {
			console.error(error);
			process.send({
				instanceid : instanceId,
				message : "ERROR: Could not edit status message. "
			});
		};

		await SleepCanceable(config["statusUpdateTime"] * 1000);
	};
};

client.once('reconnecting', c => {
	process.send({
		instanceid : instanceId,
		message : "???? Reconnecting..."
	});
});

client.on('interactionCreate', interaction => {
	if (!interaction.isButton()) return;

	// Check for CustomID
	if (interaction.customId == 'steamLink')
		interaction.reply({ content: 'steam://connect/' + config["server_host"] + ':' + config["server_port"], ephemeral: true })

	else if (interaction.customId == 'refresh') {
		interaction.deferUpdate();
		cancelTimeout.abort();
	}

});

// DM's listener
client.on('messageCreate', async msg => {
	if (msg.author.bot) return;

	if (msg.channel.type == "DM" && msg.content == "shutdown") {
		if (msg.author.id == config["ownerID"]) {
			await msg.channel.send("Shutting down...").then(m => {
				client.user.setActivity("Shutting down...", { type: 'PLAYING' });
				process.send({
					instanceid : instanceId,
					message : "Instance shutting down."
				});
				client.destroy();
			});
		}
	}
});



//----------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------
// fetch data
const gamedig = require('gamedig');
var tic = false;
function generateStatusEmbed() {
	let embed = new MessageEmbed();

	// set embed name and logo
	embed.setAuthor({ name: config["server_title"], iconURL: config["server_logo"], url: config["server_url"]});
	
	// set embed updated time
	tic = !tic;
	let ticEmojy = tic ? "???" : "???";
	
	let time = new Date();

	embed.setTimestamp(time);

	let serverTime = time.toLocaleString('ru', {timeZone: config['timezone']});

	embed.setFooter({ text: '?????????? ?????????????? : ' + serverTime + '\n' + ticEmojy + ' ' + "?????????????????? ????????????????????" });
	
	// query gamedig
	try {
		return gamedig.query({
			type: config["server_type"],
			host: config["server_host"],
			port: config["server_port"],

			maxAttempts: 5,
			socketTimeout: 1000,
			debug: false
		}).then((state) => {
			// set embed color
			embed.setColor(config["server_color"]);

			//-----------------------------------------------------------------------------------------------
			// set server name
			let serverName = config["server_name"];
			// OR get servername from gamedig
			//let serverName = state.name;
			
			// refactor server name
			for (let i = 0; i < serverName.length; i++) {
				if (serverName[i] == "^") {
					serverName = serverName.slice(0, i) + " " + serverName.slice(i+2);
				} else if (serverName[i] == "???") {
					serverName = serverName.slice(0, i) + " " + serverName.slice(i+1);
				} else if (serverName[i] == "???") {
					serverName = serverName.slice(0, i) + " " + serverName.slice(i+2);
				};
			};
			
			// server name field
			embed.addField("???????????????? ??????????????" + ' :', serverName);
			//-----------------------------------------------------------------------------------------------
			// basic server info
			if (!config["minimal"]) {
				embed.addField("???????????? ??????????????????????" + ' :', "`" + state.connect + "`", true);
				embed.addField("?????????? ????????" + ' :', config["server_type"] , true);
				if (state.map == "") {
					embed.addField("\u200B", "\u200B", true);
				} else {
					embed.addField("??????????" + ' :', state.map, true);
				};
			};

			embed.addField("????????????" + ' :', "??? " + "????????????", true);
			embed.addField("??????-???? ??????????????" + ' :', state.players.length + "/" + state.maxplayers, true);
			embed.addField('\u200B', '\u200B', true);
			
			//-----------------------------------------------------------------------------------------------
			// player list
			if (config["server_enable_playerlist"] && state.players.length > 0) {
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
				let field_label = "?????????? ?? ??????";

				let fields = [];
				let j = 0;
				fields[j] = "```\n";
				for (let i = 0; i < state.players.length; i++) {
					// devides playerlist into multiple fields if character limit reached for one field
					if ((i + 1 - j * 30) > 30) {
						fields[j] += "```";
						j++;
						fields[j] = "```\n";
						/* field_value += "?? ?????? " + (state.players.length - 64) + "...";
						break; */
					}

					// set player data
					if (state.players[i]['name'] != undefined) {
						let player_data = null;

						// adding numbers to beginning of name list
						let index = i + 1 > 9 ? i + 1 : "0" + (i + 1);
						if (config["server_enable_numbers"]) {
							fields[j] += index + '???';
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

						fields[j] += "???"

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
				embed.addField(field_label + ' :', fields[0], false);
				for (let i = 1; i < fields.length; i++) {
					embed.addField('\u200B', fields[i], false);
				};
			};
			
			// set bot activity
			client.user.setActivity("??? ????????????: " + state.players.length + "/" + state.maxplayers, { type: 'WATCHING' });

			// add graph data
			graphDataPush(time, state.players.length);

			// set graph image
			if (config["server_enable_graph"]) {
				embed.setImage(
					"attachment://graph_" + instanceId + ".png"
				);
			};

			return embed;
		}).catch(function(error) {
			
			// set bot activity
			client.user.setActivity("??? ??????????????.", { type: 'WATCHING' });
	
			// offline status message
			embed.setColor('#ff0000');
			embed.setTitle('??? ' + "???????????? ??????????????" + '.');

			// add graph data
			graphDataPush(time, 0);

			return embed;
		});
	} catch (error) {
		console.error(error);
		process.send({
			instanceid : instanceId,
			message : "ERROR: Failed at querying the server."
		});
		
		// set bot activity
		client.user.setActivity("??? ??????????????.", { type: 'WATCHING' });
		
		// offline status message
		embed.setColor('#ff0000');
		embed.setTitle('??? ' + "???????????? ??????????????" + '.');

		// add graph data
		graphDataPush(time, 0);

		return embed;
	};
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
			console.error(error);
			process.send({
				instanceid : instanceId,
				message : "ERROR: Could not parse/read JSON data."
			});
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

const width = 600;
const height = 400;
require('chartjs-adapter-date-fns');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
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
				graph_labels.push(new Date(data[i]["x"]));
				graph_datas.push(data[i]["y"]);
			};

			let graphConfig =  {
				type: 'line',
					
				data: {
					labels: graph_labels,
					datasets: [{
						label: '??????-???? ??????????????',
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
				console.error(error);
				process.send({
					instanceid : instanceId,
					message : "ERROR: Graph rendering failed."
				});
			});

		} catch (error) {
			console.error(error);
			process.send({
				instanceid : instanceId,
				message : "ERROR: Could not generate graph image."
			});
		};

		await Sleep(60 * 1000); // every minute
	};
};

// does what its name says
function hexToRgb(hex, opacity) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? "rgba(" + parseInt(result[1], 16) + ", " + parseInt(result[2], 16) + ", " + parseInt(result[3], 16) + ", " + opacity + ")" : null;
};
