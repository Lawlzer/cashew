interface ProcessConfig {
	windowTitle?: string;
}

export class Config {
	private static processConfig: ProcessConfig = {};

	public static setProcessConfig(newConfig: ProcessConfig) {
		Config.processConfig = { ...Config.processConfig, ...newConfig };
	}

	public static getProcessConfig() {
		return Config.processConfig;
	}
}
