const zlib = require('zlib')
const drop = require('drag-and-drop-files')
const fileReaderStream = require('filereader-stream')
const concat = require('concat-stream')
const $ = require('jquery')
const { FILE } = require('dns')

var LOADED_FILES = {}
var GAMESESSION = null
var CAMPAIGN = null
var FILENAME = ''
var SUBFILEMAP = {}
var MULTIPLAYER = false

// #region files handling

// file upload handler
function handleFileUpload(files) {
	var file = files[0]

	if (!file.name.endsWith('.save') && !GAMESESSION) {
		window.alert('Uploaded file is not a ".save" file. Upload .save file to start editing.')
		return console.warn('Selected file is not a ".save" file')
	}

	fileReaderStream(file).pipe(
		concat(function (contents) {
			console.log('File loaded successfully')

			// save file
			if (file.name.endsWith('.save')) {
				FILENAME = file.name

				LOADED_FILES = {}

				var buffer = Buffer.from(zlib.gunzipSync(contents))

				var i = 0
				while (i < buffer.length) {
					// file name
					var name_length = buffer.readInt32LE(i)
					// console.log(name_length)
					i += 4
					var name = buffer.toString('utf-16le', i, i + name_length * 2)
					// console.log(name)
					i += name_length * 2

					//file contents
					var f_length = buffer.readInt32LE(i)
					// console.log(f_length)
					i += 4
					var f_content = buffer.slice(i, i + f_length)
					i += f_length

					// gamesession saved as xml, other as raw buffer
					if (name === 'gamesession.xml') {
						var string = f_content.toString('utf-8')
						// strip the header - is causing errors
						var xmlData = $.parseXML(string.substring(`<?xml version="1.0" encoding="utf-8"?>\n`.length))
						GAMESESSION = $(xmlData).find('Gamesession')
					} else {
						LOADED_FILES[name] = f_content
					}
				}

				console.log('Files decompressed successfully')
				generateSubFileMap()
				loadGameSession()
			} else if (file.name.endsWith('.sub')) {
				var name = getNameFromSubFile(contents)
				if (!name) return window.alert('Could not decompress .sub file, it might be invalid')

				if (LOADED_FILES[file.name]) {
					if (!SUBFILEMAP[name]) return window.alert(`File ${file.name} exists, but owned submarine ${name} doesn't. Aborting changes.`)
					console.log(`Updated ${name} submarine file: ${file.name}`)
					showMsg(`Updated <span>${name}</span> submarine file: <span>${file.name}</span>`)
				} else {
					if (SUBFILEMAP[name]) return window.alert(`File ${file.name} doesnt exist, but owned submarine ${name} does. Aborting changes.`)
					var ownedSubs = GAMESESSION.find('ownedsubmarines')
					ownedSubs.append(`<sub name="${name}" />`)
					console.log(`Added new owned submarine ${name}, in file: ${file.name}`)
					showMsg(`Added new owned submarine <span>${name}</span>, in file: <span>${file.name}</span>`)
					SUBFILEMAP[name] = file.name
				}

				LOADED_FILES[file.name] = contents
				updateOwnedSubs()
			} else if (file.name == 'gamesession.xml') {
				var string = contents.toString('utf-8')
				// strip the header - is causing errors
				var xmlData = $.parseXML(string.substring(`<?xml version="1.0" encoding="utf-8"?>\n`.length))
				GAMESESSION = $(xmlData).find('Gamesession')
				loadGameSession()
				console.log('Updated gamesession.xml')
				showMsg('Updated <span>gamesession.xml</span>')
			} else {
				return window.alert(`File extension not recognized.`)
			}
		})
	)
}

// dropbox hadling
drop(document.getElementById('drop'), handleFileUpload)

// click on dropbox handing
$('#drop').on('click', () => {
	$('#hiddenFileInput').trigger('click')
})

$('#hiddenFileInput').on('change', () => {
	let files = $('#hiddenFileInput')[0].files
	if (files.length < 1) return
	handleFileUpload(files)
})

