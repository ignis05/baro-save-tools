# Barotrauma Save Tools

Simple save editor for barotrauma.

Working fully client-sided in the browser.

Master branch hosted on https://ignis05.github.io/baro-save-tools/index.html

# Currently available tools:

### Owned Submarines List

-  manage purchased submarines
-  upload .sub file to add it as another owned submarine, or replace existing owned submarine
-  remove owned submarine with "X" button
-  download .sub file of owned submarine with download button
-  change currently used submarine using radio buttons
-  clean all dirt and stains from owned submarines

### Available Submarines List

-  for multiplayer saves only (SP saves have all submarines available)
-  manage submarines available for purchase at outposts
-  remove submarine from the list using "X" button
-  add submarine to the list by typing its name below and pressing "Add"

### Current crew list

-  manage your crew characters
-  edit character's name, job, skills or raw xml
-  remove crewmates with "X" button
-  upload CharacterData.xml to import human characters from multiplayer games as bots
-  import new character from xml data
-  change crew order

### Other tools

-  change multiplayer campaign id (to resolve id conflicts)
-  directly edit raw gamesession.xml
-  download gamesession.xml
-  upload edited gamesession.xml to replace the loaded one
-  switch between single-player and multi-player save formats
-  set current money

# FAQ

**Always make sure to back up your .save files before replacing them**

**Warning: Multiplayer saves have unique id's, having multiple saves with the same id can cause some issues. Make sure to replace original multiplayer save files with modified ones or change "multiplayer campaign id" to something unique if you want to keep the original save file in its original location.**

### How to add a new purchasable submarine to ongoing multiplayer campaign?

0. _Backup your save file_
1. Drag the save file to the dropbox to upload it
2. Type the name of the submarine you want to add in the field below "Available Submarines" list and press "Add"
3. Press the "Download" button and replace the original save file with the downloaded one.

### How modify the submarine used?

0. _Backup your save file_
1. Drag the save file to the dropbox to upload it
2. Press the button with the folder icon and download arrow on the "Owned Submarines" list.
3. Move the downloaded file to `Barotrauma/Submarines` so you can edit it in the submarine editor.
4. Upload modified .sub file to update your owned submarine.
5. Press the "Download" button and replace the original save file with the downloaded one.

### How switch to a new submarine?

0. _Backup your save file_
1. Drag the save file to the dropbox to upload it
2. Upload the .sub file you want.
3. Select the radio button next to the new submarine's name to mark it as currently selected submarine.
4. Press the "Download" button and replace the original save file with the downloaded one.

### How to convert a multiplayer savefile to singleplayer

0. _Backup your save file_
1. Drag the save file to the dropbox to upload it
2. Press "Convert to Singleplayer savefile" button and "OK" on the warning popup
3. Upload related "CharacterData.xml" to import all player controlled characters
4. Press the "Download" button and place the downloaded file in the savefile location

### How to convert a singleplayer savefile to multiplayer

0. _Backup your save file_
1. Drag the save file to the dropbox to upload it
2. Press "Convert to Multiplayer savefile" button and "OK" on the warning popup
3. Make sure that auto-generated "campaign id" is not used by your other multiplayer savefiles (it's pretty unlikey - auto-generated id's start with 50)
4. Tweak "Available Submarines" list to your preferences.
5. Press the "Download" button and place the downloaded file in the savefile location
<hr>
