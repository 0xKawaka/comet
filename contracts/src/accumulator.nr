use dep::aztec::{protocol_types::traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Packable, Serialize)]
pub struct Accumulator {
    value: u128,
    last_updated_ts: u64,
}