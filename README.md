# Comet | Lend and borrow on Aztec
Privacy preserving and decentralized multi-markets overcollaterized lending protocol.

Born during the NoirHack.

## Features
- Privacy-preserving transactions
- Decentralized lending markets
- Multi-asset and multi-market support
- Built on Aztec

## Quick Start

### Prerequisites
- Aztec sandbox: install via `bash -i <(curl -s https://install.aztec.network)`

### Running Locally

1. **Start the Aztec Sandbox**
```bash
aztec start --sandbox
```
2. **Deploy and Setup Contracts**
```bash
cd interact && npm i && npm run deploy
```
> **Note:**  
> The first deployment attempt might fail with the following error:  
> `Reason: Tx dropped by P2P node.`  
> If this happens, simply try running the command again.

3. **Start the Frontend**
```bash
cd website && npm i && npm run dev
```
> Private flow isn't fully figured out. You'll run in a bug if you try to deposit or repay from a secret address.

## Project Structure

- `interact/` – Deployment scripts  
- `website/` – Frontend application  
- `contracts/` – Smart contracts
