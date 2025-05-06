#!/bin/bash

# Copy Lending.ts to both destinations
cp target/Lending.ts ../website/src/blockchain/contracts/
cp target/Lending.ts ../interact/src/contracts/

# Copy lending_contract-Lending.json to both destinations
cp target/lending_contract-Lending.json ../website/src/blockchain/contracts/
cp target/lending_contract-Lending.json ../interact/src/contracts/

echo "Files copied successfully!" 