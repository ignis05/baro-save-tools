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

// #region files handling

// file upload handler
function handleFileUpload(files) {
	var file = files[0]

	if (!file.name.endsWith('.save')) {
		window.alert('Selected file is not a ".save" file')
		return console.warn('Selected file is not a ".save" file')
	}

	FILENAME = file.name

	fileReaderStream(file).pipe(
		concat(function (contents) {
			console.log('File loaded successfully')

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
			loadGameSession()
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

// #endregion files handling

// get data from gamesession
function loadGameSession() {
	CAMPAIGN = GAMESESSION.find('MultiPlayerCampaign')
	if (CAMPAIGN.length == 0) {
		GAMESESSION = null
		LOADED_FILES = {}
		CAMPAIGN = null
		return window.alert('Single player campaign save files are not supported yet')
	}

	var timestamp = new Date(parseInt(GAMESESSION.attr('savetime')) * 1000)

	$('#tools').show()
	$('#loadedInfo .name').text(FILENAME)
	$('#loadedInfo .date').text(timestamp.toLocaleString())
	updateAvalSubs()
}

// help popup
$('#fileLocHelp').on('click', () => {
	var infobox = $(`<div id="infoBox"></div>`)
	var close = $(`<div id=closeInfoBox>X</div>`)
	var textWrapper = $(`<div class="text"></div>`)
	textWrapper.html(`
	<h3>Saves can be found in your local AppData folder. To get there you can:</h3><ul>
	<li>Navigate full path:<br><span class="highlight">C:\\Users\\[username]\\AppData\\Local\\Daedalic Entertainment GmbH\\Barotrauma</span></li>
	<li>Paste this in your file explorator navigation bar:<br><span class="highlight">%localappdata%\\Daedalic Entertainment GmbH\\Barotrauma</span></li>
	<li>Press Win+R, type <span class="highlight">%localappdata%</span> and navigate from there</li>
	</ul>
	`)
	infobox.append(close).append(textWrapper)
	close.on('click', () => {
		close.off('click')
		infobox.remove()
	})
	$(document.body).append(infobox)
})

// #region tools

function addToAvalSubsList(name) {}

// available submarines list
function updateAvalSubs() {
	$('.avalSubListElement').remove()
	CAMPAIGN.find('Sub').each(function () {
		var name = $(this).attr('name')
		var nameLabel = $(`<div class="name">${name}</div>`)
		var delButton = $('<div class="deleteButton">X</div>')
		var listEl = $('<div class="avalSubListElement"></div>')
		listEl.append(nameLabel)
		listEl.append(delButton)
		listEl.appendTo($('#avalSubListWrapper'))

		delButton.on('click', () => {
			console.log(`Removing ${name} from available subs`)
			$(this).remove()
			listEl.remove()
		})
	})
}
$('#addToAvalSubsButton').on('click', () => {
	var name = $('#addToAvalSubs').val()
	console.log(`Adding ${name} to availale subs`)
	$('#addToAvalSubs').val('')
	var avalSubs = CAMPAIGN.find('AvailableSubs')
	avalSubs.append(`<Sub name="${name}" />`)

	updateAvalSubs()
})

// #endregion tools
