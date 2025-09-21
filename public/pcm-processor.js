class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      const buffer = new ArrayBuffer(channelData.length * 2);
      const view = new DataView(buffer);

      for (let i = 0; i < channelData.length; i++) {
        let s = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }

      this.port.postMessage(buffer);
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
