const zlib = require('zlib')
const drop = require('drag-and-drop-files')
const fileReaderStream = require('filereader-stream')
const concat = require('concat-stream')
const $ = require('jquery')

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
			} else if (file.name.endsWith('CharacterData.xml')) {
				var string = contents.toString('utf-8')
				// strip the header - is causing errors
				var xmlData = $.parseXML(string.substring(`<?xml version="1.0" encoding="utf-8"?>\n`.length))

				var crew
				if (MULTIPLAYER) {
					crew = CAMPAIGN.find('bots')
					crew.attr('hasbots', 'true')
				} else crew = CAMPAIGN.find('crew')

				$(xmlData)
					.find('CharacterCampaignData')
					.each(function () {
						let chData = $(this)
						let character = chData.find('Character')
						let inventory = chData.find('inventory')[0] // its also used for subinvetories - take the first one
						let health = chData.find('health')
						character.append(inventory).append(health)
						crew.append(character)
						let name = character.attr('name')
						console.log(`Added ${name} to the crew list`)
						showMsg(`Added <span>${name}</span> to the crew list`)
					})

				updateCrewList()
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

	// show main panel
	// $('#dropWrapper .desc').html('Drag .sub file to add it as owned submarine.<br/>Drag gamesession.xml to replace currently loaded one.<br/>Drag name_CharacterData.xml to import human characters as bots.')
	if ($('#tools').is(':hidden')) {
		$('#dropWrapper .desc').html('Click here to see what files can be uploaded')
		$('#dropWrapper .desc').css('cursor', 'pointer')
		$('#dropWrapper .desc').on('click', () => {
			showInfoBox(`
			<h3>Drag files to modify save:</h3>
			Drag another <span>.save</span> file to edit it instead.<br>
			Drag <span>.sub</span> file to add it as owned submarine (or update existing owned subarine with matching name).<br>
			Drag <span>gamesession.xml</span> to replace currently loaded one.<br>
			Drag <span>[name]_CharacterData.xml</span> to import human characters as bots.<br>
			`)
		})
		$('#tools').show()
	}

	// savefile details
	$('#loadedInfo .name').text(FILENAME)
	$('#loadedInfo .date').text(timestamp.toLocaleString())

	// other tools
	$('#moneyInput').val(CAMPAIGN.attr('money'))

	// mp campaign_id input
	if (MULTIPLAYER) {
		$('#mpIdTool').show()
		let id = GAMESESSION.attr('campaignid')
		$('#idInput').val(id)
	} else {
		$('#mpIdTool').hide()
	}
	// savefile conversion labels
	var type = 'Multiplayer'
	var falseType = 'Singleplayer'
	if (!MULTIPLAYER) [type, falseType] = [falseType, type]
	$('#saveTypeLabel').text(type)
	$('#notSaveTypeLabel').text(falseType)

	updateAvalSubs()
	updateOwnedSubs()
	updateCrewList()
}

function showInfoBox(text) {
	var infobox = $(`<div class="infoBox"></div>`)
	var close = $(`<div class=closeInfoBox>X</div>`)
	var textWrapper = $(`<div class="text"></div>`)
	textWrapper.html(text)
	infobox.append(close).append(textWrapper)
	close.on('click', () => {
		close.off('click')
		infobox.remove()
	})
	$(document.body).append(infobox)
}

