type DriftConfig = {
	PYTH_ORACLE_MAPPING_ADDRESS: string;
	CLEARING_HOUSE_PROGRAM_ID: string;
	USDC_MINT_ADDRESS: string;
	MOCK_USDC_FAUCET_ADDRESS: string;
	EXCHANGE_HISTORY_SERVER_URL: string;
};

export type DriftEnv = 'local' | 'master' | 'devnet' | 'mainnet-beta';

const configs: { [key in DriftEnv]: DriftConfig } = {
	local: {
		PYTH_ORACLE_MAPPING_ADDRESS: 'BmA9Z6FjioHJPpjT39QazZyhDRUdZy2ezwx4GiDdE2u2',
		CLEARING_HOUSE_PROGRAM_ID: '8Fs5E3Jt4Tx7La47XHXBWevqGrZtTJB2txvU8MrBUoWS',
		USDC_MINT_ADDRESS: 'Doe9rajhwt18aAeaVe8vewzAsBk4kSQ2tTyZVUJhHjhY',
		MOCK_USDC_FAUCET_ADDRESS: '2z2DLVD3tBWc86pbvvy5qN31v1NXprM6zA5MDr2FMx64',
		EXCHANGE_HISTORY_SERVER_URL: 'http://localhost:5000',
	},
	master: {
		PYTH_ORACLE_MAPPING_ADDRESS: 'BmA9Z6FjioHJPpjT39QazZyhDRUdZy2ezwx4GiDdE2u2',
		CLEARING_HOUSE_PROGRAM_ID: '8Fs5E3Jt4Tx7La47XHXBWevqGrZtTJB2txvU8MrBUoWS',
		USDC_MINT_ADDRESS: 'Doe9rajhwt18aAeaVe8vewzAsBk4kSQ2tTyZVUJhHjhY',
		MOCK_USDC_FAUCET_ADDRESS: '2z2DLVD3tBWc86pbvvy5qN31v1NXprM6zA5MDr2FMx64',
		EXCHANGE_HISTORY_SERVER_URL: 'https://master.history.drift.trade',
	},
	devnet: {
		PYTH_ORACLE_MAPPING_ADDRESS: 'BmA9Z6FjioHJPpjT39QazZyhDRUdZy2ezwx4GiDdE2u2',
		CLEARING_HOUSE_PROGRAM_ID: '8Fs5E3Jt4Tx7La47XHXBWevqGrZtTJB2txvU8MrBUoWS',
		USDC_MINT_ADDRESS: 'Doe9rajhwt18aAeaVe8vewzAsBk4kSQ2tTyZVUJhHjhY',
		MOCK_USDC_FAUCET_ADDRESS: '2z2DLVD3tBWc86pbvvy5qN31v1NXprM6zA5MDr2FMx64',
		EXCHANGE_HISTORY_SERVER_URL: 'https://devnet.history.drift.trade',
	},
	//TODO - replace these with mainnet values
	'mainnet-beta': {
		PYTH_ORACLE_MAPPING_ADDRESS: 'BmA9Z6FjioHJPpjT39QazZyhDRUdZy2ezwx4GiDdE2u2',
		CLEARING_HOUSE_PROGRAM_ID: '2GKYrCi6xAsH82dQbXKH4Sn7o59wcjSmcHbeF4jvkpcZ',
		USDC_MINT_ADDRESS: 'FRaqszHXLdPPY9d7e7oJMei7McYaJgjcmrYzW3ahbG3X',
		MOCK_USDC_FAUCET_ADDRESS: '8swCeiLXZU1UBwxkYLUjmZdbAGMP87RY5T4JFcM8wxcG',
		EXCHANGE_HISTORY_SERVER_URL: 'https://devnet.history.drift.trade',
	},
};

let currentConfig: DriftConfig = configs.master;

export const getConfig = (): DriftConfig => currentConfig;

/**
 * Allows customization of the SDK's environment and endpoints. You can pass individual settings to override the settings with your own presets.
 *
 * Defaults to master environment if you don't use this function.
 * @param props
 * @returns
 */
export const initialize = (props: {
	env: DriftEnv;
	overrideEnv?: Partial<DriftConfig>;
}): DriftConfig => {
	currentConfig = { ...configs[props.env], ...(props.overrideEnv ?? {}) };

	return currentConfig;
};
