import { Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { PriceFeedContract } from '@aztec/noir-contracts.js/PriceFeed';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
// import { LendingContract } from '../../contracts/src/artifacts/Lending.ts';
import { LendingContract } from './contracts/Lending.ts';
import { writeFileSync } from 'fs';


const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [ownerWallet] = await getInitialTestAccountsWallets(pxe);
  const ownerAddress = ownerWallet.getAddress();
  
  const token1 = await TokenContract.deploy(ownerWallet, ownerAddress, 'token 1', 'TK1', 9)
    .send()
    .deployed();
  const token2 = await TokenContract.deploy(ownerWallet, ownerAddress, 'token 2', 'TK2', 9)
    .send()
    .deployed();
  const token3 = await TokenContract.deploy(ownerWallet, ownerAddress, 'token 3', 'TK3', 9)
    .send()
    .deployed();

  const priceFeed1 = await PriceFeedContract.deploy(ownerWallet)
    .send()
    .deployed();
  const priceFeed2 = await PriceFeedContract.deploy(ownerWallet)
    .send()
    .deployed();
  const priceFeed3 = await PriceFeedContract.deploy(ownerWallet)
    .send()
    .deployed();

  const lending = await LendingContract.deploy(ownerWallet)
  .send()
  .deployed();

  console.log(`Token1 deployed at ${token1.address.toString()}`);
  console.log(`Token2 deployed at ${token2.address.toString()}`);
  console.log(`Token3 deployed at ${token3.address.toString()}`);
  console.log(`PriceFeed1 deployed at ${priceFeed1.address.toString()}`);
  console.log(`PriceFeed2 deployed at ${priceFeed2.address.toString()}`);
  console.log(`PriceFeed3 deployed at ${priceFeed3.address.toString()}`);
  console.log(`Lending deployed at ${lending.address.toString()}`);

  await token1.methods.set_minter(ownerAddress, true).send().wait();
  await token2.methods.set_minter(lending.address, true).send().wait();
  await token3.methods.set_minter(lending.address, true).send().wait();
  await token1.methods.mint_to_public(ownerAddress, 1000n * 10n ** 9n).send().wait();
  await token2.methods.mint_to_public(ownerAddress, 1000n * 10n ** 9n).send().wait();
  await token3.methods.mint_to_public(ownerAddress, 1000n * 10n ** 9n).send().wait();

  await priceFeed1.methods.set_price(0n, 3n * 10n ** 9n).send().wait();
  await priceFeed2.methods.set_price(0n, 2n * 10n ** 9n).send().wait();
  await priceFeed3.methods.set_price(0n, 1n * 10n ** 9n).send().wait();

  // add_asset(market_id: Field, asset_address: AztecAddress, oracle: AztecAddress, loan_to_value: u128, is_borrowable: bool, optimal_utilization_rate: u128, under_optimal_slope: u128, over_optimal_slope: u128, deposit_cap: u128)
  await lending.methods.add_asset(1n, token1.address, priceFeed1.address, 6000n, true, 600000000n, 2000000000n, 3000000000n, 1000000000000000n).send().wait();
  await lending.methods.add_asset(1n, token2.address, priceFeed2.address, 7000n, true, 700000000n, 2000000000n, 3000000000n, 1000000000000000n).send().wait();
  await lending.methods.add_asset(1n, token3.address, priceFeed3.address, 8000n, true, 800000000n, 2000000000n, 3000000000n, 1000000000000000n).send().wait();
  
  const addresses = { lending: lending.address.toString() };
  writeFileSync('contracts.json', JSON.stringify(addresses, null, 2));
  writeFileSync('../website/src/blockchain/dev-contracts.json', JSON.stringify(addresses, null, 2));
  const allAssets = {
    [token1.address.toString()]: { name: 'token 1', ticker: 'TK1', decimals: 9, oracle: priceFeed1.address.toString(), loan_to_value: 0.6, is_borrowable: true, deposit_cap: "1000000000000000" },
    [token2.address.toString()]: { name: 'token 2', ticker: 'TK2', decimals: 9, oracle: priceFeed2.address.toString(), loan_to_value: 0.7, is_borrowable: true, deposit_cap: "1000000000000000" },
    [token3.address.toString()]: { name: 'token 3', ticker: 'TK3', decimals: 9, oracle: priceFeed3.address.toString(), loan_to_value: 0.8, is_borrowable: true, deposit_cap: "1000000000000000" },
  }
  writeFileSync('../website/src/blockchain/dev-all-assets.json', JSON.stringify(allAssets, null, 2));

  console.log(`Deployement complete`);
}

main();