// help popup
$('#fileLocHelp').on('click', () => {
	showInfoBox(`
	<h3>Savefiles location depends on your operating system:</h3><ul>
	<li>Windows - <span>C:\\Users\\%username%\\AppData\\Local\\Daedalic Entertainment GmbH\\Barotrauma</span></li>
	<br><li>Linux - <span>/home/$USER/.local/share/Daedalic Entertainment GmbH/</span></li>
	<br><li>macOS - <span>/$USER/Library/Application Support/Daedalic Entertainment GmbH/</span></li>
	</ul>
	`)
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
			var radio = $(`<input type="radio" title="Set as currently selected submarine" name="selectedOwnedSub" value="${name}" ${name == selectedSub ? 'checked' : ''}/>`)
			var nameLabel = $(`<div class="name">${name}</div>`)
			var download = $('<img class="downloadImg" src="./res/download.svg" alt="download" title="download"/>')
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

// clean dirt
$('#cleanDirt').on('click', () => {
	for (let subfile of Object.values(SUBFILEMAP)) {
		var output = zlib.gunzipSync(LOADED_FILES[subfile]).toString('utf-8')
		var submarine = $($.parseXML(output)).find('Submarine')
		var cleanedCount = 0
		submarine.find('Hull').each(function () {
			var hull = $(this)
			if (hull.attr('backgroundsections') !== '') {
				hull.attr('backgroundsections', '')
				cleanedCount++
			}
		})
		console.log(`Cleaned ${cleanedCount} hulls in ${subfile}`)
		showMsg(`Cleaned <span>${cleanedCount}</span> rooms in <span>${subfile}</span>`)

		if (!cleanedCount) {
			console.log('nothing changed, not saving')
			continue
		}

		var string = submarine.prop('outerHTML')
		var compressed = zlib.gzipSync(string)
		LOADED_FILES[subfile] = compressed
		console.log('saved properly')
	}
})
// #endregion owned submarines list

// #region other tools

// edit gamesession.xml
$('#editGamesession').on('click', () => {
	var infobox = $(`<div class="infoBoxLarge"></div>`)

	var firstLineWrapper = $(`<div class=firstLineWrapper><h2>Editing gamesession.xml</span></h2></div>`)
	firstLineWrapper.appendTo(infobox)

	var closeButtonsWrapper = $(`<div class=closeButtonsWrapper></div>`)
	closeButtonsWrapper.appendTo(firstLineWrapper)

	var saveButton = $('<div class="savebutton">Save</div>')
	saveButton.appendTo(closeButtonsWrapper)
	saveButton.on('click', () => {
		var xmlString = textArea.val()
		try {
			var xml = $.parseXML(xmlString)
			let tempG = $(xml).find('Gamesession')
			if (GAMESESSION.length < 1) return window.alert('Failed to read gamesession.xml')
			GAMESESSION = tempG
		} catch {
			return window.alert(`Faled to parse the xml.`)
		}
		loadGameSession()
		console.log(`Saving changes to gamesession.xml`)
		infobox.remove()
	})

	var close = $(`<div class=closeButton>X</div>`)
	close.appendTo(closeButtonsWrapper)
	close.on('click', () => {
		infobox.remove()
		resolve(false)
	})

	var textWrapper = $(`<div class="mainWrapper"><div class="desc">Edit raw save data in xml format.</div></div>`)
	textWrapper.appendTo(infobox)
	var textArea = $(`<textarea class="charXmlInput" spellcheck="false"></textarea>`)
	textArea.appendTo(textWrapper)
	textArea.val(GAMESESSION.prop('outerHTML'))

	$(document.body).append(infobox)
})

$('#moneyConfirm').on('click', () => {
	let money = $('#moneyInput').val()
	CAMPAIGN.attr('money', money)
	console.log(`Set current money to ${money}`)
	showMsg(`Set current money to <span>${money}</span>`)
})

$('#idConfirm').on('click', () => {
	let id = $('#idInput').val()
	console.log(`Setting campaign id to ${id}`)
	GAMESESSION.attr('campaignid', id)
	showMsg(`Changed campaign id to <span>${id}</span>`)
})

// convert save file
$('#convertSaveButton').on('click', () => {
	let warningString = MULTIPLAYER
		? `WARNING: for multiplayer saves player controlled characters are saved separately.\nMake sure you have some bots, or that you import your CharacterData.xml before downloading or that save might get bricked.\n\nYou can never know when something will go wrong - make sure to check if the converted savefile works before removing the original one.\n\nPress OK to continue, press Cancel to abort`
		: `WARNING: after converting savefile to multiplayer current crew will become AI crew.\nAfter converting make sure that campaign id (randomly generated) is not already used in your other campaign saves.\n\nYou can never know when something will go wrong - make sure to check if the converted savefile works before removing the original one.\n\nPress OK to continue, press Cancel to abort`

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

		// set campaign id tag - very small chance of confict, can be changed with tools after
		GAMESESSION.attr('campaignid', (Math.floor(Math.random() * 50) + 50).toString())

		console.log(`Converted campaign type to MultiPlayer`)
		showMsg(`Converted campaign type to <span>MultiPlayer</span>`)
	}
	loadGameSession()
})

// #endregion other tools

// #region crew list
function updateCrewList() {
	var crew = GAMESESSION.find(MULTIPLAYER ? 'bots' : 'crew')

	$('.crewListElement').remove()

	console.log(crew.find('Character').length)
	if (crew.find('Character').length < 2) $('#sortCrewList').hide()
	else $('#sortCrewList').show()

	crew.find('Character').each(function () {
		var name = $(this).attr('name')
		var job = $(this).find('job').attr('identifier')

		var nameLabel = $(`<div class="name ${job}">${name}</div>`)
		var buttonWrapper = $(`<div class="buttonWrapper"></div>`)
		var editButton = $('<div class="deleteButton">Edit</div>')
		var deleteButton = $('<div class="deleteButton">X</div>')
		var listEl = $('<div class="crewListElement subListElement"></div>')
		listEl.append(nameLabel)
		buttonWrapper.append(editButton)
		buttonWrapper.append(deleteButton)
		listEl.append(buttonWrapper)
		listEl.appendTo($('#crewListWrapper'))

		deleteButton.on('click', () => {
			console.log(`Removing character ${name}`)
			$(this).remove()
			listEl.remove()
			showMsg(`Removed character <span>${name}</span>`)
		})

		editButton.on('click', () => {
			editCrewmemberBox($(this))
		})
	})
}

// reorder crew
$('#sortCrewList').on('click', () => {
	var crew = GAMESESSION.find(MULTIPLAYER ? 'bots' : 'crew')
	var madechange = false

	var infobox = $(`<div class="infoBoxLarge"></div>`)

	var firstLineWrapper = $(`<div class=firstLineWrapper><h2>Change crew order</span></h2></div>`)
	firstLineWrapper.appendTo(infobox)

	var closeButtonsWrapper = $(`<div class=closeButtonsWrapper></div>`)
	closeButtonsWrapper.appendTo(firstLineWrapper)

	var saveButton = $('<div class="savebutton">Close</div>')
	saveButton.appendTo(closeButtonsWrapper)
	saveButton.on('click', () => {
		if (!madechange) return infobox.remove()
		infobox.remove()
		updateCrewList()
		showMsg(`Reordered crew list`)
	})

	var textWrapper = $(`<div class="subListWrapper crewReorderWrapper"></div>`)
	textWrapper.appendTo(infobox)

	crew.find('Character').each(function () {
		var character = $(this)
		var name = character.attr('name')
		var job = character.find('job').attr('identifier')

		var nameLabel = $(`<div class="name ${job}">${name}</div>`)
		var buttonWrapper = $(`<div class="buttonWrapper"></div>`)
		var upArrow = $('<div class="deleteButton">&uarr;</div>')
		var downArrow = $('<div class="deleteButton">&darr;</div>')
		var listEl = $('<div class="subListElement crewReorderElement"></div>')
		listEl.append(nameLabel)
		buttonWrapper.append(upArrow)
		buttonWrapper.append(downArrow)
		listEl.append(buttonWrapper)
		listEl.appendTo(textWrapper)

		downArrow.on('click', () => {
			//move element down one step
			if (listEl.not(':last-child')) listEl.next().after(listEl)
			if (character.not(':last-child')) character.next().after(character)
			madechange = true
		})

		upArrow.on('click', () => {
			//move element up one step
			if (listEl.not(':first-child')) listEl.prev().before(listEl)
			if (character.not(':first-child')) character.prev().before(character)
			madechange = true
		})
	})

	$(document.body).append(infobox)
})

var jobName = jobid => {
	switch (jobid) {
		case 'captain':
			return 'Captain'
		case 'securityofficer':
			return 'Security Officer'
		case 'medicaldoctor':
			return 'Medical Doctor'
		case 'engineer':
			return 'Engineer'
		case 'mechanic':
			return 'Mechanic'
		case 'assistant':
			return 'Assistant'
		default:
			return 'undefined'
	}
}

function editCrewmemberBox(character) {
	var name = character.attr('name')
	var job = character.find('job')
	var jobID = job.attr('identifier')

	var saveChanges = () => {
		// name
		character.attr('name', charNameInput.val())

		// job
		var job_id = jobSelect.val()
		job.attr('name', jobName(job_id))
		job.attr('identifier', job_id)

		// skills
		job.find('skill').each(function () {
			var skill = $(this)
			var id = skill.attr('identifier')
			skill.attr('level', sliders[id].val())
		})
	}

	var madechange = false

	var infobox = $(`<div class="infoBoxLarge"></div>`)

	var firstLineWrapper = $(`<div class=firstLineWrapper><h2>Editing Crewmate</span></h2></div>`)
	firstLineWrapper.appendTo(infobox)

	var closeButtonsWrapper = $(`<div class=closeButtonsWrapper></div>`)
	closeButtonsWrapper.appendTo(firstLineWrapper)

	var saveButton = $('<div class="savebutton">Save</div>')
	saveButton.appendTo(closeButtonsWrapper)
	saveButton.on('click', () => {
		if (!madechange) return infobox.remove()
		saveChanges()
		infobox.remove()
		updateCrewList()
		showMsg(`Updated crewmate <span>${character.attr('name')}</span>`)
	})

	var close = $(`<div class=closeButton>X</div>`)
	close.appendTo(closeButtonsWrapper)
	close.on('click', () => {
		infobox.remove()
	})

	var textWrapper = $(`<div class="mainBoxWrapper"></div>`)
	textWrapper.appendTo(infobox)

	//  name, looks, export
	var detailWrapper = $(`<div class="detailWrapper"><h3>General</h3></div>`)
	detailWrapper.appendTo(textWrapper)

	var copyButton = $(`<div class="copyButton">Copy xml to clipboard</div>`)
	copyButton.appendTo(detailWrapper)
	copyButton.on('click', () => {
		saveChanges()
		var text = character.prop('outerHTML')
		navigator.clipboard
			.writeText(text)
			.then(() => {
				console.log('Copied string to clipboard')
				copyButton.text('Copied!')
				setTimeout(() => {
					copyButton.text('Copy xml to clipboard')
				}, 3000)
			})
			.catch(err => {
				console.log('Failed to copy string to clipboard')
			})
	})

	var rawXmlEdit = $(`<div class="copyButton">Edit raw xml</div>`)
	rawXmlEdit.appendTo(detailWrapper)
	rawXmlEdit.on('click', () => {
		saveChanges()
		console.log('opening raw character xml')
		rawCharacterXmlEdit(character).then(newCharacter => {
			if (newCharacter === false) return
			// reload character edit popup
			infobox.remove()
			updateCrewList()
			editCrewmemberBox(newCharacter)
		})
	})

	detailWrapper.append(`<h3>Name:</h3>`)
	var charNameInput = $(`<input type="text" class="${jobID}"/>`)
	charNameInput.appendTo(detailWrapper)
	charNameInput.val(name)
	charNameInput.on('input', () => {
		madechange = true
	})

	// job, skills
	var jobWrapper = $(`<div class="jobWrapper"><h3>Job</h3></div>`)
	jobWrapper.appendTo(textWrapper)

	var jobSelect = $(`<select name="job" id="jobSelect" class="${jobID}">
    <option class="captain" value="captain">Captain</option>
    <option class="securityofficer" value="securityofficer">Security Officer</option>
    <option class="medicaldoctor" value="medicaldoctor">Medical Doctor</option>
    <option class="engineer" value="engineer">Engineer</option>
    <option class="mechanic" value="mechanic">Mechanic</option>
    <option class="assistant" value="assistant">Assistant</option>
  </select>`)
	jobSelect.val(jobID)
	jobSelect.appendTo(jobWrapper)
	jobSelect.on('change', () => {
		var val = jobSelect.val()
		// role colors
		jobSelect.removeClass()
		jobSelect.addClass(val)
		charNameInput.removeClass()
		charNameInput.addClass(val)

		madechange = true
	})

	var skillSliderWrapper = $(`<div class="skillSliderWrapper"><h3>Skills</h3></div>`)
	skillSliderWrapper.appendTo(jobWrapper)

	var sliders = {}

	var wrappers = {}

	job.find('skill').each(function () {
		var skill = $(this)
		var id = skill.attr('identifier')
		var level = skill.attr('level')

		var wrapper = $(`<div class="sliderWrapper"></div>`)
		wrappers[id] = wrapper

		var label = $(`<div class="label">${id}:</div>`)
		label.appendTo(wrapper)

		var input = $(`<input type="number" min="0" max="100" step="1"/>`)
		input.val(level)
		input.appendTo(label)
		input.on('change', () => {
			sliders[id].val(input.val())
			madechange = true
		})

		sliders[id] = $(`<input type="range" min="0" max="100" step="0.000001"/>`)
		sliders[id].appendTo(wrapper)
		sliders[id].val(level)
		sliders[id].on('input', () => {
			input.val(sliders[id].val())
			madechange = true
		})
		sliders[id]
	})
	// force sliders to be in order
	for (let skillname of ['helm', 'weapons', 'mechanical', 'electrical', 'medical']) {
		wrappers[skillname].appendTo(skillSliderWrapper)
	}

	$(document.body).append(infobox)
}

function rawCharacterXmlEdit(character) {
	return new Promise(resolve => {
		var infobox = $(`<div class="infoBoxLarge"></div>`)

		var firstLineWrapper = $(`<div class=firstLineWrapper><h2>Editing Character</span></h2></div>`)
		firstLineWrapper.appendTo(infobox)

		var closeButtonsWrapper = $(`<div class=closeButtonsWrapper></div>`)
		closeButtonsWrapper.appendTo(firstLineWrapper)

		var saveButton = $('<div class="savebutton">Save</div>')
		saveButton.appendTo(closeButtonsWrapper)
		saveButton.on('click', () => {
			var xmlString = textArea.val()
			try {
				var xml = $.parseXML(xmlString)
				var newCharacter = $(xml).find('Character')
				var name = newCharacter.attr('name')
			} catch {
				return window.alert(`Faled to parse the xml.`)
			}
			console.log(`Saving changes to character ${name}`)
			character.replaceWith(newCharacter)
			infobox.remove()
			resolve(newCharacter)
		})

		var close = $(`<div class=closeButton>X</div>`)
		close.appendTo(closeButtonsWrapper)
		close.on('click', () => {
			infobox.remove()
			resolve(false)
		})

		var textWrapper = $(`<div class="mainWrapper"><div class="desc">Edit raw character data in xml format.</div></div>`)
		textWrapper.appendTo(infobox)
		var textArea = $(`<textarea class="charXmlInput" spellcheck="false"></textarea>`)
		textArea.appendTo(textWrapper)
		textArea.val(character.prop('outerHTML'))

		$(document.body).append(infobox)
	})
}

$('#addCrewMember').on('click', () => {
	var infobox = $(`<div class="infoBoxLarge"></div>`)

	var firstLineWrapper = $(`<div class=firstLineWrapper><h2>Adding Crewmate</span></h2></div>`)
	firstLineWrapper.appendTo(infobox)

	var closeButtonsWrapper = $(`<div class=closeButtonsWrapper></div>`)
	closeButtonsWrapper.appendTo(firstLineWrapper)

	var saveButton = $('<div class="savebutton">Add</div>')
	saveButton.appendTo(closeButtonsWrapper)
	saveButton.on('click', () => {
		var xmlString = textArea.val()
		try {
			var xml = $.parseXML(xmlString)
			var character = $(xml).find('Character')
			var name = character.attr('name')
		} catch {
			return window.alert(`Faled to parse the xml.`)
		}
		console.log(`Adding new character ${name}`)

		var crew = GAMESESSION.find(MULTIPLAYER ? 'bots' : 'crew')
		crew.append(character)
		infobox.remove()
		updateCrewList()
		showMsg(`Added new character <span>${name}</span>`)
	})

	var close = $(`<div class=closeButton>X</div>`)
	close.appendTo(closeButtonsWrapper)
	close.on('click', () => {
		infobox.remove()
	})

	var textWrapper = $(`<div class="mainWrapper"><div class="desc">Add new character to crew by pasting its xml below. You can get character xml string from gamesession.xml or using "copy xml to clipboard" button in character editor screen.</div></div>`)
	textWrapper.appendTo(infobox)
	var textArea = $(`<textarea class="charXmlInput" spellcheck="false"></textarea>`)
	textArea.appendTo(textWrapper)

	$(document.body).append(infobox)
})
// #endregion crew list

// #endregion tools
