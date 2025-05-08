import chalk from "chalk";

/**
 * Logger utility for consistent and colorful console logging
 */
export class Logger {
  private readonly module: string;
  private readonly colors = {
    info: chalk.blue,
    success: chalk.green,
    warn: chalk.yellow,
    error: chalk.red,
    debug: chalk.magenta,
  };

  /**
   * Create a new logger instance for a specific module
   * @param module The name of the module (e.g., 'Connection Handler', 'Sequence Handler')
   */
  constructor(module: string) {
    this.module = module;
  }

  /**
   * Format a message with module name and timestamp
   * @param message The message to format
   * @returns Formatted message with module name and timestamp
   */
  private formatMessage(message: string): string {
    const timestamp = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
    return `[${chalk.cyan(timestamp)}] [${chalk.bold(this.module)}] ${message}`;
  }

  /**
   * Log an info message
   * @param message The message to log
   * @param data Optional data to log
   */
  info(message: string, ...data: any[]): void {
    console.log(this.formatMessage(this.colors.info(message)), ...data);
  }

  /**
   * Log a success message
   * @param message The message to log
   * @param data Optional data to log
   */
  success(message: string, ...data: any[]): void {
    console.log(this.formatMessage(this.colors.success(message)), ...data);
  }

  /**
   * Log a warning message
   * @param message The message to log
   * @param data Optional data to log
   */
  warn(message: string, ...data: any[]): void {
    console.warn(this.formatMessage(this.colors.warn(message)), ...data);
  }

  /**
   * Log an error message
   * @param message The message to log
   * @param data Optional data to log
   */
  error(message: string, ...data: any[]): void {
    console.error(this.formatMessage(this.colors.error(message)), ...data);
  }

  /**
   * Log a debug message (only in development environment)
   * @param message The message to log
   * @param data Optional data to log
   */
  debug(message: string, ...data: any[]): void {
    if (process.env.NODE_ENV !== "production") {
      console.log(this.formatMessage(this.colors.debug(message)), ...data);
    }
  }

  /**
   * Create a child logger with a submodule name
   * @param submodule The name of the submodule
   * @returns A new logger instance with the combined module name
   */
  child(submodule: string): Logger {
    return new Logger(`${this.module}:${submodule}`);
  }
}

/**
 * Create a new logger instance for a specific module
 * @param module The name of the module
 * @returns A new logger instance
 */
export const createLogger = (module: string): Logger => {
  return new Logger(module);
};

// Default export for convenience
export default createLogger;
