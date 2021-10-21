import * as anchor from '@project-serum/anchor';
import { assert } from 'chai';

import BN from 'bn.js';

import {
	mockOracle,
	mockUserUSDCAccount,
	mockUSDCMint,
} from '../utils/mockAccounts';
import { getFeedData, setFeedPrice } from '../utils/mockPythUtils';
import {
	PEG_SCALAR,
	stripMantissa,
	UserAccount,
	PositionDirection,
	USDC_PRECISION,
	BASE_ASSET_PRECISION,
} from '../sdk';

import { Program } from '@project-serum/anchor';

import { PublicKey } from '@solana/web3.js';

import { AMM_MANTISSA, FUNDING_MANTISSA, ClearingHouse } from '../sdk/src';

import {
	initUserAccounts,
} from './../utils/stressUtils';

async function updateFundingRateHelper(
	clearingHouse: ClearingHouse,
	marketIndex: BN,
	priceFeedAddress: PublicKey,
	prices: Array<number>
) {
	for (let i = 0; i < prices.length; i++) {
		await new Promise((r) => setTimeout(r, 1000)); // wait 1 second

		const newprice = prices[i];
		await setFeedPrice(anchor.workspace.Pyth, newprice, priceFeedAddress);

		const marketsAccount0 = clearingHouse.getMarketsAccount();
		const marketData0 = marketsAccount0.markets[marketIndex.toNumber()];
		const ammAccountState0 = marketData0.amm;
		const oraclePx0 = await getFeedData(
			anchor.workspace.Pyth,
			ammAccountState0.oracle
		);

		const priceSpread0 =
			stripMantissa(ammAccountState0.lastMarkPriceTwap) - oraclePx0.twap;
		const frontEndFundingCalc0 = priceSpread0 / oraclePx0.twap / (24 * 3600);

		console.log(
			'funding rate frontend calc0:',
			frontEndFundingCalc0,
			'markTwap0:',
			ammAccountState0.lastMarkPriceTwap.toNumber() / AMM_MANTISSA.toNumber(),
			'markTwap0:',
			ammAccountState0.lastMarkPriceTwap.toNumber(),
			'oracleTwap0:',
			oraclePx0.twap,
			'priceSpread',
			priceSpread0,
		);

		const cumulativeFundingRateLongOld = ammAccountState0.cumulativeFundingRateLong;
		const cumulativeFundingRateShortOld = ammAccountState0.cumulativeFundingRateShort;


		const _tx = await clearingHouse.updateFundingRate(
			priceFeedAddress,
			marketIndex
		);

		const CONVERSION_SCALE = FUNDING_MANTISSA.mul(AMM_MANTISSA);

		const marketsAccount = clearingHouse.getMarketsAccount();
		const marketData = marketsAccount.markets[marketIndex.toNumber()];
		const ammAccountState = marketData.amm;
		const peroidicity = marketData.amm.fundingPeriod;

		const lastFundingRate = stripMantissa(
			ammAccountState.lastFundingRate,
			CONVERSION_SCALE
		);

		console.log('last funding rate:', lastFundingRate);
		console.log(
			'cumfunding rate long',
			stripMantissa(ammAccountState.cumulativeFundingRateLong, CONVERSION_SCALE),
			'cumfunding rate short',
			stripMantissa(ammAccountState.cumulativeFundingRateShort, CONVERSION_SCALE),
		);
		
		const lastFundingLong = (ammAccountState.cumulativeFundingRateLong.sub(cumulativeFundingRateLongOld)).abs();
		const lastFundingShort = (ammAccountState.cumulativeFundingRateShort.sub(cumulativeFundingRateShortOld)).abs();

		assert(ammAccountState.lastFundingRate.abs().gte(lastFundingLong.abs()));
		console.log(stripMantissa(ammAccountState.lastFundingRate.abs()),
		'>', 
		stripMantissa(lastFundingShort.abs()));
		assert(ammAccountState.lastFundingRate.abs().gte(lastFundingShort.abs()));

		const oraclePx = await getFeedData(
			anchor.workspace.Pyth,
			ammAccountState.oracle
		);

		await new Promise((r) => setTimeout(r, 1000)); // wait 1 second

		const priceSpread =
			ammAccountState.lastMarkPriceTwap.toNumber() / AMM_MANTISSA.toNumber() -
			oraclePx.twap;
		const frontEndFundingCalc =
			priceSpread / ((24 * 3600) / Math.max(1, peroidicity.toNumber()));

		console.log(
			'funding rate frontend calc:',
			frontEndFundingCalc,
			'markTwap:',
			ammAccountState.lastMarkPriceTwap.toNumber() / AMM_MANTISSA.toNumber(),
			'markTwap:',
			ammAccountState.lastMarkPriceTwap.toNumber(),
			'oracleTwap:',
			oraclePx.twap,
			'priceSpread:',
			priceSpread,
		);
		const s = new Date(ammAccountState.lastMarkPriceTwapTs.toNumber() * 1000);
		const sdate = s.toLocaleDateString('en-US');
		const stime = s.toLocaleTimeString('en-US');

		console.log('funding rate timestamp:', sdate, stime);

		// assert(Math.abs(frontEndFundingCalc - lastFundingRate) < 9e-6);
	}
}


