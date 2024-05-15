interface ProcessConfig {
	windowTitle?: string;
}

export class Config {
	private static processConfig: ProcessConfig = {};

	public static setProcessConfig(newConfig: ProcessConfig): void {
		Config.processConfig = { ...Config.processConfig, ...newConfig };
	}

	public static getProcessConfig(): ProcessConfig {
		return Config.processConfig;
	}
}
