import { Contract, createPXEClient, loadContractArtifact, waitForPXE, Fr, PXE, deriveKeys, AztecAddress } from '@aztec/aztec.js';
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { PriceFeedContract } from '@aztec/noir-contracts.js/PriceFeed';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
// import { LendingContract } from '../../contracts/src/artifacts/Lending.ts';
import { LendingContract } from './contracts/Lending.ts';
import { writeFileSync } from 'fs';


const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  console.log('Retrieving PXE...');
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const wallets = await getInitialTestAccountsWallets(pxe);

  const userWallet0 = wallets[0];
  const userAddress0 = userWallet0.getAddress();
  const userWallet = wallets[1];
  const userAddress1 = userWallet.getAddress();
  const ownerWallet = wallets[2];
  const ownerAddress = ownerWallet.getAddress();

  console.log('Deploying contracts...');
  const [token1, token2, token3, priceFeed1, priceFeed2, priceFeed3] = await Promise.all([
    TokenContract.deploy(ownerWallet, ownerAddress, 'token 1', 'TK1', 9).send().deployed(),
    TokenContract.deploy(ownerWallet, ownerAddress, 'token 2', 'TK2', 9).send().deployed(),
    TokenContract.deploy(ownerWallet, ownerAddress, 'token 3', 'TK3', 9).send().deployed(),
    PriceFeedContract.deploy(ownerWallet).send().deployed(),
    PriceFeedContract.deploy(ownerWallet).send().deployed(),
    PriceFeedContract.deploy(ownerWallet).send().deployed()
  ]);

  // Deploy lending contract
  const lendingSecret = Fr.random()
  const lendingPublicKeys = (await deriveKeys(lendingSecret)).publicKeys

  const lending_deployment = LendingContract.deployWithPublicKeys(
    lendingPublicKeys,
    ownerWallet,
  )
  const lending = await lending_deployment.send().deployed()
  const lendingPartialAddress = await lending.partialAddress

  if (!lendingPartialAddress) {
    throw new Error("Failed to get partial address")
  }

  await pxe.registerContract({ instance: lending.instance, artifact: lending.artifact })
  await pxe.registerAccount( lendingSecret, lendingPartialAddress )


  // // Deploy lending contract
  // const lending = await LendingContract.deploy(ownerWallet).send().deployed();

  console.log(`Token1 deployed at ${token1.address.toString()}`);
  console.log(`Token2 deployed at ${token2.address.toString()}`);
  console.log(`Token3 deployed at ${token3.address.toString()}`);
  console.log(`PriceFeed1 deployed at ${priceFeed1.address.toString()}`);
  console.log(`PriceFeed2 deployed at ${priceFeed2.address.toString()}`);
  console.log(`PriceFeed3 deployed at ${priceFeed3.address.toString()}`);
  console.log(`Lending deployed at ${lending.address.toString()}`);

  console.log('Minting tokens...');
  await Promise.all([
    token1.methods.mint_to_public(userAddress0, 1000n * 10n ** 9n).send().wait(),
    token2.methods.mint_to_public(userAddress0, 1000n * 10n ** 9n).send().wait(),
    token3.methods.mint_to_public(userAddress0, 1000n * 10n ** 9n).send().wait(),
    token1.methods.mint_to_public(userAddress1, 1000n * 10n ** 9n).send().wait(),
    token2.methods.mint_to_public(userAddress1, 1000n * 10n ** 9n).send().wait(),
    token3.methods.mint_to_public(userAddress1, 1000n * 10n ** 9n).send().wait(),
    token1.methods.mint_to_private(userAddress0, userAddress0, 500n * 10n ** 9n).send().wait(),
    token2.methods.mint_to_private(userAddress0, userAddress0, 500n * 10n ** 9n).send().wait(),
    token3.methods.mint_to_private(userAddress0, userAddress0, 500n * 10n ** 9n).send().wait(),
    priceFeed1.methods.set_price(0n, 3n * 10n ** 9n).send().wait(),
    priceFeed2.methods.set_price(0n, 2n * 10n ** 9n).send().wait(),
    priceFeed3.methods.set_price(0n, 1n * 10n ** 9n).send().wait(),
    lending.methods.add_asset(1n, token1.address, priceFeed1.address, 6000n, true, 600000000n, 2000000000n, 3000000000n, 1000000000000000n).send().wait(),
    lending.methods.add_asset(1n, token2.address, priceFeed2.address, 7000n, true, 700000000n, 2000000000n, 3000000000n, 1000000000000000n).send().wait(),
    lending.methods.add_asset(1n, token3.address, priceFeed3.address, 8000n, true, 800000000n, 2000000000n, 3000000000n, 1000000000000000n).send().wait()
  ]);
  
  console.log('Writing files...');
  const addresses = { lending: lending.address.toString() };

  writeFileSync('contracts.json', JSON.stringify(addresses, null, 2));
  writeFileSync('../website/src/blockchain/dev-contracts.json', JSON.stringify(addresses, null, 2));
  
  const allAssets = {
    [token1.address.toString()]: { name: 'token 1', ticker: 'TK1', decimals: 9, oracle: priceFeed1.address.toString(), loan_to_value: 0.6, is_borrowable: true, deposit_cap: "1000000000000000", optimal_utilization_rate: 0.6, under_optimal_slope: 2, over_optimal_slope: 3 },
    [token2.address.toString()]: { name: 'token 2', ticker: 'TK2', decimals: 9, oracle: priceFeed2.address.toString(), loan_to_value: 0.7, is_borrowable: true, deposit_cap: "1000000000000000", optimal_utilization_rate: 0.7, under_optimal_slope: 2, over_optimal_slope: 3 },
    [token3.address.toString()]: { name: 'token 3', ticker: 'TK3', decimals: 9, oracle: priceFeed3.address.toString(), loan_to_value: 0.8, is_borrowable: true, deposit_cap: "1000000000000000", optimal_utilization_rate: 0.8, under_optimal_slope: 2, over_optimal_slope: 3 },
  }
  writeFileSync('../website/src/blockchain/dev-all-assets.json', JSON.stringify(allAssets, null, 2));

  console.log(`Deployment complete`);
}

main();
