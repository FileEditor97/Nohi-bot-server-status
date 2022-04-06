/*
	Author: Ramzi Sah#2992
	Fork by: GreenLord#0593
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
			message : "instance started."
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
function Sleep(milliseconds) {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
};

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
	let statusChannel = client.channels.cache.get(config["serverStatusChannelId"]);
	
	if (statusChannel == undefined) {
		process.send({
			instanceid : instanceId,
			message : "ERROR: channel id " + config["serverStatusChannelId"] + ", does not exist."
		});
		return;
	};
	
	// get a status message
	let statusMessage = await createStatusMessage(statusChannel);
	
	if (statusMessage == undefined) {
		process.send({
			instanceid : instanceId,
			message : "ERROR: could not send the status message."
		});
		return;
	};

	// start server status loop
	startStatusMessage(statusMessage);
	
	// start generate graph loop
	generateGraph();
});

//----------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------
// create/get last status message
async function createStatusMessage(statusChannel) {
	// get last message
	let statusMessage = await getLastMessage(statusChannel);
	if (statusMessage != undefined) {
		// return last message if exists
		return statusMessage;
	};
	

	// OR create new message
	let embed = new MessageEmbed();
	embed.setTitle("instance starting...");
	embed.setColor('#ffff00');
	
	return await statusChannel.send({ embeds: [embed] }).then((sentMessage)=> {
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
	while(true){
		try {
			// steam link button
			let row = new MessageActionRow()
			row.addComponents(
				new MessageButton()
					.setCustomId('steamLink')
					.setLabel('Присоединиться')
					.setStyle('PRIMARY')
			);
		
			let embed = await generateStatusEmbed();
			statusMessage.edit({ embeds: [embed], components: config["steam_btn"] ? [row] : [],
				files: config["server_enable_graph"] ? [new MessageAttachment(__dirname + "/temp/graphs/graph_" + instanceId + ".png")] : []
			});
		} catch (error) {
			process.send({
				instanceid : instanceId,
				message : "ERROR: could not edit status message. " + error
			});
		};

		await Sleep(config["statusUpdateTime"] * 1000);
	};
};

client.once('reconnecting', c => {
	console.log(`[`+instanceId+`] 🔃 Reconnecting...`);
});

client.on('interactionCreate', interaction => {
	if (!interaction.isButton()) return;

	// Check for CustomID
	if (interaction.customId == 'steamLink')
		interaction.reply({ content: 'steam://connect/' + config["server_host"] + ':' + config["server_port"], ephemeral: true });

});

// Shutdown sequence
client.on('messageCreate', msg => {
	if (msg.channel.type == "DM" && msg.content == "shutdown") {
		if (msg.author.id == config["owner_id"]) {
			msg.reply({ content: 'Shutting down...', allowedMentions: { repliedUser: false }}).then(m => {
				client.user.setActivity("Shutting down...", { type: 'PLAYING' });
				process.send({
					instanceid : instanceId,
					message : "instance shutting down."
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
	let ticEmojy = tic ? "⚪" : "⚫";
	
	let time = new Date();

	embed.setTimestamp(time);

	let serverTime = time.toLocaleString('ru', {timeZone: config['timezone']});

	embed.setFooter({ text: 'Время сервера : ' + serverTime + '\n' + ticEmojy + ' ' + "Последнее обновление" });
	
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
				} else if (serverName[i] == "█") {
					serverName = serverName.slice(0, i) + " " + serverName.slice(i+1);
				} else if (serverName[i] == "�") {
					serverName = serverName.slice(0, i) + " " + serverName.slice(i+2);
				};
			};
			
			// server name field
			embed.addField("Название сервера" + ' :', serverName);
			//-----------------------------------------------------------------------------------------------
			// basic server info
			if (!config["minimal"]) {
				embed.addField("Прямое подключение" + ' :', "`" + state.connect + "`" + (config["server_join"] != "" ? "\nили " + config["server_join"] : ""), true);
				embed.addField("Режим игры" + ' :', config["server_type"] , true);
				if (state.map == "") {
					embed.addField("\u200B", "\u200B", true);
				} else {
					embed.addField("Карта" + ' :', state.map, true);
				};
			};

			embed.addField("Статус" + ' :', "✅ " + "Онлайн", true);
			embed.addField("Кол-во игроков" + ' :', state.players.length + "/" + state.maxplayers, true);
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
					// e !== 'raw' && // need to parse raw data, time and score
					e !== 'skin'
				);
				
				// declare field label
				let field_label = "";
				
				for (let j = 0; j < dataKeys.length && j < 2; j++) {
					// check if data key empty
					if (dataKeys[j] == "") {
						dataKeys[j] = "\u200B";
					};
					
					let player_datas = "```\n";
					for (let i = 0; i < state.players.length; i++) {
						// break if too many players, prevent discord message overflood
						if (i + 1 > 64) {
							if (j == 0) player_datas += "и еще " + (state.players.length - 50) + "...";
							else player_datas += "...";
							break;
						};

						// set player data
						if (state.players[i][dataKeys[j]] != undefined) {
							let player_data = null;
							let process_time = false;
							
							// Player name field
							if (typeof state.players[i][dataKeys[j]] == 'string') {
								process_time = false;
								field_label = "Ник";
								player_data = state.players[i][dataKeys[j]].toString();
								if (player_data == "") {
									player_data = "*loading*";
								};
							};
							
							// Player time field
							if (state.players[i][dataKeys[j]] != null && typeof state.players[i][dataKeys[j]] == 'object') {
								process_time = true;
								field_label = "Время";
								player_data = state.players[i][dataKeys[j]].time;
								if (player_data == undefined) {
									player_data = 0;
								};
							};
							
							// process the time or name
							if (process_time == true) {
								let date = new Date(player_data * 1000).toISOString().substr(11,8).split(":");
								date = date[0] + ":" + date[1] + ":" + date[2];
								player_datas += date;
							} else {
								player_data = player_data.replace(/_/g, " ");
								for (let k = 0; k < player_data.length; k++) {
									if (player_data[k] == "^") {
										player_data = player_data.slice(0, k) + " " + player_data.slice(k+2);
									};
								};
								// handle very long strings
								player_data = (player_data.length > 24) ? player_data.substring(0, 24 - 3) + "..." : player_data;
								let index = i + 1 > 9 ? i + 1 : "0" + (i + 1);
								// new config entry for adding numbers to beginning of name list
								if (config["server_enable_numbers"]) {
									player_datas += j == 0 ? index +  " - " + player_data : player_data;
								} else {
									player_datas += player_data;
								};
								if (dataKeys[j] == "ping") player_datas += " ms";
							};
						};
						
						player_datas += "\n";
					};
					player_datas += "```";
					dataKeys[j] = dataKeys[j].charAt(0).toUpperCase() + dataKeys[j].slice(1);
					embed.addField(field_label + ' :', player_datas, true);
				};
			};
			
			// set bot activity
			client.user.setActivity("✅ Онлайн: " + state.players.length + "/" + state.maxplayers, { type: 'WATCHING' });

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
			client.user.setActivity("❌ Оффлайн.", { type: 'WATCHING' });
	
			// offline status message
			embed.setColor('#ff0000');
			embed.setTitle('❌ ' + "Сервен оффлайн" + '.');

			// add graph data
			graphDataPush(time, 0);

			return embed;
		});
	} catch (error) {
		console.log(error);
		
		// set bot activity
		client.user.setActivity("❌ Оффлайн.", { type: 'WATCHING' });
		
		// offline status message
		embed.setColor('#ff0000');
		embed.setTitle('❌ ' + "Сервен оффлайн" + '.');

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
			console.log("error on graph data")
			console.error(err)
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
	while(true){
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
						label: 'кол-во игроков',
						data: graph_datas,
						
						pointRadius: 0,
						
						backgroundColor: hexToRgb(config["server_color"], 0.2),
						borderColor: hexToRgb(config["server_color"], 1.0),
						// borderWidth: 2, // lines width, for this dataset
      					fill: true
					}]
				},
				
				options: {
					downsample: {
						enabled: true,
						threshold: 500 // max number of points to display per dataset
					},
					plugins: {
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
						line: {
							tension: 0.2, // smooth out
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
				console.error("graph creation for guild " + instanceId + " failed.");
				console.error(error);
			});

		} catch (error) {
			console.error(error);
			process.send({
				instanceid : instanceId,
				message : "could not generate graph image " + error
			});
		};

		await Sleep(60 * 1000); // every minute
	};
};

// does what its name says
function hexToRgb(hex, opacity) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? "rgba(" + parseInt(result[1], 16) + ", " + parseInt(result[2], 16) + ", " + parseInt(result[3], 16) + ", " + opacity + ")" : null;
}