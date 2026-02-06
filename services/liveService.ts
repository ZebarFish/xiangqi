export interface LiveSessionCallbacks {
  onOpen: () => void;
  onMessage: (message: LiveServerMessage) => void;
  onClose: () => void;
  onError: (error: Error) => void;
}
type LiveServerMessage = any;

export class GeminiLiveService {
  private client: any = null;
  private apiKey: string = '';
  private session: any | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private videoInterval: number | null = null;

  constructor() {
    // Read API key from browser-friendly Vite env first, then fall back to Node envs.
    const env: any = (typeof import !== 'undefined' && typeof import.meta !== 'undefined') ? (import.meta as any).env : process.env;
    this.apiKey = env?.VITE_GEMINI_API_KEY || process.env?.API_KEY || process.env?.GEMINI_API_KEY || '';
    // Do NOT initialize the Gemini client here to avoid throwing when no API key is present.
  }

  private async initClient() {
    if (this.client) return;
    if (!this.apiKey) throw new Error('Live features are disabled (no API key).');
    // Dynamically import the SDK only when needed and when API key is present.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const mod = await import('@google/genai');
    this.client = new mod.GoogleGenAI({ apiKey: this.apiKey });
  }

  async connect(callbacks: LiveSessionCallbacks, boardCanvas: HTMLCanvasElement) {
    // If no API key, fail gracefully with informative error
    if (!this.apiKey) {
      throw new Error('Live features disabled: no Gemini API key configured.');
    }

    // Setup Audio Contexts
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    // Get Mic Stream
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Ensure client is initialized and connect to Gemini Live
    await this.initClient();
    const sessionPromise = this.client.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: async () => {
          callbacks.onOpen();
          // Start Audio Streaming
          this.startAudioInput(stream, sessionPromise);
          // Start Video (Canvas) Streaming
          this.startVideoInput(boardCanvas, sessionPromise);
        },
        onmessage: (msg: LiveServerMessage) => {
          this.handleServerMessage(msg, callbacks.onMessage);
        },
        onclose: (e) => callbacks.onClose(),
        onerror: (e) => callbacks.onError(new Error("Live API 错误")),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }, // Fenrir sounds like a wise old man
        },
        systemInstruction: `你是一位中国象棋特级大师。
        你正在观看家庭成员之间的对弈。
        你的角色是担任一位乐于助人的教练或解说员。
        你可以看到棋盘。
        如果用户请求帮助，请分析局势并建议一步棋。
        如果用户下了一步臭棋，请委婉地指出来。
        保持你的回答简洁友好。
        除非被问到，否则不要描述整个盘面。专注于当前的行动。`
      },
    });

    this.session = sessionPromise;
    return sessionPromise;
  }

  private startAudioInput(stream: MediaStream, sessionPromise: Promise<any>) {
    if (!this.inputAudioContext) return;
    
    const source = this.inputAudioContext.createMediaStreamSource(stream);
    const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    
    scriptProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = this.createPcmBlob(inputData);
      
      sessionPromise.then((session) => {
         session.sendRealtimeInput({ media: pcmBlob });
      });
    };
    
    source.connect(scriptProcessor);
    scriptProcessor.connect(this.inputAudioContext.destination);
  }

  private startVideoInput(canvasEl: HTMLCanvasElement, sessionPromise: Promise<any>) {
    // Send frames at 1 FPS to save bandwidth but keep context fresh
    const FRAME_RATE = 1; 
    
    this.videoInterval = window.setInterval(() => {
        canvasEl.toBlob(async (blob) => {
            if (blob) {
                const base64Data = await this.blobToBase64(blob);
                sessionPromise.then((session) => {
                    session.sendRealtimeInput({
                        media: { data: base64Data, mimeType: 'image/jpeg' }
                    });
                });
            }
        }, 'image/jpeg', 0.6);
    }, 1000 / FRAME_RATE);
  }

  private async handleServerMessage(message: LiveServerMessage, onMessage: (msg: LiveServerMessage) => void) {
    onMessage(message);
    
    // Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext) {
        const audioBuffer = await this.decodeAudioData(
            this.decodeBase64(base64Audio), 
            this.outputAudioContext
        );
        
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputAudioContext.destination);
        source.start();
    }
  }

  public disconnect() {
    if (this.videoInterval) clearInterval(this.videoInterval);
    if (this.inputAudioContext) this.inputAudioContext.close();
    if (this.outputAudioContext) this.outputAudioContext.close();
    
    // There isn't a direct "disconnect" on the session promise wrapper easily accessible
    // usually we just close contexts and let the socket time out or rely on the object destruction
    // For this implementation, stopping the streams is the primary cleanup.
  }

  // Utilities
  private createPcmBlob(data: Float32Array) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    for (let i=0; i<bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);

    return {
      data: b64,
      mimeType: 'audio/pcm;rate=16000',
    };
  }

  private blobToBase64(blob: Blob): Promise<string> {
      return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
              const result = reader.result as string;
              // remove "data:image/jpeg;base64,"
              resolve(result.split(',')[1]);
          };
          reader.readAsDataURL(blob);
      });
  }

  private decodeBase64(base64: string): Uint8Array {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
      // 1 channel, 24k rate
      const dataInt16 = new Int16Array(data.buffer);
      const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for(let i=0; i<dataInt16.length; i++) {
          channelData[i] = dataInt16[i] / 32768.0;
      }
      return buffer;
  }
}

export const liveService = new GeminiLiveService();