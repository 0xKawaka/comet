# Comet | Lend and borrow on Aztec
Privacy preserving and decentralized multi-markets lending protocol.

## Features
- Privacy-preserving transactions
- Decentralized lending markets
- Multi-asset support
- Built on Aztec's zk-rollup technology

## Quick Start

### Prerequisites
- Aztec CLI: install via `bash -i <(curl -s https://install.aztec.network)`

### Running Locally

1. **Start the Aztec Sandbox**
```bash
aztec start --sandbox
```
Wait for the sandbox initialisation
2. **Deploy and Setup Contracts**
```bash
cd interact && npm run deploy
```
3. **Start the Frontend**
```bash
cd website && npm run dev
```
