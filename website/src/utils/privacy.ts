import { Fr, AztecAddress } from '@aztec/aztec.js';
import { pedersenHash } from '@aztec/foundation/crypto/sync';

function frToAztecAddress(field: Fr): AztecAddress {
  return AztecAddress.fromField(field);
}

export function computePrivateAddress(
  secret: Fr | bigint, 
  sender: AztecAddress
): AztecAddress {
  const secretField = secret instanceof Fr ? secret : new Fr(secret);
  const senderField = sender.toField();
  return frToAztecAddress(pedersenHash([senderField, secretField], 0));
}