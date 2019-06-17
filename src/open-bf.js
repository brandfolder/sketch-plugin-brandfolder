import sketch from 'sketch'
var Settings = require('sketch/settings')
const dom = require('sketch/dom')
const BrowserWindow = require('sketch-module-web-view')

// documentation: https://developer.sketchapp.com/reference/api/

const bf_path = '~/Downloads'

const getExt = (filename) => {
    var idx = filename.lastIndexOf('.')
    // handle cases like, .htaccess, filename
    return (idx < 1) ? '' : filename.substr(idx + 1).toUpperCase()
}

const handlers = {
  initMsg: ({ payload: msg }) => {
    sketch.UI.message(msg)
  },
  externalLinkClicked: ({ payload: url }) => {
    log(`Clicked link: ${url}`)
    NSWorkspace.sharedWorkspace().openURL(NSURL.URLWithString(url))
    sketch.UI.message(`Navigating to ${url}`)
  },
  selectedOrganization: ({ payload: org }) => {
    log(`Selected Organization ${org.name}`)
  },
  selectedBrandfolder: ({ payload: bf }) => {
    log(`Selected Brandfolder ${bf.name}`)
  },
  selectedAttachment: ({ payload: attachment }) => {
    const {
      filename,
      url,
      width,
      height,
      id,
    } = attachment

    try {
      log(`Selected Attachment to open: ${filename}`)
      log(attachment)

      sketch.UI.message(`Placing Attachment: ${filename}`)

      const document = sketch.getSelectedDocument()
      let parent = document.selectedPage

      const selection = document.selectedLayers
      if (!selection.isEmpty) {
        parent = selection.layers[0].parent
      }
      const imgURL = NSURL.URLWithString(encodeURI(url));

      const ext = getExt(filename)

      if (ext == 'SKETCH'){
        sketch.UI.message(`Trying to load ${filename}.`)
        openSketchFile(attachment)
        return
      } else if (ext == 'ZIP'){
        sketch.UI.message(`Could not load ${filename}. Please make sure it is a supported file type.`)
        return
      } else if (ext == 'SVG'){
        const svgImporter = MSSVGImporter.svgImporter();
        svgImporter.prepareToImportFromURL(imgURL);
        svgImporter.importIntoPage_name_progress(parent.sketchObject, filename, null);
        sketch.UI.message(`Placed the SVG: ${filename}`)
        return
      }

      const rect = new dom.Rectangle(0, 0, width, height)
      const imageLayer = new dom.Image({
        image: imgURL,
        name: filename,
        frame: rect,
        parent: parent
      })
      log('Made image layer')
      sketch.UI.message(`Placed Attachment: ${filename}`)

      Settings.setDocumentSettingForKey(document, imageLayer.id, id)
      log(`Saved on doc, layer id: ${imageLayer.id} as key for value attachment id: ${id}`)
    } catch (e) {
      log(e)
      sketch.UI.message(`Could not load ${filename}. Please make sure it is a supported file type.`)
    }
  },
  selectedAsset: async ({ payload: asset }) => {
    log(asset)
    log(`Selected Asset to open: ${asset.name}`)
    sketch.UI.message(`Loading first Attachment for Asset: ${asset.name}`)

    try {
      const attachment = asset.included.find(att => att.id == asset.attachments[0].id)
      return handlers.selectedAttachment({ payload: attachment })
    } catch (err) {
      sketch.UI.message(`Failed to load first Attachment for Asset: ${asset.name}`)
    }
  },
}

const openSketchFile = (attachment) => {
  const { url, filename } = attachment
  sketch.UI.message(`Loading ${filename}`)
  // TODO? add to path ${attachment.id} folder?
  const filepath = `${bf_path}/"${filename}"`
  const cmdMkdir = `mkdir -p ${bf_path}`
  runCommand(cmdMkdir)
  const cmdCurl = `curl ${url} > ${filepath}`
  runCommand(cmdCurl)
  sketch.UI.message(`Loaded ${filename}`)
  const filepath2 = `${bf_path}/${filename}`
  openDoc(filepath2)
}

function runCommand(command) {
  log(`cmd: ${command}`)
  const args = ['-l', '-c', command]
  const task = NSTask.alloc().init();
  task.setLaunchPath_('/bin/bash');
  task.arguments = args;
  task.launch();
  task.waitUntilExit();
  return (task.terminationStatus() == 0)
}

function openDoc(filepath){
  dom.Document.open(filepath, (err, document) => {
    if (err) {
      log(err)
      sketch.UI.message('Error getting the Sketch file from Brandfolder.')
      return
    }
    else {
      sketch.UI.message('Pulled latest version from Brandfolder and saved it in Downloads.')
    }
  })
}


export const openBrandfolder = (context) => {
  let win = BrowserWindow.fromId('open-bf')
  if (win) {
    log('Browser already open, closing it')
    win.close()
    return
  }
  log('Opening browser')

  win = new BrowserWindow({
    identifier: 'open-bf',
    title: 'Brandfolder',
    width: 362,
    height: 600,
    show: false,
    acceptsFirstMouse: true
  })

  win.setAlwaysOnTop(true, 'modal-panel')
  win.once('ready-to-show', () => {
    win.show()
  })

  win.on('closed', () => {
    log('window closed, nullifying it')
    win = null
  })

  // Load the remote URL
  const url = 'https://integration-panel-ui.brandfolder-svc.com?channel=message&appName=Sketch&allowedExtensions=jpg,jpeg,svg,tiff,png,ai&openableExtensions=sketch'
  win.loadURL(url)

  win.webContents.on('message', (msg) => {
    log('Got message:')
    log(msg)
    if (typeof handlers[msg.event] === 'function') {
      handlers[msg.event](msg)
    }
  })
}
