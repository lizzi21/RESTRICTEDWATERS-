

const echo = {
  synth: {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.25, sustain: 0.15, release: 1.2 },
    harmonicity: 2, modulationIndex: 3,
    modulation: { type: 'sine' }
  },
  delay: { delayTime: '8n', feedback: 0.3, wet: 0.35 },
  reverb: { roomSize: 0.3, wet: 0.18 },
  channel: { volume: -14, pan: -0.4 },
  sequence: [
    { time: '0:0:0', noteName: 'C5', duration: '8n', velocity: 0.6 },
    { time: '0:2:0', noteName: 'G4', duration: '8n', velocity: 0.45 },
    { time: '1:0:0', noteName: 'D5', duration: '8n', velocity: 0.6 },
    { time: '1:3:0', noteName: 'A4', duration: '8n', velocity: 0.45 }
  ],
  loop: '2m'
}

const depth = {
  synth: {
    oscillator: { type: 'triangle' },
    envelope: { attack: 1.5, decay: 0.5, sustain: 0.65, release: 2.5 }
  },
  filter: { type: 'lowpass', frequency: 550, Q: 2 },
  reverb: { roomSize: 0.8, wet: 0.55 },
  channel: { volume: -19, pan: 0.4 },
  sequence: [
    { time: '0:0:0', interval: 0, duration: '1m', velocity: 0.6 },
    { time: '1:0:0', interval: 7, duration: '1m', velocity: 0.5 }
  ],
  loop: '2m'
}

let echoSynth, echoDelay, echoChannel, echoPart
let depthSynth, depthFilter, depthReverb, depthChannel, depthPart
let masterChannel
let initialized = false
let playing = false
let lastManualNote = 0

function levelToDb(percent) {
  if (percent === 0) return -60
  return 20 * Math.log10(percent / 100)
}

function initEcho() {
  echoSynth = new Tone.FMSynth(echo.synth)
  echoDelay = new Tone.FeedbackDelay(echo.delay)
  const reverb = new Tone.JCReverb(echo.reverb)
  echoChannel = new Tone.Channel(echo.channel)
  echoSynth.chain(echoDelay, reverb, echoChannel, masterChannel)

  echoPart = new Tone.Part((time, note) => {
    const shift = Number(document.getElementById('transpose').value)
    const pitch = Tone.Frequency(note.noteName).transpose(shift)
    echoSynth.triggerAttackRelease(pitch, note.duration, time, note.velocity)
  }, echo.sequence).start(0)
  echoPart.loopEnd = echo.loop
  echoPart.loop = true
  echoPart.mute = !document.getElementById('echoAuto').checked
}

function initDepth() {
  depthSynth = new Tone.Synth(depth.synth)
  depthFilter = new Tone.Filter(depth.filter)
  depthReverb = new Tone.JCReverb(depth.reverb)
  depthChannel = new Tone.Channel(depth.channel)
  depthSynth.chain(depthFilter, depthReverb, depthChannel, masterChannel)

  depthPart = new Tone.Part((time, note) => {
    const root = document.getElementById('rootNote').value
    const pitch = Tone.Frequency(root).transpose(note.interval)
    depthSynth.triggerAttackRelease(pitch, note.duration, time, note.velocity)
  }, depth.sequence).start(0)
  depthPart.loopEnd = depth.loop
  depthPart.loop = true
  depthPart.mute = !document.getElementById('depthAuto').checked
}

async function initWebAudio() {
  await Tone.start()
  if (initialized) return
  masterChannel = new Tone.Channel({ volume: levelToDb(75) }).toDestination()
  initEcho()
  initDepth()
  Tone.getTransport().bpm.value = Number(document.getElementById('bpm').value)
  initialized = true
  document.getElementById('depthTrigger').disabled = false
}

function initTransport() {
  const transport = Tone.getTransport()
  transport.start()
  playing = true
  document.getElementById('systemStatus').textContent = 'ONLINE'
  document.getElementById('stopButton').disabled = false
  document.getElementById('startButton').querySelector('strong').textContent = 'TRANSMITTING'
}

function stopTransport() {
  const transport = Tone.getTransport()
  transport.stop()
  transport.position = 0
  if (echoSynth) echoSynth.triggerRelease()
  if (depthSynth) depthSynth.triggerRelease()
  playing = false
  document.getElementById('systemStatus').textContent = 'STANDBY'
  document.getElementById('stopButton').disabled = true
  document.getElementById('startButton').querySelector('strong').textContent = 'START TRANSMISSION'
}