async function cappedSymFundingScenario
	(
		clearingHouse: ClearingHouse,
		userAccount: UserAccount,
		clearingHouse2: ClearingHouse,
		userAccount2: UserAccount,
		marketIndex: BN,
		kSqrt: BN,
		priceAction: Array<number>,
		longShortSizes: Array<number>,
	)
	
	{
	const priceFeedAddress = await mockOracle(priceAction[0], -10);
		const periodicity = new BN(0);

		await clearingHouse.initializeMarket(
			marketIndex,
			priceFeedAddress,
			kSqrt,
			kSqrt,
			periodicity,
			new BN(priceAction[0] * PEG_SCALAR.toNumber())
		);

		console.log('PRICE', stripMantissa(clearingHouse.calculateBaseAssetPriceWithMantissa(marketIndex)));
		await clearingHouse.updateFundingPaused(true);

		await clearingHouse.openPosition(
			await userAccount.getPublicKey(),
			PositionDirection.LONG,
			USDC_PRECISION.mul(new BN(longShortSizes[0])),
			marketIndex
		);

		console.log('clearingHouse2.openPosition');
		// try{
		await clearingHouse2.openPosition(
			await userAccount2.getPublicKey(),
			PositionDirection.SHORT,
			USDC_PRECISION.mul(new BN(longShortSizes[1])),
			marketIndex
		)
		console.log(longShortSizes[0], longShortSizes[1]);
		if(longShortSizes[0]!=0){
			assert(!userAccount.getTotalPositionValue().eq(new BN(0)));
		} else{
			assert(userAccount.getTotalPositionValue().eq(new BN(0)));
		}
		if(longShortSizes[1]!=0){
			assert(!userAccount2.getTotalPositionValue().eq(new BN(0)));
		} else{
			assert(userAccount2.getTotalPositionValue().eq(new BN(0)));
		}

		// } catch(e){
		// }
		console.log('clearingHouse.getMarketsAccount');

		const market =
			await clearingHouse.getMarketsAccount().markets[marketIndex.toNumber()];
		const prevFRL = market.amm.cumulativeFundingRateLong;
		const prevFRS = market.amm.cumulativeFundingRateShort;
		console.log('updateFundingRateHelper');



		await clearingHouse.updateFundingPaused(false);

		const state = clearingHouse.getState();
		// console.log('Clearing House unpaused state', 
		// state);

		console.log('priceAction update', priceAction, priceAction.slice(1));
		await updateFundingRateHelper(
			clearingHouse,
			marketIndex,
			market.amm.oracle,
			priceAction.slice(1)
		);

		const marketNew =
		await clearingHouse.getMarketsAccount().markets[marketIndex.toNumber()];

		const fundingRateLong = marketNew.amm.cumulativeFundingRateLong;//.sub(prevFRL);
		const fundingRateShort = marketNew.amm.cumulativeFundingRateShort;//.sub(prevFRS);


		console.log(
		'fundingRateLong',
		 stripMantissa(fundingRateLong, AMM_MANTISSA.mul(FUNDING_MANTISSA)),
		'fundingRateShort', 
		stripMantissa(fundingRateShort, AMM_MANTISSA.mul(FUNDING_MANTISSA)),
		);
		console.log(
			'baseAssetAmountLong',
			 stripMantissa(marketNew.baseAssetAmountLong, BASE_ASSET_PRECISION),
			'baseAssetAmountShort', 
			stripMantissa(marketNew.baseAssetAmountShort, BASE_ASSET_PRECISION),
			'totalFee',
			stripMantissa(marketNew.amm.totalFee, USDC_PRECISION),
			'cumFee',
			stripMantissa(marketNew.amm.cumulativeFee, USDC_PRECISION),
			);

		const fundingPnLForLongs = marketNew.baseAssetAmountLong.mul(fundingRateLong).mul(new BN(-1));
		const fundingPnLForShorts = marketNew.baseAssetAmountShort.mul(fundingRateShort).mul(new BN(-1));

		let precisionFundingPay = BASE_ASSET_PRECISION;
		console.log(
			'fundingPnLForLongs',
			 stripMantissa(fundingPnLForLongs.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay),
			'fundingPnLForShorts', 
			stripMantissa(fundingPnLForShorts.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay),
			);

		// more dollars long than short
		assert(!fundingRateLong.eq(new BN(0)));
		assert(!fundingRateShort.eq(new BN(0)));

		assert(fundingRateShort.lte(fundingRateLong));
		await clearingHouse.closePosition(
			await userAccount.getPublicKey(),
			marketIndex
		);

		await clearingHouse2.closePosition(
			await userAccount2.getPublicKey(),
			marketIndex
		)

		return [fundingRateLong, fundingRateShort, fundingPnLForLongs, fundingPnLForShorts,
			marketNew.amm.totalFee, marketNew.amm.cumulativeFee];
}

