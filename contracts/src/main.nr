mod asset;
mod position;
mod helpers;
mod accumulator;

use dep::aztec::macros::aztec;

#[aztec]
pub contract Lending {
    use crate::asset::Asset;
    use crate::helpers::{compute_identifier};
    use crate::position::Position;
    use crate::accumulator::Accumulator;

    use dep::aztec::prelude::{AztecAddress, Map, PublicMutable};
    use dep::price_feed::PriceFeed;
    use dep::token::Token;
    use dep::aztec::macros::{
        functions::{initializer, internal, private, public, view, utility},
        storage::storage,
    };
    use dep::aztec::protocol_types::traits::{FromField, ToField};
    use dep::aztec::{
        event::event_interface::EventInterface,
        macros::events::event,
        messages::logs::{
            event::encode_and_encrypt_event_unconstrained,
            note::{encode_and_encrypt_note, encode_and_encrypt_note_unconstrained},
        },
        unencrypted_logs::unencrypted_event_emission::encode_event,
        protocol_types::traits::Serialize,
    };

    #[derive(Serialize)]
    #[event]
    struct PositionUpdate {
        user: AztecAddress,
        market_id: Field,
        asset_address: AztecAddress,
        scaled_deposited: u128,
        scaled_borrowed: u128,
        deposit_accumulator: Accumulator,
        borrow_accumulator: Accumulator,
    }

    #[storage]
    struct Storage<Context> {
        market_assets: Map<Field, Map<AztecAddress, PublicMutable<Asset, Context>, Context>, Context>,
        market_assets_list: Map<Field, Map<u64, PublicMutable<AztecAddress, Context>, Context>, Context>,
        market_assets_list_len: Map<Field, PublicMutable<u64, Context>, Context>,
        scaled_deposited_assets: Map<Field, Map<AztecAddress, Map<AztecAddress, PublicMutable<u128, Context>, Context>, Context>, Context>,
        scaled_borrowed_assets: Map<Field, Map<AztecAddress, Map<AztecAddress, PublicMutable<u128, Context>, Context>, Context>, Context>, // static debt
        scaled_total_deposited_assets: Map<Field, Map<AztecAddress, PublicMutable<u128, Context>, Context>, Context>,
        scaled_total_borrowed_assets: Map<Field, Map<AztecAddress, PublicMutable<u128, Context>, Context>, Context>, // static debt
        deposit_accumulators: Map<Field, Map<AztecAddress, PublicMutable<Accumulator, Context>, Context>, Context>,
        borrow_accumulators: Map<Field, Map<AztecAddress, PublicMutable<Accumulator, Context>, Context>, Context>,
    }

    #[public]
    #[internal]
    fn emit_position_update(market_id: Field, asset_address: AztecAddress, user: AztecAddress) {
        let scaled_deposited = storage.scaled_deposited_assets.at(market_id).at(asset_address).at(user).read();
        let scaled_borrowed = storage.scaled_borrowed_assets.at(market_id).at(asset_address).at(user).read();
        let deposit_accumulator = storage.deposit_accumulators.at(market_id).at(asset_address).read();
        let borrow_accumulator = storage.borrow_accumulators.at(market_id).at(asset_address).read();
        let event = PositionUpdate { user, market_id, asset_address, scaled_deposited, scaled_borrowed, deposit_accumulator, borrow_accumulator };
        event.emit(encode_event(&mut context));
    }

    #[private]
    #[initializer]
    fn constructor() {}

    #[private]
    fn repay_private(
        from: AztecAddress,
        amount: u128,
        nonce: Field,
        secret: Field,
        on_behalf_of: Field,
        market_id: Field,
        asset_address: AztecAddress,
        fromPublicBalance: bool,
    ) {
        let on_behalf_of =
            compute_identifier(secret, on_behalf_of, context.msg_sender().to_field());
        if(!fromPublicBalance) {
            let _ = Token::at(asset_address).transfer_to_public(from, context.this_address(), amount, nonce).call(&mut context);
        }
        else {
            let _ = Token::at(asset_address).transfer_in_public(from, context.this_address(), amount, nonce).enqueue(&mut context);
        }
        let _ = Lending::at(context.this_address())
            ._repay(AztecAddress::from_field(on_behalf_of), amount, market_id, asset_address)
            .enqueue(&mut context);
    }

    #[public]
    fn repay_public(amount: u128, nonce: Field, owner: AztecAddress, market_id: Field, asset_address: AztecAddress) {
        let _ = Token::at(asset_address).transfer_in_public(context.msg_sender(), context.this_address(), amount, nonce).call(&mut context);
        let _ = Lending::at(context.this_address())._repay(owner, amount, market_id, asset_address).call(
            &mut context,
        );
    }

    #[public]
    #[internal]
    fn _repay(owner: AztecAddress, amount: u128, market_id: Field, asset_address: AztecAddress) {
        let asset_loc = storage.market_assets.at(market_id).at(asset_address);
        let asset: Asset = asset_loc.read();
        assert(asset.asset_address == asset_address, "Invalid asset or market id");

        Lending::at(context.this_address()).update_accumulators(market_id, asset_address).call(&mut context);

        let scaled_user_borrowed_amount_loc = storage.scaled_borrowed_assets.at(market_id).at(asset_address).at(owner);
        let scaled_user_borrowed_amount: u128 = scaled_user_borrowed_amount_loc.read();
        let borrow_accumulator_loc = storage.borrow_accumulators.at(market_id).at(asset_address);
        let borrow_accumulator: Accumulator = borrow_accumulator_loc.read();
        let scaled_amount = (amount * 1000000000 as u128) / borrow_accumulator.value;

        assert(scaled_user_borrowed_amount >= scaled_amount, "Insufficient balance");
        scaled_user_borrowed_amount_loc.write(scaled_user_borrowed_amount - scaled_amount);

        let scaled_total_borrowed_asset_loc = storage.scaled_total_borrowed_assets.at(market_id).at(asset_address);
        let scaled_total_borrowed_asset: u128 = scaled_total_borrowed_asset_loc.read();
        scaled_total_borrowed_asset_loc.write(scaled_total_borrowed_asset - scaled_amount);

        Lending::at(context.this_address()).emit_position_update(market_id, asset_address, owner).call(&mut context);
    }

     #[private]
    fn borrow_private(secret: Field, to: AztecAddress, amount: u128, market_id: Field, asset_address: AztecAddress) {
        let on_behalf_of = compute_identifier(secret, context.msg_sender().to_field(), context.msg_sender().to_field());
        let _ = Lending::at(context.this_address())
            ._borrow(AztecAddress::from_field(on_behalf_of), amount, market_id, asset_address)
            .enqueue(&mut context);
        // let _ = Token::at(asset_address)
        // .transfer_in_public(context.this_address(), to, amount, 0)
        // .enqueue(&mut context);
        let _ = Token::at(asset_address)
        .transfer_to_private(to, amount)
        .call(&mut context);
    }

    #[public]
    fn borrow_public(to: AztecAddress, amount: u128, market_id: Field, asset_address: AztecAddress) {
        let _ = Lending::at(context.this_address())._borrow(context.msg_sender(), amount, market_id, asset_address).call(
            &mut context,
        );
        let _ = Token::at(asset_address)
        .transfer_in_public(context.this_address(), to, amount, 0)
        .call(&mut context);
    }

    #[public]
    #[internal]
    fn _borrow(owner: AztecAddress, amount: u128, market_id: Field, asset_address: AztecAddress) {
        let asset_loc = storage.market_assets.at(market_id).at(asset_address);
        let asset: Asset = asset_loc.read();

        assert(asset.is_borrowable, "Asset is not borrowable");

        let total_collateral_value: u128 = Lending::at(context.this_address())._compute_total_collateral_value(market_id, owner).call(&mut context);
        let collateral_debt_value = Lending::at(context.this_address())._compute_collateral_debt_value(market_id, owner).call(&mut context);

        let borrow_price = PriceFeed::at(asset.oracle).get_price(0).view(&mut context).price;
        let min_collateral_for_borrow = (amount * borrow_price * 10000 as u128) / (asset.loan_to_value * 1000000000 as u128);

        assert(collateral_debt_value + min_collateral_for_borrow <= total_collateral_value, "Insufficient collateral");
        
        let scaled_user_borrowed_amount_loc = storage.scaled_borrowed_assets.at(market_id).at(asset_address).at(owner);
        let scaled_user_borrowed_amount: u128 = scaled_user_borrowed_amount_loc.read();
        let borrow_accumulator_loc = storage.borrow_accumulators.at(market_id).at(asset_address);
        let borrow_accumulator: Accumulator = borrow_accumulator_loc.read();
        let scaled_amount = (amount * 1000000000 as u128) / borrow_accumulator.value;
        scaled_user_borrowed_amount_loc.write(scaled_user_borrowed_amount + scaled_amount);

        let scaled_total_borrowed_asset_loc = storage.scaled_total_borrowed_assets.at(market_id).at(asset_address);
        let scaled_total_borrowed_asset: u128 = scaled_total_borrowed_asset_loc.read();
        scaled_total_borrowed_asset_loc.write(scaled_total_borrowed_asset + scaled_amount);

        Lending::at(context.this_address()).emit_position_update(market_id, asset_address, owner).call(&mut context);
    }

    #[private]
    fn withdraw_private(secret: Field, to: AztecAddress, amount: u128, market_id: Field, collateral_asset: AztecAddress) {
        let on_behalf_of = compute_identifier(secret, context.msg_sender().to_field(), context.msg_sender().to_field());
        Lending::at(context.this_address())
            ._withdraw(AztecAddress::from_field(on_behalf_of), to, amount, market_id, collateral_asset)
            .enqueue(&mut context);
        // let _ = Token::at(collateral_asset)
        // .transfer_in_public(context.this_address(), to, amount, 0)
        // .enqueue(&mut context);
        let _ = Token::at(collateral_asset)
        .transfer_to_private(to, amount)
        .call(&mut context);
    }

    #[public]
    fn withdraw_public(to: AztecAddress, amount: u128, market_id: Field, collateral_asset: AztecAddress) {
        let _ = Lending::at(context.this_address())
            ._withdraw(context.msg_sender(), to, amount, market_id, collateral_asset)
            .call(&mut context);
        let _ = Token::at(collateral_asset)
        .transfer_in_public(context.this_address(), to, amount, 0)
        .call(&mut context);
    }

    #[public]
    #[internal]
    fn _withdraw(owner: AztecAddress, to: AztecAddress, amount: u128, market_id: Field, collateral_asset: AztecAddress) {
        let asset_loc = storage.market_assets.at(market_id).at(collateral_asset);
        let asset: Asset = asset_loc.read();
        assert(asset.asset_address == collateral_asset, "Invalid asset or market id");
        
        Lending::at(context.this_address()).update_accumulators(market_id, collateral_asset).call(&mut context);

        let deposit_accumulator_loc = storage.deposit_accumulators.at(market_id).at(collateral_asset);
        let deposit_accumulator: Accumulator = deposit_accumulator_loc.read();

        let scaled_user_deposited_amount_loc = storage.scaled_deposited_assets.at(market_id).at(collateral_asset).at(owner);
        let scaled_user_deposited_amount: u128 = scaled_user_deposited_amount_loc.read();
        let user_deposited_amount = (scaled_user_deposited_amount * deposit_accumulator.value) / 1000000000 as u128 ;
        assert(user_deposited_amount >= amount, "Insufficient balance");

        let total_collateral_value: u128 = Lending::at(context.this_address())._compute_total_collateral_value(market_id, owner).call(&mut context);

        let collateral_debt_value = Lending::at(context.this_address())._compute_collateral_debt_value(market_id, owner).call(&mut context);

        let collateral_price = PriceFeed::at(asset.oracle).get_price(0).view(&mut context).price;
        let withdraw_amount_value = (amount * collateral_price) / 1000000000 as u128;

        let total_collateral_value_after_withdraw = total_collateral_value - withdraw_amount_value;

        assert(collateral_debt_value <= total_collateral_value_after_withdraw, "Insufficient collateral");

        let scaled_withdraw_amount = (amount * 1000000000 as u128) / deposit_accumulator.value;
        scaled_user_deposited_amount_loc.write(scaled_user_deposited_amount - scaled_withdraw_amount);

        let scaled_total_deposited_asset_loc = storage.scaled_total_deposited_assets.at(market_id).at(collateral_asset);
        let scaled_total_deposited_asset: u128 = scaled_total_deposited_asset_loc.read();
        scaled_total_deposited_asset_loc.write(scaled_total_deposited_asset - scaled_withdraw_amount);

        Lending::at(context.this_address()).emit_position_update(market_id, collateral_asset, owner).call(&mut context);
    }

    #[public]
    #[internal]
    fn _compute_total_collateral_value(market_id: Field, owner: AztecAddress) -> u128 {
        let mut total_collateral_value: u128 = 0 as u128;

        let market_assets_list_len_loc = storage.market_assets_list_len.at(market_id);
        let market_assets_list_len: u64 = market_assets_list_len_loc.read();
        let market_assets_list_loc = storage.market_assets_list.at(market_id);

        for i in 0..market_assets_list_len {
            let market_asset_loc = market_assets_list_loc.at(i);
            let market_asset: AztecAddress = market_asset_loc.read();
            Lending::at(context.this_address()).update_accumulators(market_id, market_asset).call(&mut context);
            let collateral_asset_loc = storage.market_assets.at(market_id).at(market_asset);
            let collateral_asset: Asset = collateral_asset_loc.read();
            let collateral_price = PriceFeed::at(collateral_asset.oracle).get_price(0).view(&mut context).price;
            let scaled_collateral_amount_loc = storage.scaled_deposited_assets.at(market_id).at(market_asset).at(owner);
            let scaled_collateral_amount: u128 = scaled_collateral_amount_loc.read();
            let deposit_accumulator_loc = storage.deposit_accumulators.at(market_id).at(market_asset);
            let deposit_accumulator: Accumulator = deposit_accumulator_loc.read();
            let collateral_amount = (scaled_collateral_amount * deposit_accumulator.value) / 1000000000 as u128;
            total_collateral_value += (collateral_amount * collateral_price);
        }
        total_collateral_value / 1000000000 as u128
    }

    #[public]
    #[internal]
    fn _compute_collateral_debt_value(market_id: Field, owner: AztecAddress) -> u128 {
        let mut min_collateral_value: u128 = 0 as u128;

        let market_assets_list_len_loc = storage.market_assets_list_len.at(market_id);
        let market_assets_list_len: u64 = market_assets_list_len_loc.read();
        let market_assets_list_loc = storage.market_assets_list.at(market_id);

        for i in 0..market_assets_list_len {
            let market_asset_loc = market_assets_list_loc.at(i);
            let market_asset: AztecAddress = market_asset_loc.read();
            Lending::at(context.this_address()).update_accumulators(market_id, market_asset).call(&mut context);
            let debt_asset_loc = storage.market_assets.at(market_id).at(market_asset);
            let debt_asset: Asset = debt_asset_loc.read();
            if(debt_asset.is_borrowable) {
                let scaled_user_borrowed_amount_loc = storage.scaled_borrowed_assets.at(market_id).at(market_asset).at(owner);
                let scaled_user_borrowed_amount: u128 = scaled_user_borrowed_amount_loc.read();
                let borrow_accumulator_loc = storage.borrow_accumulators.at(market_id).at(market_asset);
                let borrow_accumulator: Accumulator = borrow_accumulator_loc.read();
                let user_borrowed_amount = (scaled_user_borrowed_amount * borrow_accumulator.value) / 1000000000 as u128;
                
                let borrow_price= PriceFeed::at(debt_asset.oracle).get_price(0).view(&mut context).price;

                min_collateral_value += (user_borrowed_amount * borrow_price * 10000 as u128) / debt_asset.loan_to_value;
            }
        }
        min_collateral_value / 1000000000 as u128
    }

    #[private]
    fn deposit_private(
        from: AztecAddress,
        amount: u128,
        nonce: Field,
        secret: Field,
        on_behalf_of: Field,
        market_id: Field,
        collateral_asset: AztecAddress,
        fromPublicBalance: bool,
    ) {
        let on_behalf_of =
            compute_identifier(secret, on_behalf_of, context.msg_sender().to_field());
        if(!fromPublicBalance) {
            let _ = Token::at(collateral_asset).transfer_to_public(from, context.this_address(), amount, nonce).call(&mut context);
        }
        else {
            let _ = Token::at(collateral_asset).transfer_in_public(from, context.this_address(), amount, nonce).enqueue(&mut context);
        }
        Lending::at(context.this_address())
            ._deposit(AztecAddress::from_field(on_behalf_of), amount, market_id,collateral_asset)
            .enqueue(&mut context);
    }

    #[public]
    fn deposit_public(
        amount: u128,
        nonce: Field,
        on_behalf_of: Field,
        market_id: Field,
        collateral_asset: AztecAddress,
    ) {
        // docs:start:public_to_public_call
        let _ = Token::at(collateral_asset)
            .transfer_in_public(context.msg_sender(), context.this_address(), amount, nonce)
            .call(&mut context);
        // docs:end:public_to_public_call
        let _ = Lending::at(context.this_address())
            ._deposit(AztecAddress::from_field(on_behalf_of), amount, market_id, collateral_asset)
            .call(&mut context);
    }

    #[public]
    #[internal]
    fn _deposit(owner: AztecAddress, amount: u128, market_id: Field, collateral_asset: AztecAddress) {
        let asset_loc = storage.market_assets.at(market_id).at(collateral_asset);
        let asset: Asset = asset_loc.read();
        assert(asset.asset_address == collateral_asset, "Invalid asset or market id");
        
        Lending::at(context.this_address()).update_accumulators(market_id, collateral_asset).call(&mut context);

        let deposit_accumulator_loc = storage.deposit_accumulators.at(market_id).at(collateral_asset);
        let deposit_accumulator: Accumulator = deposit_accumulator_loc.read();

        let total_deposited_assets = Lending::at(context.this_address()).compute_total_deposited_assets(market_id, collateral_asset, deposit_accumulator).call(&mut context);
        assert((total_deposited_assets + amount) < asset.deposit_cap, "Deposit cap exceeded");

        let scaled_user_deposited_asset_loc = storage.scaled_deposited_assets.at(market_id).at(collateral_asset).at(owner);
        let scaled_user_deposited_asset: u128 = scaled_user_deposited_asset_loc.read();
        let scaled_amount = (amount * 1000000000 as u128) / deposit_accumulator.value;
        scaled_user_deposited_asset_loc.write(scaled_user_deposited_asset + scaled_amount);

        let scaled_total_deposited_asset_loc = storage.scaled_total_deposited_assets.at(market_id).at(collateral_asset);
        let scaled_total_deposited_asset: u128 = scaled_total_deposited_asset_loc.read();
        scaled_total_deposited_asset_loc.write(scaled_total_deposited_asset + scaled_amount);

        Lending::at(context.this_address()).emit_position_update(market_id, collateral_asset, owner).call(&mut context);
    }

    #[public]
    fn compute_total_deposited_assets(market_id: Field, asset_address: AztecAddress, deposit_accumulator: Accumulator) -> u128 {
        let scaled_total_deposited_asset_static = storage.scaled_total_deposited_assets.at(market_id).at(asset_address).read();
        let total_deposited_asset = scaled_total_deposited_asset_static * deposit_accumulator.value / 1000000000 as u128;
        total_deposited_asset
    }

    #[public]
    fn add_asset(market_id: Field, asset_address: AztecAddress, oracle: AztecAddress, loan_to_value: u128, is_borrowable: bool, optimal_utilization_rate: u128, under_optimal_slope: u128, over_optimal_slope: u128, deposit_cap: u128) {
        let asset_loc = storage.market_assets.at(market_id).at(asset_address);
        let asset: Asset = asset_loc.read();

        assert(loan_to_value <= (10000 as u128));

        asset_loc.write(Asset {
            asset_address,
            oracle,
            loan_to_value,
            is_borrowable,
            optimal_utilization_rate,
            under_optimal_slope,
            over_optimal_slope,
            deposit_cap,
        });

        let market_assets_list_len_loc = storage.market_assets_list_len.at(market_id);
        let market_assets_list_len: u64 = market_assets_list_len_loc.read();
        let market_assets_list_loc = storage.market_assets_list.at(market_id).at(market_assets_list_len);
        market_assets_list_loc.write(asset_address);
        market_assets_list_len_loc.write(market_assets_list_len + 1);

        let deposit_accumulator_loc = storage.deposit_accumulators.at(market_id).at(asset_address);
        let deposit_accumulator: Accumulator = deposit_accumulator_loc.read();

        assert(deposit_accumulator.last_updated_ts == 0);
        assert(deposit_accumulator.value == 0 as u128);

        deposit_accumulator_loc.write(Accumulator {
            // 10**9
            value: 1000000000 as u128,
            last_updated_ts: context.timestamp(),
        });

        let borrow_accumulator_loc = storage.borrow_accumulators.at(market_id).at(asset_address);
        let borrow_accumulator: Accumulator = borrow_accumulator_loc.read();

        assert(borrow_accumulator.last_updated_ts == 0);
        assert(borrow_accumulator.value == 0 as u128);

        borrow_accumulator_loc.write(Accumulator {
            // 10**9
            value: 1000000000 as u128,
            last_updated_ts: context.timestamp(),
        });
    }


    // Create a position.
    #[public]
    fn update_accumulators(market_id: Field, asset_address: AztecAddress) {
        let asset_loc = storage.market_assets.at(market_id).at(asset_address);
        let asset: Asset = asset_loc.read();
        let deposit_accumulator_loc = storage.deposit_accumulators.at(market_id).at(asset_address);
        let mut deposit_accumulator: Accumulator = deposit_accumulator_loc.read();
        let borrow_accumulator_loc = storage.borrow_accumulators.at(market_id).at(asset_address);
        let mut borrow_accumulator: Accumulator = borrow_accumulator_loc.read();

        let timestamp = context.timestamp();
        let time_delta = timestamp - deposit_accumulator.last_updated_ts;

        // Only update if time has passed.
        if !(time_delta == 0) {
            let precision = 1000000000 as u128; // 10**9
            let utilization_rate = _compute_utilization_rate(market_id, asset_address, precision, deposit_accumulator, borrow_accumulator);
            let borrow_rate_per_year = _compute_borrow_rate(asset, utilization_rate, precision);
            // TODO: let supply_rate_per_year = borrow_rate_per_year * utilization_rate * (1 - reserve_factor);
            let supply_rate_per_year = (borrow_rate_per_year * utilization_rate) / precision;

            let new_borrow_accumulator = ((borrow_accumulator.value * borrow_rate_per_year * time_delta as u128) / 31536000 as u128) / precision;
            let new_deposit_accumulator = ((deposit_accumulator.value * supply_rate_per_year * time_delta as u128) / 31536000 as u128) / precision;

            borrow_accumulator.value += new_borrow_accumulator;
            borrow_accumulator.last_updated_ts = timestamp;
            borrow_accumulator_loc.write(borrow_accumulator);
            deposit_accumulator.value += new_deposit_accumulator;
            deposit_accumulator.last_updated_ts = timestamp;
            deposit_accumulator_loc.write(deposit_accumulator);
        }
    }

    #[public]
    #[internal]
    fn _compute_utilization_rate(market_id: Field, asset_address: AztecAddress, precision: u128, deposit_accumulator: Accumulator, borrow_accumulator: Accumulator) -> u128 {
        
        let scaled_total_deposited_asset = storage.scaled_total_deposited_assets.at(market_id).at(asset_address).read();
        let scaled_total_borrowed_asset = storage.scaled_total_borrowed_assets.at(market_id).at(asset_address).read();

        let total_deposited_assets = (scaled_total_deposited_asset * deposit_accumulator.value) / precision;
        let total_borrowed_assets = (scaled_total_borrowed_asset * borrow_accumulator.value) / precision;
        let mut utilization_rate = 0 as u128;
        if (total_borrowed_assets != 0) {
            utilization_rate = (total_borrowed_assets * precision) / total_deposited_assets;
        } else {
            utilization_rate = 0;
        }

        utilization_rate
    }

    #[public]
    #[internal]
    fn _compute_borrow_rate(asset: Asset, utilization_rate: u128, precision: u128) -> u128 {
        let mut rate = 0 as u128;
        if utilization_rate < asset.optimal_utilization_rate {
            // rate = base + utilization * slope1 / optimal No base for now
            rate = (utilization_rate * asset.under_optimal_slope) / asset.optimal_utilization_rate;
        } else {
            // rate = base +slope1 + (utilization - optimal) * slope2 / (1 - optimal) No base for now
            rate = asset.under_optimal_slope + (utilization_rate - asset.optimal_utilization_rate) * asset.over_optimal_slope / (precision - asset.optimal_utilization_rate);
        }
        rate
    }

    #[public]
    fn liquidate_public(market_id: Field, collateral_asset: AztecAddress, debt_asset: AztecAddress, user: AztecAddress, debt_to_cover: u128) {
        let _ = Lending::at(context.this_address())._liquidate(market_id, collateral_asset, debt_asset, user, debt_to_cover).call(&mut context);
    }

    #[public]
    #[internal]
    fn _liquidate(market_id: Field, collateral_token: AztecAddress, debt_token: AztecAddress, user: AztecAddress, debt_to_liquidate_amount: u128) {
        Lending::at(context.this_address()).update_accumulators(market_id, collateral_token).call(&mut context);
        Lending::at(context.this_address()).update_accumulators(market_id, debt_token).call(&mut context);

        let scaled_borrowed_amount_loc = storage.scaled_borrowed_assets.at(market_id).at(debt_token).at(user);
        let scaled_borrowed_amount: u128 = scaled_borrowed_amount_loc.read();
        let borrow_accumulator_loc = storage.borrow_accumulators.at(market_id).at(debt_token);
        let borrow_accumulator: Accumulator = borrow_accumulator_loc.read();
        let borrowed_amount = (scaled_borrowed_amount * borrow_accumulator.value) / 1000000000 as u128;

        assert(borrowed_amount >= debt_to_liquidate_amount, "Insufficient borrowed amount");

        let total_collateral_value: u128 = Lending::at(context.this_address())._compute_total_collateral_value(market_id, user).call(&mut context);
        let collateral_debt_value = Lending::at(context.this_address())._compute_collateral_debt_value(market_id, user).call(&mut context);

        assert(collateral_debt_value > total_collateral_value, "collateral >= debt");

        let debt_asset_loc = storage.market_assets.at(market_id).at(debt_token);
        let debt_asset: Asset = debt_asset_loc.read();
        let debt_asset_price = PriceFeed::at(debt_asset.oracle).get_price(0).view(&mut context).price;
        let debt_to_liquidate_price = (debt_to_liquidate_amount * debt_asset_price) / 1000000000 as u128;

        let collateral_asset_loc = storage.market_assets.at(market_id).at(collateral_token);
        let collateral_asset: Asset = collateral_asset_loc.read();
        let collateral_asset_price = PriceFeed::at(collateral_asset.oracle).get_price(0).view(&mut context).price;
        let collateral_amount_to_liquidate = (debt_to_liquidate_price * 1000000000 as u128) / collateral_asset_price;

        let collateral_deposit_accumulator_loc = storage.deposit_accumulators.at(market_id).at(collateral_token);
        let collateral_deposit_accumulator: Accumulator = collateral_deposit_accumulator_loc.read();
        let scaled_collateral_deposit_amount_loc = storage.scaled_deposited_assets.at(market_id).at(collateral_token).at(user);
        let scaled_collateral_deposit_amount: u128 = scaled_collateral_deposit_amount_loc.read();
        let collateral_deposit_amount = (scaled_collateral_deposit_amount * collateral_deposit_accumulator.value) / 1000000000 as u128;

        assert(collateral_deposit_amount >= collateral_amount_to_liquidate, "Insufficient collateral");

        let scaled_collateral_amount_to_liquidate = (collateral_amount_to_liquidate * 1000000000 as u128) / collateral_deposit_accumulator.value;

        let debt_borrow_accumulator_loc = storage.borrow_accumulators.at(market_id).at(debt_token);
        let debt_borrow_accumulator: Accumulator = debt_borrow_accumulator_loc.read();
        let scaled_debt_amount_to_liquidate = (debt_to_liquidate_amount * 1000000000 as u128) / debt_borrow_accumulator.value;

        let scaled_user_deposited_amount_loc = storage.scaled_deposited_assets.at(market_id).at(collateral_token).at(user);
        let scaled_user_deposited_amount: u128 = scaled_user_deposited_amount_loc.read();
        scaled_user_deposited_amount_loc.write(scaled_user_deposited_amount - scaled_collateral_amount_to_liquidate);

        let scaled_total_deposited_asset_loc = storage.scaled_total_deposited_assets.at(market_id).at(collateral_token);
        let scaled_total_deposited_asset: u128 = scaled_total_deposited_asset_loc.read();
        scaled_total_deposited_asset_loc.write(scaled_total_deposited_asset - scaled_collateral_amount_to_liquidate);

        let scaled_user_borrowed_amount_loc = storage.scaled_borrowed_assets.at(market_id).at(debt_token).at(user);
        let scaled_user_borrowed_amount: u128 = scaled_user_borrowed_amount_loc.read();
        scaled_user_borrowed_amount_loc.write(scaled_user_borrowed_amount - scaled_debt_amount_to_liquidate);

        let scaled_total_borrowed_asset_loc = storage.scaled_total_borrowed_assets.at(market_id).at(debt_token);
        let scaled_total_borrowed_asset: u128 = scaled_total_borrowed_asset_loc.read();
        scaled_total_borrowed_asset_loc.write(scaled_total_borrowed_asset - scaled_debt_amount_to_liquidate);
    }

    #[utility]
    #[view]
    unconstrained fn get_position(owner: AztecAddress, market_id: Field, asset_address: AztecAddress) -> pub Position {
        let scaled_user_deposited_asset_loc = storage.scaled_deposited_assets.at(market_id).at(asset_address).at(owner);
        let scaled_user_deposited_asset: u128 = scaled_user_deposited_asset_loc.read();
        let deposit_accumulator_loc = storage.deposit_accumulators.at(market_id).at(asset_address);
        let deposit_accumulator: Accumulator = deposit_accumulator_loc.read();
        let collateral = (scaled_user_deposited_asset * deposit_accumulator.value) / 1000000000 as u128;
        let scaled_user_borrowed_amount_loc = storage.scaled_borrowed_assets.at(market_id).at(asset_address).at(owner);
        let scaled_user_borrowed_amount: u128 = scaled_user_borrowed_amount_loc.read();
        let borrow_accumulator_loc = storage.borrow_accumulators.at(market_id).at(asset_address);
        let borrow_accumulator: Accumulator = borrow_accumulator_loc.read();
        let debt = (scaled_user_borrowed_amount * borrow_accumulator.value) / 1000000000 as u128;
        Position { collateral, scaled_debt:scaled_user_borrowed_amount, debt }
    }

    #[utility]
    #[view]
    unconstrained fn get_total_deposited_assets(market_id: Field, asset_address: AztecAddress) -> u128 {
        let scaled_total_deposited_asset = storage.scaled_total_deposited_assets.at(market_id).at(asset_address).read();
        let deposit_accumulator_loc = storage.deposit_accumulators.at(market_id).at(asset_address);
        let deposit_accumulator: Accumulator = deposit_accumulator_loc.read();
        let total_deposited_assets = (scaled_total_deposited_asset * deposit_accumulator.value) / 1000000000 as u128;
        total_deposited_assets
    }

    #[utility]
    #[view]
    unconstrained fn get_total_borrowed_assets(market_id: Field, asset_address: AztecAddress) -> u128 {
        let scaled_total_borrowed_asset = storage.scaled_total_borrowed_assets.at(market_id).at(asset_address).read();
        let borrow_accumulator_loc = storage.borrow_accumulators.at(market_id).at(asset_address);
        let borrow_accumulator: Accumulator = borrow_accumulator_loc.read();
        let total_borrowed_assets = (scaled_total_borrowed_asset * borrow_accumulator.value) / 1000000000 as u128;
        total_borrowed_assets
    }


    #[utility]
    #[view]
    unconstrained fn get_accumulators(market_id: Field, asset_address: AztecAddress) -> (Accumulator, Accumulator) {
        let deposit_accumulator_loc = storage.deposit_accumulators.at(market_id).at(asset_address);
        let deposit_accumulator: Accumulator = deposit_accumulator_loc.read();
        let borrow_accumulator_loc = storage.borrow_accumulators.at(market_id).at(asset_address);
        let borrow_accumulator: Accumulator = borrow_accumulator_loc.read();
        (deposit_accumulator, borrow_accumulator)
    }
}