function showSignal(x, y) {
  const layer = document.getElementById('signalEffects')
  const ring = document.createElement('span')
  ring.className = 'signal-burst'
  ring.style.left = `${x * 100}%`
  ring.style.top = `${y * 100}%`
  layer.appendChild(ring)
  ring.addEventListener('animationend', () => ring.remove())
}

function playManualEcho(event) {
  if (!initialized) return

  if (Date.now() - lastManualNote < 140) return
  lastManualNote = Date.now()
  const bounds = event.currentTarget.getBoundingClientRect()
  const x = Math.max(0, Math.min(0.999, (event.clientX - bounds.left) / bounds.width))
  const y = Math.max(0, Math.min(0.999, (event.clientY - bounds.top) / bounds.height))
  const scale = ['C4', 'D4', 'F4', 'G4', 'A4', 'C5', 'D5', 'F5']
  const note = scale[Math.floor(x * scale.length)]
  const transpose = Number(document.getElementById('transpose').value)
  echoSynth.modulationIndex.value = 1 + (1 - y) * 9
  echoSynth.triggerAttackRelease(Tone.Frequency(note).transpose(transpose), '8n', undefined, 0.65)
  showSignal(x, y)
}

function connectSlider(id, valueId, handler, format = v => `${v}%`) {
  const input = document.getElementById(id)
  const output = document.getElementById(valueId)
  input.addEventListener('input', () => {
    const value = Number(input.value)
    output.textContent = format(value)
    if (initialized && handler) handler(value)
  })
}

function panLabel(value) {
  return value < 0 ? `L ${-value}` : value > 0 ? `R ${value}` : 'CENTER'
}

function initInterface() {
  const startButton = document.getElementById('startButton')
  startButton.addEventListener('click', async () => {
    try {
      await initWebAudio()
      if (!playing) initTransport()
    } catch (error) {
      console.error('Could not start audio:', error)
      document.getElementById('systemStatus').textContent = 'AUDIO ERROR'
    }
  })
  document.getElementById('stopButton').addEventListener('click', stopTransport)
  document.getElementById('echoAuto').addEventListener('change', e => {
    if (echoPart) echoPart.mute = !e.target.checked
  })
  document.getElementById('depthAuto').addEventListener('change', e => {
    if (depthPart) depthPart.mute = !e.target.checked
  })
  connectSlider('transpose', 'transposeValue', null, v => `${v >= 0 ? '+' : ''}${v} st`)
  connectSlider('pulseRate', 'pulseRateValue', v => { echoPart.playbackRate = v }, v => `${v}×`)
  connectSlider('echoAmount', 'echoAmountValue', v => { echoDelay.wet.value = v / 100 })
  connectSlider('echoPan', 'echoPanValue', v => { echoChannel.pan.value = v / 100 }, panLabel)
  connectSlider('echoLevel', 'echoLevelValue', v => { echoChannel.volume.rampTo(-14 + levelToDb(v), 0.08) })
  connectSlider('filterCutoff', 'filterCutoffValue', v => { depthFilter.frequency.rampTo(150 * Math.pow(40, v / 100), 0.1) })
  connectSlider('resonance', 'resonanceValue', v => { depthFilter.Q.value = 0.5 + v / 100 * 9 })
  connectSlider('reverbAmount', 'reverbAmountValue', v => { depthReverb.wet.value = v / 100 })
  connectSlider('depthPan', 'depthPanValue', v => { depthChannel.pan.value = v / 100 }, panLabel)
  connectSlider('depthLevel', 'depthLevelValue', v => { depthChannel.volume.rampTo(-19 + levelToDb(v), 0.08) })
  connectSlider('bpm', 'bpmValue', v => { Tone.getTransport().bpm.rampTo(v, 0.1) }, v => String(v))
  connectSlider('masterLevel', 'masterLevelValue', v => { masterChannel.volume.rampTo(levelToDb(v), 0.08) })
  document.getElementById('rootNote').addEventListener('change', e => {
    document.getElementById('rootNoteValue').textContent = e.target.value
  })
  document.getElementById('depthTrigger').addEventListener('click', () => {
    if (initialized) depthSynth.triggerAttackRelease(document.getElementById('rootNote').value, '2n', undefined, 0.6)
  })
  const field = document.getElementById('signalField')
  field.addEventListener('pointerdown', e => { field.setPointerCapture(e.pointerId); playManualEcho(e) })
  field.addEventListener('pointermove', e => { if (e.buttons === 1) playManualEcho(e) })
}

document.addEventListener('DOMContentLoaded', initInterface)
