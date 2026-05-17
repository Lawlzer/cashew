export interface ProcessConfig {
	windowTitle?: string;
}

// Singleton configuration with better encapsulation
class ConfigManager {
	private config: ProcessConfig = {};

	public get windowTitle(): string | undefined {
		return this.config.windowTitle;
	}

	public update(newConfig: Partial<ProcessConfig>): void {
		this.config = { ...this.config, ...newConfig };
	}

	/**
	 * @deprecated Use update instead.
	 */
	public setProcessConfig(newConfig: Partial<ProcessConfig>): void {
		this.update(newConfig);
	}

	public get(): Readonly<ProcessConfig> {
		return this.config;
	}
}

export const Config = new ConfigManager();
