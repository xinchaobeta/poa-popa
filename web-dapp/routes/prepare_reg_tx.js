'use strict';

const logger = require('../server-lib/logger');
const express = require('express');
const config = require('../server-config');
const buildSignature = require('../server-lib/buildSignature');
const generate_code = require('../server-lib/generate_code');
const validate = require('../server-lib/validations').validate;
const normalize = require('../server-lib/validations').normalize;
const db = require('../server-lib/session_store');
const send_response = require('../server-lib/send_response');
const recalc_price = require('../server-lib/recalc_price');
const post_api = require('../server-lib/post_api');

// eslint-disable-next-line no-unused-vars
module.exports = (opts) => {
    var router = express.Router();
    router.post('/prepareRegTx', function(req, res) {
        var prelog = '[prepareRegTx] (' + req.log_prfx + ') ';
        if (!req.body) {
            logger.log(prelog + 'request body empty');
            return send_response(res, { ok: false, err: 'request body: empty' });
        }

        var params = {};
        var verr;

        // wallet
        verr = validate.wallet(config.web3, req.body.wallet);
        if (verr) {
            logger.log(
                prelog + 'validation error on wallet: ' + wallet + ', err: ' + verr
            );
            return send_response(res, { ok: false, err: 'wallet: ' + verr });
        }
        var wallet = req.body.wallet;

        // name
        verr = validate.string(req.body.name);
        if (verr) {
            logger.log(prelog + 'validation error on name: ' + req.body.name + ', err: ' + verr);
            return send_response(res, { ok: false, err: 'name: ' + verr });
        }
        params.name = normalize.string(req.body.name);

        // country
        verr = validate.string(req.body.country);
        if (verr) {
            logger.log(
                prelog + 'validation error on country: ' + req.body.country + ', err: ' + verr
            );
            return send_response(res, { ok: false, err: 'country: ' + verr });
        }
        params.country = normalize.string(req.body.country);

        // state
        verr = validate.string(req.body.state);
        if (verr) {
            logger.log(
                prelog + 'validation error on state: ' + req.body.state + ', err: ' + verr
            );
            return send_response(res, { ok: false, err: 'state: ' + verr });
        }
        params.state = normalize.string(req.body.state);

        // city
        verr = validate.string(req.body.city);
        if (verr) {
            logger.log(prelog + 'validation error on city: ' + req.body.city + ', err: ' + verr);
            return send_response(res, { ok: false, err: 'city: ' + verr });
        }
        params.city = normalize.string(req.body.city);

        // address
        verr = validate.string(req.body.address);
        if (verr) {
            logger.log(
                prelog + 'validation error on address: ' + req.body.address + ', err: ' + verr
            );
            return send_response(res, { ok: false, err: 'address: ' + verr });
        }
        params.address = normalize.string(req.body.address);

        // zip
        verr = validate.string(req.body.zip);
        if (verr) {
            logger.log(prelog + 'validation error on zip: ' + req.body.zip + ', err: ' + verr);
            return send_response(res, { ok: false, err: 'zip: ' + verr });
        }
        params.zip = normalize.string(req.body.zip);

        logger.log(prelog + 'normalized params: ' + JSON.stringify(params));

        var addr = {
            state: params.state,
            city: params.city,
            location: params.address,
            zip: params.zip,
        };
        post_api.verify_address(addr, function(address_ok) {
            if (!address_ok) {
                logger.log(prelog + 'address is not ok');
                return send_response(res, { ok: false, err: 'address is invalid' });
            }

            // generate confimration confirmation_code_plain
            var confirmation_code_plain = generate_code();
            logger.log(prelog + 'confirmation_code_plain: ' + confirmation_code_plain);
            var sha3cc = config.web3.sha3(confirmation_code_plain);

            // get post card price
            params.price_wei = recalc_price.get_price_wei();
            logger.log(prelog + 'price_wei: ' + params.price_wei);

            logger.log(prelog + 'combining into text2sign hex string:');
            logger.log(prelog + 'wallet:        ' + wallet);
            logger.log(prelog + 'sha3(cc):      ' + sha3cc);

            try {
                var signatureParams = Object.assign(params, { wallet, sha3cc });

                var sign_output = buildSignature(signatureParams, config.signer_private_key);
                logger.log(prelog + 'sign() output: ' + JSON.stringify(sign_output));
            } catch (e) {
                logger.error(prelog + 'exception in sign(): ' + e.stack);
                return send_response(res, {
                    ok: false,
                    err: 'exception occured during signature calculation',
                });
            }

            var session_key = Math.random();
            logger.log(prelog + 'setting session_key: ' + session_key);
            db.set(session_key, { wallet, date: new Date(), confirmation_code_plain })
                .then(() => {
                    return send_response(res, {
                        ok: true,
                        result: {
                            wallet: wallet,
                            params: params,
                            confirmation_code_sha3: sha3cc,
                            v: sign_output.v,
                            r: sign_output.r,
                            s: sign_output.s,
                            session_key: session_key,
                        },
                    });
                })
                .catch(err => {
                    logger.error(prelog + 'error setting session_key: ' + err);
                    return send_response(res, {
                        ok: false,
                        err: 'error setting session_key',
                    });
                });
        });
    });

    return router;
};
