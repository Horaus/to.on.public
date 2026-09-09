const { registerVoiceClipHandler, registerSoundBedHandler } = require("./audio-handler-actions.cjs");

function registerAudioHandlers(runtime) {
  registerVoiceClipHandler(runtime);
  registerSoundBedHandler(runtime);
}

module.exports = { registerAudioHandlers };