function addToBuffer(filename, content, buffer) {
	var name = Buffer.from(filename, 'utf-16le')
	var name_length = Buffer.alloc(4)
	name_length.writeInt32LE(filename.length)

	var file

	if (typeof content == 'string') {
		file = Buffer.from(content, 'utf-8')
	} else {
		file = content
	}
	var file_length = Buffer.alloc(4)
	file_length.writeInt32LE(file.length)

	return Buffer.concat([buffer, name_length, name, file_length, file])
}

// download button
$('#downloadButton').on('click', () => {
	console.log('Compressing save')
	var buffer = Buffer.alloc(0)

	// gamesession.xml  - add stripped header
	let gameses_string = `<?xml version="1.0" encoding="utf-8"?>\n` + GAMESESSION.prop('outerHTML')
	buffer = addToBuffer('gamesession.xml', gameses_string, buffer)

	// other files
	for (let filename in LOADED_FILES) {
		buffer = addToBuffer(filename, LOADED_FILES[filename], buffer)
	}

	// compression
	var output = zlib.gzipSync(buffer)

	var blob = new Blob([output.buffer], { type: 'application/gzip' })
	var blobUrl = URL.createObjectURL(blob)

	var a = document.createElement('a')
	a.href = blobUrl
	a.download = FILENAME
	a.click()

	console.log(`Prompted to download savefile`)

	$('#downloadPrompt').hide()
})

// decompress .sub file and get name from xml
function getNameFromSubFile(buffer) {
	var output = zlib.gunzipSync(buffer).toString('utf-8')
	var name = $($.parseXML(output)).find('Submarine').attr('name')
	if (!name) console.error(`Failed to fetch submarine name`)
	return name
}

function generateSubFileMap() {
	// map submarine names from .sub files - in case they're compretely different (R-29)
	SUBFILEMAP = {}
	for (let filename in LOADED_FILES) {
		if (!filename.endsWith('.sub')) continue
		var name = getNameFromSubFile(LOADED_FILES[filename])
		if (!name) return window.alert(`Failed to decompress ${filename}, it might be invalid`)
		SUBFILEMAP[name] = filename
	}
	console.log('Mapped submarine names correctly.')
}

// download gamesession.xml
$('#downloadGamesession').on('click', () => {
	// gamesession.xml  - add stripped header
	let gameses_string = `<?xml version="1.0" encoding="utf-8"?>\n` + GAMESESSION.prop('outerHTML')
	var blob = new Blob([gameses_string], { type: 'application/xml' })
	var blobUrl = URL.createObjectURL(blob)

	var a = document.createElement('a')
	a.href = blobUrl
	a.download = 'gamesession.xml'
	a.click()
})

// #endregion files handling

// get data from gamesession
function loadGameSession() {
	CAMPAIGN = GAMESESSION.find('MultiPlayerCampaign')
	if (CAMPAIGN.length == 0) {
		CAMPAIGN = GAMESESSION.find('SinglePlayerCampaign')
		MULTIPLAYER = false
	} else MULTIPLAYER = true

	var timestamp = new Date(parseInt(GAMESESSION.attr('savetime')) * 1000)

	showMsg(`Loaded ${MULTIPLAYER ? 'multiplayer' : 'singleplayer'} savefile: <span>${FILENAME}</span>`)

	$('#dropWrapper .desc').text('Drag .sub file to add it as owned submarine. Drag gamesession.xml to replace currently loaded one.')
	$('#tools').show()
	$('#loadedInfo .name').text(FILENAME)
	$('#loadedInfo .date').text(timestamp.toLocaleString())
	$('#moneyInput').val(CAMPAIGN.attr('money'))
	var type = 'Multiplayer'
	var falseType = 'Singleplayer'
	if (!MULTIPLAYER) [type, falseType] = [falseType, type]
	$('#saveTypeLabel').text(type)
	$('#notSaveTypeLabel').text(falseType)
	updateAvalSubs()
	updateOwnedSubs()
	updateCrewList()
}

