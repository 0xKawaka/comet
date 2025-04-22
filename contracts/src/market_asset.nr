use dep::aztec::protocol_types::traits::{Deserialize, Serialize};
use std::meta::derive;
use crate::asset::Asset;

#[derive(Serialize, Deserialize)]
pub struct MarketAssets {
    first_asset: Asset,
    second_asset: Asset,
}