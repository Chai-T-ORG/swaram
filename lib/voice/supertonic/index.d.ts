export interface TTSLoadOptions {
  autoDownload?: boolean;
  modelUrl?: string;
}

export interface TTSSynthesizeOptions {
  style?: string;
  lang?: string;
}

export interface TTSSynthesizeResult {
  wav: Float32Array;
  duration?: number;
}

export class TTS {
  static load(options?: TTSLoadOptions): Promise<TTS>;
  getVoiceStyle(name: string): Promise<any>;
  synthesize(text: string, options?: TTSSynthesizeOptions): Promise<TTSSynthesizeResult>;
}