// help popup
$('#fileLocHelp').on('click', () => {
	var infobox = $(`<div id="infoBox"></div>`)
	var close = $(`<div id=closeInfoBox>X</div>`)
	var textWrapper = $(`<div class="text"></div>`)
	textWrapper.html(`
	<h3>Savefiles location depends on your operating system:</h3><ul>
	<li>Windows - <span class="highlight">C:\\Users\\%username%\\AppData\\Local\\Daedalic Entertainment GmbH\\Barotrauma</span></li>
	<br><li>Linux - <span class="highlight">/home/$USER/.local/share/Daedalic Entertainment GmbH/</span></li>
	<br><li>macOS - <span class="highlight">/$USER/Library/Application Support/Daedalic Entertainment GmbH/</span></li>
	</ul>
	`)
	infobox.append(close).append(textWrapper)
	close.on('click', () => {
		close.off('click')
		infobox.remove()
	})
	$(document.body).append(infobox)
})

// "console" popups
function showMsg(msg) {
	let entry = $(`<div class="consoleMsg">[${new Date().toLocaleTimeString()}] - ${msg}</div>`)
	entry.appendTo($('#console')).hide().fadeIn(1000)
	setTimeout(() => {
		entry.fadeOut(1000, () => {
			entry.remove()
		})
	}, 1000 * 5)
}

// #region tools

// #region available submarines list
function updateAvalSubs() {
	$('.avalSubListElement').remove()

	var avalSubs = CAMPAIGN.find('AvailableSubs')

	// don't render component if no AvalSubs (SP save loaded)
	if (avalSubs.length < 1) return $('#availableSubs').hide()
	else $('#availableSubs').show()

	avalSubs.find('Sub').each(function () {
		var name = $(this).attr('name')
		var nameLabel = $(`<div class="name">${name}</div>`)
		var delButton = $('<div class="deleteButton">X</div>')
		var listEl = $('<div class="avalSubListElement subListElement"></div>')
		listEl.append(nameLabel)
		listEl.append(delButton)
		listEl.appendTo($('#avalSubListWrapper'))

		delButton.on('click', () => {
			console.log(`Removing ${name} from available subs`)
			$(this).remove()
			listEl.remove()
			showMsg(`Removed <span>${name}</span> from available subs`)
		})
	})
}
$('#addToAvalSubsButton').on('click', () => {
	var name = $('#addToAvalSubs').val()
	console.log(`Adding ${name} to availale subs`)
	$('#addToAvalSubs').val('')
	var avalSubs = CAMPAIGN.find('AvailableSubs')
	avalSubs.append(`<Sub name="${name}" />`)
	showMsg(`Added <span>${name}</span> to available subs`)

	updateAvalSubs()
})
// #endregion available submarines list

// #region owned submarines list
function updateOwnedSubs() {
	var selectedSub = GAMESESSION.attr('submarine')
	$('.ownedSubListElement').remove()
	GAMESESSION.find('ownedsubmarines')
		.find('sub')
		.each(function () {
			var name = $(this).attr('name')
			var radio = $(`<input type="radio" name="selectedOwnedSub" value="${name}" ${name == selectedSub ? 'checked' : ''}/>`)
			var nameLabel = $(`<div class="name">${name}</div>`)
			var download = $('<img class="downloadImg" src="./res/download.svg" alt="download" />')
			var delButton = $('<div class="deleteButton">X</div>')
			var listEl = $('<div class="ownedSubListElement subListElement"></div>')
			listEl.append(radio)
			listEl.append(nameLabel)
			listEl.append(download)
			listEl.append(delButton)
			listEl.appendTo($('#ownedSubListWrapper'))

			delButton.on('click', () => {
				console.log(`Removing ${name} from available subs`)
				$(this).remove()
				listEl.remove()
				// remove .sub file & entry in name map
				delete LOADED_FILES[SUBFILEMAP[name]]
				delete SUBFILEMAP[name]
				showMsg(`Removed <span>${name}</span> from available subs`)
			})

			radio.on('click', function () {
				console.log(`Changing selected submarine to ${this.value}`)
				GAMESESSION.attr('submarine', this.value)
				showMsg(`Changed selected submarine to <span>${this.value}</span>`)
			})

			download.on('click', () => {
				let filename = SUBFILEMAP[name]
				let contents = LOADED_FILES[filename]

				var blob = new Blob([contents], { type: 'application/gzip' })
				var blobUrl = URL.createObjectURL(blob)

				var a = document.createElement('a')
				a.href = blobUrl
				a.download = filename
				a.click()
			})
		})
}
// #endregion owned submarines list

