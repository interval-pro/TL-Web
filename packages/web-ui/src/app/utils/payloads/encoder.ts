import BigNumber from 'bignumber.js'; // Make sure BigNumber is imported

const marker = 'tl';

const encodeSend = (params: { sendAll: boolean, address: string, propertyId: number | number[], amount: number | number[]}) => {
    if (params.sendAll)  return `1;${params.address}`;
    if (Array.isArray(params.propertyId) && Array.isArray(params.amount)) {
        const payload = [
            '0',
            '',
            params.propertyId.map(id => id.toString(36)).join(','),
            params.amount.map(amt => amt.toString(36)).join(',') 
        ];
        return payload.join(';');
    } else {
        const payload = [
            '0',
            params.address,
            params.propertyId.toString(36),
            params.amount.toString(36) // Updated to use BigNumber
        ];
        const txNumber = 2;
        const txNumber36 = txNumber.toString(36);
        const payloadString = payload.join(';');
        return marker + txNumber36 + payloadString;
    }
};

type TradeTokensChannelParams = {
    propertyId1: number;
    propertyId2: number;
    amountOffered1: number;
    amountDesired2: number;
    columnAIsOfferer: number;
    expiryBlock: number;
};

const encodeTradeTokensChannel = (params: TradeTokensChannelParams): string => {
    const payload = [
        params.propertyId1.toString(36),
        params.propertyId2.toString(36),
        new BigNumber(params.amountOffered1).times(1e8).toString(36), // Updated to use BigNumber
        new BigNumber(params.amountDesired2).times(1e8).toString(36), // Updated to use BigNumber
        params.columnAIsOfferer ? '1' : '0',
        params.expiryBlock.toString(36),
    ];
    const txNumber = 20;
    const txNumber36 = txNumber.toString(36);
    const payloadString = payload.join(',');
    return marker + txNumber36 + payloadString;
};

type EncodeCommitParams = {
    propertyId: number;
    amount: number;
    channelAddress: string;
    ref?: number; // New optional parameter for reference output
};

const encodeCommit = (params: EncodeCommitParams): string => {
    const payload = [
        params.propertyId.toString(36),
        new BigNumber(params.amount).times(1e8).toString(36),
        params.channelAddress.length > 42 ? `ref:${params.ref || 0}` : params.channelAddress // Handle long multisig addresses
    ];
    const txNumber = 4;
    const txNumber36 = txNumber.toString(36);
    const payloadString = payload.join(',');
    return marker + txNumber36 + payloadString;
};

type EncodeTradeTokenForUTXOParams = {
    propertyId: number;
    amount: number;
    columnA: boolean;
    satsExpected: number;
    tokenOutput: number;
    payToAddress: number;
};

const encodeTradeTokenForUTXO = (params: EncodeTradeTokenForUTXOParams): string => {
    const payload = [
        params.propertyId.toString(36),
        new BigNumber(params.amount).times(1e8).toString(36), // Updated to use BigNumber
        params.columnA ? 1:0,
        new BigNumber(params.satsExpected).times(1e8).toString(36),
        params.tokenOutput.toString(36),
        params.payToAddress.toString(36)
    ];

    const txNumber = 3;
    const txNumber36 = txNumber.toString(36);
    const payloadString = payload.join(',');
    return marker + txNumber36 + payloadString;
};

type EncodeTransferParams = {
    propertyId: number;
    amount: number;
    isColumnA: boolean;
    destinationAddr: string;
    ref?: number; // New optional parameter for reference output
};


// Encode Transfer Transaction 
const encodeTransfer = (params: EncodeTransferParams): string => {
    const propertyId = params.propertyId.toString(36);
    const amounts = new BigNumber(params.amount).times(1e8).toString(36);
    const isColumnA = params.isColumnA ? 1 : 0;
    const destinationAddr = params.destinationAddr.length > 42 ? `ref:${params.ref || 0}` : params.destinationAddr; // Handle long multisig addresses
    
    return [propertyId, amounts, isColumnA, destinationAddr].join(',');
};



export const ENCODER = { 
    encodeSend, 
    encodeTradeTokensChannel,
    // encodeWithdrawal, 
    // encodeTradeContractChannel,  
    encodeTradeTokenForUTXO, 
    encodeCommit,
    encodeTransfer 
};
