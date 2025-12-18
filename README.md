# Comet | Lend and borrow on Aztec (https://x.com/Comet_fi)
Privacy preserving and decentralized multi-markets overcollaterized lending protocol.

Born during the NoirHack.

## Features
- Privacy-preserving transactions
- Decentralized lending markets
- Multi-asset and multi-market support
- Built on Aztec

## Quick Start

### Prerequisites
- Node.js 18 `nvm install 18 && nvm use`
- Aztec sandbox: install via `bash -i <(curl -s https://install.aztec.network) && aztec-up 0.86.0`

### Running Locally

1. **Start the Aztec Sandbox**
```bash
aztec start --sandbox
```
> Wait a minute for the sandbox to initialize.
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

## Project Structure

- `interact/` – Deployment scripts  
- `website/` – Frontend application  
- `contracts/` – Smart contracts
