import { verifyRegistrationResponse } from '@simplewebauthn/server';

async function run() {
    // Generate dummy payload representing verifyRegistrationResponse schema
    // Since we don't have a real credential to pass without a physical hardware key, 
    // we can intentionally fail verification and see the returned structure, 
    // or inspect the TS types from the module exports.
    console.log(Object.keys(require('@simplewebauthn/server')));
}
run();
