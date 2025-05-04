# Comet | Lend and borrow on Aztec
Privacy preserving and decentralized multi-markets overcollaterized lending protocol.

## Features
- Privacy-preserving transactions
- Decentralized lending markets
- Multi-asset and multi-market support
- Built on Aztec

## Quick Start

### Prerequisites
- Aztec CLI: install via `bash -i <(curl -s https://install.aztec.network)`

### Running Locally

1. **Start the Aztec Sandbox**
```bash
aztec start --sandbox
```
2. **Deploy and Setup Contracts**
```bash
cd interact && npm run deploy
```
3. **Start the Frontend**
```bash
cd website && npm run dev
```

## Project Structure

- `interact/` – Contract interaction scripts  
- `website/` – Frontend application  
- `contracts/` – Smart contracts (if applicable)