describe('pyth-oracle', () => {
	const provider = anchor.Provider.local();
	const connection = provider.connection;

	anchor.setProvider(provider);
	const program = anchor.workspace.Pyth;

	const chProgram = anchor.workspace.ClearingHouse as Program;

	let clearingHouse: ClearingHouse;
	let clearingHouse2: ClearingHouse;

	let usdcMint: Keypair;
	let userUSDCAccount: Keypair;


	const ammInitialQuoteAssetAmount = (new anchor.BN(5 * 10 ** 13)).mul(AMM_MANTISSA);
	const ammInitialBaseAssetAmount = (new anchor.BN(5 * 10 ** 13)).mul(AMM_MANTISSA);

	const usdcAmount = new BN(10000 * 10 ** 6);

	let userAccount: UserAccount;
	let userAccount2: UserAccount;

	let rollingMarketNum = 0;
	before(async () => {
		usdcMint = await mockUSDCMint(provider);
		userUSDCAccount = await mockUserUSDCAccount(
			usdcMint,
			usdcAmount,
			provider
		);

		clearingHouse = new ClearingHouse(
			connection,
			provider.wallet,
			chProgram.programId
		);

		await clearingHouse.initialize(usdcMint.publicKey, true);
		await clearingHouse.subscribe();

		await clearingHouse.initializeUserAccount();
		userAccount = new UserAccount(clearingHouse, provider.wallet.publicKey);
		await userAccount.subscribe();

		await clearingHouse.depositCollateral(
			await userAccount.getPublicKey(),
			usdcAmount,
			userUSDCAccount.publicKey
		);


				// create <NUM_USERS> users with 10k that collectively do <NUM_EVENTS> actions
		const [userUSDCAccounts, user_keys, clearingHouses, userAccountInfos] =
		await initUserAccounts(1, usdcMint, usdcAmount, provider);

		clearingHouse2 = clearingHouses[0];
		userAccount2 = userAccountInfos[0];

		// await clearingHouse.depositCollateral(
		// 	await userAccount2.getPublicKey(),
		// 	usdcAmount,
		// 	userUSDCAccounts[1].publicKey
		// );
	});

	after(async () => {
		await clearingHouse.unsubscribe();
		await userAccount.unsubscribe();

		await clearingHouse2.unsubscribe();
		await userAccount2.unsubscribe();
	});

	it('capped sym funding: ($1 long, $200 short, oracle < mark)', async () => {
		const marketIndex = new BN(rollingMarketNum);
		rollingMarketNum+=1;
		const [fundingRateLong, fundingRateShort, fundingPnLForLongs, fundingPnLForShorts,
			totalFee, cumulativeFee] =  await cappedSymFundingScenario(
			clearingHouse, userAccount,
			clearingHouse2, userAccount2, 
			marketIndex,
			 ammInitialBaseAssetAmount,
			 [40, 36.5],
			 [1, 200],
			 );

		assert(fundingRateLong.abs().gt(fundingRateShort.abs()));
		assert(fundingRateLong.gt(new BN(0)));
		assert(fundingRateShort.gt(new BN(0)));

		assert(fundingPnLForLongs.abs().lt(fundingPnLForShorts.abs()));

		const feeAlloced =  stripMantissa(totalFee, USDC_PRECISION) -
		stripMantissa(cumulativeFee, USDC_PRECISION);

		let precisionFundingPay = BASE_ASSET_PRECISION;
		const fundingPnLForLongsNum = stripMantissa(fundingPnLForLongs.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);
		const fundingPnLForShortsNum = stripMantissa(fundingPnLForShorts.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);

		console.log(feeAlloced, '+', Math.abs(fundingPnLForLongsNum), '>=', fundingPnLForShortsNum);
		assert(feeAlloced + Math.abs(fundingPnLForLongsNum) >= fundingPnLForShortsNum);

	});

	it('capped sym funding: ($0 long, $200 short, oracle < mark)', async () => {
		const marketIndex = new BN(rollingMarketNum);
		rollingMarketNum+=1;

		const [fundingRateLong, fundingRateShort, fundingPnLForLongs, fundingPnLForShorts,
			totalFee, cumulativeFee] =  await cappedSymFundingScenario(
			clearingHouse, userAccount,
			clearingHouse2, userAccount2, 
			marketIndex,
			 ammInitialBaseAssetAmount,
			 [40, 36.5],
			 [0, 200],
			 );

		assert(fundingRateLong.abs().gt(fundingRateShort.abs()));
		assert(fundingRateLong.gt(new BN(0)));
		assert(fundingRateShort.gt(new BN(0)));

		assert(fundingPnLForLongs.abs().lt(fundingPnLForShorts.abs()));

		const feeAlloced =  stripMantissa(totalFee, USDC_PRECISION) -
		stripMantissa(cumulativeFee, USDC_PRECISION);

		let precisionFundingPay = BASE_ASSET_PRECISION;
		const fundingPnLForLongsNum = stripMantissa(fundingPnLForLongs.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);
		const fundingPnLForShortsNum = stripMantissa(fundingPnLForShorts.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);

		console.log(feeAlloced, '+', Math.abs(fundingPnLForLongsNum), '>=', fundingPnLForShortsNum);
		assert(feeAlloced + Math.abs(fundingPnLForLongsNum) >= fundingPnLForShortsNum);

	});
	it('capped sym funding: ($1 long, $200 short, oracle > mark)', async () => {
		// symmetric is taking fees

		const marketIndex = new BN(rollingMarketNum);
		rollingMarketNum+=1;

		const [fundingRateLong, fundingRateShort, fundingPnLForLongs, fundingPnLForShorts,
			totalFee, cumulativeFee] =  await cappedSymFundingScenario(
			clearingHouse, userAccount,
			clearingHouse2, userAccount2, 
			marketIndex,
			 ammInitialBaseAssetAmount,
			 [40, 43.5],
			 [1, 200],
			 );

		assert(fundingRateLong.abs().eq(fundingRateShort.abs()));
		assert(fundingRateLong.lt(new BN(0)));
		assert(fundingRateShort.lt(new BN(0)));

		assert(fundingPnLForLongs.abs().lt(fundingPnLForShorts.abs()));

		const feeAlloced =  stripMantissa(totalFee, USDC_PRECISION) -
		stripMantissa(cumulativeFee, USDC_PRECISION);

		let precisionFundingPay = BASE_ASSET_PRECISION;
		const fundingPnLForLongsNum = stripMantissa(fundingPnLForLongs.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);
		const fundingPnLForShortsNum = stripMantissa(fundingPnLForShorts.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);

		console.log(feeAlloced, '+', Math.abs(fundingPnLForLongsNum), '>=', fundingPnLForShortsNum);
		assert(feeAlloced + Math.abs(fundingPnLForLongsNum) >= fundingPnLForShortsNum);

	});
	it('capped sym funding: ($200 long, $1 short, oracle > mark)', async () => {
		const marketIndex = new BN(rollingMarketNum);
		rollingMarketNum+=1;

		const [fundingRateLong, fundingRateShort, fundingPnLForLongs, fundingPnLForShorts,
			totalFee, cumulativeFee] = await cappedSymFundingScenario(
			clearingHouse, userAccount,
			clearingHouse2, userAccount2, 
			marketIndex,
			 ammInitialBaseAssetAmount,
			 [41, 42.5],
			 [200, 1],
			 );

			 assert(fundingRateShort.abs().gt(fundingRateLong.abs()));
			 assert(fundingRateLong.lt(new BN(0)));
			 assert(fundingRateShort.lt(new BN(0)));

			 assert(fundingPnLForLongs.gt(new BN(0)));
			 assert(fundingPnLForShorts.lt(new BN(0)));

			 assert(fundingPnLForShorts.abs().lt(fundingPnLForLongs.abs()));
	 
			 const feeAlloced =  stripMantissa(totalFee, USDC_PRECISION) -
			 stripMantissa(cumulativeFee, USDC_PRECISION);
	 
			 let precisionFundingPay = BASE_ASSET_PRECISION;
			 const fundingPnLForLongsNum = stripMantissa(fundingPnLForLongs.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);
			 const fundingPnLForShortsNum = stripMantissa(fundingPnLForShorts.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);
	 
	 
			 // amount of money inflow must be greater than or equal to money outflow
			 console.log(feeAlloced, '+', Math.abs(fundingPnLForShortsNum), '>=', fundingPnLForLongsNum);
			 assert(feeAlloced + Math.abs(fundingPnLForShortsNum) >= fundingPnLForLongsNum);
			
	});
	it('capped sym funding: ($200 long, $0 short, oracle > mark)', async () => {
		const marketIndex = new BN(rollingMarketNum);
		rollingMarketNum+=1;

		const [fundingRateLong, fundingRateShort, fundingPnLForLongs, fundingPnLForShorts,
			totalFee, cumulativeFee] = await cappedSymFundingScenario(
			clearingHouse, userAccount,
			clearingHouse2, userAccount2, 
			marketIndex,
			 ammInitialBaseAssetAmount,
			 [41, 42.5],
			 [200, 0],
			 );

			 assert(fundingRateShort.abs().gt(fundingRateLong.abs()));
			 assert(fundingRateLong.lt(new BN(0)));
			 assert(fundingRateShort.lt(new BN(0)));

			 assert(fundingPnLForLongs.gt(new BN(0)));
			 assert(fundingPnLForShorts.eq(new BN(0)));

			 assert(fundingPnLForShorts.abs().lt(fundingPnLForLongs.abs()));
	 
			 const feeAlloced =  stripMantissa(totalFee, USDC_PRECISION) -
			 stripMantissa(cumulativeFee, USDC_PRECISION);
	 
			 let precisionFundingPay = BASE_ASSET_PRECISION;
			 const fundingPnLForLongsNum = stripMantissa(fundingPnLForLongs.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);
			 const fundingPnLForShortsNum = stripMantissa(fundingPnLForShorts.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);
	 
	 
			 // amount of money inflow must be greater than or equal to money outflow
			 console.log(feeAlloced, '+', Math.abs(fundingPnLForShortsNum), '>=', fundingPnLForLongsNum);
			 assert(feeAlloced + Math.abs(fundingPnLForShortsNum) >= fundingPnLForLongsNum);
			
	});
	it('capped sym funding: ($200 long, $1 short, oracle < mark)', async () => {
		//symmetric is taking fees
		const marketIndex = new BN(rollingMarketNum);
		rollingMarketNum+=1;

		const [fundingRateLong, fundingRateShort, fundingPnLForLongs, fundingPnLForShorts,
			totalFee, cumulativeFee] = await cappedSymFundingScenario(
			clearingHouse, userAccount,
			clearingHouse2, userAccount2, 
			marketIndex,
			 ammInitialBaseAssetAmount,
			 [41, 38.5],
			 [200, 1],
			 );

			 assert(fundingRateShort.abs().eq(fundingRateLong.abs()));
			 assert(fundingRateLong.gt(new BN(0)));
			 assert(fundingRateShort.gt(new BN(0)));

			 assert(fundingPnLForLongs.lt(new BN(0)));
			 assert(fundingPnLForShorts.gt(new BN(0)));

			 assert(fundingPnLForShorts.abs().lt(fundingPnLForLongs.abs()));
	 
			 const feeAlloced =  stripMantissa(totalFee, USDC_PRECISION) -
			 stripMantissa(cumulativeFee, USDC_PRECISION);
	 
			 let precisionFundingPay = BASE_ASSET_PRECISION;
			 const fundingPnLForLongsNum = stripMantissa(fundingPnLForLongs.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);
			 const fundingPnLForShortsNum = stripMantissa(fundingPnLForShorts.div(AMM_MANTISSA.mul(FUNDING_MANTISSA)), precisionFundingPay);
	 
	 
			 // amount of money inflow must be greater than or equal to money outflow
			 console.log(feeAlloced, '+', Math.abs(fundingPnLForShortsNum), '>=', fundingPnLForLongsNum);
			 assert(feeAlloced + Math.abs(fundingPnLForShortsNum) >= fundingPnLForLongsNum);
			
	});
});