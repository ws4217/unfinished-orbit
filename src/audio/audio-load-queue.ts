export interface AudioAsset { id: string; url: string; bytes: number }
type FetchBytes = (url: string) => Promise<ArrayBuffer>;
interface Job {
  asset: AudioAsset; needed: () => boolean;
  resolve: (bytes?: ArrayBuffer) => void; reject: (error: unknown) => void;
}
// 一个文件一个批次；所有BGM/SFX共用队列，压缩数据可缓存，但不预载全部音乐。
export class AudioLoadQueue {
  private cache = new Map<string, ArrayBuffer>();
  private jobs: Job[] = [];
  private running = false;
  private pending = new Map<string, Promise<ArrayBuffer | undefined>>();
  constructor(privateFetch: FetchBytes, limit = 10 * 1024 * 1024) {
    this.fetchBytes = privateFetch; this.limit = limit;
  }
  private fetchBytes: FetchBytes;
  private limit: number;
  load(asset: AudioAsset, needed = () => true): Promise<ArrayBuffer | undefined> {
    if (this.cache.has(asset.id)) return Promise.resolve(this.cache.get(asset.id));
    const existing = this.pending.get(asset.id);
    if (existing) return existing;
    if (asset.bytes > this.limit || asset.bytes <= 0) return Promise.reject(new Error('Audio batch exceeds budget'));
    const promise = new Promise<ArrayBuffer | undefined>((resolve, reject) => this.jobs.push({ asset, needed, resolve, reject }));
    this.pending.set(asset.id, promise);
    void this.run();
    return promise;
  }
  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length) {
        const job = this.jobs.shift()!;
        try {
          if (!job.needed()) { job.resolve(undefined); continue; }
          const bytes = await this.fetchBytes(job.asset.url);
          if (bytes.byteLength !== job.asset.bytes || bytes.byteLength > this.limit) throw new Error('Unexpected audio size');
          this.cache.set(job.asset.id, bytes);
          job.resolve(bytes);
        } catch (error) { job.reject(error); }
        finally { this.pending.delete(job.asset.id); }
      }
    } finally { this.running = false; }
  }
}