$('#moneyConfirm').on('click', () => {
	let money = $('#moneyInput').val()
	CAMPAIGN.attr('money', money)
	console.log(`Set current money to ${money}`)
	showMsg(`Set current money to <span>${money}</span>`)
})

// convert save file
$('#convertSaveButton').on('click', () => {
	let warningString = MULTIPLAYER ? `WARNING: after converting savefile to singleplayer type all human controlled characters will be lost. Make sure you have some bots or that save might get bricked.\n\nPress OK to continue` : `WARNING: after converting savefile to multiplayer available submarines will be stripped and current crew will become AI crew\n\nPress OK to continue`

	let confirm = window.confirm(warningString)
	if (confirm === false) {
		console.log('Cancelled save conversion')
		return showMsg('Cancelled save conversion')
	}

	if (MULTIPLAYER) {
		// crew
		var crew = CAMPAIGN.find('bots')
		crew.replaceWith(`<crew>${crew.html()}</crew>`)

		// campaign attributes
		var money = CAMPAIGN.attr('money')
		var cheats = CAMPAIGN.attr('cheatsenabled')

		// strip aval subs
		var avalSubs = CAMPAIGN.find('AvailableSubs')
		avalSubs.remove()

		// convert
		CAMPAIGN.replaceWith(`<SinglePlayerCampaign money="${money}" cheatsenabled="${cheats}">${CAMPAIGN.html()}</SinglePlayerCampaign>`)

		console.log(`Converted campaign type to SinglePlayer`)
		showMsg(`Converted campaign type to <span>SinglePlayer</span>`)
	} else {
		// crew
		var crew = CAMPAIGN.find('crew')
		crew.replaceWith(`<bots hasbots="true">${crew.html()}</bots>`)

		// campaign attributes
		var money = CAMPAIGN.attr('money')
		var cheats = CAMPAIGN.attr('cheatsenabled')

		// add default avalsubs
		CAMPAIGN.append(`<AvailableSubs><Sub name="Azimuth" /><Sub name="Berilia" /><Sub name="Dugong" /><Sub name="Humpback" /><Sub name="Kastrull" /><Sub name="Orca" /><Sub name="R-29" /><Sub name="Remora" /><Sub name="Typhon" /><Sub name="Typhon2" /></AvailableSubs>`)

		// convert
		CAMPAIGN.replaceWith(`<MultiPlayerCampaign money="${money}" cheatsenabled="${cheats}">${CAMPAIGN.html()}</MultiPlayerCampaign>`)

		// set campaign id tag
		GAMESESSION.attr('campaignid', (Math.floor(Math.random() * 31) + 50).toString()) // temp untill id field is added

		console.log(`Converted campaign type to MultiPlayer`)
		showMsg(`Converted campaign type to <span>MultiPlayer</span>`)
		console.log(GAMESESSION)
	}
	loadGameSession()
})

// #region crew list
function updateCrewList() {
	// singleplayer
	var crew = GAMESESSION.find('crew')

	// multiplayer
	if (crew.length < 1) crew = GAMESESSION.find('bots')

	$('.crewListElement').remove()

	crew.find('Character').each(function () {
		var name = $(this).attr('name')
		var job = $(this).find('job').attr('identifier')

		var nameLabel = $(`<div class="name ${job}">${name}</div>`)
		// var editButton = $('<div class="deleteButton">X</div>')
		var listEl = $('<div class="ownedSubListElement subListElement"></div>')
		listEl.append(nameLabel)
		// listEl.append(editButton)
		listEl.appendTo($('#crewListWrapper'))
	})
}
// #endregion crew list

// #endregion tools
