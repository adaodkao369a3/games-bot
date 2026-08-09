export class Logger {
  static info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${message}`, ...args);
  }

  static error(message: string, error?: Error | unknown): void {
    console.error(`[ERROR] ${message}`, error);
  }

  static warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  static debug(message: string, ...args: any[]): void {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}
