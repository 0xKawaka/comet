use dep::aztec::{prelude::AztecAddress, protocol_types::traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

/// Struct to be used to represent "totals". Generally, there should be one per Asset.
/// It stores the global values that are shared among all users, such as an accumulator
/// and last time it was updated.
/// In practice, it should also point to an oracle and have more fields related to
/// loan to value ratios and other things, but we did not have enough reads/writes for this.
///
/// Note: Right now we are wasting so many writes. If changing last_updated_ts we will end
/// up rewriting all the values.
#[derive(Deserialize, Packable, Serialize)]
pub struct Asset {
    asset_address: AztecAddress,
    loan_to_value: u128,
    oracle: AztecAddress,
    is_borrowable: bool,
    optimal_utilization_rate: u128,
    under_optimal_slope: u128,
    over_optimal_slope: u128,
    deposit_cap: u128,
}
